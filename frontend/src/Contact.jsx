import { useRef } from "react";
import { useScroll, useTransform, useReducedMotion } from "framer-motion";
import { LuMapPin, LuPhone, LuMail, LuClock } from "react-icons/lu";
import useReveal from "./useReveal";
import { MotionDiv, MotionIframe } from "./components/landing/motion-elements";

export default function Contact() {
  const ref = useReveal();
  const prefersReducedMotion = useReducedMotion();

  // Header text drifts up and fades slightly as the page scrolls past it.
  const { scrollY } = useScroll();
  const headerY = useTransform(scrollY, [0, 400], [0, -50]);
  const headerOpacity = useTransform(scrollY, [0, 350], [1, 0.35]);

  // Map gets a subtle parallax lag as it travels through the viewport.
  const mapRef = useRef(null);
  const { scrollYProgress: mapProgress } = useScroll({
    target: mapRef,
    offset: ["start end", "end start"],
  });
  const mapY = useTransform(mapProgress, [0, 1], [50, -50]);

  const cards = [
    {
      icon: <LuMapPin className="w-5 h-5" />,
      title: "Buying Station",
      content: (
        <p className="text-brown-mid/90 text-sm leading-relaxed">
          Poblacion, Kumalarang,<br />
          Zamboanga del Sur, Philippines
        </p>
      ),
    },
    {
      icon: <LuPhone className="w-5 h-5" />,
      title: "Phone & Email",
      content: (
        <div className="text-brown-mid/90 text-sm leading-relaxed space-y-2">
          <p>
            <span className="text-brown-dark font-medium">Phone:</span><br />
            <a href="tel:+639186062580" className="hover:text-green-dark transition-colors">+63 918 606 2580</a>
          </p>
          <p>
            <span className="text-brown-dark font-medium">Email:</span><br />
            <a href="mailto:nerccopra@coptrax.com" className="hover:text-green-dark transition-colors">nerccopra@coptrax.com</a>
          </p>
        </div>
      ),
    },
    {
      icon: <LuClock className="w-5 h-5" />,
      title: "Business Hours",
      content: (
        <p className="text-brown-mid/90 text-sm leading-relaxed">
          <span className="text-brown-dark font-medium">Monday – Sunday</span><br />
          6:00 AM – 5:00 PM
        </p>
      ),
    },
  ];

  return (
    <div ref={ref} className="bg-cream">
      <section className="pt-28 sm:pt-32 lg:pt-36 pb-14 sm:pb-16">
        <MotionDiv
          className="max-w-3xl mx-auto px-4 sm:px-5 text-center"
          data-reveal
          style={prefersReducedMotion ? undefined : { y: headerY, opacity: headerOpacity }}
        >
          <p className="reveal text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-green-dark mb-5">
            Get in Touch
          </p>
          <h1 className="reveal text-4xl sm:text-5xl font-extrabold text-brown-dark leading-tight mb-5 delay-100">
            Contact Us
          </h1>
          <p className="reveal text-base sm:text-lg text-brown-mid/90 leading-relaxed delay-200">
            Reach out to sell your copra or inquire about the current buying price.
          </p>
        </MotionDiv>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 pb-20 sm:pb-28">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 mb-16 sm:mb-20" data-reveal>
          {cards.map((card, i) => (
            <div
              key={card.title}
              className={`reveal delay-${(i + 1) * 100} bg-white rounded-2xl border border-beige-dark/60 p-6 sm:p-7`}
            >
              <div className="w-9 h-9 rounded-full bg-green-pale text-green-dark flex items-center justify-center mb-5">
                {card.icon}
              </div>
              <h3 className="text-brown-dark font-bold text-base mb-3">{card.title}</h3>
              {card.content}
            </div>
          ))}
        </div>

        <div className="mb-16 sm:mb-20" data-reveal>
          <div className="max-w-xl mb-8">
            <p className="reveal text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-4">
              Location
            </p>
            <h2 className="reveal text-2xl sm:text-3xl font-extrabold text-brown-dark mb-3 delay-100">
              Find our buying station
            </h2>
            <p className="reveal text-brown-mid/90 text-sm leading-relaxed delay-200">
              Visit us to sell your copra and get paid on the spot.
            </p>
          </div>
          <div
            ref={mapRef}
            className="reveal delay-300 relative rounded-2xl border border-beige-dark/60 h-64 sm:h-80 overflow-hidden"
          >
            <MotionIframe
              title="Poblacion, Kumalarang, Zamboanga del Sur"
              src="https://www.google.com/maps?q=Poblacion%2C+Kumalarang%2C+Zamboanga+del+Sur%2C+Philippines&output=embed"
              className="absolute inset-x-0 top-[-25%] w-full h-[150%] border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={prefersReducedMotion ? undefined : { y: mapY }}
            />
          </div>
        </div>

        <div className="border-t border-beige-dark/60 pt-16 sm:pt-20 text-center" data-reveal>
          <h2 className="reveal text-2xl sm:text-3xl font-extrabold text-brown-dark mb-4">
            Ready to sell your copra?
          </h2>
          <p className="reveal text-brown-mid/90 max-w-xl mx-auto mb-9 text-base leading-relaxed delay-100">
            Contact us to inquire about the current copra buying price, or visit our buying
            station. We pay on the spot.
          </p>
          <a
            href="tel:+639186062580"
            className="reveal delay-200 group inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-8 py-4 rounded-full hover:bg-green-mid transition-colors duration-300"
          >
            <LuPhone className="w-4 h-4" /> Call Us Now
          </a>
        </div>

      </section>
    </div>
  );
}
