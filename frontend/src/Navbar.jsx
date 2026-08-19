import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LuPhone, LuLogIn } from "react-icons/lu";
import BrandLogo from "./components/BrandLogo";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const linkClass = ({ isActive }) =>
    `relative block rounded-full py-1.5 px-3.5 text-[13px] font-medium transition-all duration-300 ${
      isActive
        ? "bg-white/25 text-green-dark font-semibold shadow-sm"
        : "text-brown-dark/70 hover:text-green-dark hover:bg-white/15"
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `block py-3 px-5 rounded-2xl text-base font-medium transition-all duration-300 ${
      isActive
        ? "bg-white/20 text-green-dark font-semibold"
        : "text-brown-dark/70 hover:text-green-dark hover:bg-white/10"
    }`;

  const links = [
    { to: "/", label: "Home", end: true },
    { to: "/what-is-copra", label: "What is Copra?" },
    { to: "/why-sell-to-us", label: "Why Sell to Us" },
    { to: "/gallery", label: "Gallery" },
    { to: "/contact", label: "Contact" },
  ];

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between lg:justify-center gap-3 pt-4 px-5 sm:px-6 lg:px-4 pointer-events-none">
        <Link
          to="/"
          className={`liquid-glass pointer-events-auto rounded-full flex items-center gap-2.5 transition-all duration-500 group ${
            scrolled ? "px-3 py-2 shadow-lg" : "px-4 py-2.5 shadow-md"
          }`}
        >
          <div className="w-7 h-7 bg-gradient-to-br from-green-dark to-green-light rounded-full flex items-center justify-center shadow-sm group-hover:shadow-glow-green transition-all duration-300 group-hover:scale-110 overflow-hidden p-1.5">
            <BrandLogo className="w-full h-full" size="100%" />
          </div>
          <span className="text-sm font-extrabold tracking-tight text-green-dark hidden sm:block">
            NERC
          </span>
        </Link>

        <nav
          className={`liquid-glass pointer-events-auto rounded-full hidden lg:flex items-center gap-0.5 transition-all duration-500 ${
            scrolled ? "px-2 py-1.5 shadow-lg" : "px-3 py-2 shadow-md"
          }`}
        >
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/contact"
          className={`liquid-glass pointer-events-auto rounded-full hidden lg:flex items-center gap-2 text-green-dark font-bold text-[13px] transition-all duration-500 group hover:shadow-glow-green ${
            scrolled ? "px-4 py-2 shadow-lg" : "px-5 py-2.5 shadow-md"
          }`}
        >
          <LuPhone className="w-3.5 h-3.5" />
          <span>Sell Copra</span>
        </Link>

        <Link
          to="/login"
          className={`liquid-glass pointer-events-auto rounded-full hidden lg:flex items-center gap-2 text-green-dark font-bold text-[13px] transition-all duration-500 group hover:shadow-glow-green ${
            scrolled ? "px-4 py-2 shadow-lg" : "px-5 py-2.5 shadow-md"
          }`}
        >
          <LuLogIn className="w-3.5 h-3.5" />
          <span>Login</span>
        </Link>

        <button
          onClick={() => setOpen(!open)}
          className={`liquid-glass pointer-events-auto rounded-full lg:hidden flex items-center justify-center transition-all duration-500 ${
            scrolled ? "w-10 h-10 shadow-lg" : "w-11 h-11 shadow-md"
          }`}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5 text-brown-mid" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      <div
        className={`fixed inset-0 z-40 lg:hidden transition-all duration-500 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
        <div className="absolute top-20 left-0 right-0 px-5 sm:px-6">
          <div
            className={`liquid-glass rounded-3xl p-5 transition-all duration-500 ${
              open ? "translate-y-0 opacity-100 scale-100" : "-translate-y-4 opacity-0 scale-95"
            }`}
            style={{ overflow: "visible" }}
          >
          <div className="flex flex-col gap-1">
            {links.map((link, i) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={mobileLinkClass}
                end={link.end}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/15 flex flex-col gap-2">
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-dark to-green-mid text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg hover:shadow-glow-green transition-all duration-300"
            >
              <LuPhone className="w-4 h-4" /> Sell Your Copra
            </Link>
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 border-2 border-green-dark text-green-dark font-bold py-3 rounded-2xl text-sm hover:bg-green-pale transition-all duration-300"
            >
              <LuLogIn className="w-4 h-4" /> Staff Login
            </Link>
          </div>
          </div>
        </div>
      </div>
    </>
  );
}
