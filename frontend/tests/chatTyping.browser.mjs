import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";

// npm exec --yes --package=playwright-core -- node tests/chatTyping.browser.mjs
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const playwrightPath = require.resolve("playwright-core", {
  paths: [root, ...process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory))],
});
const { chromium } = require(playwrightPath);
const mockPath = path.join(root, "tests/chatTyping.mock.js");
const fixtureHtml = await readFile(path.join(root, "tests/chatTyping.fixture.html.template"), "utf8");
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-chat-tests"), optimizeDeps: { entries: ["tests/chatTyping.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
  name: "chat-test-only-adapter", enforce: "pre",
  resolveId(source) { if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return mockPath; },
  configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/tests/chatTyping.fixture.html?")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, fixtureHtml));
    });
  },
}] });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.CHAT_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const screenshotDir = path.join(root, "tests/artifacts");
await mkdir(screenshotDir, { recursive: true });
const contexts = [];
const errors = [];
async function open(view, viewer, conversation, extra = "", waitReady = true) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${view}: ${error.message}`));
  await page.goto(`${base}/tests/chatTyping.fixture.html?view=${view}&viewer=${viewer}&conversation=${conversation}${extra}`);
  if (waitReady) await page.waitForFunction(() => document.body.dataset.realtime === "SUBSCRIBED", { timeout: 25000 });
  await page.locator('input[maxlength="2000"]').waitFor();
  return page;
}
const active = (page, side = "left") => page.locator(`.chat-typing-slot[data-side="${side}"][data-active="true"]`);
const input = page => page.locator('input[maxlength="2000"]');
const waitActive = (page, side) => active(page, side).waitFor({ state: "visible", timeout: 5000 });
const waitGone = (page, side) => active(page, side).waitFor({ state: "hidden", timeout: 6500 });
const humanActive = (page, side = "left") => active(page, side).filter({ hasText: /typing/ });
const aiActive = (page, side = "left") => active(page, side).filter({ hasText: "Assistant is thinking" });
async function assertConcurrentTyping(owner, supplier, artifact) {
  await input(supplier).fill("Human and AI overlap"); await input(supplier).press("Enter");
  await aiActive(supplier).waitFor({ state: "visible" });
  await input(owner).fill("Owner is still composing");
  await humanActive(supplier).waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await active(supplier).count(), 2);
  assert.match(await humanActive(supplier).innerText(), /Maria Buyer is typing/);
  assert.equal(await humanActive(owner, "right").count(), 0);
  await supplier.waitForFunction(() => [...document.querySelectorAll('.chat-typing-slot[data-active="true"] .chat-typing-content')]
    .every(element => Number(getComputedStyle(element).opacity) >= .99));
  await input(owner).type(".");
  await supplier.screenshot({ path: path.join(screenshotDir, artifact) });
  assert.equal(await active(supplier).count(), 2);
  const humanTop = (await humanActive(supplier).boundingBox()).y;
  const aiTop = (await aiActive(supplier).boundingBox()).y;
  assert(humanTop < aiTop);
  if (artifact === "widget-human-and-ai.png") {
    const humanBox = await humanActive(supplier).boundingBox();
    const aiBox = await aiActive(supplier).boundingBox();
    await supplier.screenshot({ path: path.join(screenshotDir, "human-and-ai-indicators.png"), clip: {
      x: humanBox.x, y: humanBox.y, width: humanBox.width, height: aiBox.y + aiBox.height - humanBox.y,
    } });
  }
  // Keep the human active across the AI reply to catch the shared-sender-ID bug.
  for (let iteration = 0; iteration < 10 && await aiActive(supplier).count(); iteration++) {
    await input(owner).type(".");
    await owner.waitForTimeout(600);
  }
  assert.equal(await aiActive(supplier).count(), 0);
  assert.equal(await humanActive(supplier).count(), 1);
  await input(owner).fill("");
  await humanActive(supplier).waitFor({ state: "hidden" });
}
async function metrics(page, side) {
  return active(page, side).evaluate(element => {
    const bubble = element.querySelector(".chat-typing-bubble");
    const medium = element.querySelector(".chat-typing-tail");
    const small = element.querySelector(".chat-typing-tail-small");
    const rect = bubble.getBoundingClientRect();
    return { bubble: getComputedStyle(bubble).backgroundColor, text: getComputedStyle(bubble).color,
      tail: getComputedStyle(medium).backgroundColor, mediumLeft: medium.getBoundingClientRect().left - rect.left,
      smallLeft: small.getBoundingClientRect().left - rect.left, width: rect.width,
      animation: getComputedStyle(element.querySelector(".chat-typing-dot")).animationName };
  });
}
try {
  const id = randomUUID();
  const owner = await open("owner", "owner", id);
  // The original regression: composing is possible before the ready callback.
  const supplier = await open("supplier", "supplier", id, "&typing_join_delay=1000", false);
  const slotHeight = await owner.locator(".chat-typing-slot").first().evaluate(element => element.getBoundingClientRect().height);
  await input(supplier).fill("Hello buyer"); await waitActive(owner, "left");
  assert.match(await active(owner).innerText(), /Juan Supplier is typing/);
  assert.equal(await active(supplier).count(), 0);
  const left = await metrics(owner, "left");
  assert(left.mediumLeft < left.width / 2 && left.smallLeft < left.mediumLeft);
  assert.equal(left.bubble, left.tail);
  assert.equal(await owner.locator(".chat-typing-slot").first().evaluate(element => element.getBoundingClientRect().height), slotHeight);
  await owner.screenshot({ path: path.join(screenshotDir, "owner-human-left.png") });
  await waitGone(owner, "left");
  await input(owner).fill("Hello supplier"); await waitActive(supplier, "left");
  assert.match(await active(supplier).innerText(), /Maria Buyer is typing/);
  assert.equal(await active(owner).count(), 0);
  await input(owner).fill(""); await waitGone(supplier, "left");
  await input(supplier).fill("AI success"); await input(supplier).press("Enter");
  await waitActive(supplier, "left"); await waitActive(owner, "right");
  assert.match(await active(supplier).innerText(), /Assistant is thinking/);
  const right = await metrics(owner, "right");
  assert(right.mediumLeft > right.width / 2 && right.smallLeft > right.mediumLeft);
  await owner.screenshot({ path: path.join(screenshotDir, "owner-ai-right.png") });
  await waitGone(supplier, "left"); await waitGone(owner, "right");
  await supplier.screenshot({ path: path.join(screenshotDir, "supplier-after-ai.png") });
  await supplier.getByText("Fixture assistant reply", { exact: false }).waitFor({ timeout: 5000 });
  await supplier.getByLabel("AI outcome").selectOption("error");
  await input(supplier).fill("AI failure"); await input(supplier).press("Enter");
  await waitActive(supplier, "left"); await waitGone(supplier, "left");
  await supplier.getByLabel("AI outcome").selectOption("timeout");
  await input(supplier).fill("AI timeout"); await input(supplier).press("Enter");
  await waitActive(supplier, "left");
  await active(supplier).waitFor({ state: "hidden", timeout: 24000 });
  await waitGone(owner, "right");
  await supplier.getByLabel("AI outcome").selectOption("success");
  await assertConcurrentTyping(owner, supplier, "supplier-human-and-ai.png");
  // Dark theme + reduced motion on the real supplier view.
  await supplier.evaluate(() => document.documentElement.dataset.theme = "dark");
  await supplier.emulateMedia({ reducedMotion: "reduce" });
  await input(owner).fill("Theme check"); await waitActive(supplier, "left");
  const dark = await metrics(supplier, "left");
  assert.equal(dark.animation, "none"); assert.equal(dark.bubble, dark.tail);
  assert.notEqual(dark.bubble, left.bubble); assert.notEqual(dark.text, left.text);
  await supplier.setViewportSize({ width: 390, height: 844 });
  await supplier.screenshot({ path: path.join(screenshotDir, "supplier-mobile-dark-reduced.png") });
  const layout = await supplier.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    input: document.querySelector('input[maxlength="2000"]').getBoundingClientRect().top,
    indicator: document.querySelector('.chat-typing-slot[data-active="true"]').getBoundingClientRect().bottom }));
  assert(layout.scrollWidth <= layout.width); assert(layout.indicator <= layout.input);
  await input(owner).fill(""); await waitGone(supplier, "left");
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.evaluate(() => document.documentElement.dataset.theme = "dark");
  await input(supplier).fill("Mobile owner check"); await waitActive(owner, "left");
  await owner.screenshot({ path: path.join(screenshotDir, "owner-mobile-dark.png") });
  await input(supplier).fill(""); await waitGone(owner, "left");
  // Switch the owner view while the supplier is active in the old thread.
  await input(supplier).fill("Typing in the old conversation"); await waitActive(owner, "left");
  await owner.getByRole("button", { name: "Switch conversation", exact: true }).click();
  await owner.waitForFunction(original => document.body.dataset.realtime === "SUBSCRIBED" && document.body.dataset.realtimeConversation !== original, id);
  assert.equal(await active(owner).count(), 0);
  await input(supplier).type(" more"); await supplier.waitForTimeout(1600);
  assert.equal(await active(owner).count(), 0);
  await input(supplier).fill("");
  await owner.getByRole("button", { name: "Switch conversation", exact: true }).click();
  await owner.waitForFunction(original => document.body.dataset.realtime === "SUBSCRIBED" && document.body.dataset.realtimeConversation === original, id);
  assert.equal(await active(owner).count(), 0);
  // Supplier widget uses the same thread, transport, and component.
  await supplier.close();
  const widget = await open("widget", "supplier", id);
  await widget.setViewportSize({ width: 390, height: 844 });
  await input(owner).fill("Compact check"); await waitActive(widget, "left");
  const compact = await widget.evaluate(() => {
    const rect = element => { const bounds = element.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom }; };
    return { input: rect(document.querySelector('input[maxlength="2000"]')),
      indicator: rect(document.querySelector('.chat-typing-slot[data-active="true"]')),
      header: rect([...document.querySelectorAll("h3")].find(element => element.textContent.includes("NERC Copra Trading"))) };
  });
  assert(compact.indicator.top >= 0 && compact.indicator.bottom <= compact.input.top);
  assert(compact.header.top >= 0 && compact.header.bottom < compact.indicator.top);
  await widget.screenshot({ path: path.join(screenshotDir, "widget-mobile-human.png") });
  assert.equal((await metrics(widget, "left")).bubble, "rgb(253, 247, 231)");
  await input(owner).fill(""); await waitGone(widget, "left");
  await input(widget).fill("Widget AI success"); await input(widget).press("Enter");
  await waitActive(widget, "left"); await waitGone(widget, "left");
  await widget.getByText("Fixture assistant reply", { exact: false }).waitFor();
  await assertConcurrentTyping(owner, widget, "widget-human-and-ai.png");
  await widget.evaluate(() => document.documentElement.dataset.theme = "dark");
  await widget.emulateMedia({ reducedMotion: "reduce" });
  await input(owner).fill("Widget dark check"); await waitActive(widget, "left");
  const widgetDark = await metrics(widget, "left");
  assert.equal(widgetDark.animation, "none"); assert.equal(widgetDark.bubble, widgetDark.tail);
  await widget.screenshot({ path: path.join(screenshotDir, "widget-mobile-dark-reduced.png") });
  await input(owner).fill(""); await waitGone(widget, "left");
  await input(widget).fill("Widget typing"); await waitActive(owner, "left");
  assert.equal(await active(widget).count(), 0);
  // Drop the network so the stopped packet cannot be relied on.
  await widget.context().setOffline(true); await waitGone(owner, "left");
  await widget.close(); await waitGone(owner, "left");
  assert.deepEqual(errors, []);
  console.log("PASS: owner, supplier, widget in Strict Mode; real broadcasts; typing before readiness; named/self-suppressed typing; idle/clear/send/close/offline; conversation switching; simultaneous human + AI, including across the AI reply; AI success/error/timeout; mirrored tails; stable slots; mobile; dark theme; reduced motion.");
  console.log("Application table data and AI responses were fixtures; no application rows were read or written.");
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close(); await server.close();
}
