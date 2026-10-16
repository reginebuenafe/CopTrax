import test from "node:test";
import assert from "node:assert/strict";
import { createSessionIdle, DEFAULT_IDLE_MS, SENSITIVE_IDLE_MS, idleStorageKeys } from "../src/utils/sessionIdle.js";
import { logoutWithRetry } from "../src/utils/sessionLogout.js";

const minute = 60_000;
function fixture() {
  let time = 1000, nextId = 0;
  const timers = new Map(), values = new Map(), tabs = [];
  const setTimer = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, at: time + ms }); return id; };
  const clearTimer = id => timers.delete(id);
  const clock = {
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = Math.max(time, next[1].at); timers.delete(next[0]); next[1].fn();
      }
      time = end;
    },
    sleep(ms) { time += ms; },
  };
  function target() {
    const handlers = new Map();
    return { hidden: false, addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
      removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
      emit(type, data = {}) { for (const fn of [...handlers.get(type) ?? []]) fn({ isTrusted: true, ...data }); },
      count() { return [...handlers.values()].reduce((sum, set) => sum + set.size, 0); } };
  }
  function tab(timeoutMs = DEFAULT_IDLE_MS, userId = "supplier") {
    const events = target(), notices = [], expirations = [];
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) { values.set(key, value); tabs.filter(tab => tab.events !== events).forEach(tab => tab.events.emit("storage", { key })); },
      removeItem(key) { values.delete(key); tabs.filter(tab => tab.events !== events).forEach(tab => tab.events.emit("storage", { key })); },
    };
    const idle = createSessionIdle({ userId, timeoutMs, storage, target: events, visibility: events,
      now: () => time, setTimer, clearTimer, onWarning: notice => notices.push(notice), onExpire: () => expirations.push(time) });
    const result = { idle, events, notices, expirations, storage }; tabs.push(result); idle.start(); return result;
  }
  return { clock, tab, timers, values };
}

test("wheel/touch movement prevents expiry; synthetic input and automatic scrolling do not", () => {
  const f = fixture(), tab = f.tab();
  for (let i = 0; i < 10; i++) { f.clock.advance(2 * minute); tab.events.emit(i % 2 ? "touchmove" : "wheel"); }
  assert.equal(tab.expirations.length, 0);
  f.clock.advance(14 * minute);
  assert.equal(tab.notices.at(-1).show, true);
  tab.events.emit("scroll"); tab.events.emit("wheel", { isTrusted: false }); tab.events.emit("keydown");
  f.clock.advance(minute); assert.equal(tab.expirations.length, 1);
});

test("unmount cancels every timer/listener; remount preserves the deadline and accepts new activity", () => {
  const f = fixture(), first = f.tab(); f.clock.advance(2 * minute); first.idle.activity(); first.idle.stop();
  assert.equal(first.events.count(), 0); assert.equal(f.timers.size, 0);
  const next = f.tab();
  for (let i = 0; i < 10; i++) { f.clock.advance(2 * minute); next.idle.activity(); }
  assert.equal(first.expirations.length, 0); assert.equal(next.expirations.length, 0);
});

test("refresh and token/focus checks preserve the original idle deadline", () => {
  const f = fixture(), first = f.tab(); f.clock.advance(13 * minute); first.idle.stop();
  const next = f.tab(); next.idle.check(); next.events.emit("focus");
  f.clock.advance(minute); assert.equal(next.notices.at(-1).show, true);
  next.idle.check(); f.clock.advance(minute); assert.equal(next.expirations.length, 1);
});

test("background sleep cannot be followed by activity that revives an expired session", () => {
  for (const resume of [tab => tab.idle.activity(), tab => tab.idle.staySignedIn(), tab => tab.events.emit("focus")]) {
    const f = fixture(), tab = f.tab(); f.clock.sleep(16 * minute); resume(tab);
    assert.equal(tab.expirations.length, 1);
  }
});

test("activity from another tab prevents an idle tab logging out an active user", () => {
  const f = fixture(), background = f.tab(), active = f.tab();
  for (let i = 0; i < 10; i++) { f.clock.advance(2 * minute); active.idle.activity(); }
  assert.equal(background.expirations.length, 0); assert.equal(active.expirations.length, 0);
});

test("warnings synchronize across tabs and only Stay signed in clears them", () => {
  const f = fixture(), first = f.tab(), second = f.tab(); f.clock.advance(14 * minute);
  assert.equal(first.notices.at(-1).show, true); assert.equal(second.notices.at(-1).show, true);
  first.idle.activity(); second.idle.activity(); f.clock.advance(30_000);
  assert.equal(first.notices.at(-1).seconds, 30);
  second.idle.staySignedIn();
  assert.equal(first.notices.at(-1).show, false); assert.equal(second.notices.at(-1).show, false);
  f.clock.advance(2 * minute); assert.equal(first.expirations.length, 0);
});

test("a sensitive tab shares its warning; hiding the sensitive view does not invent activity", () => {
  const f = fixture(), bank = f.tab(SENSITIVE_IDLE_MS), normal = f.tab();
  f.clock.advance(4 * minute);
  assert.equal(bank.notices.at(-1).show, true); assert.equal(normal.notices.at(-1).show, true);
  normal.idle.activity(); f.clock.advance(minute);
  assert.equal(bank.expirations.length, 1); assert.equal(normal.expirations.length, 1);
  const g = fixture(), page = g.tab(SENSITIVE_IDLE_MS); g.clock.advance(3 * minute);
  page.idle.setTimeoutMs(DEFAULT_IDLE_MS); g.clock.advance(11 * minute);
  assert.equal(page.notices.at(-1).show, true);
});

test("a late warning cannot overwrite fresh cross-tab activity; different users are isolated", () => {
  const f = fixture(), tab = f.tab(); f.clock.advance(2 * minute); tab.idle.activity();
  tab.storage.setItem(idleStorageKeys("supplier").warning, JSON.stringify({ activityAt: 1000, deadline: 1000 + 5 * minute }));
  tab.idle.check(); assert.equal(tab.notices.at(-1).show, false);
  const other = f.tab(DEFAULT_IDLE_MS, "owner");
  for (let i = 0; i < 8; i++) { f.clock.advance(2 * minute); tab.idle.activity(); }
  assert.equal(other.expirations.length, 1); assert.equal(tab.expirations.length, 0);
});

test("storage failures retain in-memory inactivity protection", () => {
  let timer, expired = 0, time = 1000;
  const unavailable = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  const target = { addEventListener() {}, removeEventListener() {} };
  const idle = createSessionIdle({ userId: "test", storage: unavailable, target, visibility: target,
    now: () => time, setTimer: fn => { timer = fn; }, clearTimer() {}, onWarning() {}, onExpire: () => expired++ });
  idle.start(); time += 16 * minute; timer(); assert.equal(expired, 1); idle.clear();
});

test("logout retries revocation with the captured token after local session removal", async () => {
  const calls = [];
  const auth = { signOut: async options => { calls.push(options); return { error: Error("network") }; },
    admin: { signOut: async (token, scope) => { calls.push({ token, scope }); return { error: null }; } } };
  await logoutWithRetry(auth, "fixture-token", "local");
  assert.deepEqual(calls, [{ scope: "local" }, { token: "fixture-token", scope: "local" }]);
  calls.length = 0;
  auth.signOut = async options => { calls.push(options); return { error: null }; };
  await logoutWithRetry(auth, "fixture-token", "global"); assert.deepEqual(calls, [{ scope: "global" }]);
});
