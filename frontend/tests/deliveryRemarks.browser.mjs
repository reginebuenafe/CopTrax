import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";

// npm exec --yes --package=playwright-core -- node tests/deliveryRemarks.browser.mjs
const root = fileURLToPath(new URL("../", import.meta.url)), require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(dir => path.dirname(dir))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-delivery-remarks-tests"),
  optimizeDeps: { entries: ["tests/deliveryRemarks.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
    name: "delivery-remarks-fixture", enforce: "pre",
    resolveId(source) { if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return path.join(root, "tests/deliveryRemarks.mock.js"); },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/tests/delivery-remarks.html")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/tests/deliveryRemarks.fixture.jsx"></script></body></html>'));
    }); },
  }] });
await server.listen();
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/delivery-remarks.html`;
const artifacts = path.join(root, "tests/artifacts"); await mkdir(artifacts, { recursive: true });
const errors = [];
const rejectedText = "Moisture content 30cc exceeds 20.2cc. Automatic rejection.";
const acceptedText = "Accepted: Inspection complete. Deduction: 4.7%.";
const longText = " Accepted:\n  Inspection recorded with a detailed sample observation and additional information recorded by the laboratory staff for this delivery. ";
function delivery(id, status, remarks, result = status, moisture = 10) {
  return { delivery_id: id, supplier_id: "supplier", delivery_source: "Contract-based", delivery_status: status,
    delivery_date: "2026-10-16", created_at: "2026-10-16T07:00:00Z", truck_plate_number: `TRUCK-${id}`,
    contract_id: `contract-${id}`, contract: { contract_number: `CONTRACT-${id}` },
    weigher: { first_name: "Wendy", last_name: "Weigher" }, weighing_records: [{ gross_weight_kg: 1200, tare_weight_kg: 200, net_weight_kg: 1000 }],
    laboratory_inspections: moisture === null ? [] : [{ moisture_content_pct: moisture, inspected_at: "2026-10-16T08:00:00Z", lab_staff: { first_name: "Lara", last_name: "Lab" } }],
    quality_results: remarks === null ? [] : [{ result, remarks }],
  };
}
const rows = [delivery("rejected", "Rejected", rejectedText, "Rejected", 30), delivery("accepted", "Accepted", acceptedText),
  delivery("pending", "Weighed", null, null, null), delivery("long", "Accepted", longText), delivery("empty", "Accepted", " \n "),
  { ...delivery("priority", "Rejected", "Accepted: Previous sample was reviewed."), quality_results: [{ result: "Accepted", remarks: "Accepted: Previous sample was reviewed." }, { result: "Rejected", remarks: "Rejected: Second sample failed inspection." }] },
  delivery("note", "Weighed", " Waiting for\n the second sample. ", null, null)];
async function open(width, touch = false) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url()), table = url.pathname.split("/").at(-1);
    if (table === "deliveries") {
      assert.equal(url.searchParams.get("supplier_id"), "eq.supplier");
      assert.equal(url.searchParams.get("delivery_source"), "eq.Contract-based");
      assert(url.searchParams.get("select").includes("quality_results(result,remarks)"));
    }
    await route.fulfill({ status: 200, json: table === "deliveries" ? rows : table === "spot_price" ? [{ price_per_kg: 30 }] : [] });
  });
  await page.goto(base); await page.getByText("7 total", { exact: true }).waitFor(); return { context, page };
}
const header = (page, id) => page.getByRole("button").filter({ hasText: `CONTRACT-${id}` });
const info = page => page.getByRole("button", { name: "Moisture remarks", exact: true });
const tooltip = page => page.getByRole("tooltip");
async function assertInside(page) {
  const bounds = await tooltip(page).boundingBox(), size = page.viewportSize();
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width + 1 && bounds.y + bounds.height <= size.height + 1);
  assert.equal(await tooltip(page).evaluate(el => el.parentElement === document.body), true);
  assert.equal(await tooltip(page).evaluate(el => getComputedStyle(el).whiteSpace), "nowrap");
}
try {
  for (const width of [1280, 768]) {
    const { context, page } = await open(width);
    await header(page, "rejected").click(); assert.equal(await info(page).count(), 1);
    const cell = page.locator("td").filter({ has: info(page) });
    const before = await page.locator("tbody tr td").evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
    await info(page).hover(); await tooltip(page).waitFor();
    assert.equal(await tooltip(page).innerText(), `Rejected: ${rejectedText}`); await assertInside(page);
    assert.equal(await info(page).getAttribute("aria-describedby"), await tooltip(page).getAttribute("id"));
    assert((await cell.innerText()).includes("30cc"));
    await page.locator('td button[aria-label="Moisture remarks"]').evaluate(el => { el.style.display = "none"; });
    assert.deepEqual(await page.locator("tbody tr td").evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; })), before);
    await page.locator('td button[aria-label="Moisture remarks"]').evaluate(el => { el.style.display = ""; });
    await page.mouse.move(0, 0); await tooltip(page).waitFor({ state: "hidden" });
    await header(page, "rejected").focus(); await page.keyboard.press("Tab");
    assert.equal(await info(page).evaluate(el => el === document.activeElement), true);
    await tooltip(page).waitFor(); await page.keyboard.press("Escape"); await tooltip(page).waitFor({ state: "hidden" });
    await header(page, "accepted").click(); await info(page).focus(); await tooltip(page).waitFor();
    assert.equal(await tooltip(page).innerText(), acceptedText);
    await page.keyboard.press("Tab"); await tooltip(page).waitFor({ state: "hidden" });
    for (const id of ["pending", "empty"]) { await header(page, id).click(); assert.equal(await info(page).count(), 0); }
    await header(page, "priority").click(); await info(page).focus(); await tooltip(page).waitFor();
    assert.equal(await tooltip(page).innerText(), "Rejected: Second sample failed inspection.");
    await header(page, "long").click(); await info(page).focus(); await tooltip(page).waitFor();
    const normalized = longText.replace(/\s+/g, " ").trim();
    assert.equal(await tooltip(page).innerText(), `${normalized.slice(0, 79).trimEnd()}…`); await assertInside(page);
    if (width === 1280) await page.screenshot({ path: path.join(artifacts, "delivery-moisture-remarks-desktop.png") });
    // Force anchors against viewport edges to verify flipping and clamping.
    await info(page).evaluate(el => { Object.assign(el.style, { position: "fixed", top: "2px", left: "2px", transform: "none" }); window.dispatchEvent(new Event("resize")); });
    await assertInside(page); assert((await tooltip(page).boundingBox()).y > (await info(page).boundingBox()).y);
    await info(page).evaluate(el => { el.style.left = `${innerWidth - 20}px`; el.style.top = `${innerHeight - 20}px`; window.dispatchEvent(new Event("resize")); });
    await assertInside(page); assert((await tooltip(page).boundingBox()).y < (await info(page).boundingBox()).y);
    await page.getByPlaceholder("Search contract number or batch…").fill("CONTRACT-pending");
    assert.equal(await header(page, "pending").count(), 1); assert.equal(await header(page, "rejected").count(), 0);
    assert.equal(await tooltip(page).count(), 0);
    console.log(`PASS ${width}px: stored text/priority, absent remarks, truncation, hover/focus/Escape/blur, portal/edges, unchanged cells and search`);
    await context.close();
  }
  for (const width of [380, 320]) {
    const { context, page } = await open(width, true);
    await header(page, "accepted").tap(); assert.equal(await info(page).count(), 1);
    await info(page).tap(); await tooltip(page).waitFor(); assert.equal(await tooltip(page).innerText(), acceptedText); await assertInside(page);
    await info(page).tap(); await tooltip(page).waitFor({ state: "hidden" });
    await info(page).tap(); await tooltip(page).waitFor();
    await page.getByRole("heading", { name: "Deliveries", exact: true }).tap(); await tooltip(page).waitFor({ state: "hidden" });
    await header(page, "long").tap(); await info(page).tap(); await tooltip(page).waitFor(); await assertInside(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    if (width === 380) await page.screenshot({ path: path.join(artifacts, "delivery-moisture-remarks-mobile.png") });
    await header(page, "pending").tap(); assert.equal(await info(page).count(), 0);
    await header(page, "note").tap(); await info(page).tap(); await tooltip(page).waitFor();
    assert.equal(await tooltip(page).innerText(), "Waiting for the second sample.");
    await page.getByRole("combobox", { name: "Filter deliveries by status" }).selectOption("Rejected");
    assert.equal(await header(page, "note").count(), 0); assert.equal(await header(page, "rejected").count(), 1);
    console.log(`PASS ${width}px touch: first/second tap, outside dismissal, narrow tooltip, no page overflow, generic note and existing status filter`);
    await context.close();
  }
  assert.deepEqual(errors, []); console.log("PASS no browser errors; all responses are local fixtures");
} finally { await browser.close(); await server.close(); }
