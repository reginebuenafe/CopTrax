import { Link } from "react-router-dom";
import { LuMapPin, LuPhone, LuMail, LuClock } from "react-icons/lu";
import { MotionDiv, MotionP, MotionH2 } from "./motion-elements";

const EASE = [0.16, 1, 0.3, 1];

const COPRA_STEPS = ["Coconut", "Drying", "Copra", "Trading"];

/* ── 05 — About NERC Copra Trading ────────────────────────────────────── */
function AboutNerc() {
  return (
    <section id="about" className="py-20 sm:py-28 border-t border-beige-dark/60 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-5">
        <div className="max-w-2xl mb-14 sm:mb-16">
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
          >
            About NERC
          </MotionP>
          <MotionH2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
          >
            Rooted in the<br />local copra trade.
          </MotionH2>
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="text-brown-mid/90 text-base leading-relaxed"
          >
            Based in Poblacion, Kumalarang, Zamboanga del Sur, NERC Copra Trading is a local
            copra buying business serving farmers and suppliers in the community. Built on
            long-standing relationships, the business continues to connect local copra
            producers with a reliable place to sell their produce.
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
              src="https://images.pexels.com/photos/7676876/pexels-photo-7676876.jpeg"
              alt="Dried copra halves, the product NERC Copra Trading buys and trades"
              className="w-full h-[280px] sm:h-[400px] object-cover"
            />
          </div>
        </MotionDiv>
      </div>
    </section>
  );
}

