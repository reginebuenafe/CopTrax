import { useEffect } from "react";
import Lenis from "lenis";

// Renders nothing — just gives the public/marketing pages a soft, "magnetic"
// inertial scroll feel instead of the browser's default instant-stop scroll.
// Lenis smooths native window scrolling (it still calls window.scrollTo under
// the hood), so position: sticky, IntersectionObserver reveals, and every
// scroll-linked framer-motion effect on these pages keep working untouched.
// `anchors: true` is required: this site's Navbar/Footer links are plain
// `href="/#section"` hash anchors, and without it Lenis fights the browser's
// native hash-jump (its own animation loop overrides the jump), overshooting
// wildly past the target section instead of landing on it.
// Scoped to the public landing routes only — never mounted on dashboard
// layouts, so it can't interfere with internal scroll containers, modals, or
// the chat/negotiation UI.
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.2,
      anchors: true,
    });

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return null;
}
