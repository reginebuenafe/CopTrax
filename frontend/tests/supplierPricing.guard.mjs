import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
// Real PostgreSQL engine in memory; never connects to the application database.
// npm exec --yes --package=@electric-sql/pglite -- node tests/supplierPricing.guard.mjs
const require = createRequire(import.meta.url);
const { PGlite } = require(require.resolve("@electric-sql/pglite", { paths: process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory)) }));
const db = new PGlite();
const supplier = "11111111-1111-4111-8111-111111111111", owner = "22222222-2222-4222-8222-222222222222";
try {
  await db.exec(`CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('fixture.uid', true), '')::uuid $$;
    CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('fixture.role', true) $$;
    CREATE TABLE public.contracts (supplier_id uuid, status text);
    CREATE TABLE public.proposal_forms (supplier_id uuid, submitted_by uuid, supersedes_proposal_id uuid, proposal_status text DEFAULT 'Pending');`);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261015000087_first_time_supplier_proposal_guard.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../../supabase/migrations/20261015000088_allow_first_time_supplier_initial_proposals.sql", import.meta.url), "utf8"));
  async function actor(id, role) { await db.query("SELECT set_config('fixture.uid', $1, false), set_config('fixture.role', $2, false)", [id, role]); }
  async function insert(author = supplier, counter = false) { return db.query("INSERT INTO proposal_forms(supplier_id, submitted_by, supersedes_proposal_id) VALUES ($1,$2,$3)", [supplier, author, counter ? owner : null]); }
  async function blocked(author, counter) { await assert.rejects(insert(author, counter), error => error.code === "42501" && /First-time suppliers/.test(error.message)); }
  await actor(supplier, "Supplier"); await insert(); await blocked(supplier, true); await blocked(owner, true);
  for (const status of ["Pending", "Active", "Completed", "Breached", "Cancelled", "Other"]) {
    await db.query("INSERT INTO contracts VALUES ($1,$2)", [supplier, status]); await insert(); await insert(supplier, true); await db.exec("DELETE FROM contracts");
  }
  await db.query("INSERT INTO contracts VALUES ($1,'Cancelled')", [owner]); await insert(); await blocked(supplier, true);
  await actor(owner, "Business Owner"); await insert(owner, true);
  await actor("", "service_role"); await insert(); await insert(owner, true); await blocked(supplier, true);
  await actor(supplier, "Supplier"); await db.exec("UPDATE proposal_forms SET proposal_status='Accepted'; UPDATE proposal_forms SET proposal_status='Rejected';");
  console.log("PASS migrations 087 + 088: zero-history initial proposal allowed; counter/spoof rejected; every contract status allows counters; unrelated supplier ignored; BO/service AI allowed; accept/reject updates unaffected");
} finally { await db.close(); }
