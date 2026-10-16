import test from "node:test";
import assert from "node:assert/strict";
import { createSupplierPricingStore } from "../src/utils/supplierPricing.js";

function fixture() {
  let rows = [], fail = false, spot = 50;
  const filters = [];
  const client = { from(table) {
    return { select() { return this; }, eq(key, value) { filters.push([table, key, value]); return this; }, limit() { return this; }, maybeSingle() { return this; },
      then(resolve) { resolve(table === "contracts" ? { count: rows.length, error: fail ? new Error("offline") : null } : { data: { price_per_kg: spot } }); } };
  } };
  return { store: createSupplierPricingStore(client), filters, history: statuses => { rows = statuses; }, fail: () => { fail = true; }, noSpot: () => { spot = null; } };
}
test("zero history; every status counts; the only contract filter is supplier_id", async () => {
  const f = fixture();
  assert.equal(f.store.getSnapshot("supplier").loading, true);
  assert.equal((await f.store.refresh("supplier")).count, 0);
  for (const status of ["Pending", "Active", "Completed", "Breached", "Cancelled", "Other"]) {
    f.history([status]);
    assert.equal((await f.store.refresh("supplier")).count, 1, status);
  }
  assert(f.filters.every(([table, key, id]) => table === "contracts" && key === "supplier_id" && id === "supplier"));
});
test("shared subscribers observe eligibility refresh; failures never grant access", async () => {
  const f = fixture(); let updates = 0;
  const unsubscribe = f.store.subscribe("supplier", () => updates++);
  await f.store.refresh("supplier");
  f.history(["Pending"]); await f.store.refresh("supplier");
  assert.equal(f.store.getSnapshot("supplier").count, 1);
  assert(updates >= 4);
  f.fail();
  const failed = await f.store.refresh("supplier");
  assert.equal(failed.count, null); assert.equal(failed.loading, false); assert.equal(failed.error, "offline");
  unsubscribe(); const before = updates; await f.store.refresh("supplier"); assert.equal(updates, before);
});
test("no spot source returns null for offer-price fallback", async () => {
  const f = fixture(); f.noSpot();
  assert.equal((await f.store.refresh("supplier")).spotPrice, null);
});
test("late zero-contract response cannot overwrite a newer contract-created refresh", async () => {
  const pending = [];
  const store = createSupplierPricingStore({ from(table) { return {
    select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle() { return this; },
    then(resolve) { if (table === "contracts") pending.push(resolve); else resolve({ data: null }); },
  }; } });
  const old = store.refresh("supplier"); await Promise.resolve();
  const current = store.refresh("supplier"); await Promise.resolve();
  pending[1]({ count: 1 }); await current;
  pending[0]({ count: 0 }); await old;
  assert.equal(store.getSnapshot("supplier").count, 1);
});