/* ── 06 — About Copra ──────────────────────────────────────────────────── */
function AboutCopra() {
  return (
    <section className="py-20 sm:py-28 bg-beige/60 border-y border-beige-dark/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div className="order-2 lg:order-1">
          <MotionDiv
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <div className="rounded-2xl overflow-hidden border border-beige-dark/60">
              <img
                src="https://images.unsplash.com/photo-1581453883350-288b2c19bea8?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Y29jb251dHxlbnwwfHwwfHx8MA%3D%3D"
                alt="Hand holding a split coconut, the raw material dried into copra"
                className="w-full h-[280px] sm:h-[360px] object-cover"
              />
            </div>
          </MotionDiv>
        </div>

        <div className="order-1 lg:order-2">
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
          >
            About Copra
          </MotionP>
          <MotionH2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
          >
            From coconut<br />to copra.
          </MotionH2>
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="text-brown-mid/90 text-base leading-relaxed mb-8"
          >
            Copra is the dried meat of the coconut. Once harvested and dried, it becomes the
            commodity NERC buys and trades, not the raw coconut itself.
          </MotionP>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {COPRA_STEPS.map((step, i) => (
              <MotionDiv
                key={step}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.08, ease: EASE }}
                className="flex items-center gap-3"
              >
                <span className="text-sm sm:text-base font-bold uppercase tracking-wide text-brown-dark">
                  {step}
                </span>
                {i < COPRA_STEPS.length - 1 && <span className="text-green-dark/60">&rarr;</span>}
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 07 — Quality ─────────────────────────────────────────────────────── */
function Quality() {
  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-2xl mx-auto px-4 sm:px-5 text-center">
        <MotionP
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
        >
          Copra Quality
        </MotionP>
        <MotionH2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
          className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
        >
          Quality matters.
        </MotionH2>
        <MotionP
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
          className="text-brown-mid/90 text-base leading-relaxed"
        >
          The moisture content of your copra is measured at the buying station and factored
          into the transaction, so the condition of what you bring in affects the outcome.
        </MotionP>
      </div>
    </section>
  );
}

/* ── 08 — Powered by CopTrax (short) ──────────────────────────────────── */
function PoweredByCopTrax() {
  return (
    <section className="py-20 sm:py-28 bg-beige/60 border-y border-beige-dark/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
          >
            Powered by CopTrax
          </MotionP>
          <MotionH2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
          >
            Clear records<br />from start to finish.
          </MotionH2>
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="text-brown-mid/90 text-base leading-relaxed mb-4"
          >
            NERC Copra Trading uses CopTrax to organize supplier agreements, deliveries,
            quality assessments, and transaction records in one connected system.
          </MotionP>
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
            className="text-brown-mid/90 text-base leading-relaxed"
          >
            Registered suppliers can access their account to view relevant transactions with
            NERC.
          </MotionP>
        </div>

        <MotionDiv
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <div className="bg-white rounded-2xl border border-beige-dark/60 shadow-card overflow-hidden">
            <div className="bg-green-dark text-white px-5 sm:px-7 py-3.5 flex items-center justify-between">
              <span className="text-sm font-bold">CopTrax</span>
              <span className="text-[11px] uppercase tracking-wider text-white/70">Supplier Portal</span>
            </div>
            <div className="px-5 sm:px-7 py-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="font-bold text-brown-dark">Delivery / 024</span>
              <span className="text-brown-mid/80 tabular-nums">842.50 kg</span>
              <span className="ml-auto text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-green-pale text-green-dark">
                Accepted
              </span>
            </div>
          </div>
        </MotionDiv>
      </div>
    </section>
  );
}

/* ── 09 — Contact / Visit NERC ────────────────────────────────────────── */
function ContactSection() {
  const details = [
    { icon: <LuMapPin className="w-5 h-5" />, title: "Buying Station", body: <>Poblacion, Kumalarang<br />Zamboanga del Sur</> },
    { icon: <LuPhone className="w-5 h-5" />, title: "Phone", body: <a href="tel:+639186062580" className="hover:text-green-dark transition-colors">+63 918 606 2580</a> },
    { icon: <LuMail className="w-5 h-5" />, title: "Email", body: <a href="mailto:nerccopra@coptrax.com" className="hover:text-green-dark transition-colors">nerccopra@coptrax.com</a> },
    { icon: <LuClock className="w-5 h-5" />, title: "Hours", body: <>Monday – Sunday<br />6:00 AM – 5:00 PM</> },
  ];

  return (
    <section id="contact" className="py-20 sm:py-28 border-t border-beige-dark/60 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-5">
        <div className="max-w-xl mb-14 sm:mb-16">
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
          >
            Contact
          </MotionP>
          <MotionH2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
          >
            Have copra to sell?
          </MotionH2>
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="text-brown-mid/90 text-base leading-relaxed"
          >
            Get in touch with NERC Copra Trading or visit our buying station in Kumalarang.
          </MotionP>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 mb-14 sm:mb-16">
          {details.map((d, i) => (
            <MotionDiv
              key={d.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
              className="bg-white rounded-2xl border border-beige-dark/60 p-6"
            >
              <div className="w-9 h-9 rounded-full bg-green-pale text-green-dark flex items-center justify-center mb-4">
                {d.icon}
              </div>
              <h3 className="text-brown-dark font-bold text-sm mb-2">{d.title}</h3>
              <p className="text-brown-mid/90 text-sm leading-relaxed">{d.body}</p>
            </MotionDiv>
          ))}
        </div>

        <MotionDiv
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
          className="rounded-2xl border border-beige-dark/60 h-64 sm:h-80 overflow-hidden mb-12"
        >
          <iframe
            title="Poblacion, Kumalarang, Zamboanga del Sur"
            src="https://www.google.com/maps/embed?pb=!1m2!2m1!1sPoblacion%2C+Kumalarang%2C+Zamboanga+del+Sur"
            className="w-full h-full border-0"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </MotionDiv>

        <div className="flex flex-wrap items-center gap-6">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-7 py-3.5 rounded-full hover:bg-green-mid transition-colors duration-300"
          >
            Become a Supplier
          </Link>
          <Link
            to="/login"
            className="text-brown-dark font-semibold hover:text-green-dark transition-colors duration-300"
          >
            Log In
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── 10 — Final CTA ───────────────────────────────────────────────────── */
function FinalBrandStatement() {
  return (
    <section className="py-28 sm:py-40 border-t border-beige-dark/60">
      <div className="max-w-lg mx-auto px-4 sm:px-5 text-center">
        <MotionP
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-5"
        >
          Sell to NERC
        </MotionP>
        <MotionH2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
          className="text-3xl sm:text-4xl font-extrabold text-brown-dark leading-tight mb-5"
        >
          Your next delivery<br />starts here.
        </MotionH2>
        <MotionP
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
          className="text-brown-mid/90 text-base leading-relaxed mb-9"
        >
          Create a supplier account and start doing business with NERC Copra Trading.
        </MotionP>
        <MotionDiv
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
          className="flex flex-col items-center gap-4"
        >
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-8 py-4 rounded-full hover:bg-green-mid transition-colors duration-300"
          >
            Become a Supplier
          </Link>
          <Link
            to="/login"
            className="text-brown-dark font-semibold hover:text-green-dark transition-colors duration-300 text-sm"
          >
            Already a supplier? Log In
          </Link>
        </MotionDiv>
      </div>
    </section>
  );
}

export default function NercStory() {
  return (
    <>
      <AboutNerc />
      <AboutCopra />
      <Quality />
      <PoweredByCopTrax />
      <ContactSection />
      <FinalBrandStatement />
    </>
  );
}
