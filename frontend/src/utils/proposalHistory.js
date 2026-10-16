import { uniqueContractCardMessages } from "./negotiationMessages.js";

const BUSINESS = "NERC Copra Trading";
const numeric = value => Number(String(value).replaceAll(",", ""));
const amount = (price, volume) => `₱${numeric(price).toFixed(2)}/kg for ${numeric(volume)} ${numeric(volume) === 1 ? "ton" : "tons"}`;
const time = value => new Date(value).getTime() || 0;

// Only the application's structured proposal messages are converted. Free-form
// chat, AI replies, contract cards and moisture tables keep their own renderers.
function readEvent(message) {
  const text = (message.message_text ?? "").trim().replace(/^(?:💰|🔄|✅|❌)\s*/, "");
  const offer = text.match(/^(Price proposal|Counteroffer):\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons?\.?$/i);
  if (offer) return { kind: "offer", counter: offer[1].toLowerCase() === "counteroffer", price: offer[2], volume: offer[3] };
  const decision = text.match(/^(Proposal|Counteroffer) (accepted|rejected|declined):\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons?\.?$/i);
  if (decision) return { kind: "decision", counter: decision[1].toLowerCase() === "counteroffer", action: decision[2].toLowerCase() === "accepted" ? "accepted" : "rejected", price: decision[3], volume: decision[4] };
  if (/^Counteroffer declined\.?$/i.test(text)) return { kind: "decision", counter: true, action: "rejected" };
  if (/^(?:You accepted .+['’]s proposal form|NERC accepted your proposal form)\.(?:\s*Price: ₱?[\d,.]+\/kg\s+Volume: [\d,.]+ tons?\.?)?$/i.test(text)) {
    const values = text.match(/Price: ₱?([\d,.]+)\/kg\s+Volume: ([\d,.]+)/i);
    return { kind: "decision", counter: false, action: "accepted", ...(values && { price: values[1], volume: values[2] }) };
  }
  return null;
}

function decisionLine(event, supplierView, supplierName) {
  const subject = event.counter
    ? supplierView ? "You" : supplierName
    : supplierView ? BUSINESS : "You";
  const object = event.counter
    ? supplierView ? `${BUSINESS}'s counteroffer` : "your counteroffer"
    : supplierView ? "your proposal" : `${supplierName}'s proposal`;
  return {
    text: `${subject} ${event.action} ${object}${event.price != null ? ` of ${amount(event.price, event.volume)}` : ""}.`,
    tone: event.action === "accepted" ? "positive" : "negative",
  };
}

/** Display-only timeline: a durable offer entry per proposal, and one decision
 * per proposal/action. No messages, statuses or action eligibility are changed.
 */
export function proposalHistoryItems({ messages, proposals, supplierId, supplierName = "Supplier", supplierView = true }) {
  const rows = proposals.map((data, proposalIndex) => {
    // Match the chats' submitted_by rule, including their legacy parity fallback.
    const bySupplier = data.submitted_by != null ? data.submitted_by === supplierId : proposalIndex % 2 === 0;
    const actor = bySupplier ? supplierView ? "You" : supplierName : supplierView ? BUSINESS : "You";
    return { type: "proposal", key: `proposal:${data.proposal_id}`, date: new Date(data.submitted_at), data, proposalIndex, bySupplier,
      history: { text: `${actor} ${data.supersedes_proposal_id ? "counteroffered" : "proposed"}: ${amount(data.proposed_price_per_kg, data.proposed_volume_tons)}`, tone: data.supersedes_proposal_id ? "counteroffer" : "neutral" } };
  });
  const orderedRows = [...rows].sort((a, b) => a.date - b.date || a.key.localeCompare(b.key));
  const items = [...rows];
  const seenMessages = new Set(), decisions = new Set();
  const visibleMessages = uniqueContractCardMessages(messages);
  for (const message of [...visibleMessages].sort((a, b) => time(a.sent_at) - time(b.sent_at) || a.message_id.localeCompare(b.message_id))) {
    if (seenMessages.has(message.message_id)) continue;
    seenMessages.add(message.message_id);
    const event = readEvent(message);
    if (!event) {
      items.push({ type: "message", key: `message:${message.message_id}`, date: new Date(message.sent_at), data: message });
      continue;
    }
    const bySupplier = message.sender_id === supplierId;
    const candidates = orderedRows.filter(row => {
      if (row.data.conversation_id !== message.conversation_id) return false;
      if (event.kind === "offer" ? row.bySupplier !== bySupplier : row.bySupplier !== !event.counter) return false;
      if (event.kind === "offer" && !!row.data.supersedes_proposal_id !== event.counter) return false;
      return event.price == null || (numeric(row.data.proposed_price_per_kg) === numeric(event.price) && numeric(row.data.proposed_volume_tons) === numeric(event.volume));
    });
    // A stored submission follows its INSERT. A small clock-skew allowance also
    // covers realtime delivery arriving in the reverse order. Repeated offers
    // with identical amounts still match their own nearest preceding row.
    const row = candidates.filter(candidate => +candidate.date <= time(message.sent_at)).at(-1)
      ?? candidates.find(candidate => +candidate.date - time(message.sent_at) <= 5000);
    if (event.kind === "offer") {
      if (row) continue; // The row supplies the line immediately above its card.
      const actor = bySupplier ? supplierView ? "You" : supplierName : supplierView ? BUSINESS : "You";
      items.push({ type: "history", key: `message:${message.message_id}`, date: new Date(message.sent_at), data: message,
        history: { text: `${actor} ${event.counter ? "counteroffered" : "proposed"}: ${amount(event.price, event.volume)}`, tone: event.counter ? "counteroffer" : "neutral" } });
    } else {
      const identity = row ? `${row.key}:${event.action}` : `message:${message.message_id}`;
      if (decisions.has(identity)) continue;
      decisions.add(identity);
      items.push({ type: "history", key: `message:${message.message_id}`, date: new Date(message.sent_at), data: message,
        history: decisionLine(event, supplierView, supplierName) });
    }
  }
  for (const row of orderedRows) {
    const action = row.data.proposal_status === "Accepted" ? "accepted" : row.data.proposal_status === "Rejected" ? "rejected" : null;
    if (!action || decisions.has(`${row.key}:${action}`)) continue;
    const history = decisionLine({ counter: !row.bySupplier, action, price: row.data.proposed_price_per_kg, volume: row.data.proposed_volume_tons }, supplierView, supplierName);
    // Acceptance may only publish a contract card, without a decision message.
    // Use that card's persisted timestamp when available. Old rows have no
    // reviewed_at; keep their status annotation attached to the original offer
    // rather than inventing a decision time that changes on every reload.
    const next = orderedRows.find(candidate => +candidate.date > +row.date);
    const contract = action === "accepted" && visibleMessages.find(message => {
      if (message.conversation_id !== row.data.conversation_id || time(message.sent_at) < +row.date || (next && time(message.sent_at) >= +next.date)) return false;
      if (!message.message_text?.startsWith("CONTRACT_CARD:")) return false;
      try {
        const card = JSON.parse(message.message_text.slice("CONTRACT_CARD:".length));
        return numeric(card.price_per_kg) === numeric(row.data.proposed_price_per_kg) && numeric(card.contracted_tons) === numeric(row.data.proposed_volume_tons);
      } catch { return false; }
    });
    if (contract) items.push({ type: "history", key: `${row.key}:${action}`, date: new Date(contract.sent_at), data: row.data, history, beforeKey: `message:${contract.message_id}` });
    else row.decision = history;
  }
  // Database events can share a millisecond. In that case the offer must still
  // precede its decision, and an inferred acceptance precedes its contract.
  const rank = item => item.type === "proposal" ? 1 : item.type === "history" ? 2
    : item.data.message_text?.startsWith("CONTRACT_CARD:") ? 3 : 0;
  return items.sort((a, b) => +a.date - +b.date
    || (a.beforeKey === b.key ? -1 : b.beforeKey === a.key ? 1 : rank(a) - rank(b) || a.key.localeCompare(b.key)));
}
