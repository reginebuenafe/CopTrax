import { Link } from "react-router-dom";
import { LuLeaf, LuPhone, LuMail, LuMapPin, LuArrowUpRight } from "react-icons/lu";

export default function Footer() {
  return (
    <footer className="relative bg-brown-dark text-white/80 overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white/[0.02] -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/[0.02] translate-y-1/2 -translate-x-1/2" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-5 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-green-dark to-green-light rounded-full flex items-center justify-center shadow-md">
                <LuLeaf className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-extrabold text-white">NERC Copra</span>
            </div>
            <p className="text-sm leading-relaxed opacity-60">
              Your trusted copra buying partner in Zamboanga del Sur. Fair prices, honest weight, fast payment.
            </p>
          </div>

          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-5">Quick Links</h4>
            <ul className="space-y-3 text-sm">
              {[
                { to: "/what-is-copra", label: "What is Copra?" },
                { to: "/why-sell-to-us", label: "Why Sell to Us" },
                { to: "/gallery", label: "Gallery" },
                { to: "/contact", label: "Contact" },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="group inline-flex items-center gap-1 hover:text-white transition-colors duration-300">
                    {link.label}
                    <LuArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-5">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2.5"><LuPhone className="w-4 h-4 text-green-light flex-shrink-0" /> +63 912 345 6789</li>
              <li className="flex items-center gap-2.5"><LuMail className="w-4 h-4 text-green-light flex-shrink-0" /> nerc.copra@gmail.com</li>
              <li className="flex items-start gap-2.5"><LuMapPin className="w-4 h-4 text-green-light flex-shrink-0 mt-0.5" /> Kumalarang, Zamboanga del Sur, Philippines</li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-5">Business Hours</h4>
            <ul className="space-y-3 text-sm">
              <li className="opacity-60">Monday – Sunday</li>
              <li className="text-white font-medium">8:00 AM – 5:00 PM</li>
            </ul>
            <div className="mt-6 inline-flex items-center gap-2 bg-green-dark/40 text-green-light text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-green-light rounded-full animate-pulse" />
              Open 7 days a week
            </div>
          </div>

        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs opacity-50">
          <p>&copy; {new Date().getFullYear()} NERC Copra Trading. All rights reserved.</p>
          <p>Serving Filipino coconut farmers</p>
        </div>
      </div>
    </footer>
  );
}
