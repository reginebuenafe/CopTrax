// Executes the manual cleanup against tables/constraints extracted from schema.sql.
// No live database connection; run from the repository root:
// npm exec --yes --package=@electric-sql/pglite -- node supabase/tests/delete_supplier_contract_test_data.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { PGlite } = require(require.resolve("@electric-sql/pglite", { paths: process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory)) }));
const schema = (await readFile(new URL("../../schema.sql", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const cleanup = await readFile(new URL("../scripts/delete_supplier_contract_test_data.sql", import.meta.url), "utf8");
const target = "6642c109-eb7f-4984-92f1-d4dcba699e04";
async function fixture() {
  const db = new PGlite();
  await db.exec("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;");
  for (const pattern of [/CREATE TYPE "public"\."[^"]+" AS ENUM \([\s\S]*?\n\);/g, /CREATE TABLE IF NOT EXISTS "public"\."[^"]+" \([\s\S]*?\n\);/g, /ALTER TABLE ONLY "public"\."[^"]+"\s+ADD CONSTRAINT [\s\S]*?;/g]) {
    const statements = [...schema.matchAll(pattern)]; assert(statements.length > 0);
    for (const [statement] of statements) await db.exec(statement);
  }
  await db.exec(schema.match(/CREATE OR REPLACE FUNCTION "public"\."prevent_signature_mutation"\(\)[\s\S]*?\$\$;/)[0]);
  await db.exec(schema.match(/CREATE OR REPLACE TRIGGER "contract_signatures_no_update"[^;]+;/)[0]);
  async function insert(table, values) {
    const keys = Object.keys(values);
    return (await db.query(`INSERT INTO public.${table} (${keys.join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`, Object.values(values))).rows[0];
  }
  const owner = randomUUID(), other = randomUUID();
  for (const id of [target, owner, other]) { await db.query("INSERT INTO auth.users VALUES ($1)", [id]); await insert("users", { user_id: id, email: `${id}@example.test` }); }
  async function seed(supplierId) {
    const conversation = await insert("conversations", { supplier_id: supplierId, business_owner_id: owner });
    const proposal = await insert("proposal_forms", { conversation_id: conversation.conversation_id, supplier_id: supplierId, submitted_by: supplierId, proposed_price_per_kg: 50, proposed_volume_tons: 2, proposal_status: "Accepted" });
    const contract = await insert("contracts", { contract_number: randomUUID(), supplier_id: supplierId, business_owner_id: owner, negotiated_price_per_kg: 50, contracted_tons: 2, conversation_id: conversation.conversation_id, source_proposal_id: proposal.proposal_id });
    await db.query("UPDATE conversations SET contract_id=$1, accepted_proposal_id=$2 WHERE conversation_id=$3", [contract.contract_id, proposal.proposal_id, conversation.conversation_id]);
    const signature = await insert("contract_signatures", { contract_id: contract.contract_id, signer_id: supplierId, signer_role: "Supplier", signature_order: 1 });
    const message = await insert("messages", { conversation_id: conversation.conversation_id, sender_id: supplierId, message_type: "Text", message_text: "Keep this chat" });
    const payment = await insert("payments", { supplier_id: supplierId, business_owner_id: owner, payment_week: "2026-10-12", total_amount: 5000 });
    const delivery = await insert("deliveries", { delivery_source: "Contract-based", contract_id: contract.contract_id, supplier_id: supplierId, delivery_date: "2026-10-15", payment_id: payment.payment_id });
    const allocation = await insert("delivery_allocations", { delivery_id: delivery.delivery_id, contract_id: contract.contract_id, allocated_weight_kg: 100 });
    const inspection = await insert("laboratory_inspections", { delivery_id: delivery.delivery_id, lab_staff_id: owner, moisture_content_pct: 8 });
    await insert("quality_results", { delivery_id: delivery.delivery_id, inspection_id: inspection.inspection_id, result: "Accepted" });
    await insert("weighing_records", { delivery_id: delivery.delivery_id, weigher_id: owner, gross_weight_kg: 120, tare_weight_kg: 20, net_weight_kg: 100 });
    const issue = await insert("delivery_issue_reports", { delivery_id: delivery.delivery_id, reported_by: supplierId, issue_note: "Test issue" });
    await insert("delivery_corrections", { issue_report_id: issue.issue_report_id, delivery_id: delivery.delivery_id, issue_type: "Weight Correction", old_value: 101, corrected_value: 100, resolved_by: owner, date_reported: "2026-10-15", date_resolved: "2026-10-15" });
    const batch = await insert("inventory_batches", { delivery_id: delivery.delivery_id, source_type: "Contractual", weight_kg: 100 });
    await insert("inventory_adjustments", { inventory_batch_id: batch.inventory_batch_id, old_weight_kg: 101, new_weight_kg: 100 });
    await insert("inventory_transactions", { inventory_batch_id: batch.inventory_batch_id, transaction_type: "Stock In", quantity_kg: 100 });
    await insert("payment_details", { payment_id: payment.payment_id, delivery_id: delivery.delivery_id, gross_weight_kg: 120, tare_weight_kg: 20, net_weight_kg: 100, final_weight_kg: 100, price_type: "Negotiated", price_per_kg_used: 50, line_amount: 5000 });
    const file = await insert("file_uploads", { uploaded_by: supplierId, file_category: "Receipt", file_url: "https://example.test/receipt" });
    await insert("e_receipts", { payment_id: payment.payment_id, receipt_number: randomUUID(), file_id: file.file_id });
    await insert("supplier_performance_snapshot", { supplier_id: supplierId, contract_id: contract.contract_id });
    return { conversation, proposal, contract, signature, message, payment, delivery, allocation, batch, file };
  }
  const a = await seed(target), b = await seed(other);
  return { db, insert, owner, other, a, b };
}
async function count(db, table) { return Number((await db.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n); }
async function triggerEnabled(db) { assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='contract_signatures_no_update'")).rows[0].tgenabled, "O"); }
const dependentTables = ["contracts", "contract_signatures", "deliveries", "delivery_allocations", "inventory_batches", "inventory_adjustments", "inventory_transactions", "payment_details", "payments", "e_receipts", "laboratory_inspections", "quality_results", "weighing_records", "delivery_issue_reports", "delivery_corrections", "supplier_performance_snapshot"];
{
  const f = await fixture();
  try {
    for (const status of ["Signed", "Active", "Completed", "Breached", "Pending Owner Review"]) await f.insert("contracts", { contract_number: randomUUID(), supplier_id: target, business_owner_id: f.owner, negotiated_price_per_kg: 50, contracted_tons: 2, status });
    const allocationOnly = await f.insert("deliveries", { delivery_source: "Contract-based", supplier_id: target, delivery_date: "2026-10-15" });
    await f.insert("delivery_allocations", { delivery_id: allocationOnly.delivery_id, contract_id: f.a.contract.contract_id, allocated_weight_kg: 10 });
    await f.insert("inventory_batches", { delivery_id: allocationOnly.delivery_id, source_type: "Contractual", weight_kg: 10, merged_into_batch_id: f.a.batch.inventory_batch_id });
    const result = await f.db.exec(cleanup); assert.equal(Number(result.at(-1).rows[0].remaining_contracts), 0);
    for (const table of dependentTables) assert.equal(await count(f.db, table), 1, table);
    for (const table of ["users", "conversations", "messages", "proposal_forms", "file_uploads"]) assert.equal(await count(f.db, table), table === "users" ? 3 : 2, table);
    assert.equal((await f.db.query("SELECT contract_id FROM conversations WHERE conversation_id=$1", [f.a.conversation.conversation_id])).rows[0].contract_id, null);
    assert.equal((await f.db.query("SELECT contract_id FROM conversations WHERE conversation_id=$1", [f.b.conversation.conversation_id])).rows[0].contract_id, f.b.contract.contract_id);
    await triggerEnabled(f.db); await f.db.exec(cleanup); await triggerEnabled(f.db);
    console.log("PASS actual schema constraints: target graph deleted; other supplier, user/chat/files preserved; trigger restored; rerun succeeds");
  } finally { await f.db.close(); }
}
for (const scenario of ["mixed payment", "foreign allocation", "mixed inventory incoming", "mixed inventory outgoing", "late FK failure"]) {
  const f = await fixture();
  try {
    if (scenario === "mixed payment") await f.db.query("UPDATE deliveries SET payment_id=$1 WHERE delivery_id=$2", [f.a.payment.payment_id, f.b.delivery.delivery_id]);
    if (scenario === "foreign allocation") await f.db.query("UPDATE delivery_allocations SET contract_id=$1 WHERE allocation_id=$2", [f.b.contract.contract_id, f.a.allocation.allocation_id]);
    if (scenario === "mixed inventory incoming") await f.db.query("UPDATE inventory_batches SET merged_into_batch_id=$1 WHERE inventory_batch_id=$2", [f.a.batch.inventory_batch_id, f.b.batch.inventory_batch_id]);
    if (scenario === "mixed inventory outgoing") await f.db.query("UPDATE inventory_batches SET merged_into_batch_id=$1 WHERE inventory_batch_id=$2", [f.b.batch.inventory_batch_id, f.a.batch.inventory_batch_id]);
    if (scenario === "late FK failure") { await f.db.exec("CREATE TABLE extra_dependency(contract_id uuid REFERENCES public.contracts(contract_id));"); await f.db.query("INSERT INTO extra_dependency VALUES ($1)", [f.a.contract.contract_id]); }
    await assert.rejects(f.db.exec(cleanup)); await f.db.exec("ROLLBACK");
    for (const table of dependentTables) assert.equal(await count(f.db, table), 2, `${scenario}: ${table}`);
    await triggerEnabled(f.db); console.log(`PASS ${scenario}: full rollback, signatures and trigger preserved`);
  } finally { await f.db.close(); }
}
