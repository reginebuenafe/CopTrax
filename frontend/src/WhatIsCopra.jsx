import { LuArrowRight } from "react-icons/lu";
import { Link } from "react-router-dom";
import useReveal from "./useReveal";

export default function WhatIsCopra() {
  const ref = useReveal();

  const sections = [
    {
      title: "What is Copra?",
      text: "Copra is the dried kernel (meat) of the coconut. It is the primary product used to extract coconut oil, which is one of the most important agricultural commodities in the Philippines. The Philippines is one of the top coconut-producing countries in the world, and copra plays a vital role in the livelihood of millions of Filipino farmers.",
      img: "https://images.unsplash.com/photo-1560769680-ba2f3767c785?w=900&h=700&fit=crop",
      alt: "Fresh coconuts split open, showing the white meat",
    },
    {
      title: "How is Copra Produced?",
      text: "After harvesting mature coconuts, farmers split them open and remove the meat. The coconut meat is then dried using one of several methods: sun drying, smoke drying (using a kiln or tapahan), or hot-air drying. Proper drying is essential to achieve the right moisture content (around 6%) to prevent mold and ensure high oil yield.",
      img: "https://images.unsplash.com/photo-1509278159101-02103f49328f?w=900&h=700&fit=crop",
      alt: "Coconut being processed by hand",
    },
    {
      title: "Common Uses of Copra",
      intro: "Copra is primarily used to produce coconut oil through pressing or solvent extraction. Coconut oil is widely used in:",
      list: [
        { bold: "Cooking & food products", desc: "frying oil, margarine, baked goods" },
        { bold: "Cosmetics & personal care", desc: "soaps, shampoos, lotions, hair products" },
        { bold: "Industrial applications", desc: "biodiesel, lubricants, detergents" },
        { bold: "Animal feed", desc: "copra meal (byproduct after oil extraction)" },
      ],
      img: "https://images.unsplash.com/photo-1596663097529-c65b32a1f506?w=900&h=700&fit=crop",
      alt: "Coconut oil, a product of copra",
    },
    {
      title: "Importance of Quality",
      intro: "The quality of copra directly affects its price and oil yield. Key quality factors include:",
      list: [
        { bold: "Moisture content", desc: "ideally 6% or less for best price" },
        { bold: "Color", desc: "white to light brown indicates good quality" },
        { bold: "No contamination", desc: "proper drying prevents mold & spoilage" },
        { bold: "Oil content", desc: "higher oil content means a better price" },
      ],
      img: "https://images.unsplash.com/photo-1554444510-592779e6e009?w=900&h=700&fit=crop",
      alt: "Cross-section of dried coconut meat used to judge copra quality",
    },
  ];

  return (
    <div ref={ref} className="bg-cream">
      <section className="pt-28 sm:pt-32 lg:pt-36 pb-14 sm:pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-5 text-center" data-reveal>
          <p className="reveal text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-green-dark mb-5">
            The Basics
          </p>
          <h1 className="reveal text-4xl sm:text-5xl font-extrabold text-brown-dark leading-tight mb-5 delay-100">
            What is Copra?
          </h1>
          <p className="reveal text-base sm:text-lg text-brown-mid/90 leading-relaxed delay-200">
            The dried meat of the coconut, the backbone of the Philippine coconut industry.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 pb-16 sm:pb-24">
        {sections.map((s, i) => (
          <div
            key={i}
            className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} gap-8 md:gap-16 items-center py-14 sm:py-16 ${
              i !== 0 ? "border-t border-beige-dark/60" : ""
            }`}
            data-reveal
          >
            <div className={`flex-1 ${i % 2 === 0 ? "reveal-left" : "reveal-right"}`}>
              <span className="block text-xs font-bold text-green-dark/60 tabular-nums mb-3">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-brown-dark mb-4">{s.title}</h2>
              {s.intro && <p className="text-brown-mid/90 leading-relaxed mb-4 text-base">{s.intro}</p>}
              {s.text && <p className="text-brown-mid/90 leading-relaxed text-base">{s.text}</p>}
              {s.list && (
                <ul className="mt-5 space-y-3.5">
                  {s.list.map((item, j) => (
                    <li key={j} className="flex items-start gap-3 border-t border-beige-dark/60 pt-3.5 first:border-t-0 first:pt-0">
                      <span className="w-1 h-1 rounded-full bg-green-dark mt-2 shrink-0" />
                      <p className="text-brown-mid/90 text-sm leading-relaxed">
                        <strong className="text-brown-dark font-semibold">{item.bold}</strong>: {item.desc}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`flex-1 w-full ${i % 2 === 0 ? "reveal-right" : "reveal-left"}`}>
              <img
                src={s.img}
                alt={s.alt}
                loading="lazy"
                className="rounded-2xl border border-beige-dark/60 w-full h-64 md:h-80 object-cover"
              />
            </div>
          </div>
        ))}
      </section>

      <section className="border-t border-beige-dark/60 py-20 sm:py-28">
        <div className="max-w-2xl mx-auto px-4 sm:px-5 text-center" data-reveal>
          <h2 className="reveal text-2xl sm:text-3xl font-extrabold text-brown-dark mb-4">
            Want to sell your copra?
          </h2>
          <p className="reveal text-brown-mid/90 text-base leading-relaxed mb-9 delay-100">
            Now that you know about copra, contact us to get the best price for yours.
          </p>
          <Link
            to="/contact"
            className="reveal delay-200 group inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-7 py-3.5 rounded-full hover:bg-green-mid transition-colors duration-300"
          >
            Contact Us
            <LuArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
