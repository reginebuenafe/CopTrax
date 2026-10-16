// Real PostgreSQL engine + tables, constraints, RLS and existing payment writers
// extracted from schema.sql. Never connects to a hosted database or pays money.
// npm exec --yes --package=@electric-sql/pglite -- node supabase/tests/pending_payments_on_acceptance.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { PGlite } = require(require.resolve("@electric-sql/pglite", { paths: process.env.PATH.split(path.delimiter).map(dir => path.dirname(dir)) }));
const schema = (await readFile(new URL("../../schema.sql", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const migration = await readFile(new URL("../migrations/20261016000089_pending_payments_on_delivery_acceptance.sql", import.meta.url), "utf8");
const ownerSource = await readFile(new URL("../../frontend/src/pages/owner/PaymentsPage.jsx", import.meta.url), "utf8");
const computeLine = new Function(`${ownerSource.slice(ownerSource.indexOf("function computeLine("), ownerSource.indexOf("function getPaymentFriday("))}; return computeLine;`)();
const paymentFriday = new Function(`${ownerSource.slice(ownerSource.indexOf("function getPaymentFriday("), ownerSource.indexOf("export default function PaymentsPage("))}; return getPaymentFriday;`)();
const db = new PGlite();
async function insert(table, values) {
  const keys = Object.keys(values);
  return (await db.query(`INSERT INTO public.${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, Object.values(values))).rows[0];
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const dateOnly = value => new Date(value).toISOString().slice(0, 10);
function originalFunction(name) {
  const match = schema.match(new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${name}"\\([\\s\\S]*?\\$\\$;`));
  assert(match, name); return match[0];
}
const owner = randomUUID(), supplier = randomUUID(), other = randomUUID(), empty = randomUUID();
async function makeContract(supplierId, status = "Active", price = 30, tons = 2) {
  return insert("contracts", { contract_number: randomUUID(), supplier_id: supplierId, business_owner_id: owner, negotiated_price_per_kg: price, contracted_tons: tons, status });
}
async function delivery(supplierId, contract, { status = "Accepted", net = 1000, mc = 1, discount = 0, portions = [net], spot = false,
  createdAt = "2026-10-16T07:26:00Z", source = "Contract-based", quality = "Accepted", qualityLast = false } = {}) {
  const d = await insert("deliveries", { supplier_id: supplierId, contract_id: contract?.contract_id ?? null, delivery_source: source, delivery_date: "2026-10-16", created_at: createdAt, delivery_status: status });
  const wr = await insert("weighing_records", { delivery_id: d.delivery_id, weigher_id: owner, gross_weight_kg: net + 3000, tare_weight_kg: 3000, net_weight_kg: net });
  const li = await insert("laboratory_inspections", { delivery_id: d.delivery_id, lab_staff_id: owner, moisture_content_pct: mc });
  const qr = { delivery_id: d.delivery_id, inspection_id: li.inspection_id, result: quality, remarks: `Moisture content ${mc}cc. Deduction: ${discount}%.` };
  if (!qualityLast) await insert("quality_results", qr);
  const allocs = [];
  for (let i = 0; i < portions.length; i++) allocs.push(await insert("delivery_allocations", {
    delivery_id: d.delivery_id, contract_id: spot && i === portions.length - 1 ? null : contract?.contract_id ?? null,
    allocated_weight_kg: portions[i], sequence_order: i + 1,
    price_type: spot && i === portions.length - 1 ? "Spot" : "Negotiated",
  }));
  return { d, wr, li, qr, allocs, contract };
}
async function switchSupplier(id) {
  await db.query("SELECT set_config('fixture.uid', $1, false)", [id]);
  await db.exec("SET ROLE authenticated");
}
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('fixture.uid', true), '')::uuid $$;
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;`);
  for (const pattern of [/CREATE TYPE "public"\."[^"]+" AS ENUM \([\s\S]*?\n\);/g, /CREATE TABLE IF NOT EXISTS "public"\."[^"]+" \([\s\S]*?\n\);/g, /ALTER TABLE ONLY "public"\."[^"]+"\s+ADD CONSTRAINT [\s\S]*?;/g]) {
    const statements = [...schema.matchAll(pattern)]; assert(statements.length);
    for (const [statement] of statements) await db.exec(statement);
  }
  for (const name of ["get_my_role", "lab_staff_contract_visible", "create_payment_batch", "create_payment_receipt", "finalize_successful_payment", "check_contract_completion_on_acceptance"]) await db.exec(originalFunction(name));
  await db.exec("CREATE SEQUENCE public.e_receipt_number_seq; CREATE UNIQUE INDEX e_receipts_payment_id_key ON public.e_receipts(payment_id);");
  await insert("roles", { role_id: 1, role_name: "Business Owner" }); await insert("roles", { role_id: 2, role_name: "Supplier" });
  for (const id of [owner, supplier, other, empty]) {
    await db.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await insert("users", { user_id: id, email: `${id}@example.test`, role_id: id === owner ? 1 : 2, account_status: "Active" });
  }
  await insert("spot_price", { price_per_kg: 30 });
  const completed = await makeContract(supplier, "Completed");
  const first = await delivery(supplier, completed, { net: 2000, mc: 10, discount: 4.7, portions: [1906] });
  const second = await delivery(supplier, completed, { portions: [94, 906], spot: true });
  const existingContract = await makeContract(other, "Completed", 40);
  const paid = await insert("payments", { supplier_id: other, business_owner_id: owner, payment_week: "2026-10-09", payment_status: "Released", payment_date: "2026-10-09", total_amount: 4000 });
  const paidDelivery = await delivery(other, existingContract, { net: 100, portions: [100] });
  await db.query("UPDATE deliveries SET payment_id=$1 WHERE delivery_id=$2", [paid.payment_id, paidDelivery.d.delivery_id]);
  await insert("payment_details", { payment_id: paid.payment_id, delivery_id: paidDelivery.d.delivery_id, gross_weight_kg: 3100, tare_weight_kg: 3000, net_weight_kg: 100, final_weight_kg: 100, price_type: "Negotiated", price_per_kg_used: 40, line_amount: 4000 });
  const originalPaid = await one("SELECT row_to_json(p) AS payment FROM payments p WHERE payment_id=$1", [paid.payment_id]);
  const result = await db.exec(migration);
  const backfill = result.find(part => part.rows?.[0]?.created_pending_payments !== undefined).rows[0];
  assert.equal(Number(backfill.created_pending_payments), 1); assert.equal(Number(backfill.backfilled_deliveries), 2);
  const pending = await one("SELECT * FROM payments WHERE supplier_id=$1", [supplier]);
  assert.equal(pending.payment_status, "Pending"); assert.equal(pending.payment_date, null);
  assert.equal(dateOnly(pending.payment_week), "2026-10-16"); assert.equal(Number(pending.total_amount), 87180);
  const details = (await db.query("SELECT * FROM payment_details WHERE payment_id=$1", [pending.payment_id])).rows;
  assert.equal(details.length, 3);
  let originalTotal = 0;
  for (const seeded of [first, second]) {
    const input = { weighing_records: [seeded.wr], laboratory_inspections: [seeded.li], quality_results: [seeded.qr],
      delivery_allocations: seeded.allocs.map(a => ({ ...a, contract: a.contract_id ? completed : null })) };
    const original = computeLine(input, 30); originalTotal += original.lineAmount;
    assert.equal(dateOnly(pending.payment_week), paymentFriday(seeded.d.created_at));
    for (const line of original.allocLines) {
      const saved = details.find(pd => pd.delivery_id === seeded.d.delivery_id && pd.price_type === line.priceType);
      assert.equal(Number(saved.final_weight_kg), line.allocFinalKg);
      assert.equal(Number(saved.price_per_kg_used), line.pricePerKg);
      assert.equal(Number(saved.line_amount), Math.round(line.lineAmount * 100) / 100);
      assert(Math.abs(Number(saved.net_weight_kg) - line.allocNetKg) < 0.001);
    }
  }
  assert.equal(Number(pending.total_amount), Math.round(originalTotal * 100) / 100);
  assert.deepEqual(await one("SELECT row_to_json(p) AS payment FROM payments p WHERE payment_id=$1", [paid.payment_id]), originalPaid);
  const repeat = await db.exec(migration);
  assert.equal(Number(repeat.find(part => part.rows?.[0]?.created_pending_payments !== undefined).rows[0].created_pending_payments), 0);
  console.log("PASS completed-contract backfill: 1 Pending batch, 2 deliveries, 3 allocation lines; exact BO calculations/Friday; paid record unchanged; rerun creates 0");

  // Execute actual SELECT policies as the authenticated supplier, not postgres.
  await db.exec("GRANT USAGE ON SCHEMA public, auth TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;");
  for (const table of ["payments", "payment_details", "contracts", "deliveries"]) {
    await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    for (const [policy] of schema.matchAll(new RegExp(`CREATE POLICY "[^"]+" ON "public"\\."${table}" FOR SELECT[\\s\\S]*?;`, "g"))) await db.exec(policy);
  }
  for (const [id, expectedPayments, expectedDetails] of [[supplier, 1, 3], [other, 1, 1], [empty, 0, 0]]) {
    await switchSupplier(id);
    assert.equal(Number((await one("SELECT count(*) AS n FROM payments")).n), expectedPayments);
    assert.equal(Number((await one("SELECT count(*) AS n FROM payment_details")).n), expectedDetails);
    assert.equal(Number((await one("SELECT count(*) AS n FROM payments WHERE supplier_id<>auth.uid()")).n), 0);
    await assert.rejects(db.query("SELECT ensure_pending_delivery_payment($1)", [first.d.delivery_id]), error => error.code === "42501");
    await db.exec("RESET ROLE");
  }
  console.log("PASS existing RLS: own Pending/paid headers and details readable; other supplier hidden; no-payable supplier empty; internal writer inaccessible");

  await db.exec(schema.match(/CREATE OR REPLACE TRIGGER "trigger_check_contract_completion"[^;]+;/)[0]);
  const liveContract = await makeContract(empty, "Active", 35, 1);
  const live = await delivery(empty, liveContract, { status: "Weighed" });
  assert.equal(Number((await one("SELECT count(*) AS n FROM payments WHERE supplier_id=$1", [empty])).n), 0);
  await db.query("UPDATE deliveries SET delivery_status='Accepted' WHERE delivery_id=$1", [live.d.delivery_id]);
  assert.equal((await one("SELECT status FROM contracts WHERE contract_id=$1", [liveContract.contract_id])).status, "Completed");
  const livePayment = await one("SELECT * FROM payments WHERE supplier_id=$1", [empty]);
  assert.equal(livePayment.payment_status, "Pending"); assert.equal(Number(livePayment.total_amount), 35000);
  await db.query("UPDATE deliveries SET delivery_status='Accepted' WHERE delivery_id=$1", [live.d.delivery_id]);
  assert.equal(Number((await one("SELECT count(*) AS n FROM payments WHERE supplier_id=$1", [empty])).n), 1);
  await db.query("UPDATE payments SET payment_status='Processing' WHERE payment_id=$1", [livePayment.payment_id]);
  const finalized = await one("SELECT * FROM finalize_successful_payment($1, 'fixture-reference')", [livePayment.payment_id]);
  assert.equal(finalized.finalized, true);
  const released = await one("SELECT * FROM payments WHERE payment_id=$1", [livePayment.payment_id]);
  assert.equal(released.payment_status, "Released"); assert(released.payment_date); assert.equal(Number(released.total_amount), 35000);
  assert.equal((await one("SELECT * FROM finalize_successful_payment($1, 'fixture-reference')", [livePayment.payment_id])).finalized, false);
  assert.equal(Number((await one("SELECT count(*) AS n FROM payments WHERE supplier_id=$1", [empty])).n), 1);
  assert.equal(Number((await one("SELECT count(*) AS n FROM e_receipts WHERE payment_id=$1", [livePayment.payment_id])).n), 1);
  console.log("PASS acceptance creates Pending alongside unchanged contract completion; existing finalizer updates SAME row once with paid date/receipt");

  const late = await delivery(supplier, completed, { status: "Accepted", qualityLast: true, createdAt: "2026-10-16T09:01:00Z" });
  await insert("quality_results", late.qr);
  const latePayment = await one("SELECT p.* FROM payments p JOIN deliveries d ON d.payment_id=p.payment_id WHERE d.delivery_id=$1", [late.d.delivery_id]);
  assert.equal(dateOnly(latePayment.payment_week), "2026-10-23"); assert.equal(latePayment.payment_status, "Pending");
  assert.equal(dateOnly(latePayment.payment_week), paymentFriday(late.d.created_at));
  const rejected = await delivery(supplier, completed, { status: "Rejected", quality: "Rejected", qualityLast: true });
  await insert("quality_results", rejected.qr);
  const walkin = await delivery(supplier, null, { source: "Walkin", status: "Weighed" });
  await db.query("UPDATE deliveries SET delivery_status='Accepted' WHERE delivery_id=$1", [walkin.d.delivery_id]);
  assert.equal((await one("SELECT payment_id FROM deliveries WHERE delivery_id=$1", [rejected.d.delivery_id])).payment_id, null);
  assert.equal((await one("SELECT payment_id FROM deliveries WHERE delivery_id=$1", [walkin.d.delivery_id])).payment_id, null);
  console.log("PASS late quality acceptance and Friday cutoff; rejected, unassessed and walk-in deliveries do not generate contractual payments");

  const centContract = await makeContract(supplier, "Active", 0.5, 1);
  const cent = await delivery(supplier, centContract, { status: "Weighed", net: 2.01, portions: [2.01] });
  await db.query("UPDATE deliveries SET delivery_status='Accepted' WHERE delivery_id=$1", [cent.d.delivery_id]);
  const centPayment = await one("SELECT p.total_amount, pd.line_amount FROM payments p JOIN payment_details pd USING(payment_id) WHERE pd.delivery_id=$1", [cent.d.delivery_id]);
  const expectedCent = Math.round((2.01 * 0.5) * 100) / 100;
  assert.equal(Number(centPayment.total_amount), expectedCent); assert.equal(Number(centPayment.line_amount), expectedCent);
  console.log("PASS preserves the BO's existing floating-point cent-rounding behavior");

  const oldLine = details[0];
  const duplicateHeader = await insert("payments", { supplier_id: supplier, business_owner_id: owner, payment_week: "2026-10-16", total_amount: 1 });
  const { payment_detail_id: _ignored, ...duplicateLine } = oldLine;
  await assert.rejects(insert("payment_details", { ...duplicateLine, payment_id: duplicateHeader.payment_id }), error => error.code === "23505");
  await db.query("DELETE FROM payments WHERE payment_id=$1", [duplicateHeader.payment_id]);
  const untouched = await delivery(supplier, completed, { status: "Weighed" });
  const before = Number((await one("SELECT count(*) AS n FROM payments")).n);
  await assert.rejects(db.query("SELECT create_payment_batch($1,$2,$3,$4,$5,$6)", [supplier, owner, "2026-10-16", 1, "Stale batch",
    JSON.stringify([duplicateLine, { ...duplicateLine, delivery_id: untouched.d.delivery_id }])]), error => error.code === "23505");
  assert.equal(Number((await one("SELECT count(*) AS n FROM payments")).n), before);
  assert.equal((await one("SELECT payment_id FROM deliveries WHERE delivery_id=$1", [untouched.d.delivery_id])).payment_id, null);
  console.log("PASS duplicate delivery rejected across payments; stale mixed batch rolls back header/details and leaves original payment intact");
} catch (error) {
  console.error(error.code === "ERR_ASSERTION" ? error : `${error.code}: ${error.message}\n${error.where ?? ""}`);
  process.exitCode = 1;
} finally { await db.close(); }
