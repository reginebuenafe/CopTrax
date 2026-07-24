import { Link } from "react-router-dom";
import { LuCoins, LuScale, LuZap, LuHandshake, LuPhone, LuLeaf, LuArrowRight, LuQuote } from "react-icons/lu";
import useReveal from "./useReveal";

export default function WhySellToUs() {
  const ref = useReveal();

  const benefits = [
    {
      icon: <LuCoins className="w-6 h-6" />,
      title: "Competitive Copra Prices",
      desc: "We offer fair, market-based prices. Contact us anytime to inquire about today's rate before bringing in your copra.",
      color: "from-yellow-400 to-yellow-500",
    },
    {
      icon: <LuScale className="w-6 h-6" />,
      title: "Honest Weighing",
      desc: "We use certified, calibrated scales so you can be sure you're paid fairly. Transparency is at the heart of how we operate.",
      color: "from-green-light to-green-mid",
    },
    {
      icon: <LuZap className="w-6 h-6" />,
      title: "Fast, On-the-Spot Payment",
      desc: "No waiting, no delays. Once your copra is weighed and inspected, you get paid instantly.",
      color: "from-orange-400 to-orange-500",
    },
    {
      icon: <LuHandshake className="w-6 h-6" />,
      title: "Reliable & Trustworthy Buyer",
      desc: "We've been serving coconut farmers consistently. You can count on us to buy your copra fairly any day of the week.",
      color: "from-brown-light to-brown-mid",
    },
  ];

  const testimonials = [
    { name: "Mang Tomas", location: "Coconut Farmer, Quezon", text: "Palagi akong nagtitiwala sa NERC. Tama ang timbang at mabilis ang bayad." },
    { name: "Aling Rosa", location: "Copra Supplier, Laguna", text: "Maganda ang presyo dito at hindi ka papahirapan. Madali lang ang proseso." },
    { name: "Kuya Ben", location: "Farmer, Camarines Sur", text: "Kahit konti lang ang dala ko, tinatanggap nila. Maganda ang serbisyo." },
  ];

  return (
    <div ref={ref}>
      <section className="relative overflow-hidden grain">
        <img src="https://images.unsplash.com/photo-1554444510-592779e6e009?w=1920&h=1080&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-dark/85 via-green-mid/80 to-brown-mid/85 animate-gradient" />
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-white/5 animate-float" />
        <div className="relative z-10 pt-28 sm:pt-36 pb-20 sm:pb-28 px-5 text-center text-white">
          <span className="inline-flex items-center gap-2 glass text-sm font-medium px-5 py-2 rounded-full mb-6 animate-fade-in-up">
            <LuHandshake className="w-4 h-4" /> Your Trusted Partner
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            Why Sell to Us?
          </h1>
          <p className="text-lg sm:text-xl opacity-90 max-w-lg mx-auto animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            Discover why coconut farmers choose NERC Copra Trading
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-28" data-reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {benefits.map((item, i) => (
            <div
              key={i}
              className={`reveal delay-${(i + 1) * 100} group bg-white rounded-3xl shadow-card hover:shadow-card-hover border border-beige-dark/20 p-6 sm:p-8 md:p-10 transition-all duration-500 hover:-translate-y-2`}
            >
              <div className={`w-14 h-14 bg-gradient-to-br ${item.color} text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                {item.icon}
              </div>
              <h3 className="font-bold text-xl text-brown-dark mb-3">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative bg-beige py-14 sm:py-28 px-4 sm:px-5 overflow-hidden">
        <div className="absolute top-20 right-10 w-52 h-52 rounded-full bg-green-pale/30 blur-3xl" />
        <div className="absolute bottom-10 left-10 w-40 h-40 rounded-full bg-brown-light/10 blur-2xl" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-16" data-reveal>
            <span className="reveal inline-block bg-brown-mid/10 text-brown-mid text-xs font-bold uppercase tracking-widest px-5 py-2 rounded-full mb-4">
              Farmer Stories
            </span>
            <h2 className="reveal text-3xl sm:text-4xl font-extrabold text-brown-dark mb-3 delay-100">
              What Our Farmers Say
            </h2>
            <p className="reveal text-gray-500 max-w-lg mx-auto text-base delay-200">
              Hear from the farmers and suppliers who trust us with their copra
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6" data-reveal>
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`reveal delay-${(i + 1) * 100} group bg-white rounded-3xl shadow-card hover:shadow-card-hover p-6 sm:p-8 border border-beige-dark/20 transition-all duration-500 hover:-translate-y-2`}
              >
                <div className="w-10 h-10 bg-gradient-to-br from-green-light to-green-mid text-white rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <LuQuote className="w-5 h-5" />
                </div>
                <p className="text-gray-500 text-sm leading-relaxed mb-6 italic">{t.text}</p>
                <div className="border-t border-beige-dark/30 pt-4">
                  <p className="font-bold text-brown-dark text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-28" data-reveal>
        <div className="reveal-scale bg-white rounded-3xl shadow-card-hover border border-beige-dark/20 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-6 sm:p-10 md:p-14 flex flex-col justify-center">
              <span className="inline-block bg-green-pale text-green-dark text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5 w-fit">
                Our Promise
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-brown-dark mb-5">
                Fair Deals, Every Time
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8 text-base">
                We believe in building long-term relationships with farmers by providing consistent, transparent, and fair copra buying services. Your success is our success.
              </p>
              <div className="space-y-4">
                {["Fair market-based pricing", "No hidden deductions", "Open 7 days a week", "Friendly and respectful service"].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <span className="w-7 h-7 bg-gradient-to-br from-green-dark to-green-mid text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-md group-hover:scale-110 transition-transform">✓</span>
                    <span className="text-brown-dark text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center p-8 sm:p-10 md:p-14 text-center text-white overflow-hidden grain">
              <div className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full bg-white/5 animate-float-slow" />
              <div className="relative z-10">
                <div className="mb-6">
                  <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform animate-float-slow">
                    <LuLeaf className="w-10 h-10" />
                  </div>
                </div>
                <h3 className="text-2xl font-extrabold mb-3">Start Selling Today</h3>
                <p className="opacity-90 text-sm mb-8 max-w-xs mx-auto leading-relaxed">
                  Contact us for the current price and visit our station. No appointment needed.
                </p>
                <Link
                  to="/contact"
                  className="group inline-flex items-center justify-center gap-2 bg-white text-green-dark font-bold px-7 py-3.5 rounded-2xl hover:bg-yellow-300 transition-all duration-300 shadow-lg text-sm hover:-translate-y-1"
                >
                  <LuPhone className="inline w-4 h-4" /> Contact Us
                  <LuArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
