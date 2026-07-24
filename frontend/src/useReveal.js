import { useEffect, useRef } from "react";

export default function useReveal(threshold = 0.12) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = root.querySelectorAll("[data-reveal]");
    if (!targets.length) return;

    const revealClasses = ["reveal", "reveal-left", "reveal-right", "reveal-scale"];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            el.classList.add("visible");
            revealClasses.forEach((cls) => {
              el.querySelectorAll(`.${cls}`).forEach((child) => {
                child.classList.add("visible");
              });
            });
            observer.unobserve(el);
          }
        });
      },
      { threshold, rootMargin: "0px 0px -30px 0px" }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
