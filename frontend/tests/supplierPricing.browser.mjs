import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";
// npm exec --yes --package=playwright-core -- node tests/supplierPricing.browser.mjs
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-pricing-tests"), optimizeDeps: { entries: ["tests/supplierPricing.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
  name: "isolated-supplier-pricing", enforce: "pre",
  resolveId(source) { if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return path.join(root, "tests/supplierPricing.mock.js"); },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/tests/pricing.html?")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/tests/supplierPricing.fixture.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHAT_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const errors = [], contexts = [];
const artifacts = path.join(root, "tests/artifacts"); await mkdir(artifacts, { recursive: true });
async function open(view, extra = "", width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 844 } }); contexts.push(context);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  // Accept goes through the unchanged edge endpoint; intercept it locally.
  await page.route("**/functions/v1/generate-contract", route => route.fulfill({ json: { success: true } }));
  await page.goto(`${base}/tests/pricing.html?view=${view}${view === "owner" ? "&viewer=owner" : ""}${extra}`);
  return page;
}
const notice = page => page.getByRole("complementary", { name: "First-time supplier pricing" });
const counter = page => page.getByRole("button", { name: "Counter", exact: true });
const propose = page => page.getByRole("button", { name: /^(Submit Price Proposal|Propose Price)$/ });
async function ready(page) { await page.locator('input[maxlength="2000"]').waitFor(); await page.getByText("Checking pricing eligibility…", { exact: true }).waitFor({ state: "hidden" }); }
async function noOverflow(page) { assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "horizontal overflow"); }
try {
  for (const view of ["widget", "supplier"]) {
    const page = await open(view, "&delay=800&saved=counter", 380);
    await page.getByText("Checking pricing eligibility…", { exact: true }).waitFor();
    for (const button of await counter(page).all()) assert(await button.isDisabled());
    for (const button of await propose(page).all()) assert(await button.isDisabled());
    assert.equal(await notice(page).count(), 0);
    await ready(page); await notice(page).waitFor();
    assert(await counter(page).isDisabled()); assert(await propose(page).first().isEnabled());
    assert.match(await counter(page).getAttribute("title"), /cannot counter/);
    await propose(page).first().click(); await page.getByRole("heading", { name: "Propose Price", exact: true }).waitFor();
    await page.locator('input[type="number"]').nth(0).fill("50"); await page.locator('input[type="number"]').nth(1).fill("2");
    await page.getByRole("button", { name: "Submit Proposal", exact: true }).click();
    await page.waitForFunction(() => window.pricingFixture.calls.some(call => call.table === "proposal_forms" && call.insert.supersedes_proposal_id === null));
    await page.getByText("Spot price basis", { exact: true }).waitFor();
    await page.getByText("Current spot price: ₱50.00/kg", { exact: true }).waitFor();
    await page.waitForFunction(view => sessionStorage.getItem(`coptrax:proposal-modal:${view === "widget" ? "widget" : "supplier-chat"}:supplier`) === null, view);
    assert.equal(await page.getByText("Submit Counteroffer", { exact: true }).count(), 0);
    const accept = page.getByRole("button", { name: "Accept", exact: true });
    const decline = page.getByRole("button", { name: view === "widget" ? "Reject" : "Decline", exact: true });
    assert(await accept.isEnabled()); assert(await decline.isEnabled());
    assert(Math.abs((await accept.boundingBox()).width - (await decline.boundingBox()).width) < 1);
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `first-time-${view}-380.png`), fullPage: true });
    await page.locator('input[maxlength="2000"]').fill("Text stays available"); await page.locator('input[maxlength="2000"]').press("Enter");
    await page.waitForFunction(() => window.pricingFixture.calls.some(call => call.table === "messages" && call.insert.message_text === "Text stays available"));
    // Existing accept path still calls generate-contract, never the proposal INSERT.
    let accepted = false;
    await page.evaluate(() => { window.pricingFixture.calls.length = 0; });
    await page.route("**/functions/v1/generate-contract", route => { accepted = true; return route.fulfill({ json: { success: true } }); });
    await accept.click(); await page.waitForFunction(() => window.pricingFixture.calls.some(call => call.table === "notifications"));
    assert(accepted);
    await page.reload(); await ready(page); await decline.click();
    await page.waitForFunction(() => window.pricingFixture.calls.some(call => call.rpc === "decline_current_proposal"));
    if (view === "supplier") {
      await page.getByText("You rejected NERC Copra Trading's counteroffer.", { exact: true }).waitFor();
      assert.equal(await propose(page).count(), 2, "header and footer proposal buttons remain after rejection");
      for (const button of await propose(page).all()) assert(await button.isEnabled());
      for (const suggestion of ["I'll review the contract shortly.", "Can I receive payment earlier?", "What moisture content is acceptable?"]) {
        assert(await page.getByRole("button", { name: suggestion, exact: true }).isVisible());
      }
      await page.getByRole("button", { name: "Can I receive payment earlier?", exact: true }).click();
      assert.equal(await page.locator('input[maxlength="2000"]').inputValue(), "Can I receive payment earlier?");
      await propose(page).last().click();
      await page.getByRole("heading", { name: "Propose Price", exact: true }).waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    await page.evaluate(() => window.pricingFixture.setContractHistory("Pending"));
    await notice(page).waitFor({ state: "hidden" }); await propose(page).first().waitFor();
    await page.reload(); await ready(page); await notice(page).waitFor();
    for (const status of ["Cancelled", "Breached"]) {
      const experienced = await open(view, `&history=${status}`); await ready(experienced);
      assert.equal(await notice(experienced).count(), 0); await counter(experienced).waitFor(); await propose(experienced).first().waitFor();
      await counter(experienced).click(); await experienced.getByText("Submit Counteroffer", { exact: true }).waitFor();
      await experienced.getByRole("button", { name: "Cancel", exact: true }).click();
      await propose(experienced).first().click();
      await experienced.getByRole("heading", { name: "Propose Price", exact: true }).waitFor();
    }
    const empty = await open(view, "&empty"); await ready(empty); await notice(empty).waitFor();
    for (const button of await propose(empty).all()) assert(await button.isEnabled());
    const saved = await open(view, "&empty&saved=propose");
    await saved.getByRole("heading", { name: "Propose Price", exact: true }).waitFor();
    const fallback = await open(view, "&no_spot"); await ready(fallback); await fallback.getByText("Offer price: ₱50.00/kg", { exact: true }).waitFor();
    const failed = await open(view, "&failure"); await ready(failed);
    for (const button of await propose(failed).all()) assert(await button.isDisabled());
    for (const button of await counter(failed).all()) assert(await button.isDisabled());
    console.log(`PASS ${view}: loading, zero/history, stale modals, text/decisions, realtime unlock, fallback, mobile`);
  }
  const overview = await open("overview"); await overview.getByRole("heading", { name: "How pricing works" }).waitFor();
  await notice(overview).filter({ has: overview.getByRole("heading", { name: "How pricing works" }) }).getByRole("button", { name: "Dismiss pricing information" }).click();
  assert.equal(await overview.getByRole("heading", { name: "How pricing works" }).count(), 0);
  await overview.reload();
  await ready(overview); await overview.getByRole("heading", { name: "How pricing works" }).waitFor(); assert.equal(await notice(overview).count(), 2);
  const liveOverview = await open("overview"); await liveOverview.getByRole("heading", { name: "How pricing works" }).waitFor();
  await liveOverview.evaluate(() => window.pricingFixture.setContractHistory("Pending")); await notice(liveOverview).first().waitFor({ state: "hidden" }); assert.equal(await notice(liveOverview).count(), 0);
  const bo = await open("owner"); await bo.getByText("First-time supplier", { exact: true }).waitFor();
  await bo.evaluate(() => window.pricingFixture.setContractHistory("Cancelled")); await bo.getByText("First-time supplier", { exact: true }).waitFor({ state: "hidden" });
  const direct = await open("modal"); await direct.getByRole("dialog", { name: "Pricing information" }).waitFor(); assert.equal(await direct.locator('input[type="number"]').count(), 0);
  const initial = await open("modal", "&initial"); await initial.getByRole("button", { name: "Submit Proposal", exact: true }).waitFor();
  await initial.locator('input[type="number"]').nth(0).fill("50"); await initial.locator('input[type="number"]').nth(1).fill("2");
  await initial.getByRole("button", { name: "Submit Proposal", exact: true }).click();
  await initial.waitForFunction(() => window.pricingFixture.calls.some(call => call.table === "proposal_forms" && call.insert.supersedes_proposal_id === null));
  const stale = await open("modal", "&history=Breached"); await stale.getByRole("button", { name: "Send Counteroffer", exact: true }).waitFor();
  await stale.evaluate(() => window.pricingFixture.setContractHistory(null, false)); await stale.getByRole("button", { name: "Send Counteroffer", exact: true }).click();
  await stale.getByRole("dialog", { name: "Pricing information" }).waitFor(); assert.equal(await stale.evaluate(() => window.pricingFixture.calls.filter(call => call.table === "proposal_forms" && call.insert).length), 0);
  const boModal = await open("modal", "&viewer=owner"); await boModal.getByRole("button", { name: "Send Counteroffer", exact: true }).click();
  await boModal.waitForFunction(() => window.pricingFixture.calls.some(call => call.table === "proposal_forms" && call.insert.submitted_by === "owner"));
  console.log("PASS dashboard dismissal/live refresh, BO badge/counter, direct and stale modal guards");
  assert.deepEqual(errors, []); console.log("PASS no browser errors; all application data and requests isolated");
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); await server.close(); }
