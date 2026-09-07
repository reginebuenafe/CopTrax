import { useEffect } from "react";

// Belt-and-suspenders fix for the classic mobile "100vh gets cut off by the
// browser's address bar" bug. index.css already defines --vh-unit using the
// modern `1svh` (smallest viewport height) unit wherever it's supported,
// which handles this correctly with zero JS. But `svh`/`dvh` aren't
// universally supported — older Android WebViews and in-app browsers (e.g.
// Messenger/Facebook, common among rural mobile users sharing links) can
// silently fall back to plain `1vh`, which is sized against the *largest*
// possible viewport (address bar hidden). That makes a `calc(var(--vh-unit)
// * 100)` section taller than what's actually visible on load, so its
// bottom edge — where the Hero is meant to hand off to the next section —
// renders behind the browser chrome and looks cut off until the user
// scrolls.
//
// This hook sets --vh-unit directly from window.innerHeight, which reflects
// the browser's actual visible viewport on every device, overriding the CSS
// value once mounted. It's harmless to also run on modern browsers where
// `svh` already works correctly — it just recomputes to the same value.
export default function useViewportHeightUnit() {
  useEffect(() => {
    let frame = null;

    function setVhUnit() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh-unit", `${vh}px`);
    }

    function scheduleUpdate() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(setVhUnit);
    }

    setVhUnit();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      // Restore the CSS-only value on unmount so navigating to a route
      // without this hook doesn't leave a stale inline override behind.
      document.documentElement.style.removeProperty("--vh-unit");
    };
  }, []);
}
