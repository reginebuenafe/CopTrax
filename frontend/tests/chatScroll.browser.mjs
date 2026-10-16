// npm exec --yes --package=playwright-core -- node tests/chatScroll.browser.mjs
// Real React components; entirely local messages, proposals, and API fixtures.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-scroll-tests"), optimizeDeps: { entries: ["tests/chatScroll.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
  name: "chat-scroll-fixture", enforce: "pre",
  resolveId(source) { if (source.includes("/contexts/AuthContext") || source.includes("/lib/supabase")) return path.join(root, "tests/supplierPricing.mock.js"); },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/tests/scroll.html?")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/tests/chatScroll.fixture.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHAT_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const contexts = [], errors = [];
const artifacts = path.join(root, "tests/artifacts"); await mkdir(artifacts, { recursive: true });
async function open(view, width, mode = "long", height = 844) {
  const context = await browser.newContext({ viewport: { width, height } }); contexts.push(context);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/scroll.html?view=${view}&mode=${mode}&proposal_history${view === "owner" ? "&viewer=owner" : ""}${["short", "empty"].includes(mode) ? "&empty" : ""}`);
  await page.locator('input[maxlength="2000"]').waitFor();
  await page.getByText("Checking pricing eligibility…", { exact: true }).waitFor({ state: "hidden" });
  if (mode === "long") await page.locator("[data-chat-entry]").filter({ hasText: "Historical message 44:" }).waitFor();
  return page;
}
const feed = page => page.locator("[data-chat-scroll]");
async function atBottom(page) {
  await page.waitForFunction(() => {
    const list = document.querySelector("[data-chat-scroll]");
    const end = list?.querySelector("[data-chat-end]");
    if (!end) return false;
    const padding = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    return list.scrollHeight - list.clientHeight - list.scrollTop <= 2
      && end.getBoundingClientRect().top <= list.getBoundingClientRect().bottom - padding + 2;
  }, null, { timeout: 5000 }).catch(async error => {
    console.log("BOTTOM:", await feed(page).evaluate(list => ({ scroll: list.scrollTop, height: list.scrollHeight, viewport: list.clientHeight,
      end: list.querySelector("[data-chat-end]").getBoundingClientRect().toJSON(), list: list.getBoundingClientRect().toJSON() })));
    await page.screenshot({ path: path.join(artifacts, "scroll-failure.png") }); throw error;
  });
}
async function noTrailingGap(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-chat-scroll] .chat-typing-slot[data-active="false"]')].every(slot => slot.getBoundingClientRect().height === 0));
  const gap = await feed(page).evaluate(list => {
    const entries = [...list.querySelectorAll("[data-chat-entry]")];
    const last = entries.at(-1);
    const end = list.querySelector("[data-chat-end]");
    const typing = list.querySelector("[data-chat-typing]");
    return { gap: last ? end.getBoundingClientRect().top - last.getBoundingClientRect().bottom : 0,
      markerHeight: end.getBoundingClientRect().height, typingHeight: typing.getBoundingClientRect().height };
  });
  assert.equal(gap.markerHeight, 0); assert.equal(gap.typingHeight, 0);
  assert(gap.gap >= -1 && gap.gap <= 16, JSON.stringify(gap));
}
async function receiveMessage(page, message) {
  const key = `message:${await page.evaluate(message => window.scrollFixture.receiveFixtureMessage(message), message)}`;
  await page.locator(`[data-chat-entry="${key}"]`).waitFor();
  return key;
}
async function receiveProposal(page) {
  const key = `proposal:${await page.evaluate(() => window.scrollFixture.receiveFixtureProposal({ is_ai_generated: true }))}`;
  await page.locator(`[data-chat-entry="${key}"]`).waitFor();
  return key;
}
async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.evaluate(() => scrollY), 0);
}
try {
  for (const view of ["widget", "supplier", "owner"]) for (const width of [1280, 380, 320]) {
    const page = await open(view, width);
    await atBottom(page); await noTrailingGap(page);
    await page.reload(); await feed(page).waitFor(); await atBottom(page); await noTrailingGap(page);
    await receiveMessage(page, { sender_id: view === "owner" ? "supplier" : "owner", message_text: "A new message with several lines.\n".repeat(30) });
    await atBottom(page); await noTrailingGap(page);
    await receiveProposal(page); await atBottom(page); await noTrailingGap(page);
    if (view !== "widget") {
      const cardWidth = await page.locator('[data-chat-entry^="proposal:"] .max-w-sm').first().evaluate(element => element.getBoundingClientRect().width);
      if (width === 1280) assert(cardWidth > 320 && cardWidth <= 384);
    }
    await receiveMessage(page, { message_text: "Latest short reply" }); await atBottom(page);
    // A late image in an older entry and changes to the latest card are both
    // content resizes. Neither should leave a following reader above the end.
    await page.evaluate(() => {
      const entry = document.querySelector("[data-chat-entry]");
      const img = document.createElement("img"); img.alt = "Local late-loading image fixture";
      img.style.cssText = "display:block;width:120px;height:0"; entry.append(img);
      requestAnimationFrame(() => { img.style.height = "180px"; img.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180'/>"; });
    });
    await atBottom(page);
    for (const ai of [false, true]) {
      await page.evaluate(ai => window.scrollFixture.activity(true, ai), ai);
      await page.locator('.chat-typing-slot[data-active="true"]').first().waitFor(); await atBottom(page);
    }
    assert.equal(await page.locator('.chat-typing-slot[data-active="true"]').count(), 2);
    await page.evaluate(() => { window.scrollFixture.activity(false); window.scrollFixture.activity(false, true); });
    await noTrailingGap(page); await atBottom(page);
    // The bottom follows the browser's dynamic viewport, including short desktop
    // windows and the height changes caused by a mobile address bar.
    await page.setViewportSize({ width, height: 600 }); await atBottom(page); await noOverflow(page);
    await page.setViewportSize({ width, height: 844 }); await atBottom(page);
    if (view !== "owner") await page.getByRole("button", { name: "Dismiss pricing information" }).click();
    await atBottom(page);
    await feed(page).evaluate(element => { element.scrollTop = element.scrollHeight - element.clientHeight - 100; });
    await page.waitForTimeout(80);
    await receiveMessage(page, { message_text: "Follow while within 100px of the bottom." }); await atBottom(page);
    // Scrolling up disables following before the next large arrival.
    await feed(page).evaluate(element => { element.scrollTop = 0; }); await page.waitForTimeout(80);
    const previousTop = await feed(page).evaluate(element => element.scrollTop);
    await receiveMessage(page, { message_text: "Keep reading the older history.\n".repeat(30) });
    await page.waitForTimeout(80);
    assert(Math.abs(await feed(page).evaluate(element => element.scrollTop) - previousTop) < 2);
    await page.evaluate(() => window.scrollFixture.activity(true));
    await page.locator('.chat-typing-slot[data-active="true"]').first().waitFor();
    assert(Math.abs(await feed(page).evaluate(element => element.scrollTop) - previousTop) < 2);
    await page.evaluate(() => window.scrollFixture.activity(false));
    // Own send always resumes following, even from the oldest entry.
    await page.locator('input[maxlength="2000"]').fill("My new message"); await page.locator('input[maxlength="2000"]').press("Enter");
    await page.locator("[data-chat-entry]").filter({ hasText: "My new message" }).waitFor(); await atBottom(page); await noTrailingGap(page);
    if (width === 1280) {
      await feed(page).evaluate(element => { element.scrollTop = 0; }); await page.waitForTimeout(80);
      if (view === "widget") {
        await page.getByTitle("Close chat", { exact: true }).click();
        await page.getByTitle("Open NERC Copra Trading Chat", { exact: true }).click();
      } else {
        await page.evaluate(() => window.scrollFixture.navigate("another-conversation"));
        await page.waitForFunction(() => document.querySelectorAll("[data-chat-entry]").length === 0);
        await page.evaluate(() => window.scrollFixture.navigate("pricing-conversation"));
      }
      await page.locator("[data-chat-entry]").filter({ hasText: "My new message" }).waitFor(); await atBottom(page);
    }
    await noOverflow(page);
    if (width === 380) await page.screenshot({ path: path.join(artifacts, `chat-bottom-${view}-380.png`) });
    await page.close();
    console.log(`PASS ${view} ${width}px: refresh, incoming/own messages, cards, late layout, human/AI typing, history position, viewport resizing`);
  }
  for (const view of ["widget", "supplier", "owner"]) for (const mode of ["short", "empty"]) {
    const page = await open(view, 380, mode);
    if (mode === "short") await atBottom(page);
    await noTrailingGap(page);
    assert.equal(await feed(page).evaluate(element => element.scrollTop), 0);
    if (mode === "short") assert(await feed(page).evaluate(element => element.scrollHeight <= element.clientHeight + 1));
    else assert(await feed(page).evaluate(element => {
      const content = element.querySelector("[data-chat-content]");
      const style = getComputedStyle(element);
      return element.scrollHeight <= Math.max(element.clientHeight, Math.ceil(content.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom))) + 1;
    }), "empty thread has only its actual welcome content, with no artificial spacer");
    await page.reload(); await feed(page).waitFor();
    if (mode === "short") await atBottom(page);
    await noTrailingGap(page);
    assert.equal(await feed(page).evaluate(element => element.scrollTop), 0);
    await page.close(); console.log(`PASS ${view} ${mode}: no artificial scroll height on open or refresh`);
  }
  assert.deepEqual(errors, []); console.log("PASS no browser errors; all data and realtime signals are local fixtures");
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); await server.close(); }
