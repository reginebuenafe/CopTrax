import { useRef } from "react";
import { Link } from "react-router-dom";
import { useScroll, useTransform, useReducedMotion } from "framer-motion";
import { MotionDiv, MotionP, MotionH2 } from "./motion-elements";

const EASE = [0.16, 1, 0.3, 1];

const REASONS = [
  {
    title: "Clear Weighing",
    body: "You can see the recorded weight of your delivery.",
  },
  {
    title: "Quality Assessment",
    body: "Copra quality is assessed and recorded as part of the transaction.",
  },
  {
    title: "Clear Records",
    body: "Deliveries, agreements, and transactions are properly recorded.",
  },
  {
    title: "Transaction Visibility",
    body: "Registered suppliers can access records connected to their transactions.",
  },
  {
    title: "Direct Communication",
    body: "Suppliers can communicate with NERC regarding agreements and transactions.",
  },
];

/* ── 02 — What We Do ──────────────────────────────────────────────────── */
function WhatWeDo() {
  // As this section enters the viewport it rises and its top corners
  // flatten out — reading as a rounded sheet sliding up to cover the Hero's
  // bottom edge (the `-mt` overlap plus the top shadow sell the layering).
  // Bounded to exactly the section's own entrance; nothing continues to
  // move once it has fully arrived.
  const sectionRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start start"],
  });
  const coverY = useTransform(scrollYProgress, [0, 1], [320, 0]);
  const coverRadius = useTransform(scrollYProgress, [0, 1], [96, 32]);

  return (
    <MotionDiv
      ref={sectionRef}
      style={
        prefersReducedMotion
          ? undefined
          : { y: coverY, borderTopLeftRadius: coverRadius, borderTopRightRadius: coverRadius }
      }
      className="relative z-10 -mt-32 sm:-mt-48 bg-cream shadow-[0_-24px_50px_-20px_rgba(62,39,35,0.25)] rounded-t-[32px]"
    >
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <MotionP
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
            >
              What We Do
            </MotionP>
            <MotionH2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
              className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
            >
              We buy copra from<br />local suppliers.
            </MotionH2>
            <MotionP
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
              className="text-brown-mid/90 text-base leading-relaxed"
            >
              NERC Copra Trading provides a local market for farmers and suppliers looking to
              sell their copra in Kumalarang, Zamboanga del Sur.
            </MotionP>
          </div>
          <MotionDiv
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <div className="rounded-2xl overflow-hidden border border-beige-dark/60">
              <img
                src="https://images.unsplash.com/photo-1551040291-8450bc650fe8?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1yZWxhdGVkfDJ8fHxlbnwwfHx8fHw%3D"
                alt="Copra shells sun dried."
                className="w-full h-[280px] sm:h-[360px] object-cover"
              />
            </div>
          </MotionDiv>
        </div>
      </section>
    </MotionDiv>
  );
}

/* ── 03 — Why Sell to NERC ────────────────────────────────────────────── */
function WhySellToNerc() {
  return (
    <section id="why-nerc" className="py-20 sm:py-28 bg-beige/60 border-y border-beige-dark/60 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-5">
        <div className="max-w-2xl mb-14 sm:mb-16">
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
          >
            Why NERC
          </MotionP>
          <MotionH2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight"
          >
            A straightforward way<br />to sell your copra.
          </MotionH2>
        </div>

        <div className="max-w-2xl">
          {REASONS.map((reason, i) => (
            <MotionDiv
              key={reason.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
              className="grid grid-cols-[1fr_1.6fr] sm:grid-cols-[220px_1fr] gap-6 py-6 border-t border-beige-dark/60 first:border-t-0"
            >
              <span className="text-base sm:text-lg font-bold text-brown-dark">{reason.title}</span>
              <span className="text-brown-mid/90 text-sm sm:text-base leading-relaxed">{reason.body}</span>
            </MotionDiv>
          ))}
        </div>

        <MotionDiv
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
        >
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-7 py-3.5 rounded-full hover:bg-green-mid transition-colors duration-300 mt-10"
          >
            Sell to NERC
          </Link>
        </MotionDiv>
      </div>
    </section>
  );
}

export default function BeforeStory() {
  return (
    <>
      <WhatWeDo />
      <WhySellToNerc />
    </>
  );
}
