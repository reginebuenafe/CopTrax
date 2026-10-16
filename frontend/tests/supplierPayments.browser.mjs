import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";

// npm exec --yes --package=playwright-core -- node tests/supplierPayments.browser.mjs
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(dir => path.dirname(dir))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-supplier-payments-tests"),
  optimizeDeps: { entries: ["tests/supplierPayments.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
    name: "supplier-payments-fixture", enforce: "pre",
    resolveId(source) {
      if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return path.join(root, "tests/supplierPayments.mock.js");
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/tests/supplier-payments.html?")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/tests/supplierPayments.fixture.jsx"></script></body></html>'));
    }); },
  }] });
await server.listen();
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const errors = [], queries = [];
const artifacts = path.join(root, "tests/artifacts"); await mkdir(artifacts, { recursive: true });
const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/supplier-payments.html?supplier=`;
function payment(id, status, amount, supplier = "supplier-a") {
  return { payment_id: id, supplier_id: supplier, payment_week: "2026-10-16", payment_date: status === "Released" ? "2026-10-15" : null,
    total_amount: amount, payment_status: status, created_at: id === "pending" ? "2026-10-16T12:00:00Z" : "2026-10-15T12:00:00Z",
    reference_number: `PAYMENT-${id}`, payment_method: "Bank Transfer",
    supplier: { first_name: "Juan", last_name: "Supplier", bank_accounts: [{ bank_name: "Test Bank", account_name: "Juan Supplier", account_number: "12345678901234567890" }] },
    payment_details: [{ payment_detail_id: `detail-${id}`, delivery_id: `delivery-${id}`, net_weight_kg: amount / 30, final_weight_kg: amount / 30,
      price_per_kg_used: 30, line_amount: amount, price_type: "Negotiated", moisture_deduction_kg: 0,
      delivery: { batch_number: `BATCH-${id}`, contract_id: `contract-${id}`, contract: { contract_number: `CONTRACT-${id}` } } }],
    e_receipts: status === "Released" ? [{ receipt_number: `RECEIPT-${id}`, generated_at: "2026-10-15T12:00:00Z" }] : [],
  };
}
let rows = [];
async function open(width = 1280, supplier = "supplier-a") {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/rest/v1/payments?**", async route => {
    const url = new URL(route.request().url()); queries.push(url);
    const owner = url.searchParams.get("supplier_id");
    assert.equal(owner, `eq.${supplier}`, "every query must be supplier scoped");
    assert.equal(url.searchParams.get("order"), "created_at.desc");
    assert.equal(url.searchParams.get("payment_status"), null, "preserve existing status visibility");
    assert(url.searchParams.get("select").includes("contract:contract_id(contract_number)"));
    const data = rows.filter(row => owner === `eq.${row.supplier_id}`).sort((a, b) => b.created_at.localeCompare(a.created_at));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(base + supplier);
  await page.getByText(rows.some(row => row.supplier_id === supplier) ? "Total Received" : "No payments yet", { exact: true }).waitFor();
  return page;
}
const summaryValue = (page, label) => page.getByText(label, { exact: true }).locator("..").locator("p").first().innerText();
const cardButton = (page, amount, status) => page.getByRole("button").filter({ hasText: amount }).filter({ hasText: status });
try {
  rows = [payment("completed", "Released", 30000)];
  let page = await open();
  assert.equal(await summaryValue(page, "Total Received"), "₱30,000.00");
  assert.equal(await summaryValue(page, "Amount to receive"), "₱0.00");
  await cardButton(page, "₱30,000.00", "Completed").click();
  await page.getByRole("button", { name: "View Receipt" }).click();
  await page.getByText("RECEIPT-completed", { exact: true }).last().waitFor();
  await page.getByRole("button", { name: "Download" }).waitFor();
  console.log("PASS completed-only amounts and existing receipt modal/actions"); await page.close();

  for (const width of [1280, 380, 320]) {
    rows = [payment("completed", "Released", 30000), payment("pending", "Pending", 15000), payment("other", "Pending", 99999, "supplier-b")];
    page = await open(width);
    assert.equal(await summaryValue(page, "Total Received"), "₱30,000.00");
    assert.equal(await summaryValue(page, "Amount to receive"), "₱15,000.00");
    const buttons = page.getByRole("button");
    assert((await buttons.first().innerText()).includes("Pending"));
    await cardButton(page, "₱15,000.00", "Pending").click();
    for (const text of ["Pending: payment is on its way to you.", "Reference: BATCH-pending", "Contract: CONTRACT-pending", "Expected payment date", "Test Bank", "Juan Supplier", "12345678901234567890"]) await page.getByText(text, { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "View Receipt" }).count(), 0);
    await page.getByText("× ₱30.00/kg", { exact: false }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    assert(await page.locator("#root *").evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).display === "inline")), "no cut-off card content");
    if (width === 380) await page.screenshot({ path: path.join(artifacts, "supplier-payments-pending-380.png"), fullPage: true });
    rows[1] = { ...rows[1], payment_status: "Released", payment_date: "2026-10-16" };
    await page.reload(); await page.getByText("Total Received", { exact: true }).waitFor();
    assert.equal(await summaryValue(page, "Total Received"), "₱45,000.00");
    assert.equal(await summaryValue(page, "Amount to receive"), "₱0.00");
    await cardButton(page, "₱15,000.00", "Completed").click();
    await page.getByText("Paid Oct 16, 2026", { exact: false }).waitFor();
    await page.getByText("Date paid", { exact: true }).waitFor();
    console.log(`PASS mixed statuses, details, newest-first, status transition on reopen and overflow at ${width}px`); await page.close();
  }

  rows = [payment("pending", "Pending", 15000), payment("other", "Released", 8000, "supplier-b")];
  page = await open(); assert.equal(await summaryValue(page, "Total Received"), "₱0.00");
  assert.equal(await summaryValue(page, "Amount to receive"), "₱15,000.00"); await page.close();
  page = await open(380, "supplier-b"); assert.equal(await summaryValue(page, "Total Received"), "₱8,000.00");
  assert.equal(await page.getByText("Pending", { exact: true }).count(), 0); await page.close();
  console.log("PASS pending-only and two distinct supplier query scopes");

  rows = [];
  page = await open(320); assert.equal(await page.getByText("Amount to receive", { exact: true }).count(), 0); await page.close();
  console.log("PASS original no-payments empty state");

  rows = [payment("processing", "Processing", 1000), payment("failed", "Failed", 2000)];
  page = await open(); await page.getByText("Processing", { exact: true }).waitFor(); await page.getByText("Failed", { exact: true }).waitFor();
  assert.equal(await summaryValue(page, "Amount to receive"), "₱1,000.00"); await page.close();
  assert(queries.length > 0); assert.deepEqual(errors, []);
  console.log("PASS Processing/Failed visibility and existing totals preserved; no browser errors");
} finally { await browser.close(); await server.close(); }
