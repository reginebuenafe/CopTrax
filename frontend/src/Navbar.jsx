import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "./components/BrandLogo";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const links = [
    { href: "/#top", label: "Home" },
    { href: "/#why-nerc", label: "Why NERC" },
    { href: "/#story", label: "How It Works" },
    { href: "/#about", label: "About" },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <>
      {/* Zero-height sticky wrapper: keeps the header pinned via `sticky`
          instead of `fixed`. iOS Safari has a long-standing bug where
          `position: fixed` elements can visually detach and scroll away
          during sustained scrolling on long, heavy-scrolling pages (like
          the pinned scroll-story section below) — `sticky` doesn't have
          this issue since it's positioned as part of normal scroll flow.
          `height: 0` means it contributes no space to the page layout
          (same as `fixed`), so no page needs its top padding adjusted. */}
      <div className="sticky top-0 z-50 h-0">
        <header
          className={`transition-all duration-300 ${
            scrolled ? "bg-cream/80 backdrop-blur-md border-b border-beige-dark/50" : "border-b border-transparent"
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-5 h-16 sm:h-[68px] flex items-center justify-between gap-6">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <BrandLogo className="w-full h-full" size="100%" />
              </div>
              <span className="leading-tight">
                <span className="block text-[15px] sm:text-[16px] font-extrabold tracking-tight text-brown-dark">
                  NERC Copra Trading
                </span>
                <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-widest text-brown-light">
                  CopTrax
                </span>
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-9">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-[13.5px] font-medium tracking-wide text-brown-mid/80 hover:text-green-dark transition-colors duration-200"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="hidden lg:flex items-center gap-3 shrink-0">
              <Link
                to="/login"
                className="text-[13.5px] font-semibold text-brown-mid/80 hover:text-green-dark transition-colors duration-200 px-2"
              >
                Log In
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-full bg-green-dark text-white text-[13.5px] font-semibold px-5 py-2.5 hover:bg-green-mid transition-colors duration-200"
              >
                Become a Supplier
              </Link>
            </div>

            <button
              onClick={() => setOpen(!open)}
              className="lg:hidden w-9 h-9 flex items-center justify-center text-brown-dark"
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </header>
      </div>

      {/* Mobile menu */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-brown-dark/30" onClick={() => setOpen(false)} />
        <div
          className={`absolute top-16 left-0 right-0 bg-cream border-b border-beige-dark/60 shadow-lg transition-transform duration-300 ${
            open ? "translate-y-0" : "-translate-y-3"
          }`}
        >
          <div className="max-w-6xl mx-auto px-5 py-5">
            <div className="flex flex-col divide-y divide-beige-dark/50">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="py-3.5 text-[15px] font-medium text-brown-dark"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="mt-5 pt-5 border-t border-beige-dark/60 flex flex-col gap-2.5">
              <Link
                to="/register"
                className="flex items-center justify-center rounded-full bg-green-dark text-white font-semibold py-3 text-sm"
              >
                Become a Supplier
              </Link>
              <Link
                to="/login"
                className="flex items-center justify-center rounded-full border border-beige-dark text-brown-dark font-semibold py-3 text-sm"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
