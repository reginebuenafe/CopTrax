// Test-only backend adapter. Real Supabase broadcasts, entirely mocked table/API
// data: this fixture never reads or writes application rows or calls an AI API.
import { createClient } from "@supabase/supabase-js";

const params = new URLSearchParams(location.search);
let conversationId = params.get("conversation");
const viewer = params.get("viewer") || "supplier";
const owner = { user_id: "owner", first_name: "Maria", last_name: "Buyer", email: "owner@example.test", account_status: "Active" };
const supplier = { user_id: "supplier", first_name: "Juan", last_name: "Supplier", email: "supplier@example.test", account_status: "Active" };
export function useAuth() {
  return { user: { id: viewer }, profile: { ...(viewer === "owner" ? owner : supplier), roles: { role_name: viewer === "owner" ? "Business Owner" : "Supplier" } } };
}
const real = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const messages = Array.from({ length: 80 }, (_, index) => ({
  message_id: `seed-${index}`, conversation_id: conversationId, sender_id: index % 2 ? "owner" : "supplier",
  message_text: `Existing conversation message ${index + 1}`, message_type: "Text", sent_at: new Date(Date.now() - (80 - index) * 60000).toISOString(),
}));
const conversation = { conversation_id: conversationId, supplier_id: "supplier", business_owner_id: "owner", status: "Open", supplier, business_owner: owner, created_at: messages[0].sent_at, messages };
const channels = new Set();
let aiMode = "success";
export function setAiMode(mode) { aiMode = mode; }
export function setFixtureConversation(id) { conversationId = id; }
async function deliver(message) {
  if (!messages.some(item => item.message_id === message.message_id)) messages.push(message);
  const channel = [...channels].find(item => item.topic.endsWith(`coptrax:chat:${conversationId}`));
  await channel?.send({ type: "broadcast", event: "fixture_message", payload: message });
}
function table(name) {
  let single = false;
  let insert;
  const chain = {
    select() { return this; }, eq() { return this; }, neq() { return this; }, order() { return this; }, limit() { return this; }, in() { return this; }, gt() { return this; },
    single() { single = true; return this; }, maybeSingle() { single = true; return this; },
    update() { return this; }, upsert() { return this; },
    insert(row) { insert = row; return this; },
    async then(resolve, reject) {
      try {
        let data;
        if (insert && name === "messages") {
          data = { ...insert, message_id: crypto.randomUUID(), sent_at: new Date().toISOString() };
          await deliver(data);
        } else if (name === "conversations") {
          const current = { ...conversation, conversation_id: conversationId, messages: messages.filter(message => message.conversation_id === conversationId) };
          data = single ? current : [current];
        }
        else if (name === "messages") data = messages.filter(message => message.conversation_id === conversationId);
        else if (name === "users") data = single ? (viewer === "owner" ? owner : supplier) : [owner];
        else data = single ? null : [];
        resolve({ data, error: null, count: messages.length });
      } catch (error) { reject?.(error); }
    },
  };
  return chain;
}
export const supabase = {
  from: table,
  getChannels: () => [...channels],
  channel(topic) {
    // Global presence/list channels are inert fixtures. Only conversation
    // broadcast traffic uses the real network and an isolated random topic.
    if (!topic.startsWith("coptrax:chat:")) {
      return { on() { return this; }, subscribe(callback) { callback?.("SUBSCRIBED"); return this; }, presenceState() { return {}; }, unsubscribe() {} };
    }
    // Echo fixture message packets like the application's Postgres INSERT echo.
    // The production typing controller still filters its own sender/session.
    const raw = real.channel(topic, { config: { broadcast: { self: true } } });
    channels.add(raw);
    const actualOn = raw.on.bind(raw);
    raw.on = (type, filter, callback) => {
      if (type === "postgres_changes") {
        if (filter.table === "messages") actualOn("broadcast", { event: "fixture_message" }, ({ payload }) => {
          if (!messages.some(message => message.message_id === payload.message_id)) messages.push(payload);
          callback({ new: payload });
        });
        return raw;
      }
      return actualOn(type, filter, callback);
    };
    // Visible test readiness; no access to application authentication state.
    const actualSubscribe = raw.subscribe.bind(raw);
    raw.subscribe = callback => actualSubscribe(status => {
      const report = () => {
        if (topic.endsWith(`:${conversationId}`)) {
          document.body.dataset.realtime = status;
          document.body.dataset.realtimeConversation = conversationId;
        }
        callback?.(status);
      };
      const delay = Number(params.get("typing_join_delay")) || 0;
      if (status === "SUBSCRIBED" && delay) setTimeout(report, delay);
      else report();
    });
    return raw;
  },
  removeChannel(channel) { channels.delete(channel); return channel.topic ? real.removeChannel(channel) : Promise.resolve(); },
  functions: {
    invoke(_name, { body, signal }) {
      return new Promise((resolve, reject) => {
        if (aiMode === "timeout") { signal?.addEventListener("abort", () => reject(new Error("Fixture timeout")), { once: true }); return; }
        setTimeout(async () => {
          if (aiMode === "error") { resolve({ error: { message: "Fixture AI error" } }); return; }
          await deliver({ message_id: crypto.randomUUID(), conversation_id: body.conversation_id,
            sender_id: "owner", message_type: "Text", is_ai_generated: true, message_text: "Fixture assistant reply", sent_at: new Date().toISOString() });
          resolve({ data: {} });
        }, 4000);
      });
    },
  },
};
