import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";

// npm exec --yes --package=playwright-core -- node tests/proposalHistory.browser.mjs
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-history-tests"), optimizeDeps: { entries: ["tests/proposalHistory.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
  name: "isolated-proposal-history", enforce: "pre",
  resolveId(source) { if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return path.join(root, "tests/supplierPricing.mock.js"); },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/tests/history.html?")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/tests/proposalHistory.fixture.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHAT_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const errors = [], styles = new Map();
const artifacts = path.join(root, "tests/artifacts"); await mkdir(artifacts, { recursive: true });
try {
  for (const view of ["widget", "supplier", "owner"]) {
    for (const width of [1280, 380, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/tests/history.html?proposal_history&view=${view}&empty&history=Breached${view === "owner" ? "&viewer=owner" : ""}`);
      const history = page.locator("[data-proposal-history]");
      const expected = view === "owner" ? [
        "Juan Supplier proposed: ₱30.00/kg for 1 ton", "You counteroffered: ₱31.00/kg for 2 tons", "Juan Supplier rejected your counteroffer.",
        "Juan Supplier proposed: ₱32.00/kg for 2 tons", "You accepted Juan Supplier's proposal of ₱32.00/kg for 2 tons.", "Juan Supplier proposed: ₱33.00/kg for 2 tons",
      ] : [
        "You proposed: ₱30.00/kg for 1 ton", "NERC Copra Trading counteroffered: ₱31.00/kg for 2 tons", "You rejected NERC Copra Trading's counteroffer.",
        "You proposed: ₱32.00/kg for 2 tons", "NERC Copra Trading accepted your proposal of ₱32.00/kg for 2 tons.", "You proposed: ₱33.00/kg for 2 tons",
      ];
      await history.nth(5).waitFor();
      assert.deepEqual(await history.allTextContents().then(lines => lines.map(line => line.trim())), expected);
      // Only the current card remains actionable, immediately after its line.
      const pending = page.locator('[data-chat-entry="proposal:pending"]');
      assert.equal(await pending.locator("[data-proposal-history]").count(), 1);
      await pending.getByText(view === "widget" ? "PRICE PROPOSAL SUBMITTED" : view === "supplier" ? "Your Proposal" : "Incoming Proposal", { exact: true }).waitFor();
      if (view === "owner") for (const name of ["Accept", "Counter", "Decline"]) assert(await pending.getByRole("button", { name, exact: true }).isEnabled());
      // No icons, time labels or read ticks inside any proposal history line.
      assert.equal(await history.locator("svg,time,button").count(), 0);
      assert.equal(await page.getByText("❌ Counteroffer declined.", { exact: true }).count(), 0);
      const ordinary = page.locator("[data-chat-entry]").filter({ hasText: "A normal message between offers." });
      assert((await ordinary.innerHTML()).includes("text-[10px]"), "normal message keeps its timestamp");
      await page.locator("[data-chat-entry]").filter({ hasText: "An unchanged assistant response." }).waitFor();
      for (const tone of ["neutral", "negative", "positive"]) {
        const style = await page.locator(`[data-proposal-history="${tone}"] p`).first().evaluate(element => {
          const s = getComputedStyle(element); return { fontSize: s.fontSize, fontStyle: s.fontStyle, color: s.color, textAlign: s.textAlign, fontWeight: s.fontWeight };
        });
        assert.equal(style.fontStyle, "italic"); assert.equal(style.textAlign, "center");
        if (styles.has(tone)) assert.deepEqual(style, styles.get(tone)); else styles.set(tone, style);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      assert(await history.evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1)), "history fits narrow widths");
      const before = await history.allTextContents();
      await page.evaluate(() => window.pricingFixture.receiveFixtureMessage({ message_text: "A new incoming message." }));
      await page.locator("[data-chat-entry]").filter({ hasText: "A new incoming message." }).waitFor();
      assert.deepEqual(await history.allTextContents(), before);
      await page.reload(); await history.nth(5).waitFor(); assert.deepEqual(await history.allTextContents(), before);
      if (view !== "widget") {
        await page.evaluate(() => window.proposalFixture.navigate("another-conversation"));
        await page.waitForFunction(() => document.querySelectorAll("[data-proposal-history]").length === 0);
        await page.evaluate(() => window.proposalFixture.navigate("pricing-conversation"));
        await history.nth(5).waitFor(); assert.deepEqual(await history.allTextContents(), before);
      }
      // Status-only realtime updates must preserve the original proposal line.
      await page.evaluate(() => window.proposalFixture.resolvePending("Rejected"));
      await page.waitForFunction(() => document.querySelectorAll('[data-proposal-history="negative"]').length === 2);
      assert.equal(await page.getByText(expected[5], { exact: true }).count(), 1);
      assert.equal(await page.getByText(view === "widget" ? "PRICE PROPOSAL SUBMITTED" : view === "supplier" ? "Your Proposal" : "Incoming Proposal", { exact: true }).count(), 0);
      if (width === 380) {
        await page.locator('[data-chat-entry="proposal:initial"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(artifacts, `proposal-history-${view}-380.png`), fullPage: true });
      }
      await context.close();
      console.log(`PASS ${view} ${width}px: wording, order, one line/event, current card, colors, reload, realtime status, normal/AI bubbles`);
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS no browser errors; all three views share identical history typography");
} finally { await browser.close(); await server.close(); }
