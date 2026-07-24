import { Link } from "react-router-dom";
import { LuLeaf, LuPhone, LuMapPin, LuCoins, LuScale, LuZap, LuPackage, LuTreePalm, LuArrowRight, LuLogIn } from "react-icons/lu";
import useReveal from "./useReveal";

export default function HomePage() {
  const ref = useReveal();

  return (
    <div ref={ref}>
      <section className="relative min-h-screen flex items-center overflow-hidden grain">
        <img src="https://images.unsplash.com/photo-1560769680-ba2f3767c785?w=1920&h=1080&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-dark/85 via-green-mid/80 to-brown-mid/85 animate-gradient" />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-white/5 animate-float" />
        <div className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full bg-white/5 animate-float-slow" />
        <div className="absolute top-1/2 right-10 w-24 h-24 rounded-full border-2 border-white/10 animate-pulse-ring" />

        <div className="relative z-10 max-w-6xl mx-auto px-5 py-24 sm:py-32 w-full">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] mb-6 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
              Your Trusted{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-100 animate-shimmer">
                Copra Trading
              </span>{" "}
              Partner
            </h1>
            <p className="text-lg sm:text-xl text-white/85 leading-relaxed mb-10 max-w-2xl animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              We buy high-quality copra directly from farmers and suppliers with fair prices and fast payment. Learn about copra and how to sell with us.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up" style={{ animationDelay: "450ms" }}>
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
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 glass text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/20 transition-all duration-300 text-base hover:-translate-y-1"
              >
                <LuLogIn className="w-5 h-5" /> Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mt-10 sm:-mt-16 z-10 max-w-3xl mx-auto px-4 sm:px-5" data-reveal>
        <div className="reveal-scale glass-white rounded-3xl shadow-card-hover overflow-hidden">
          <div className="bg-gradient-to-r from-green-dark to-green-mid text-white text-center py-3.5 px-4 text-sm font-semibold uppercase tracking-widest">
            <LuLeaf className="inline w-4 h-4 mr-1" /> About Copra
          </div>
          <div className="p-6 sm:p-10 text-center">
            <p className="text-gray-500 leading-relaxed mb-4 text-base">
              Copra is the dried kernel of the coconut — the primary product used to extract coconut oil. The Philippines is one of the world's top producers, and copra remains a vital part of the agricultural economy.
            </p>
            <Link to="/what-is-copra" className="inline-flex items-center gap-1 text-green-dark font-semibold text-sm hover:gap-2 transition-all duration-300">
              Learn more about copra <LuArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="bg-green-pale/50 text-center py-4 px-4 border-t border-green-pale">
            <p className="text-brown-mid font-semibold text-sm">
              <LuPhone className="inline w-4 h-4 mr-1" />
              Want to know the current buying price? <Link to="/contact" className="text-green-dark underline hover:text-green-mid transition-colors">Contact us</Link> directly.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-16 sm:py-24">
        <div className="text-center mb-10 sm:mb-16" data-reveal>
          <span className="reveal inline-block bg-green-pale text-green-dark text-xs font-bold uppercase tracking-widest px-5 py-2 rounded-full mb-4">
            Why Farmers Choose Us
          </span>
          <h2 className="reveal text-3xl sm:text-4xl font-extrabold text-brown-dark mb-3 delay-100">
            Your Reliable Copra Buying Partner
          </h2>
          <p className="reveal text-gray-500 max-w-xl mx-auto text-base delay-200">
            We make it easy to sell your copra — no hassle, fair deals, every time.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6" data-reveal>
          {[
            { icon: <LuCoins className="w-7 h-7" />, title: "Competitive Prices", desc: "We offer rates based on current market value so you always get the best deal.", color: "from-yellow-400 to-yellow-500" },
            { icon: <LuScale className="w-7 h-7" />, title: "Honest Weighing", desc: "Accurate and transparent weighing using certified scales you can trust.", color: "from-green-light to-green-mid" },
            { icon: <LuZap className="w-7 h-7" />, title: "Fast Payment", desc: "Get paid on the spot — no delays, no waiting.", color: "from-orange-400 to-orange-500" },
            { icon: <LuPackage className="w-7 h-7" />, title: "Any Quantity", desc: "We accept small and bulk quantities. Every farmer is welcome.", color: "from-brown-light to-brown-mid" },
          ].map((item, i) => (
            <div
              key={i}
              className={`reveal delay-${(i + 1) * 100} group bg-white rounded-3xl shadow-card hover:shadow-card-hover transition-all duration-500 p-6 sm:p-8 text-center hover:-translate-y-2 border border-beige-dark/20`}
            >
              <div className={`w-16 h-16 bg-gradient-to-br ${item.color} text-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                {item.icon}
              </div>
              <h3 className="font-bold text-lg text-brown-dark mb-2">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative bg-beige py-16 sm:py-24 px-4 sm:px-5 overflow-hidden">
        <div className="absolute top-10 right-10 w-60 h-60 rounded-full bg-green-pale/30 blur-3xl" />
        <div className="absolute bottom-10 left-10 w-40 h-40 rounded-full bg-brown-light/10 blur-2xl" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-16" data-reveal>
            <span className="reveal inline-block bg-brown-mid/10 text-brown-mid text-xs font-bold uppercase tracking-widest px-5 py-2 rounded-full mb-4">
              Simple Process
            </span>
            <h2 className="reveal text-3xl sm:text-4xl font-extrabold text-brown-dark mb-3 delay-100">
              How to Sell Your Copra
            </h2>
            <p className="reveal text-gray-500 max-w-xl mx-auto text-base delay-200">
              Selling your copra is quick and easy — follow these three simple steps.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10 max-w-4xl mx-auto" data-reveal>
            {[
              { step: "1", title: "Contact Us for the Price", desc: "Call or visit us to inquire about the current copra buying price." },
              { step: "2", title: "Bring Your Copra", desc: "Deliver your dried copra to our buying station any day. YES, even on Sundays!" },
              { step: "3", title: "Get Paid Instantly", desc: "We weigh your copra fairly and pay you on the spot." },
            ].map((item, i) => (
              <div key={i} className={`reveal delay-${(i + 1) * 200} text-center group`}>
                <div className="relative mx-auto mb-6 w-20 h-20">
                  <div className="absolute inset-0 bg-green-light/20 rounded-full animate-pulse-ring" />
                  <div className="relative w-20 h-20 bg-gradient-to-br from-green-dark to-green-mid text-white rounded-full flex items-center justify-center text-2xl font-extrabold shadow-lg group-hover:scale-110 transition-transform duration-300">
                    {item.step}
                  </div>
                </div>
                <h3 className="font-bold text-lg text-brown-dark mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden grain" data-reveal>
        <img src="https://images.unsplash.com/photo-1546662608-aec5228e9a74?w=1920&h=800&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-green-dark/90 via-green-mid/85 to-green-dark/90 animate-gradient" />
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 animate-float-slow" />

        <div className="relative z-10 max-w-2xl mx-auto py-14 sm:py-20 px-5 text-center text-white">
          <h2 className="reveal text-3xl sm:text-4xl font-extrabold mb-5">
            Ready to Sell Your Copra?
          </h2>
          <p className="reveal opacity-90 mb-10 leading-relaxed text-lg delay-100">
            Contact us to learn about the current buying price and visit our buying station. We're here to give you the fairest deal.
          </p>
          <div className="reveal flex flex-col sm:flex-row gap-4 justify-center delay-200">
            <Link
              to="/contact"
              className="group inline-flex items-center justify-center gap-2 bg-white text-green-dark font-bold px-8 py-4 rounded-2xl hover:bg-yellow-300 transition-all duration-300 shadow-lg hover:-translate-y-1"
            >
              <LuPhone className="inline w-5 h-5" /> Contact Us for Pricing
              <LuArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 glass font-bold px-8 py-4 rounded-2xl hover:bg-white/20 transition-all duration-300 hover:-translate-y-1"
            >
              <LuMapPin className="inline w-5 h-5" /> Visit Our Station
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
