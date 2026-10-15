import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createChatTyping, chatActivityLabel, conversationChatTopic } from "../src/utils/chatTyping.js";
import { observeAiRequest, getAiActivity, AI_ACTIVITY_TIMEOUT_MS } from "../src/utils/chatAiActivity.js";

function fixture() {
  const originals = Object.fromEntries(["setTimeout", "clearTimeout", "setInterval", "clearInterval", "window", "document", "crypto"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalNow = Date.now;
  let now = 10000;
  let timerId = 0;
  const timers = new Map();
  const schedule = (callback, delay, repeat = false) => {
    const id = ++timerId;
    timers.set(id, { callback, time: now + delay, delay, repeat });
    return id;
  };
  globalThis.setTimeout = (callback, delay) => schedule(callback, delay);
  globalThis.setInterval = (callback, delay) => schedule(callback, delay, true);
  globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id);
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  globalThis.crypto ??= webcrypto;
  Date.now = () => now;
  const channels = [];
  const cleanup = [];
  const person = (senderId, conversationId = "conversation-one", name = senderId, ready = true) => {
    const controller = createChatTyping({ conversationId, senderId, name, role: senderId === "owner" ? "Business Owner" : "Supplier", aiSenderId: "owner" });
    const channel = {
      topic: conversationChatTopic(conversationId), handlers: new Map(), sent: [], alive: true,
      on(_type, { event }, handler) { this.handlers.set(event, handler); return this; },
      send(packet) {
        this.sent.push({ ...packet, time: now });
        for (const peer of channels) if (peer.alive && peer !== this && peer.topic === this.topic) peer.handlers.get(packet.event)?.({ payload: packet.payload });
        return Promise.resolve("ok");
      },
    };
    channels.push(channel);
    const unbind = controller.bindChannel(channel);
    if (ready) controller.channelStatus("SUBSCRIBED");
    cleanup.push(unbind);
    return { controller, channel, unbind };
  };
  const tick = delay => {
    const end = now + delay;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.time;
      if (timer.repeat) timer.time += timer.delay;
      else timers.delete(id);
      timer.callback();
    }
    now = end;
  };
  return { person, tick, restore() {
    cleanup.forEach(unbind => unbind());
    Date.now = originalNow;
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
  } };
}

