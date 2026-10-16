import { useMemo, useSyncExternalStore } from "react";
import { createChatTyping } from "../utils/chatTyping";

export function useChatTyping({ conversationId, user, profile, aiSenderId }) {
  const senderId = user?.id;
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Someone";
  const role = profile?.roles?.role_name;
  const activity = useMemo(() => createChatTyping({ conversationId, senderId, name, role, aiSenderId }),
    [conversationId, senderId, name, role, aiSenderId]);
  const { humans, assistants } = useSyncExternalStore(activity.subscribe, activity.getSnapshot);
  return { activity, humans, assistants };
}
