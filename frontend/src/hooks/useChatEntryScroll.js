import { useCallback, useLayoutEffect, useRef } from "react";
import "./chatScroll.css";

// Keep the actual end of the thread visible, without adding scrollable space.
export function useChatEntryScroll({ containerRef, conversationKey, latestEntryKey, enabled = true }) {
  const contentRef = useRef(null);
  const bottomRef = useRef(null);
  const position = useRef({ conversationKey: null, enabled: false, follow: true, pin: null });
  const resumeFollowing = useCallback(() => {
    position.current.follow = true;
    position.current.pin?.();
  }, []);

  useLayoutEffect(() => {
    const list = containerRef.current;
    const content = contentRef.current;
    const bottom = bottomRef.current;
    const state = position.current;
    if (!enabled || !list || !content || !bottom) {
      state.enabled = false;
      return;
    }

    if (!state.enabled || state.conversationKey !== conversationKey) state.follow = true;
    state.enabled = true;
    state.conversationKey = conversationKey;
    let knownHeight = list.scrollHeight;
    let knownViewport = list.clientHeight;

    function pin() {
      // A welcome view is not a message thread. Keep its introduction visible.
      if (!latestEntryKey && !content.querySelector('.chat-typing-slot[data-active="true"]')) return;
      const padding = parseFloat(getComputedStyle(list).paddingBottom) || 0;
      // offsetTop is a layout coordinate: the widget's scale animation must
      // not change the scroll target. The pane is the marker's offset parent.
      const end = bottom.offsetTop;
      list.scrollTo({ top: Math.max(0, end + padding - list.clientHeight), behavior: "instant" });
    }
    function onResize() {
      if (state.follow) pin();
      knownHeight = list.scrollHeight;
      knownViewport = list.clientHeight;
    }
    function onScroll() {
      // Content growth or a viewport resize may dispatch a scroll event before
      // ResizeObserver. Preserve the reader's decision from before that reflow.
      if (list.scrollHeight !== knownHeight || list.clientHeight !== knownViewport) {
        onResize();
        return;
      }
      state.follow = list.scrollHeight - list.clientHeight - list.scrollTop <= 150;
    }

    state.pin = pin;
    if (state.follow) pin(); // Initial render and new entries, before paint.
    const frame = requestAnimationFrame(onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(content); // Includes every message, card, image and typer.
    observer.observe(list);
    list.addEventListener("scroll", onScroll, { passive: true });
    list.addEventListener("load", onResize, true);
    return () => {
      state.pin = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      list.removeEventListener("scroll", onScroll);
      list.removeEventListener("load", onResize, true);
    };
  }, [containerRef, conversationKey, latestEntryKey, enabled]);

  return { resumeFollowing, contentRef, bottomRef };
}