test("conversation typing and thinking lifecycle", async t => {
  const run = async (name, callback) => t.test(name, async () => {
    const f = fixture();
    try { await callback(f); } finally { f.restore(); }
  });
  await run("both directions, own-user suppression across tabs, and conversation isolation", ({ person }) => {
    const a = person("supplier", undefined, "Juan");
    const b = person("owner", undefined, "Maria");
    const ownTab = person("supplier");
    const otherConversation = person("owner", "conversation-two");
    a.controller.inputChanged("Hello");
    assert.equal(b.controller.getSnapshot().humans[0].name, "Juan");
    assert.equal(a.controller.getSnapshot().humans.length, 0);
    assert.equal(ownTab.controller.getSnapshot().humans.length, 0);
    assert.equal(otherConversation.controller.getSnapshot().humans.length, 0);
    b.controller.inputChanged("Hi");
    assert.equal(a.controller.getSnapshot().humans[0].sender_id, "owner");
  });
  await run("recent input before subscription is sent once ready, while idle/clear/blur cancel it", ({ person, tick }) => {
    const b = person("owner");
    const a = person("supplier", undefined, "Juan", false);
    a.controller.inputChanged("hello");
    assert.equal(a.channel.sent.length, 0);
    tick(500); a.controller.channelStatus("SUBSCRIBED");
    assert.equal(b.controller.getSnapshot().humans[0].name, "Juan");
    a.controller.stopTyping();
    a.controller.channelStatus("CLOSED");
    a.controller.inputChanged("idle"); tick(3000); a.controller.channelStatus("SUBSCRIBED");
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    a.controller.channelStatus("CLOSED"); a.controller.inputChanged("clear"); a.controller.inputChanged("");
    a.controller.channelStatus("SUBSCRIBED"); assert.equal(b.controller.getSnapshot().humans.length, 0);
    a.controller.channelStatus("CLOSED"); a.controller.inputChanged("blur"); a.controller.stopTyping();
    a.controller.channelStatus("SUBSCRIBED"); assert.equal(b.controller.getSnapshot().humans.length, 0);
  });
  await run("documented signals without a session ID are accepted and same sender tabs aggregate", ({ person }) => {
    const b = person("owner");
    b.channel.handlers.get("typing")({ payload: { conversation_id: "conversation-one", sender_id: "supplier", name: "Juan", typing: true } });
    assert.equal(b.controller.getSnapshot().humans[0].name, "Juan");
    b.channel.handlers.get("typing")({ payload: { conversation_id: "conversation-one", sender_id: "supplier", name: "Juan", session_id: "second-tab", typing: true } });
    assert.equal(b.controller.getSnapshot().humans.length, 1);
    b.channel.handlers.get("typing")({ payload: { conversation_id: "conversation-one", sender_id: "supplier", typing: false } });
    assert.equal(b.controller.getSnapshot().humans.length, 0);
  });
  await run("a received typing event before the ready callback is buffered until subscribed", ({ person }) => {
    const b = person("owner", undefined, "Maria", false);
    b.channel.handlers.get("typing")({ payload: { conversation_id: "conversation-one", sender_id: "supplier", name: "Juan", typing: true } });
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    b.controller.channelStatus("SUBSCRIBED");
    assert.equal(b.controller.getSnapshot().humans[0].name, "Juan");
  });
  await run("active broadcasts are throttled; idle stops at 2.5 seconds after last input", ({ person, tick }) => {
    const a = person("supplier"); const b = person("owner");
    a.controller.inputChanged("h");
    tick(500); a.controller.inputChanged("he");
    tick(500); a.controller.inputChanged("hel");
    tick(500); a.controller.inputChanged("hello");
    assert.equal(a.channel.sent.filter(packet => packet.payload.typing).length, 2);
    tick(2499); assert.equal(b.controller.getSnapshot().humans.length, 1);
    tick(1); assert.equal(b.controller.getSnapshot().humans.length, 0);
  });
  await run("clear, submit, and incoming message immediately dismiss human typing", ({ person, tick }) => {
    const a = person("supplier"); const b = person("owner");
    a.controller.inputChanged("hello"); a.controller.inputChanged("");
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    tick(1500); a.controller.inputChanged("hello");
    assert.equal(b.controller.getSnapshot().humans.length, 1);
    a.controller.stopTyping();
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    tick(1500); a.controller.inputChanged("hello");
    assert.equal(b.controller.getSnapshot().humans.length, 1);
    b.controller.messageReceived({ sender_id: "supplier" });
    assert.equal(b.controller.getSnapshot().humans.length, 0);
  });
  await run("rapid clear and restart cannot exceed the active typing throttle", ({ person, tick }) => {
    const a = person("supplier"); const b = person("owner");
    a.controller.inputChanged("a"); a.controller.inputChanged("");
    tick(200); a.controller.inputChanged("b");
    tick(200); a.controller.inputChanged("bc");
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    tick(1100);
    assert.equal(b.controller.getSnapshot().humans.length, 1);
    const activePackets = a.channel.sent.filter(packet => packet.payload.typing);
    assert.equal(activePackets.length, 2);
    assert.equal(activePackets[1].time - activePackets[0].time, 1500);
  });
  await run("a lost tab or lost stop packet expires by five seconds", ({ person, tick }) => {
    const a = person("supplier"); const b = person("owner");
    a.controller.inputChanged("hello");
    // Lose outgoing packets, including the idle stop, as on an abrupt disconnect.
    a.channel.send = () => Promise.resolve("error");
    tick(4999); assert.equal(b.controller.getSnapshot().humans.length, 1);
    tick(1); assert.equal(b.controller.getSnapshot().humans.length, 0);
  });
  await run("cleanup, offline, hidden tabs, and channel errors clear activity", ({ person }) => {
    const a = person("supplier"); const b = person("owner");
    a.controller.inputChanged("hello");
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    a.controller.inputChanged("hello");
    window.dispatchEvent(new Event("offline"));
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    a.controller.channelStatus("SUBSCRIBED"); a.controller.inputChanged("hello");
    b.controller.channelStatus("CHANNEL_ERROR");
    assert.equal(b.controller.getSnapshot().humans.length, 0);
    a.unbind();
    assert.equal(a.controller.getSnapshot().humans.length, 0);
  });
  await run("multiple people are named and can stop independently", ({ person }) => {
    const a = person("supplier", undefined, "Juan");
    const b = person("owner", undefined, "Maria");
    const c = person("third", undefined, "Ana");
    const viewer = person("observer");
    a.controller.inputChanged("a"); b.controller.inputChanged("b");
    assert.equal(chatActivityLabel(viewer.controller.getSnapshot().humans, []), "Juan and Maria are typing…");
    c.controller.inputChanged("c");
    assert.equal(chatActivityLabel(viewer.controller.getSnapshot().humans, []), "Several people are typing…");
    c.controller.stopTyping();
    assert.equal(viewer.controller.getSnapshot().humans.length, 2);
  });
  await run("AI uses the owner's sender identity and clears on success, error, and UI timeout", async ({ person, tick }) => {
    const a = person("supplier"); const b = person("owner");
    let resolve;
    observeAiRequest("conversation-one", new Promise(done => { resolve = done; }));
    assert.equal(a.controller.getSnapshot().assistants[0].sender_id, "owner");
    assert.equal(b.controller.getSnapshot().assistants[0].sender_id, "owner");
    resolve({ data: {} }); await Promise.resolve();
    assert.equal(a.controller.getSnapshot().assistants.length, 0);
    let reject;
    observeAiRequest("conversation-one", new Promise((_done, fail) => { reject = fail; }));
    reject(new Error("network")); await Promise.resolve();
    assert.equal(b.controller.getSnapshot().assistants.length, 0);
    observeAiRequest("conversation-one", new Promise(() => {}));
    tick(AI_ACTIVITY_TIMEOUT_MS);
    assert.equal(getAiActivity("conversation-one").length, 0);
    assert.equal(a.controller.getSnapshot().assistants.length, 0);
    assert.equal(b.controller.getSnapshot().assistants.length, 0);
  });
  await run("AI reply hides thinking immediately and subsequent heartbeats cannot revive it", async ({ person, tick }) => {
    const a = person("supplier");
    let resolve;
    observeAiRequest("conversation-one", new Promise(done => { resolve = done; }));
    a.controller.messageReceived({ sender_id: "owner", is_ai_generated: true });
    tick(6000);
    assert.equal(a.controller.getSnapshot().assistants.length, 0);
    resolve(); await Promise.resolve();
  });
  await run("an AI reply using the owner's sender ID does not clear that human's typing", async ({ person }) => {
    const owner = person("owner"); const supplier = person("supplier");
    owner.controller.inputChanged("still composing");
    let resolve;
    observeAiRequest("conversation-one", new Promise(done => { resolve = done; }));
    assert.equal(supplier.controller.getSnapshot().humans.length, 1);
    assert.equal(supplier.controller.getSnapshot().assistants.length, 1);
    supplier.controller.messageReceived({ sender_id: "owner", is_ai_generated: true });
    resolve(); await Promise.resolve();
    assert.equal(supplier.controller.getSnapshot().assistants.length, 0);
    assert.equal(supplier.controller.getSnapshot().humans.length, 1);
    supplier.controller.messageReceived({ sender_id: "owner", is_ai_generated: false });
    assert.equal(supplier.controller.getSnapshot().humans.length, 0);
  });
  await run("negotiation AI from another thread uses the existing owner presence channel and remains conversation scoped", async ({ person, tick }) => {
    const supplier = person("supplier");
    const otherSupplier = person("other", "conversation-two");
    const signals = [];
    const presenceChannel = { send(packet) {
      signals.push(packet.payload);
      supplier.controller.receiveAi({ payload: packet.payload });
      otherSupplier.controller.receiveAi({ payload: packet.payload });
      return Promise.resolve("ok");
    } };
    let resolve;
    observeAiRequest("conversation-one", new Promise(done => { resolve = done; }), { broadcastChannel: presenceChannel, aiSenderId: "owner" });
    assert.equal(supplier.controller.getSnapshot().assistants[0].sender_id, "owner");
    assert.equal(otherSupplier.controller.getSnapshot().assistants.length, 0);
    tick(6000);
    assert.equal(supplier.controller.getSnapshot().assistants.length, 1);
    assert(signals.length <= 5);
    resolve(); await Promise.resolve();
    assert.equal(supplier.controller.getSnapshot().assistants.length, 0);
    assert.equal(signals.at(-1).thinking, false);
  });
});
