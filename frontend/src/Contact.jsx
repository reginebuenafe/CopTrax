import { LuPhone, LuMapPin, LuClock, LuMail, LuArrowRight } from "react-icons/lu";
import useReveal from "./useReveal";

export default function Contact() {
  const ref = useReveal();

  return (
    <div ref={ref}>
      <section className="relative overflow-hidden grain">
        <img src="https://images.unsplash.com/photo-1603779046675-2eccbab9b982?w=1920&h=1080&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-dark/85 via-green-mid/80 to-brown-mid/85 animate-gradient" />
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5 animate-float" />
        <div className="relative z-10 pt-28 sm:pt-36 pb-20 sm:pb-28 px-5 text-center text-white">
          <span className="inline-flex items-center gap-2 glass text-sm font-medium px-5 py-2 rounded-full mb-6 animate-fade-in-up">
            <LuPhone className="w-4 h-4" /> Get in Touch
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            Contact Us
          </h1>
          <p className="text-lg sm:text-xl opacity-90 max-w-lg mx-auto animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            Reach out to sell your copra or inquire about the current buying price
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-28">

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-7 mb-20" data-reveal>
          {[
            {
              icon: <LuMapPin className="w-6 h-6" />,
              title: "Buying Station",
              color: "from-green-light to-green-mid",
              content: (
                <p className="text-gray-500 text-sm leading-relaxed">
                  Kumalarang,<br />
                  Zamboanga del Sur, Philippines
                </p>
              ),
            },
            {
              icon: <LuPhone className="w-6 h-6" />,
              title: "Phone & Email",
              color: "from-yellow-400 to-yellow-500",
              content: (
                <div className="text-gray-500 text-sm leading-relaxed space-y-2">
                  <p>
                    <span className="text-brown-dark font-medium">Phone:</span><br />
                    +63 912 345 6789
                  </p>
                  <p>
                    <span className="text-brown-dark font-medium">Email:</span><br />
                    nerc.copra@gmail.com
                  </p>
                </div>
              ),
            },
            {
              icon: <LuClock className="w-6 h-6" />,
              title: "Business Hours",
              color: "from-brown-light to-brown-mid",
              content: (
                <div className="text-gray-500 text-sm leading-relaxed space-y-2">
                  <p>
                    <span className="text-brown-dark font-medium">Monday – Sunday</span><br />
                    8:00 AM – 5:00 PM
                  </p>
                </div>
              ),
            },
          ].map((card, i) => (
            <div
              key={i}
              className={`reveal delay-${(i + 1) * 100} group bg-white rounded-3xl shadow-card hover:shadow-card-hover p-6 sm:p-8 text-center border border-beige-dark/20 transition-all duration-500 hover:-translate-y-2`}
            >
              <div className={`w-16 h-16 bg-gradient-to-br ${card.color} text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                {card.icon}
              </div>
              <h3 className="text-brown-dark font-bold text-lg mb-4">{card.title}</h3>
              {card.content}
            </div>
          ))}
        </div>

        <div className="mb-20" data-reveal>
          <div className="text-center mb-10">
            <span className="reveal inline-block bg-brown-mid/10 text-brown-mid text-xs font-bold uppercase tracking-widest px-5 py-2 rounded-full mb-4">
              Location
            </span>
            <h2 className="reveal text-3xl sm:text-4xl font-extrabold text-brown-dark mb-3 delay-100">Find Our Buying Station</h2>
            <p className="reveal text-gray-500 max-w-lg mx-auto text-sm delay-200">
              Visit us to sell your copra and get paid on the spot!
            </p>
          </div>
          <div className="reveal delay-300 bg-white rounded-3xl shadow-card border border-beige-dark/20 h-64 sm:h-80 overflow-hidden">
            <iframe
              title="Kumalarang, Zamboanga del Sur"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d31594.88!2d123.5847!3d7.7553!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x325416f1a0a25c55%3A0x3e9b6e8a1d5f8b0!2sKumalarang%2C%20Zamboanga%20del%20Sur!5e0!3m2!1sen!2sph!4v1700000000000"
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl grain" data-reveal>
          <div className="absolute inset-0 bg-gradient-to-r from-green-dark via-green-mid to-green-dark animate-gradient" />
          <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/5 animate-float-slow" />
          <div className="relative z-10 p-6 sm:p-10 md:p-16 text-center text-white">
            <h2 className="reveal text-3xl sm:text-4xl font-extrabold mb-4">
              Ready to Sell Your Copra?
            </h2>
            <p className="reveal opacity-90 max-w-lg mx-auto mb-3 text-base delay-100">
              Contact us to inquire about the current copra buying price.
            </p>
            <p className="reveal opacity-90 max-w-lg mx-auto mb-8 text-base delay-200">
              Visit our buying station — we pay on the spot!
            </p>
            <a
              href="./Contact"
              className="reveal delay-300 group inline-flex items-center justify-center gap-2 bg-white text-green-dark font-bold px-8 py-4 rounded-2xl hover:bg-yellow-300 transition-all duration-300 shadow-lg hover:-translate-y-1"
            >
              <LuPhone className="inline w-5 h-5" /> Call Us Now
              <LuArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
            </a>
          </div>
        </div>

      </section>
    </div>
  );
}
