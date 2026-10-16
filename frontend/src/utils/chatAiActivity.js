// Ephemeral UI activity only. Observe existing requests without modifying them.
const pending = new Map();
const listeners = new Set();
export const AI_ACTIVITY_TIMEOUT_MS = 20000;

export function subscribeAiActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getAiActivity(conversationId) {
  return [...pending.values()].filter(item => item.conversation_id === conversationId);
}
export function observeAiRequest(conversationId, request, { broadcastChannel, aiSenderId } = {}) {
  if (!conversationId) return;
  const activity = { request_id: crypto.randomUUID(), conversation_id: conversationId };
  pending.set(activity.request_id, activity);
  listeners.forEach(listener => listener());
  // The owner can launch negotiation AI from the conversation-list channel
  // while viewing a different thread. Reuse their already-open presence
  // channel in that case; supplier chats already listen on that channel.
  const broadcast = thinking => {
    if (!broadcastChannel || !aiSenderId) return;
    try {
      Promise.resolve(broadcastChannel.send({ type: "broadcast", event: "ai_thinking", payload: {
        ...activity, sender_id: aiSenderId, session_id: activity.request_id, thinking,
      } })).catch(() => {});
    } catch { /* purely optional UI signal */ }
  };
  broadcast(true);
  const heartbeat = broadcastChannel ? setInterval(() => broadcast(true), 1500) : undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    clearInterval(heartbeat);
    broadcast(false);
    pending.delete(activity.request_id);
    listeners.forEach(listener => listener());
  };
  const timeout = setTimeout(finish, AI_ACTIVITY_TIMEOUT_MS);
  // The original caller retains its own success/error/abort handling.
  Promise.resolve(request).then(finish, finish);
}
