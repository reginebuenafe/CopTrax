import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [root, ...process.env.PATH.split(path.delimiter).map(directory => path.dirname(directory))] }));
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-session-tests"), optimizeDeps: { entries: ["tests/session.fixture.jsx"] }, server: { port: 0, host: "127.0.0.1" }, plugins: [{
  name: "session-regressions", enforce: "pre",
  resolveId(source) { if (source.includes("/lib/supabase")) return path.join(root, "tests/session.mock.js"); },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/tests/session.html?")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><body><div id="root"></div><script type="module" src="/tests/session.fixture.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const errors = [], contexts = [], clockContexts = new WeakSet();
const minute = 60000;
const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/session.html?test`;
async function open(extra = "", context) {
  context ??= await browser.newContext(); if (!contexts.includes(context)) contexts.push(context);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  if (!clockContexts.has(context)) {
    await page.clock.install({ time: new Date("2026-10-16T00:00:00Z") });
    clockContexts.add(context);
  }
  await page.goto(base + extra);
  await page.getByTestId("auth-state").getByText("signed-in", { exact: true }).waitFor();
  return page;
}
const state = page => page.getByTestId("auth-state").innerText();
const warning = page => page.getByRole("dialog", { name: "You will be signed out soon" });
async function type(page) { await page.getByRole("textbox", { name: "Activity input" }).press("x"); }
async function expired(page) {
  await page.getByTestId("auth-state").getByText("expired", { exact: true }).waitFor();
  await page.getByText("You were signed out due to inactivity. Please log in again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("end-reason").innerText(), "idle");
}
try {
  const active = await open(); await active.getByTestId("inner-scroll").hover();
  for (let i = 0; i < 10; i++) {
    const previous = Number(await active.getByTestId("scroll-count").innerText());
    await active.clock.fastForward(2 * minute); await active.mouse.wheel(0, i % 2 ? -100 : 100);
    await active.waitForFunction(previous => Number(document.querySelector('[data-testid="scroll-count"]').textContent) > previous, previous);
  }
  assert.equal(await state(active), "signed-in"); assert.equal(await warning(active).count(), 0);
  console.log("PASS genuine nested scrolling stays signed in for twenty minutes"); await active.close();

  const remount = await open(); await remount.clock.fastForward(2 * minute);
  await remount.getByRole("button", { name: "Remount auth provider" }).click();
  await remount.getByTestId("auth-state").getByText("signed-in", { exact: true }).waitFor();
  for (let i = 0; i < 9; i++) { await remount.clock.fastForward(2 * minute); await type(remount); }
  assert.equal(await state(remount), "signed-in"); assert.equal(await warning(remount).count(), 0);
  console.log("PASS provider remount leaves no orphan logout timer"); await remount.close();

  const refresh = await open(); await refresh.clock.fastForward(13 * minute); await refresh.reload();
  await refresh.getByTestId("auth-state").getByText("signed-in", { exact: true }).waitFor();
  await refresh.clock.fastForward(minute); await warning(refresh).waitFor();
  await refresh.evaluate(() => window.sessionFixture.controls.emit("TOKEN_REFRESHED"));
  await type(refresh); assert(await warning(refresh).isVisible());
  await refresh.clock.fastForward(minute); await expired(refresh);
  assert.equal(await refresh.evaluate(() => window.sessionFixture.calls.find(call => call.action === "signOut").scope), "local");
  console.log("PASS refresh, token refresh and typing after warning do not extend the deadline; idle redirect is accurate"); await refresh.close();

  const sensitive = await open("&sensitive");
  assert.equal(await sensitive.getByTestId("idle-minutes").innerText(), "5");
  await sensitive.clock.fastForward(4 * minute); await warning(sensitive).waitFor();
  await sensitive.getByRole("button", { name: "Stay signed in", exact: true }).click();
  await warning(sensitive).waitFor({ state: "hidden" }); await sensitive.clock.fastForward(2 * minute);
  assert.equal(await state(sensitive), "signed-in");
  await sensitive.getByRole("button", { name: "Toggle sensitive context" }).click();
  await sensitive.waitForFunction(() => document.querySelector('[data-testid="idle-minutes"]').textContent === "15");
  console.log("PASS five-minute context, explicit continuation, and leaving sensitive context"); await sensitive.close();

  const context = await browser.newContext(); contexts.push(context);
  const background = await open("", context), foreground = await open("", context);
  for (let i = 0; i < 10; i++) {
    await foreground.clock.fastForward(2 * minute); await type(foreground);
  }
  assert.equal(await state(background), "signed-in"); assert.equal(await state(foreground), "signed-in");
  console.log("PASS inactive tab does not sign out the actively used tab");
  // Playwright's clock is shared by every page in this BrowserContext.
  await foreground.clock.fastForward(14 * minute + 1000);
  await background.bringToFront(); await warning(background).waitFor();
  await foreground.bringToFront();
  await warning(foreground).waitFor();
  await foreground.getByRole("button", { name: "Stay signed in", exact: true }).click();
  await warning(foreground).waitFor({ state: "hidden" });
  await background.bringToFront(); await warning(background).waitFor({ state: "hidden" });
  console.log("PASS same-browser activity and explicit warning continuation synchronize between tabs");
  await background.close(); await foreground.close();

  const automatic = await open();
  for (let i = 0; i < 7; i++) {
    await automatic.clock.fastForward(2 * minute);
    await automatic.getByTestId("inner-scroll").evaluate(element => { element.scrollTop = element.scrollTop ? 0 : 100; });
  }
  await warning(automatic).waitFor(); await automatic.clock.fastForward(minute); await expired(automatic);
  console.log("PASS automatic content scrolling does not keep an idle session alive"); await automatic.close();

  const manual = await open();
  await manual.evaluate(() => { window.sessionFixture.controls.failLogout = true; });
  await manual.getByRole("button", { name: "Manual logout" }).click();
  await manual.getByTestId("auth-state").getByText("signed-out", { exact: true }).waitFor();
  await manual.waitForFunction(() => window.sessionFixture.calls.some(call => call.action === "retry"));
  assert.deepEqual(await manual.evaluate(() => window.sessionFixture.calls.find(call => call.action === "retry")), { action: "retry", token: "fixture-token", scope: "global" });
  assert.equal(await manual.getByText("Your session has expired. Please log in again.", { exact: true }).count(), 0);
  console.log("PASS manual logout is not mislabelled expired and revocation retry retains its token"); await manual.close();

  const profile = await open();
  await profile.getByRole("textbox", { name: "Protected draft" }).fill("Keep my draft");
  await profile.evaluate(() => { window.sessionFixture.controls.delay = 3000; window.sessionFixture.controls.profile({ account_status: "Pending" }); });
  await profile.evaluate(() => { window.sessionFixture.controls.delay = 0; window.sessionFixture.controls.profile({ account_status: "Active" }); });
  await profile.clock.runFor(3500);
  assert.equal(await profile.getByTestId("account-status").innerText(), "Active");
  assert.equal(await state(profile), "signed-in");
  assert.equal(await profile.getByRole("textbox", { name: "Protected draft" }).inputValue(), "Keep my draft");
  console.log("PASS profile refresh keeps forms mounted and ignores late stale responses"); await profile.close();
  assert.deepEqual(errors, []);
  console.log("PASS real provider/router; fake auth and simulated time only; no browser errors");
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); await server.close(); }
