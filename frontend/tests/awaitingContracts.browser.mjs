import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";

// npm exec --yes --package=playwright-core -- node tests/awaitingContracts.browser.mjs
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(dir => path.dirname(dir))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-awaiting-contracts-tests"),
  define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("") },
  optimizeDeps: { entries: ["tests/awaitingContracts.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
    name: "awaiting-contracts-fixture", enforce: "pre",
    resolveId(source) {
      if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return path.join(root, "tests/awaitingContracts.mock.js");
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/dashboard/owner")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/tests/awaitingContracts.fixture.jsx"></script></body></html>'));
    }); },
  }] });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const artifacts = path.join(root, "tests/artifacts"); await mkdir(artifacts, { recursive: true });
const errors = [], queries = [];
function contract(id, status) {
  return { contract_id: id, contract_number: `CONTRACT-${id}`, status, supplier_id: "supplier", business_owner_id: "owner",
    supplier: { user_id: "supplier", first_name: "Juan", last_name: "Supplier", email: "supplier@example.test" },
    negotiated_price_per_kg: 30, contracted_tons: 2, created_at: "2026-10-16T00:00:00Z", bo_reviewed_at: "2026-10-15T00:00:00Z" };
}
let contracts, holdCount = null, failCount = false;
const reset = () => { contracts = [contract("review1", "Pending Owner Review"), contract("review2", "Pending Owner Review"), contract("signature", "Pending"), contract("active", "Active"), contract("completed", "Completed")]; holdCount = null; failCount = false; };
const card = page => page.getByRole("button", { name: "Awaiting contracts:", exact: false });
const panel = page => page.getByRole("dialog", { name: "Pending contracts", exact: true });
async function open(width = 1280, pathname = "/dashboard/owner") {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/rest/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split("/").at(-1);
    queries.push({ table, method: request.method(), params: Object.fromEntries(url.searchParams) });
    if (table.startsWith("auto_")) return route.fulfill({ status: 200, json: null });
    let data = table === "contracts" ? contracts : table === "spot_price" ? [{ price_per_kg: 30 }] : [];
    for (const [key, value] of url.searchParams) if (value.startsWith("eq.")) data = data.filter(row => String(row[key]) === value.slice(3));
    if (table === "contracts" && request.method() === "HEAD" && url.searchParams.get("status") === "eq.Pending Owner Review") {
      if (holdCount) await holdCount;
      if (failCount) return route.fulfill({ status: 403, json: { message: "Fixture access denied" } });
    }
    await route.fulfill({ status: 200, headers: { "Content-Range": `0-${Math.max(0, data.length - 1)}/${data.length}` }, json: data });
  });
  await page.route("**/functions/v1/approve-contract", async route => {
    const body = route.request().postDataJSON(); assert.equal(body.confirmed, true);
    contracts = contracts.map(row => row.contract_id === body.contract_id ? { ...row, status: "Active" } : row);
    await route.fulfill({ status: 200, json: { contract_id: body.contract_id, status: "Active" } });
  });
  await page.goto(base + pathname);
  return page;
}
async function ready(page, count = 2) { await page.getByRole("button", { name: `Awaiting contracts: ${count}, open pending contracts`, exact: true }).waitFor(); }
async function consumed(page) { await page.waitForFunction(() => !history.state?.usr?.openPendingContracts); }
try {
  reset(); let releaseCount; holdCount = new Promise(resolve => { releaseCount = resolve; });
  let page = await open(); await card(page).waitFor();
  assert.equal(await card(page).getAttribute("aria-busy"), "true");
  assert((await card(page).innerText()).includes("…")); assert(!(await card(page).innerText()).includes("0"));
  releaseCount(); holdCount = null; await ready(page);
  await card(page).click(); await panel(page).getByText("Awaiting Owner Review (2)", { exact: true }).waitFor();
  await panel(page).getByText("Awaiting Supplier Signature (1)", { exact: true }).waitFor();
  await consumed(page);
  await page.screenshot({ path: path.join(artifacts, "awaiting-contracts-panel.png") });
  await page.reload(); await page.getByRole("heading", { name: "Contracts", exact: true }).waitFor(); assert.equal(await panel(page).count(), 0);
  await page.goBack(); await ready(page); await page.goForward();
  await page.getByRole("heading", { name: "Contracts", exact: true }).waitFor(); assert.equal(await panel(page).count(), 0);
  await page.getByRole("link", { name: "Overview", exact: true }).click(); await ready(page);
  await page.getByRole("link", { name: "Contracts", exact: true }).click();
  await page.getByRole("heading", { name: "Contracts", exact: true }).waitFor(); assert.equal(await panel(page).count(), 0);
  console.log("PASS loading, exact owner-review count, one-time opening, reload, Back/Forward, and ordinary Contracts link"); await page.close();

  for (const width of [1440, 1024, 768, 380, 320]) {
    reset(); page = await open(width); await ready(page);
    const row = page.locator('[aria-label="Overview statistics"]');
    const cards = row.locator(".grid > *"); assert.equal(await cards.count(), 5);
    const positions = await cards.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { top: r.top, width: r.width }; }));
    assert(positions.every(p => Math.abs(p.top - positions[0].top) < 1 && Math.abs(p.width - positions[0].width) < 1));
    assert.deepEqual(await cards.locator("p[title]").allTextContents(), ["Pending Registrations", "Active Contracts", "Awaiting Contracts", "Total Amount Paid", "Pending Payments"]);
    assert(await cards.locator("p").evaluateAll(elements => elements.every(el => getComputedStyle(el).whiteSpace === "nowrap")));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    if (width < 720) assert(await row.evaluate(el => el.scrollWidth > el.clientWidth));
    if (width === 1440 || width === 380) await row.screenshot({ path: path.join(artifacts, `awaiting-contracts-row-${width}.png`) });
    await card(page).focus(); await page.keyboard.press("Enter");
    await panel(page).getByText("Awaiting Owner Review (2)", { exact: true }).waitFor();
    await consumed(page); await page.goBack(); await ready(page);
    await card(page).focus(); await page.keyboard.press("Space");
    await panel(page).waitFor();
    console.log(`PASS equal-width single row, title truncation, no page overflow and Enter/Space activation at ${width}px`); await page.close();
  }

  reset(); contracts = contracts.filter(row => row.status !== "Pending Owner Review");
  page = await open(); await ready(page, 0); await card(page).click();
  await panel(page).getByText("Awaiting Owner Review (0)", { exact: true }).waitFor();
  console.log("PASS zero count remains clickable and opens empty owner-review section"); await page.close();

  reset(); page = await open(); await ready(page); await card(page).click();
  await panel(page).getByText("Awaiting Owner Review (2)", { exact: true }).waitFor();
  await panel(page).locator("section").filter({ hasText: "Awaiting Owner Review" }).getByRole("button", { name: "View", exact: true }).first().click();
  await page.getByRole("button", { name: "Approve & Sign Contract", exact: true }).click();
  await page.getByRole("button", { name: "Confirm & Sign", exact: true }).click();
  await page.getByRole("heading", { name: "Contract Signed & Active", exact: true }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click(); await ready(page, 1);
  await card(page).click(); await panel(page).getByText("Awaiting Owner Review (1)", { exact: true }).waitFor();
  console.log("PASS existing approval flow with simulated response reduces Overview count on return"); await page.close();

  reset(); failCount = true; page = await open();
  await page.getByRole("button", { name: "Awaiting contracts: unavailable, open pending contracts", exact: true }).waitFor();
  assert(!(await card(page).innerText()).includes("0")); await page.close();
  reset(); page = await open(); await ready(page);
  await page.getByRole("button", { name: "Pending Registrations", exact: false }).click(); await page.getByText("User Management", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Overview", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Pending Payments", exact: false }).click();
  assert.equal(new URL(page.url()).search, "?tab=batches&filter=Pending"); await page.close();
  assert(queries.some(q => q.table === "contracts" && q.method === "HEAD" && q.params.status === "eq.Pending Owner Review"));
  assert.deepEqual(errors, []);
  console.log("PASS failed count never displays false zero; other stat destinations preserved; no browser errors");
} finally { await browser.close(); await server.close(); }
