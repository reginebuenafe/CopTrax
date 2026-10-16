import test from "node:test";
import assert from "node:assert/strict";
import { proposalHistoryItems } from "../src/utils/proposalHistory.js";

const at = seconds => new Date(Date.UTC(2026, 9, 16, 0, 0, seconds)).toISOString();
const proposal = (id, seconds, extra = {}) => ({ proposal_id: id, conversation_id: "chat", supplier_id: "supplier", submitted_by: "supplier", submitted_at: at(seconds), proposed_price_per_kg: 30, proposed_volume_tons: 2, proposal_status: "Pending", ...extra });
const message = (id, seconds, text, extra = {}) => ({ message_id: id, conversation_id: "chat", sender_id: "supplier", sent_at: at(seconds), message_text: text, message_type: "Text", ...extra });
const timeline = (proposals, messages = [], supplierView = true) => proposalHistoryItems({ proposals, messages, supplierId: "supplier", supplierName: "Juan Dela Cruz", supplierView });
const lines = items => items.flatMap(item => [item.history, item.decision].filter(Boolean).map(line => line.text));

test("supplier proposals use stored values, correct perspective and singular quantities", () => {
  const row = proposal("a", 1, { proposed_price_per_kg: "30.5", proposed_volume_tons: "1.00" });
  assert.deepEqual(lines(timeline([row])), ["You proposed: ₱30.50/kg for 1 ton"]);
  assert.deepEqual(lines(timeline([row], [], false)), ["Juan Dela Cruz proposed: ₱30.50/kg for 1 ton"]);
  for (const status of ["Modified", "Accepted", "Rejected", "Expired"]) {
    assert.equal(timeline([{ ...row, proposal_status: status }])[0].history.text, "You proposed: ₱30.50/kg for 1 ton");
  }
});

test("row + stored offer yield one permanent line; identical subsequent offers remain separate", () => {
  const rows = [proposal("a", 1), proposal("b", 5)];
  const messages = [message("a-text", 2, "💰 Price proposal: ₱30.00/kg for 2 tons"), message("b-text", 6, "💰 Price proposal: ₱30.00/kg for 2 tons")];
  const result = timeline(rows, messages);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.key), ["proposal:a", "proposal:b"]);
  assert.deepEqual(timeline([...rows].reverse().map(row => ({ ...row, proposal_status: "Modified" })), [...messages].reverse()), result.map(item => ({ ...item, data: { ...item.data, proposal_status: "Modified" }, proposalIndex: item.proposalIndex === 0 ? 1 : 0 })));
});

test("BO counteroffer and stored decline have the widget's exact wording and no emoji", () => {
  const row = proposal("counter", 1, { submitted_by: "owner", supersedes_proposal_id: "a", proposal_status: "Rejected" });
  const messages = [message("offer-text", 2, "🔄 Counteroffer: ₱30.00/kg for 2 tons", { sender_id: "owner" }), message("decline", 3, "❌ Counteroffer declined.")];
  assert.deepEqual(lines(timeline([row], messages)), ["NERC Copra Trading counteroffered: ₱30.00/kg for 2 tons", "You rejected NERC Copra Trading's counteroffer."]);
  assert.deepEqual(lines(timeline([row], messages, false)), ["You counteroffered: ₱30.00/kg for 2 tons", "Juan Dela Cruz rejected your counteroffer."]);
  assert.equal(timeline([row], messages).at(-1).history.tone, "negative");
});

