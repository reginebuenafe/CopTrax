import { useRef } from "react";
import { Link } from "react-router-dom";
import { useScroll, useTransform, useReducedMotion } from "framer-motion";
import { MotionDiv } from "./components/landing/motion-elements";
import ScrollStory from "./components/landing/ScrollStory";
import NercStory from "./components/landing/NercStory";
import BeforeStory from "./components/landing/BeforeStory";

function Hero() {
  const heroRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });

  const textOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.6], [0, -40]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const imgOpacity = useTransform(scrollYProgress, [0.3, 1], [1, 0.5]);

  return (
    <section ref={heroRef} id="top" className="relative bg-cream" style={{ minHeight: "100vh" }}>
      <div className="pt-32 sm:pt-36 pb-10 px-4 sm:px-5">
        <MotionDiv
          style={prefersReducedMotion ? undefined : { opacity: textOpacity, y: textY }}
          className="max-w-2xl mx-auto text-center"
        >
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.24em] text-green-dark mb-6">
            NERC Copra Trading
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-brown-dark leading-[1.05] tracking-tight mb-6">
            Your copra.<br />A market you can count on.
          </h1>
          <p className="text-base sm:text-lg text-brown-mid/90 leading-relaxed max-w-md mx-auto mb-9">
            A local copra buying business serving farmers and suppliers in Kumalarang and
            surrounding communities.
          </p>
          <div className="flex items-center justify-center gap-6">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-7 py-3.5 rounded-full hover:bg-green-mid transition-colors duration-300"
            >
              Sell to NERC
            </Link>
            <a
              href="#why-nerc"
              className="text-brown-dark font-semibold hover:text-green-dark transition-colors duration-300"
            >
              Learn More &darr;
            </a>
          </div>
        </MotionDiv>
      </div>

      <MotionDiv
        style={prefersReducedMotion ? undefined : { scale: imgScale, opacity: imgOpacity }}
        className="max-w-6xl mx-auto px-4 sm:px-5"
      >
        <div className="rounded-2xl overflow-hidden border border-beige-dark/60">
          <img
            src="https://images.unsplash.com/photo-1546662608-aec5228e9a74?w=1800&h=1000&fit=crop"
            alt="Freshly harvested coconuts ready for copra production"
            className="w-full h-[42vh] sm:h-[55vh] lg:h-[62vh] object-cover"
          />
        </div>
      </MotionDiv>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="bg-cream">
      <Hero />

      <BeforeStory />

      <div id="story" className="scroll-mt-0">
        <ScrollStory />
      </div>

      <NercStory />
    </div>
  );
}
