// Isolated pricing fixture: every table, edge call, and channel is local memory.
const params = new URLSearchParams(location.search);
const viewer = params.get("viewer") || "supplier";
const conversationId = "pricing-conversation";
const owner = { user_id: "owner", first_name: "Maria", last_name: "Buyer", email: "owner@example.test" };
const supplier = { user_id: "supplier", first_name: "Juan", last_name: "Supplier" };
const conversation = { conversation_id: conversationId, supplier_id: "supplier", business_owner_id: "owner", status: "Open", supplier, business_owner: owner, created_at: new Date().toISOString() };
let contracts = params.get("history") ? [{ contract_id: "previous", supplier_id: "supplier", status: params.get("history") }] : [];
const messages = params.has("empty") ? [] : [{ message_id: "hello", conversation_id: conversationId, sender_id: "owner", message_type: "Text", message_text: "Welcome", sent_at: new Date().toISOString() }];
const proposals = params.has("empty") ? [] : [{ proposal_id: "offer", conversation_id: conversationId, supplier_id: "supplier", submitted_by: "owner", supersedes_proposal_id: "previous", proposal_status: "Pending", proposed_price_per_kg: 50, proposed_volume_tons: 2, submitted_at: new Date().toISOString() }];
const channels = new Set();
export const calls = [];
export function useAuth() { return { user: { id: viewer }, profile: { ...(viewer === "owner" ? owner : supplier), roles: { role_name: viewer === "owner" ? "Business Owner" : "Supplier" } } }; }
function event(table, kind, row) {
  for (const channel of channels) for (const handler of channel.handlers) {
    if (handler.type === "postgres_changes" && handler.filter.table === table && [kind, "*"].includes(handler.filter.event)) handler.callback({ new: row });
  }
}
export function setContractHistory(status, notify = true) {
  contracts = status ? [{ contract_id: "first", supplier_id: "supplier", status }] : [];
  if (notify) event("contracts", "INSERT", contracts[0]);
}
let entryTime = Date.now();
export function receiveFixtureMessage(message = {}) {
  const row = { message_id: crypto.randomUUID(), conversation_id: conversationId,
    sender_id: "owner", message_type: "Text", message_text: "New incoming message",
    ...message, sent_at: new Date(entryTime = Math.max(Date.now(), entryTime + 1)).toISOString() };
  messages.push(row); event("messages", "INSERT", row);
  return row.message_id;
}
export function receiveFixtureProposal(proposal = {}) {
  const row = { proposal_id: crypto.randomUUID(), conversation_id: conversationId,
    supplier_id: "supplier", submitted_by: "owner", supersedes_proposal_id: proposals.at(-1)?.proposal_id,
    proposal_status: "Pending", proposed_price_per_kg: 50, proposed_volume_tons: 2,
    ...proposal, submitted_at: new Date(entryTime = Math.max(Date.now(), entryTime + 1)).toISOString() };
  proposals.push(row); event("proposal_forms", "INSERT", row);
  return row.proposal_id;
}
export function updateFixtureProposal(proposalId, changes) {
  const row = proposals.find(proposal => proposal.proposal_id === proposalId);
  if (!row) throw new Error(`Unknown fixture proposal: ${proposalId}`);
  Object.assign(row, changes);
  event("proposal_forms", "UPDATE", row);
}
export const supabase = {
  from(name) {
    let single = false, head = false, insert, update; const filters = [];
    const chain = {
      select(_fields, options) { head = options?.head; return this; }, eq(key, value) { filters.push([key, value]); return this; }, neq() { return this; }, order() { return this; }, limit() { return this; }, in() { return this; }, gt() { return this; }, gte() { return this; },
      single() { single = true; return this; }, maybeSingle() { single = true; return this; },
      insert(row) { insert = row; return this; }, update(row) { update = row; return this; }, upsert() { return this; },
      async then(resolve, reject) {
        try {
          if (name === "contracts" && head && params.get("delay")) await new Promise(done => setTimeout(done, Number(params.get("delay"))));
          if (name === "contracts" && head && params.has("failure")) return resolve({ count: null, error: { message: "Fixture offline" } });
          let data = name === "contracts" ? contracts.filter(row => filters.every(([key, value]) => key in row ? row[key] === value : true))
            : name === "conversations" ? [{ ...conversation, messages }]
            : name === "users" ? [owner] : name === "messages" ? messages
            : name === "proposal_forms" ? proposals : name === "spot_price" && !params.has("no_spot") ? [{ price_per_kg: 50 }] : [];
          if (params.has("proposal_history") && ["conversations", "messages", "proposal_forms"].includes(name)) {
            data = data.filter(row => filters.every(([key, value]) => row[key] === value));
          }
          if (insert) { calls.push({ table: name, insert }); const row = { ...insert, message_id: crypto.randomUUID(), sent_at: new Date().toISOString() }; data = [row]; if (name === "messages") { messages.push(row); event(name, "INSERT", row); } }
          if (update) { calls.push({ table: name, update }); data.forEach(row => Object.assign(row, update)); }
          // Supabase responses are snapshots, never the live backing arrays.
          // Otherwise inserting a fixture row mutates React state in place and
          // the component's legitimate duplicate-message guard skips rendering.
          resolve({ data: single ? data[0] ? { ...data[0] } : null : data.map(row => ({ ...row })), count: data.length, error: null });
        } catch (error) { reject?.(error); }
      },
    }; return chain;
  },
  channel(topic) {
    const channel = { topic, handlers: [], on(type, filter, callback) { this.handlers.push({ type, filter, callback }); return this; }, subscribe(callback) { channels.add(this); callback?.("SUBSCRIBED"); return this; }, presenceState() { return {}; }, send() { return Promise.resolve("ok"); }, unsubscribe() { channels.delete(this); } };
    return channel;
  },
  removeChannel(channel) { channels.delete(channel); return Promise.resolve(); }, getChannels() { return [...channels]; },
  rpc(name, body) {
    calls.push({ rpc: name, body });
    if (name === "decline_current_proposal") {
      const proposal = proposals.find(row => row.proposal_id === body.p_proposal_id);
      if (proposal) { proposal.proposal_status = "Rejected"; event("proposal_forms", "UPDATE", proposal); }
      conversation.status = "Terminated";
      event("conversations", "UPDATE", { ...conversation });
    }
    return Promise.resolve({ data: {}, error: null });
  },
  functions: { invoke() { return Promise.resolve({ data: {}, error: null }); } },
  auth: { getSession() { return Promise.resolve({ data: { session: { access_token: "test-only" } } }); } },
};
