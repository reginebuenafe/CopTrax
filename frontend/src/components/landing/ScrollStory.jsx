import { useRef, useState, useEffect } from "react";
import { useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { LuCoins, LuClock, LuCheck, LuPencil, LuX, LuArrowRight } from "react-icons/lu";
import { MotionDiv, MotionP, MotionH3, MotionSpan } from "./motion-elements";
import qualityAssessmentImage from "../../assets/images/quality-assessment.webp";

// Presentation-only mock data for the landing-page scroll story.
// This does not read from or write to any real contract, delivery, or payment record.
const STAGES = [
  {
    id: "negotiate",
    kicker: "Stage 01 — Agree",
    headline: "Start with an agreement.",
    body: "You and NERC settle on price and quantity by chat, back and forth, until both sides accept.",
    panel: "negotiate",
  },
  {
    id: "contract",
    kicker: "Stage 02 — Record",
    headline: "Your agreement is clearly recorded.",
    body: "Once you agree, the terms are written down as a contract, no re-typing figures, no separate paperwork.",
    panel: "contract",
  },
  {
    id: "delivery",
    kicker: "Stage 03 — Deliver",
    headline: "Bring in your copra.",
    body: "Bring your copra to the buying station, where it's weighed and recorded against your agreement.",
    panel: "delivery",
    image: "https://images.unsplash.com/photo-1603779046675-2eccbab9b982?w=1200&h=1400&fit=crop",
  },
  {
    id: "quality",
    kicker: "Stage 04 — Assess",
    headline: "Quality, clearly assessed.",
    body: "Moisture content is measured and checked, so you know exactly how your copra was assessed.",
    panel: "quality",
  },
  {
    id: "payment",
    kicker: "Stage 05 — Pay",
    headline: "Complete the transaction.",
    body: "Payment is calculated and released as its own transaction, so you know exactly what you're paid and why.",
    panel: "payment",
  },
];

// Shared sizing so the right-column visual occupies roughly the same
// footprint on every stage — the column shouldn't grow/shrink as the
// user scrolls between stages.
const VISUAL_CARD = "relative w-full h-[260px] sm:h-[300px] lg:h-[380px] rounded-2xl overflow-hidden border border-beige-dark/60";

// Styled after CopTrax's real proposal/counteroffer card (see
// NegotiationChatWidget.jsx) — a small "submitted" chip followed by the
// actual counteroffer card chrome (header, AI Assistant badge, Pending
// status, price/volume fields, action row), resolving to Accepted. This
// mirrors the real feature rather than an invented abstraction.
function NegotiatePanel({ active }) {
  return (
    <div className={`${VISUAL_CARD} bg-gradient-to-br from-beige to-cream flex flex-col items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-5`}>
      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[360px] flex items-center gap-3 rounded-xl border border-beige-dark/70 bg-white px-4 py-2.5 sm:py-3 shadow-sm"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-pale text-green-dark">
          <LuCoins className="h-4 w-4" />
        </span>
        <span className="whitespace-nowrap font-mono text-[11px] tracking-tight text-brown-mid sm:text-sm sm:tracking-normal">Proposed &nbsp;₱38.00/kg &middot; 5 t</span>
      </MotionDiv>

      <MotionDiv
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={active ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.97 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-green-dark/70 bg-[#FFFEFB] shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[#B7DDBD] bg-[#EAF6EC] px-4 py-2.5 sm:py-3 text-[10px] font-extrabold uppercase text-[#17682D]">
          <LuCoins className="h-4 w-4 text-[#024023]" />
          <span>Counteroffer</span>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold normal-case text-amber-700">
            <LuClock className="h-3 w-3" /> Pending
          </span>
        </div>

        <div className="space-y-1.5 sm:space-y-2 px-4 py-3 sm:py-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-brown-light font-medium">Proposed Price</span>
            <span className="font-extrabold text-brown-dark text-sm">₱37.50/kg</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-brown-light font-medium">Proposed Volume</span>
            <span className="font-extrabold text-brown-dark text-sm">5 t</span>
          </div>
        </div>

        <div className="mx-4 flex gap-1.5 border-t border-[#B7DDBD] py-2.5 sm:py-3">
          <span className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#E8F0E5] py-1.5 sm:py-2 text-[10px] font-semibold text-[#2D5A27]">
            <LuCheck className="h-3 w-3" /> Accept
          </span>
          <span className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#F5F0E8] py-1.5 sm:py-2 text-[10px] font-semibold text-[#5C4A32]">
            <LuPencil className="h-3 w-3" /> Counter
          </span>
          <span className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-50 py-1.5 sm:py-2 text-[10px] font-semibold text-red-600">
            <LuX className="h-3 w-3" /> Reject
          </span>
        </div>
      </MotionDiv>

    </div>
  );
}

// Elegant document composition — cream "paper", ruled agreement fields,
// and a signature area. Intentionally styled like a ledger page rather
// than a literal PDF viewer.
function ContractPanel({ active }) {
  const rows = [
    ["Supplier", "Juan Dela Cruz"],
    ["Agreed Price", "₱38.00 / kg"],
    ["Quantity", "5 t"],
  ];
  return (
    <div className={`${VISUAL_CARD} bg-cream shadow-[0_10px_30px_-15px_rgba(62,39,35,0.25)] flex flex-col px-5 sm:px-8 py-5 sm:py-6`}>
      <MotionDiv
        initial={{ opacity: 0, y: -6 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-baseline justify-between border-b border-beige-dark/70 pb-2 mb-3"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brown-light">Agreement</span>
        <span className="text-[11px] font-mono text-brown-light">CTR-00024</span>
      </MotionDiv>

      <div className="flex-1 flex flex-col justify-center gap-2.5">
        {rows.map(([label, value], i) => (
          <MotionDiv
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.45, delay: 0.12 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-end justify-between border-b border-dashed border-beige-dark/70 pb-1.5"
          >
            <span className="text-[10px] sm:text-[11px] uppercase tracking-widest text-brown-light">{label}</span>
            <span className="text-sm sm:text-base font-bold text-brown-dark">{value}</span>
          </MotionDiv>
        ))}
      </div>

      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.5, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between gap-6 pt-3 mt-1 border-t border-beige-dark/70"
      >
        {[
          { who: "Supplier", path: "M4 15 C6 5,9 3,11 11 C13 19,15 21,17 13 C19 5,22 2,25 9 C27 14,28 18,31 15 C35 11,38 6,42 9 C45 11,44 17,48 16 C53 15,55 8,60 10 C64 12,63 18,68 17 C74 16,77 9,83 11 C87 12.5,89 15,94 13" },
          { who: "NERC", path: "M3 12 C5 6,8 18,11 11 C14 4,17 17,20 9 C23 3,25 15,29 7 C32 1,35 13,39 9 C42 6,44 15,48 11 C52 7,55 17,60 10 C64 5,66 16,71 12 C76 8,79 15,84 9 C88 5,90 12,95 10" },
        ].map(({ who, path }) => (
          <div key={who} className="flex-1 text-center">
            <svg viewBox="0 0 100 26" className="w-4/5 mx-auto h-5 text-brown-dark/60" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d={path} />
            </svg>
            <p className="text-[9px] uppercase tracking-widest text-brown-light mt-0.5">{who}</p>
          </div>
        ))}
      </MotionDiv>
    </div>
  );
}

// Photograph stays the anchor for Delivery — only the card sizing was
// aligned with the other four stages so the column doesn't jump in size.
function DeliveryPanel({ active, image }) {
  return (
    <div className={`${VISUAL_CARD} border-beige-dark/60`}>
      <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-brown-dark/80 via-brown-dark/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        {[
          ["Gross Weight", "1,024.50 kg"],
          ["Net Weight", "998.00 kg"],
        ].map(([label, value], i) => (
          <MotionDiv
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.5, delay: i * 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[11px] uppercase tracking-widest text-white/60 mb-0.5">{label}</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">{value}</p>
          </MotionDiv>
        ))}
      </div>
    </div>
  );
}

// Photograph-led inspection visual — a real lab quality-check moment.
function QualityPanel() {
  return (
    <div className={`${VISUAL_CARD} border-beige-dark/60`}>
      <img src={qualityAssessmentImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-brown-dark/80 via-brown-dark/10 to-transparent" />
    </div>
  );
}

// A completed transfer slip tells the payment story without foregrounding
// a payment amount or turning the landing stage into fintech advertising.
function PaymentPanel({ active }) {
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setReleased(true), 900);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className={`${VISUAL_CARD} bg-gradient-to-br from-beige to-cream flex items-center justify-center px-4 sm:px-8`}>
      <MotionDiv
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={active ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[390px] rounded-2xl border border-beige-dark bg-white px-5 py-4 sm:px-7 sm:py-6 shadow-[0_14px_30px_-20px_rgba(62,39,35,0.38)]"
      >
        <div className="flex items-center justify-between border-b border-beige-dark/70 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brown-light">Transaction Record</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors duration-500 ${
            released ? "bg-green-pale text-green-dark" : "bg-beige-dark/50 text-brown-mid"
          }`}>
            <LuCheck className="h-3 w-3" />
            {released ? "Recorded" : "Processing"}
          </span>
        </div>

        <div className="py-4 sm:py-5 space-y-2.5 sm:space-y-3">
          <MotionDiv
            initial={{ opacity: 0, x: -10 }}
            animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
            transition={{ duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brown-dark text-xs font-bold text-white">N</span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brown-light">From</p>
              <p className="text-sm font-bold text-brown-dark">NERC Copra Trading</p>
            </div>
          </MotionDiv>

          <MotionDiv
            aria-hidden="true"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={active ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
            transition={{ duration: 0.45, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2 pl-4 origin-left text-green-dark"
          >
            <span className="h-px flex-1 bg-green-dark/35" />
            <LuArrowRight className="h-4 w-4" />
            <span className="h-px flex-1 bg-green-dark/35" />
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, x: 10 }}
            animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
            transition={{ duration: 0.45, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-end gap-3 text-right"
          >
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brown-light">To</p>
              <p className="text-sm font-bold text-brown-dark">Supplier Account</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-pale text-xs font-bold text-green-dark">S</span>
          </MotionDiv>
        </div>

        <MotionDiv
          initial={{ opacity: 0, y: 6 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.4, delay: 0.48, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-between border-t border-beige-dark/70 pt-3 text-[10px] text-brown-light"
        >
          <span>Payment reference</span>
          <span className="font-mono tracking-wide text-brown-mid">COP-024-0915</span>
        </MotionDiv>
      </MotionDiv>
    </div>
  );
}

function StagePanel({ stage, active }) {
  if (stage.panel === "negotiate") return <NegotiatePanel active={active} />;
  if (stage.panel === "contract") return <ContractPanel active={active} />;
  if (stage.panel === "delivery") return <DeliveryPanel active={active} image={stage.image} />;
  if (stage.panel === "quality") return <QualityPanel active={active} />;
  return <PaymentPanel active={active} />;
}

// One pinned-scroll stage, shared by every breakpoint. Every stage now
// gets a right-column visual anchor of the same footprint (see
// VISUAL_CARD); Delivery keeps its original photo + left/right swap, the
// other four stages render their own stylized composition. The
// crossfade + pin behavior itself is identical everywhere.
function Stage({ stage, isActive }) {
  const isDeliveryDark = stage.panel === "delivery";

  return (
    <div
      className="absolute inset-0 flex items-center transition-[opacity,transform] duration-500 ease-out"
      style={{
        opacity: isActive ? 1 : 0,
        transform: isActive ? "translateY(0)" : "translateY(16px)",
        pointerEvents: isActive ? "auto" : "none",
      }}
      aria-hidden={!isActive}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-5 w-full grid lg:grid-cols-2 gap-5 sm:gap-10 lg:gap-16 items-center">
        <div className={isDeliveryDark ? "lg:order-1" : ""}>
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-2 sm:mb-4">{stage.kicker}</p>
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-brown-dark leading-tight mb-2 sm:mb-4">{stage.headline}</h3>
          <p className="text-brown-mid/90 text-sm sm:text-base leading-relaxed max-w-md mb-4 sm:mb-8">{stage.body}</p>
        </div>
        <div className="relative">
          <StagePanel key={isActive} stage={stage} active={isActive} />
        </div>
      </div>
    </div>
  );
}

export default function ScrollStory() {
  const containerRef = useRef(null);
  const [activeStage, setActiveStage] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActiveStage(Math.min(STAGES.length - 1, Math.max(0, Math.floor(v * STAGES.length))));
  });

  if (prefersReducedMotion) {
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-16">
        <div className="max-w-2xl mb-14" data-reveal>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-4">
            Selling to NERC
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-4">
            From agreement<br />to payment.
          </h2>
          <p className="text-brown-mid/90 text-base leading-relaxed">
            A clear process from the moment an agreement is made to the completion of your
            transaction.
          </p>
        </div>
        {STAGES.map((stage) => (
          <div key={stage.id} className="py-10 border-t border-beige-dark/60 first:border-t-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-3">{stage.kicker}</p>
            <h3 className="text-2xl font-extrabold text-brown-dark mb-3">{stage.headline}</h3>
            <p className="text-brown-mid/90 text-base leading-relaxed mb-6 max-w-xl">{stage.body}</p>
            <StagePanel stage={stage} active={true} />
          </div>
        ))}
      </section>
    );
  }

  return (
    <>
      {/* Intro — establishes the supplier journey before the stage sequence */}
      <section className="max-w-2xl mx-auto px-4 sm:px-5 pt-20 sm:pt-28 pb-10 sm:pb-14 text-center">
        <MotionP
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
        >
          Selling to NERC
        </MotionP>
        <MotionH3
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
        >
          From agreement<br />to payment.
        </MotionH3>
        <MotionP
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-brown-mid/90 text-base leading-relaxed"
        >
          A clear process from the moment an agreement is made to the completion of your
          transaction.
        </MotionP>
      </section>

      {/* Pinned scroll-driven sequence — same crossfade behavior at every
          breakpoint. Uses the stable `--vh-unit` custom property (see
          index.css), which resolves to `svh` where supported and falls back
          to plain `vh`. Both are computed once and never change mid-scroll
          (unlike `dvh`), and `svh` additionally guarantees the pinned box
          never exceeds the actually-visible mobile viewport, so the
          background can't get cut off when the browser's toolbar is
          showing. */}
      <section
        ref={containerRef}
        className="relative"
        style={{ height: `calc(var(--vh-unit) * ${STAGES.length * 100})` }}
      >
        <div
          className="sticky top-0 overflow-hidden bg-cream"
          style={{ height: "calc(var(--vh-unit) * 100)" }}
        >
          <div className="absolute top-20 sm:top-24 left-0 right-0 text-center pointer-events-none">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.24em] text-brown-light">
              Selling copra to NERC
            </p>
          </div>
          {STAGES.map((stage, i) => (
            <Stage
              key={stage.id}
              stage={stage}
              isActive={activeStage === i}
            />
          ))}
          <div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 sm:gap-2.5">
            {STAGES.map((stage, i) => (
              <span
                key={stage.id}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                  activeStage === i ? "bg-green-dark" : "bg-beige-dark"
                }`}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
