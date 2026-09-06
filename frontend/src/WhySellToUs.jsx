import { Link } from "react-router-dom";
import { LuPhone, LuArrowRight } from "react-icons/lu";
import useReveal from "./useReveal";

export default function WhySellToUs() {
  const ref = useReveal();

  const benefits = [
    {
      title: "Competitive Copra Prices",
      desc: "We offer fair, market-based prices. Contact us anytime to inquire about today's rate before bringing in your copra.",
    },
    {
      title: "Honest Weighing",
      desc: "We use certified, calibrated scales so you can be sure you're paid fairly. Transparency is at the heart of how we operate.",
    },
    {
      title: "Fast, On-the-Spot Payment",
      desc: "No waiting, no delays. Once your copra is weighed and inspected, you get paid instantly.",
    },
    {
      title: "Reliable & Trustworthy Buyer",
      desc: "We've been serving coconut farmers consistently. You can count on us to buy your copra fairly, any day of the week.",
    },
  ];

  const promises = ["Fair market-based pricing", "No hidden deductions", "Open 7 days a week", "Friendly and respectful service"];

  return (
    <div ref={ref} className="bg-cream">
      <section className="pt-28 sm:pt-32 lg:pt-36 pb-14 sm:pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-5 text-center" data-reveal>
          <p className="reveal text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-green-dark mb-5">
            Your Trusted Partner
          </p>
          <h1 className="reveal text-4xl sm:text-5xl font-extrabold text-brown-dark leading-tight mb-5 delay-100">
            Why Sell to Us?
          </h1>
          <p className="reveal text-base sm:text-lg text-brown-mid/90 leading-relaxed delay-200">
            The reasons coconut farmers keep coming back to NERC Copra Trading.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-5 pb-16 sm:pb-24" data-reveal>
        {benefits.map((item, i) => (
          <div
            key={item.title}
            className={`reveal delay-${(i + 1) * 100} grid grid-cols-[3.5rem_1fr] sm:grid-cols-[5rem_1fr] gap-4 sm:gap-8 py-8 ${
              i !== 0 ? "border-t border-beige-dark/60" : ""
            }`}
          >
            <span className="text-3xl sm:text-4xl font-extrabold text-green-dark/25 tabular-nums leading-none pt-1">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="font-bold text-lg sm:text-xl text-brown-dark mb-1.5">{item.title}</h3>
              <p className="text-brown-mid/90 text-sm sm:text-base leading-relaxed max-w-lg">{item.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="border-t border-beige-dark/60 bg-beige/60 py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div data-reveal>
            <p className="reveal text-[11px] font-bold uppercase tracking-[0.18em] text-green-dark mb-4">
              Our Promise
            </p>
            <h2 className="reveal text-2xl sm:text-3xl font-extrabold text-brown-dark mb-4 delay-100">
              Fair deals, every time.
            </h2>
            <p className="reveal text-brown-mid/90 text-base leading-relaxed mb-8 delay-200">
              We believe in building long-term relationships with farmers by providing
              consistent, transparent, and fair copra buying services. Your success is our
              success.
            </p>
            <ul className="reveal space-y-3 delay-300">
              {promises.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-brown-dark border-t border-beige-dark/60 pt-3 first:border-t-0 first:pt-0">
                  <span className="w-1 h-1 rounded-full bg-green-dark shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="reveal-scale bg-white rounded-2xl border border-beige-dark/60 shadow-card p-8 sm:p-10 text-center" data-reveal>
            <h3 className="text-xl font-extrabold text-brown-dark mb-3">Start Selling Today</h3>
            <p className="text-brown-mid/90 text-sm mb-8 leading-relaxed">
              Contact us for the current price and visit our station. No appointment needed.
            </p>
            <Link
              to="/contact"
              className="group inline-flex items-center gap-2 bg-green-dark text-white font-semibold px-7 py-3.5 rounded-full hover:bg-green-mid transition-colors duration-300"
            >
              <LuPhone className="w-4 h-4" /> Contact Us
              <LuArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
