import { useCallback, useEffect, useState } from "react";

function readSavedModal(storageKey) {
  if (!storageKey) return null;
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    return null;
  }
}

export function usePersistentProposalModal({ storageKey, conversationId }) {
  const [modalState, setModalState] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSavedModal(storageKey);
      setModalState(saved?.conversationId === conversationId ? saved : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey, conversationId]);

  const persist = useCallback((nextState) => {
    setModalState(nextState);
    if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(nextState));
  }, [storageKey]);

  const openPropose = useCallback((targetConversationId = conversationId) => {
    if (!targetConversationId) return;
    persist({ type: "propose", conversationId: targetConversationId });
  }, [conversationId, persist]);

  const openCounter = useCallback((proposal, targetConversationId = conversationId) => {
    if (!targetConversationId || !proposal) return;
    persist({ type: "counter", conversationId: targetConversationId, proposal });
  }, [conversationId, persist]);

  const clearModal = useCallback(() => {
    setModalState(null);
    if (storageKey) sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  return { modalState, openPropose, openCounter, clearModal };
}
