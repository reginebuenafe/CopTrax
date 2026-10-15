import { getAiActivity, subscribeAiActivity } from "./chatAiActivity.js";

export const TYPING_THROTTLE_MS = 1500;
export const TYPING_IDLE_MS = 2500;
export const TYPING_EXPIRY_MS = 5000;
export const conversationChatTopic = id => `coptrax:chat:${id}`;

export function chatActivityLabel(humans, assistants) {
  const names = [...new Set(humans.map(person => person.name || "Someone"))];
  const humanLabel = names.length > 2 ? "Several people are typing…"
    : names.length === 2 ? `${names[0]} and ${names[1]} are typing…`
    : names.length === 1 ? `${names[0]} is typing…` : "";
  return [humanLabel, assistants.length ? "Assistant is thinking…" : ""].filter(Boolean).join(" ");
}

// Uses the chat's existing Realtime channel; creates no subscriptions or rows.
export function createChatTyping({ conversationId, senderId, name, role, aiSenderId }) {
  const sessionId = crypto.randomUUID();
  const humans = new Map();
  const assistants = new Map();
  const listeners = new Set();
  let snapshot = { humans: [], assistants: [] };
  let channel;
  let subscribed = false;
  let localTyping = false;
  let lastInputAt = -Infinity;
  let lastSent = -Infinity;
  let idleTimer;
  let sendTimer;
  let pulseTimer;
  let unsubscribeAi;
  let localAi = [];
  let lastAiSent = -Infinity;
  const ignoredAi = new Set();

  const publish = () => {
    // Aggregate remote tabs by sender ID while retaining each tab's expiry.
    const next = { humans: subscribed ? [...new Map([...humans.values()].map(person => [person.sender_id, person])).values()] : [], assistants: [...assistants.values()] };
    const signature = value => JSON.stringify(value, (key, item) => key === "expires" ? undefined : item);
    if (signature(next) === signature(snapshot)) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const broadcast = (event, payload) => {
    if (!subscribed || !channel) return;
    // Typing delivery must never interfere with message sending.
    try { Promise.resolve(channel.send({ type: "broadcast", event, payload })).catch(() => {}); }
    catch { /* disconnected channels expire on receivers */ }
  };
  const typingSignal = typing => broadcast("typing", {
    conversation_id: conversationId, sender_id: senderId, name, role, session_id: sessionId, typing,
  });
  const stopTyping = () => {
    clearTimeout(idleTimer);
    clearTimeout(sendTimer);
    sendTimer = undefined;
    if (localTyping) typingSignal(false);
    localTyping = false;
  };
  const sendTypingUpdate = () => {
    if (!subscribed || !localTyping) return;
    if (Date.now() - lastSent >= TYPING_THROTTLE_MS) {
      typingSignal(true);
      lastSent = Date.now();
    } else if (!sendTimer) {
      sendTimer = setTimeout(() => {
        sendTimer = undefined;
        if (localTyping && subscribed) {
          typingSignal(true);
          lastSent = Date.now();
        }
      }, TYPING_THROTTLE_MS - (Date.now() - lastSent));
    }
  };
  const inputChanged = value => {
    if (!value.trim()) { stopTyping(); return; }
    // Preserve a recent keystroke during join/reconnect instead of dropping it.
    // Sending is still gated by SUBSCRIBED; idle/blur/clear cancel queued input.
    localTyping = true;
    lastInputAt = Date.now();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
    sendTypingUpdate();
  };
  const receiveTyping = ({ payload }) => {
    if (!channel || !payload || payload.conversation_id !== conversationId ||
      !payload.sender_id || payload.sender_id === senderId) return;
    // Accept the documented sender/conversation signal even without a tab ID.
    const remoteSession = typeof payload.session_id === "string" ? payload.session_id : "";
    const key = `${payload.sender_id}:${remoteSession}`;
    if (payload.typing === true) humans.set(key, {
      sender_id: payload.sender_id, name: typeof payload.name === "string" && payload.name.trim() ? payload.name.slice(0, 100)
        : typeof payload.role === "string" ? payload.role.slice(0, 100) : "Someone",
      role: payload.role, session_id: remoteSession, expires: Date.now() + TYPING_EXPIRY_MS,
    });
    else if (payload.typing === false) {
      if (remoteSession) humans.delete(key);
      else for (const [humanKey, person] of humans) if (person.sender_id === payload.sender_id) humans.delete(humanKey);
    }
    publish();
  };
  const receiveAi = ({ payload }) => {
    if (!subscribed || !payload || payload.conversation_id !== conversationId || !payload.sender_id ||
      typeof payload.request_id !== "string" || payload.session_id === sessionId || ignoredAi.has(payload.request_id)) return;
    if (payload.thinking === true) assistants.set(payload.request_id, {
      sender_id: payload.sender_id, request_id: payload.request_id, expires: Date.now() + TYPING_EXPIRY_MS,
    });
    else assistants.delete(payload.request_id);
    publish();
  };
  const aiSignal = (item, thinking) => broadcast("ai_thinking", {
    ...item, sender_id: aiSenderId, session_id: sessionId, thinking,
  });
  const syncAi = () => {
    if (!subscribed) return;
    const next = getAiActivity(conversationId).filter(item => !ignoredAi.has(item.request_id));
    for (const item of localAi) {
      if (!next.some(nextItem => nextItem.request_id === item.request_id)) {
        aiSignal(item, false);
        assistants.delete(item.request_id);
      }
    }
    for (const item of next) {
      if (!aiSenderId) continue;
      assistants.set(item.request_id, { sender_id: aiSenderId, request_id: item.request_id });
      if (!localAi.some(previous => previous.request_id === item.request_id)) {
        aiSignal(item, true);
        lastAiSent = Date.now();
      }
    }
    localAi = next;
    publish();
  };
  const messageReceived = message => {
    if (!message.is_ai_generated) {
      for (const [key, person] of humans) if (person.sender_id === message.sender_id) humans.delete(key);
    }
    if (message.is_ai_generated) {
      for (const [key, person] of assistants) {
        if (person.sender_id === message.sender_id) {
          ignoredAi.add(key);
          assistants.delete(key);
        }
      }
      syncAi();
    }
    publish();
  };
  const channelStatus = status => {
    subscribed = status === "SUBSCRIBED";
    if (subscribed) {
      if (localTyping && Date.now() - lastInputAt < TYPING_IDLE_MS) sendTypingUpdate();
      syncAi(); return;
    }
    stopTyping();
    humans.clear(); assistants.clear(); localAi = [];
    publish();
  };
  const suspend = () => {
    stopTyping();
    localAi.forEach(item => aiSignal(item, false));
    localAi = [];
    subscribed = false;
    humans.clear(); assistants.clear();
    publish();
  };
  const visibilityChanged = () => { if (document.hidden) stopTyping(); };
  const bindChannel = nextChannel => {
    channel = nextChannel;
    channel.on("broadcast", { event: "typing" }, receiveTyping);
    channel.on("broadcast", { event: "ai_thinking" }, receiveAi);
    unsubscribeAi = subscribeAiActivity(syncAi);
    pulseTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, person] of humans) if (person.expires <= now) humans.delete(key);
      for (const [key, person] of assistants) if (person.expires && person.expires <= now) assistants.delete(key);
      if (subscribed && localAi.length && now - lastAiSent >= TYPING_THROTTLE_MS) {
        localAi.forEach(item => aiSignal(item, true));
        lastAiSent = now;
      }
      publish();
    }, 250);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("offline", suspend);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      suspend();
      subscribed = false;
      channel = null;
      clearInterval(pulseTimer);
      clearTimeout(idleTimer);
      unsubscribeAi?.();
      localAi = [];
      ignoredAi.clear();
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("offline", suspend);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  };
  return {
    bindChannel, channelStatus, inputChanged, stopTyping, messageReceived, receiveAi,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
  };
}
