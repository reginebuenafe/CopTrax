import { LuTreePalm, LuArrowRight } from "react-icons/lu";
import { Link } from "react-router-dom";
import useReveal from "./useReveal";

export default function WhatIsCopra() {
  const ref = useReveal();

  const sections = [
    {
      title: "What is Copra?",
      text: "Copra is the dried kernel (meat) of the coconut. It is the primary product used to extract coconut oil, which is one of the most important agricultural commodities in the Philippines. The Philippines is one of the top coconut-producing countries in the world, and copra plays a vital role in the livelihood of millions of Filipino farmers.",
      img: "https://images.unsplash.com/photo-1560769680-ba2f3767c785?w=800&h=500&fit=crop",
      alt: "Fresh coconuts",
    },
    {
      title: "How is Copra Produced?",
      text: "After harvesting mature coconuts, farmers split them open and remove the meat. The coconut meat is then dried using one of several methods: sun drying, smoke drying (using a kiln or tapahan), or hot-air drying. Proper drying is essential to achieve the right moisture content (around 6%) to prevent mold and ensure high oil yield.",
      img: "https://images.unsplash.com/photo-1509278159101-02103f49328f?w=800&h=500&fit=crop",
      alt: "Coconut processing",
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
      img: "https://images.unsplash.com/photo-1596663097529-c65b32a1f506?w=800&h=500&fit=crop",
      alt: "Coconut oil products",
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
      img: "https://images.unsplash.com/photo-1554444510-592779e6e009?w=800&h=500&fit=crop",
      alt: "Quality dried copra",
    },
  ];

  return (
    <div ref={ref}>
      <section className="relative overflow-hidden grain">
        <img src="https://images.unsplash.com/photo-1546662608-aec5228e9a74?w=1920&h=1080&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-dark/85 via-green-mid/80 to-brown-mid/85 animate-gradient" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-white/5 animate-float-slow" />
        <div className="relative z-10 pt-28 sm:pt-36 pb-20 sm:pb-28 px-5 text-center text-white">
          <span className="inline-flex items-center gap-2 glass text-sm font-medium px-5 py-2 rounded-full mb-6 animate-fade-in-up">
            <LuTreePalm className="w-4 h-4" /> Learn About Copra
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            What is Copra?
          </h1>
          <p className="text-lg sm:text-xl opacity-90 max-w-lg mx-auto animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            The dried meat of the coconut — the backbone of the Philippine coconut industry
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-28">
        {sections.map((s, i) => (
          <div
            key={i}
            className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} gap-8 md:gap-16 items-center mb-16 sm:mb-24 last:mb-0`}
            data-reveal
          >
            <div className={`flex-1 ${i % 2 === 0 ? "reveal-left" : "reveal-right"}`}>
              <div className="inline-block bg-green-pale text-green-dark text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-brown-dark mb-5">{s.title}</h3>
              {s.intro && <p className="text-gray-500 leading-relaxed mb-4 text-base">{s.intro}</p>}
              {s.text && <p className="text-gray-500 leading-relaxed text-base">{s.text}</p>}
              {s.list && (
                <div className="mt-5 space-y-3">
                  {s.list.map((item, j) => (
                    <div key={j} className="flex items-start gap-3 group">
                      <span className="w-2 h-2 bg-green-light rounded-full mt-2 flex-shrink-0 group-hover:scale-150 transition-transform" />
                      <p className="text-gray-500 text-sm leading-relaxed">
                        <strong className="text-brown-dark">{item.bold}</strong> — {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`flex-1 w-full ${i % 2 === 0 ? "reveal-right" : "reveal-left"}`}>
              <div className="relative group">
                <div className="absolute -inset-3 bg-gradient-to-br from-green-light/20 to-brown-light/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <img
                  src={s.img}
                  alt={s.alt}
                  loading="lazy"
                  className="relative rounded-3xl shadow-card w-full h-64 md:h-80 object-cover group-hover:shadow-card-hover group-hover:scale-[1.02] transition-all duration-500"
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="relative overflow-hidden grain" data-reveal>
        <img src="https://images.unsplash.com/photo-1560769680-ba2f3767c785?w=1920&h=800&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-green-dark/90 to-green-mid/85 animate-gradient" />
        <div className="relative z-10 max-w-2xl mx-auto py-20 px-5 text-center text-white">
          <h2 className="reveal text-3xl sm:text-4xl font-extrabold mb-4">Want to Sell Your Copra?</h2>
          <p className="reveal opacity-90 mb-8 text-lg delay-100">
            Now that you know about copra, contact us to get the best price for yours.
          </p>
          <Link
            to="/contact"
            className="reveal delay-200 group inline-flex items-center justify-center gap-2 bg-white text-green-dark font-bold px-8 py-4 rounded-2xl hover:bg-yellow-300 transition-all duration-300 shadow-lg hover:-translate-y-1"
          >
            Contact Us <LuArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>
    </div>
  );
}
