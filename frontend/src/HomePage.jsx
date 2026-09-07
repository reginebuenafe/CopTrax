import { useRef } from "react";
import { Link } from "react-router-dom";
import { useScroll, useTransform, useReducedMotion } from "framer-motion";
import { LuTreePalm, LuArrowRight, LuPhone } from "react-icons/lu";
import { MotionDiv } from "./components/landing/motion-elements";
import ScrollStory from "./components/landing/ScrollStory";
import NercStory from "./components/landing/NercStory";
import BeforeStory from "./components/landing/BeforeStory";
import useViewportHeightUnit from "./hooks/useViewportHeightUnit";

function Hero() {
  const heroRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });

  const textOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.6], [0, -40]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);

  return (
    <section
      ref={heroRef}
      id="top"
      className="relative flex items-center overflow-hidden grain"
      style={{ minHeight: "calc(var(--vh-unit) * 100)" }}
    >
      {/* Full-bleed background photo with a slow Ken Burns zoom as the user
          scrolls past, clipped by this section's own overflow-hidden. */}
      <MotionDiv
        style={prefersReducedMotion ? undefined : { scale: imgScale }}
        className="absolute inset-0 w-full h-full"
      >
        <img
          src="https://images.unsplash.com/photo-1560769680-ba2f3767c785?w=1920&h=1080&fit=crop"
          alt=""
          className="w-full h-full object-cover"
        />
      </MotionDiv>
      <div className="absolute inset-0 bg-gradient-to-br from-green-dark/85 via-green-mid/80 to-brown-mid/85 animate-gradient" />

      {/* Decorative floating shapes — purely ambient, so they're skipped
          entirely for users who prefer reduced motion rather than just
          having their animation paused. */}
      {!prefersReducedMotion && (
        <>
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-white/5 animate-float" />
          <div className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full bg-white/5 animate-float-slow" />
          <div className="absolute top-1/2 right-10 w-24 h-24 rounded-full border-2 border-white/10 animate-pulse-ring" />
        </>
      )}

      <MotionDiv
        style={prefersReducedMotion ? undefined : { opacity: textOpacity, y: textY }}
        className="relative z-10 max-w-6xl mx-auto px-4 sm:px-5 py-16 sm:py-24 lg:py-32 w-full"
      >
        <div className="max-w-3xl">
          <h1
            className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] mb-5 sm:mb-6 ${!prefersReducedMotion ? "animate-fade-in-up" : ""}`}
            style={!prefersReducedMotion ? { animationDelay: "150ms" } : undefined}
          >
            Your Trusted{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-100 animate-shimmer">
              Copra Trading
            </span>{" "}
            Partner
          </h1>
          <p
            className={`text-lg sm:text-xl text-white/85 leading-relaxed mb-8 sm:mb-10 max-w-2xl ${!prefersReducedMotion ? "animate-fade-in-up" : ""}`}
            style={!prefersReducedMotion ? { animationDelay: "300ms" } : undefined}
          >
            We buy high-quality copra directly from farmers and suppliers with fair prices and
            fast payment. Learn about copra and how to sell with us.
          </p>
          <div
            className={`flex flex-col sm:flex-row gap-3 sm:gap-4 ${!prefersReducedMotion ? "animate-fade-in-up" : ""}`}
            style={!prefersReducedMotion ? { animationDelay: "450ms" } : undefined}
          >
            <Link
              to="/what-is-copra"
              className="group inline-flex items-center justify-center gap-3 bg-white text-green-dark font-bold px-8 py-4 rounded-2xl hover:bg-yellow-300 hover:shadow-glow-green transition-all duration-300 text-base shadow-lg hover:-translate-y-1"
            >
              <LuTreePalm className="w-5 h-5" /> Learn About Copra
              <LuArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 glass text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/20 transition-all duration-300 text-base hover:-translate-y-1"
            >
              <LuPhone className="w-5 h-5" /> Contact Us
            </Link>
          </div>
        </div>
      </MotionDiv>
    </section>
  );
}

export default function HomePage() {
  useViewportHeightUnit();

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
