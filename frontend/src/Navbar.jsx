import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "./components/BrandLogo";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Close the mobile menu whenever the route changes. Adjusting state during
  // render (rather than in a useEffect) avoids the extra "cascading render"
  // pass for this exact pattern: https://react.dev/learn/you-might-not-need-an-effect
  const [prevLocation, setPrevLocation] = useState(location);
  if (location !== prevLocation) {
    setPrevLocation(location);
    setOpen(false);
  }

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
          (same as `fixed`), so no page needs its top padding adjusted.

          The header itself is a permanently frosted floating pill (per
          DESIGN.md's "Top nav" spec) rather than a background that only
          appears after scrolling. It used to render fully transparent at
          the top of the page, which worked while every page opened on a
          light cream background — but it silently broke as soon as a page
          (like the Home hero) put a busy photo/dark gradient directly
          behind it: brown nav text on a green photo has no reliable
          contrast. A permanent frosted-white pill guarantees legible
          contrast for the nav no matter what's behind it, on every page. */}
      <div className="sticky top-0 z-50 h-0">
        <div
          className={`max-w-6xl mx-auto px-4 sm:px-5 transition-[padding] duration-300 ease-out ${
            scrolled ? "pt-2 sm:pt-2.5" : "pt-3 sm:pt-4"
          }`}
        >
          <header
            className={`rounded-full bg-white/90 backdrop-blur-2xl border border-green-dark/10 transition-shadow duration-300 ${
              scrolled ? "shadow-card-hover" : "shadow-card"
            }`}
          >
            <div
              className={`flex items-center justify-between gap-6 transition-[height,padding] duration-300 ease-out ${
                scrolled ? "px-3.5 sm:px-5 h-11 sm:h-12" : "px-4 sm:px-6 h-14 sm:h-16"
              }`}
            >
              <Link to="/" className="flex items-center gap-2.5 shrink-0">
                <div
                  className={`flex items-center justify-center shrink-0 transition-[width,height] duration-300 ease-out ${
                    scrolled ? "w-6 h-6" : "w-8 h-8"
                  }`}
                >
                  <BrandLogo className="w-full h-full" size="100%" />
                </div>
                <span className="leading-tight">
                  <span
                    className={`block font-extrabold tracking-tight text-brown-dark transition-[font-size] duration-300 ease-out ${
                      scrolled ? "text-[13px] sm:text-[14px]" : "text-[15px] sm:text-[16px]"
                    }`}
                  >
                    NERC Copra Trading
                  </span>
                  <span
                    className={`hidden sm:block font-semibold uppercase tracking-widest text-brown-light overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
                      scrolled ? "max-h-0 opacity-0" : "max-h-3 opacity-100 text-[10px]"
                    }`}
                  >
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

              <div
                className={`hidden lg:flex items-center shrink-0 transition-[gap] duration-300 ease-out ${
                  scrolled ? "gap-2" : "gap-3"
                }`}
              >
                <Link
                  to="/login"
                  className="text-[13.5px] font-semibold text-brown-mid/80 hover:text-green-dark transition-colors duration-200 px-2"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className={`inline-flex items-center justify-center rounded-full bg-green-dark text-white text-[13.5px] font-semibold hover:bg-green-mid transition-[padding] duration-300 ease-out ${
                    scrolled ? "px-4 py-2" : "px-5 py-2.5"
                  }`}
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
      </div>

      {/* Mobile menu */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-brown-dark/30" onClick={() => setOpen(false)} />
        <div
          className={`absolute top-20 sm:top-24 left-4 right-4 sm:left-5 sm:right-5 bg-cream rounded-2xl border border-beige-dark/60 shadow-lg transition-transform duration-300 ${
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
