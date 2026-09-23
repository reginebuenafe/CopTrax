// Fire-and-forget caller for the `ai-faq` Edge Function (Coco, the AI FAQ
// assistant). This is intentionally isolated from all negotiation/proposal
// chat logic — it only ever posts the Supplier's message to the FAQ
// function so it can reply in the same conversation.
//
// Responsibilities kept purely client-side here (the actual answering logic,
// retries against Gemini, and fallback-message insertion all live in the
// Edge Function itself — see supabase/functions/ai-faq/index.ts):
//   - Bound how long we wait for the invoke() call so a hung network
//     request can never keep an in-flight flag set forever.
//   - Skip firing a second overlapping request for the same conversation
//     while one is still in flight (prevents duplicate AI replies if the
//     Supplier sends messages in quick succession).
//   - Always log the real error instead of letting the promise fail
//     silently, and always clear the in-flight flag — on success, failure,
//     timeout, or thrown exception.

import { supabase } from "../lib/supabase";

// Generous enough for Gemini's multi-model fallback inside the Edge
// Function, but bounded so this call can never hang indefinitely.
const AI_FAQ_CLIENT_TIMEOUT_MS = 20000;

const inFlightConversationIds = new Set();

export function invokeAiFaq(conversationId, messageText) {
  if (!conversationId || !messageText) return;

  // Duplicate-request guard: one outstanding ai-faq call per conversation.
  if (inFlightConversationIds.has(conversationId)) {
    console.warn("ai-faq: skipped duplicate request — one already in flight for conversation", conversationId);
    return;
  }
  inFlightConversationIds.add(conversationId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_FAQ_CLIENT_TIMEOUT_MS);

  supabase.functions
    .invoke("ai-faq", {
      body: { conversation_id: conversationId, message_text: messageText },
      signal: controller.signal,
    })
    .then(({ error }) => {
      if (error) console.error("ai-faq: invoke returned an error:", error);
    })
    .catch((err) => {
      console.error("ai-faq: invoke failed/timed out:", err);
    })
    .finally(() => {
      clearTimeout(timeoutId);
      inFlightConversationIds.delete(conversationId);
    });
}
