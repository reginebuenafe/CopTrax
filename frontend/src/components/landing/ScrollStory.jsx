import { useRef, useState, useEffect } from "react";
import { useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { MotionDiv, MotionP, MotionH3, MotionSpan } from "./motion-elements";

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

function NegotiatePanel({ active }) {
  return (
    <div className="space-y-4">
      {[
        { show: active, delay: 0, content: <span className="text-brown-mid">Proposed &nbsp;₱38.00&nbsp;/&nbsp;kg &middot; 5,000 kg</span> },
        { show: active, delay: 0.15, content: <span className="text-brown-mid">Countered &nbsp;₱37.50&nbsp;/&nbsp;kg &middot; 5,000 kg</span> },
      ].map((line, i) => (
        <MotionP
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.5, delay: line.delay, ease: [0.16, 1, 0.3, 1] }}
          className="text-sm sm:text-base font-mono"
        >
          {line.content}
        </MotionP>
      ))}
      <MotionSpan
        initial={{ opacity: 0, y: 8 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="inline-block text-xs font-bold uppercase tracking-widest text-green-dark bg-green-pale px-3 py-1.5 rounded-full mt-1"
      >
        Accepted
      </MotionSpan>
    </div>
  );
}

function ContractPanel({ active }) {
  const rows = [
    ["", "CTR-00024"],
    ["Supplier", "Juan Dela Cruz"],
    ["Agreed Price", "₱38.00 / kg"],
    ["Target", "5,000 kg"],
    ["Status", "Active"],
  ];
  return (
    <div className="space-y-3.5">
      {rows.map(([label, value], i) => (
        <MotionDiv
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {label && <p className="text-[11px] uppercase tracking-widest text-brown-light mb-0.5">{label}</p>}
          <p className={label ? "text-lg sm:text-xl font-bold text-brown-dark" : "text-2xl sm:text-3xl font-extrabold text-brown-dark tabular-nums"}>
            {value}
          </p>
        </MotionDiv>
      ))}
    </div>
  );
}

function DeliveryPanel({ active }) {
  return (
    <div className="space-y-6">
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
  );
}

function QualityPanel({ active }) {
  const [moisture, setMoisture] = useState(0);

  useEffect(() => {
    if (!active) return;
    const target = 7.5;
    const durationMs = 900;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setMoisture(+(target * (1 - Math.pow(1 - t, 3))).toFixed(1));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-brown-light mb-0.5">Moisture</p>
        <p className="text-3xl sm:text-4xl font-extrabold text-brown-dark tabular-nums">{moisture.toFixed(1)}%</p>
      </div>
      <MotionDiv
        initial={{ opacity: 0, y: 10 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-[11px] uppercase tracking-widest text-brown-light mb-0.5">Assessment</p>
        <span className="inline-block text-sm font-bold uppercase tracking-wide text-green-dark bg-green-pale px-3 py-1.5 rounded-full">
          Accepted
        </span>
      </MotionDiv>
    </div>
  );
}

function PaymentPanel({ active }) {
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setReleased(true), 900);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className="space-y-4">
      <MotionP
        initial={{ opacity: 0, y: 10 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-[11px] uppercase tracking-widest text-brown-light"
      >
        Supplier Payment
      </MotionP>
      <MotionP
        initial={{ opacity: 0, y: 10 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="text-3xl sm:text-4xl font-extrabold text-brown-dark tabular-nums"
      >
        ₱37,924.00
      </MotionP>
      <MotionP
        initial={{ opacity: 0, y: 10 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="text-sm text-brown-mid/80"
      >
        Bank Transfer &middot; one transaction, never batched
      </MotionP>
      <MotionSpan
        initial={{ opacity: 0, y: 10 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`inline-block text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors duration-500 ${
          released ? "text-green-dark bg-green-pale" : "text-brown-mid bg-beige-dark/60"
        }`}
      >
        {released ? "Released" : "Processing"}
      </MotionSpan>
    </div>
  );
}

function StagePanel({ stage, active }) {
  if (stage.panel === "negotiate") return <NegotiatePanel active={active} />;
  if (stage.panel === "contract") return <ContractPanel active={active} />;
  if (stage.panel === "delivery") return <DeliveryPanel active={active} />;
  if (stage.panel === "quality") return <QualityPanel active={active} />;
  return <PaymentPanel active={active} />;
}

// One pinned-scroll stage, shared by every breakpoint. Mobile gets tighter
// type/spacing and a shorter image so the stacked single-column content
// comfortably fits a small phone's viewport height; the crossfade + pin
// behavior itself is identical everywhere.
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
          {!stage.image && <StagePanel key={isActive} stage={stage} active={isActive} />}
        </div>
        <div className="relative">
          {stage.image ? (
            <div className="relative rounded-2xl overflow-hidden border border-beige-dark/60">
              <img src={stage.image} alt="" className="w-full h-[160px] sm:h-[300px] lg:h-[380px] object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-brown-dark/80 via-brown-dark/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8">
                <StagePanel key={isActive} stage={stage} active={isActive} />
              </div>
            </div>
          ) : null}
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
          breakpoint. Uses plain, stable `vh` on purpose (see index.css) —
          not `dvh`, which would resize this section in real time as the
          mobile browser's address bar hides/shows mid-scroll. */}
      <section
        ref={containerRef}
        className="relative"
        style={{ height: `${STAGES.length * 100}vh` }}
      >
        <div className="sticky top-0 h-screen overflow-hidden bg-cream">
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