test("all legacy acceptance/rejection formats use the correct participants", () => {
  const cases = [
    ["Proposal accepted: ₱30/kg for 2 tons.", "NERC Copra Trading accepted your proposal of ₱30.00/kg for 2 tons.", "You accepted Juan Dela Cruz's proposal of ₱30.00/kg for 2 tons."],
    ["❌ Proposal declined: ₱30/kg for 2 tons.", "NERC Copra Trading rejected your proposal of ₱30.00/kg for 2 tons.", "You rejected Juan Dela Cruz's proposal of ₱30.00/kg for 2 tons."],
    ["Proposal rejected: ₱30/kg for 2 tons.", "NERC Copra Trading rejected your proposal of ₱30.00/kg for 2 tons.", "You rejected Juan Dela Cruz's proposal of ₱30.00/kg for 2 tons."],
    ["You accepted Juan's proposal form.\nPrice: ₱30/kg  Volume: 2 tons", "NERC Copra Trading accepted your proposal of ₱30.00/kg for 2 tons.", "You accepted Juan Dela Cruz's proposal of ₱30.00/kg for 2 tons."],
    ["NERC accepted your proposal form.", "NERC Copra Trading accepted your proposal.", "You accepted Juan Dela Cruz's proposal."],
    ["✅ Counteroffer accepted: ₱30/kg for 2 tons", "You accepted NERC Copra Trading's counteroffer of ₱30.00/kg for 2 tons.", "Juan Dela Cruz accepted your counteroffer of ₱30.00/kg for 2 tons."],
    ["Counteroffer rejected: ₱30/kg for 2 tons.", "You rejected NERC Copra Trading's counteroffer of ₱30.00/kg for 2 tons.", "Juan Dela Cruz rejected your counteroffer of ₱30.00/kg for 2 tons."],
  ];
  for (const [text, supplierText, ownerText] of cases) {
    assert.equal(lines(timeline([], [message("event", 1, text)]))[0], supplierText);
    assert.equal(lines(timeline([], [message("event", 1, text)], false))[0], ownerText);
  }
});

test("decision duplicates collapse per proposal, while later repeated negotiations retain decisions", () => {
  const rows = [proposal("a", 1, { proposal_status: "Rejected" }), proposal("b", 5, { proposal_status: "Rejected" })];
  const messages = [message("r1", 2, "Proposal rejected: ₱30/kg for 2 tons.", { sender_id: "owner" }), message("r1-duplicate", 3, "❌ Proposal declined: ₱30/kg for 2 tons.", { sender_id: "owner" }), message("r2", 6, "❌ Proposal declined: ₱30/kg for 2 tons.", { sender_id: "owner" })];
  assert.deepEqual(timeline(rows, messages).map(item => item.key), ["proposal:a", "message:r1", "proposal:b", "message:r2"]);
});

test("acceptance without a decision message precedes its persisted contract card", () => {
  const row = proposal("a", 1, { proposal_status: "Accepted", submitted_by: "owner" });
  const chat = message("normal", 2, "Please review this.");
  const card = message("contract", 3, 'CONTRACT_CARD:{"contract_id":"contract","price_per_kg":30,"contracted_tons":2}', { message_type: "Contract Form" });
  const result = timeline([row], [chat, card]);
  assert.deepEqual(result.map(item => item.key), ["proposal:a", "message:normal", "proposal:a:accepted", "message:contract"]);
  assert.equal(result[2].history.tone, "positive");
  assert.equal(result[2].history.text, "You accepted NERC Copra Trading's counteroffer of ₱30.00/kg for 2 tons.");
});

test("normal and AI messages stay intact; reordering input, reloads and new chat preserve history", () => {
  const rows = [proposal("a", 1)];
  const messages = [message("ai", 3, "Your price proposal has been accepted. Please review the contract.", { is_ai_generated: true }), message("normal", 2, "I would like to propose a price.")];
  const result = timeline(rows, messages);
  assert.deepEqual(timeline(rows, [...messages].reverse()), result);
  assert.deepEqual(timeline(JSON.parse(JSON.stringify(rows)), JSON.parse(JSON.stringify(messages))), result);
  assert.deepEqual(result.filter(item => item.type === "message").map(item => item.data), [messages[1], messages[0]]);
  assert.deepEqual(timeline([], []), []);
});

test("offers precede decisions even when database timestamps share a millisecond", () => {
  const row = proposal("offer", 1, { proposal_status: "Rejected" });
  const decision = message("a-decision", 1, "Proposal rejected: ₱30/kg for 2 tons.", { sender_id: "owner" });
  assert.deepEqual(timeline([row], [decision]).map(item => item.key), ["proposal:offer", "message:a-decision"]);
  const welcome = message("welcome", 1, "Welcome");
  assert.deepEqual(timeline([row], [welcome, decision]).map(item => item.key), ["message:welcome", "proposal:offer", "message:a-decision"]);
});
