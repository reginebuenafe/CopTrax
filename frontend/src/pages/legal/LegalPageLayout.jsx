import { LuArrowLeft } from "react-icons/lu";
import { Link } from "react-router-dom";

/**
 * Shared shell for standalone legal documents (Privacy Policy, Terms & Conditions).
 * Deliberately plain — no hero image / gradient — per "don't overdesign it".
 * Rendered inside the same <Navbar/>...<Footer/> wrapper as the other public pages,
 * so it only needs to clear the fixed navbar height itself.
 */
export default function LegalPageLayout({ icon: Icon, title, lastUpdated, intro, children }) {
  return (
    <div className="bg-beige min-h-screen pt-28 sm:pt-32 pb-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brown-mid hover:text-green-dark transition-colors mb-8"
        >
          <LuArrowLeft className="w-4 h-4" /> Back to Homepage
        </Link>

        <header className="mb-8 pb-8 border-b border-beige-dark/40">
          <div className="flex items-center gap-3 mb-2">
            {Icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-pale text-green-dark">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brown-dark leading-tight">{title}</h1>
              <p className="text-xs sm:text-sm text-brown-light mt-1">Last Updated: {lastUpdated}</p>
            </div>
          </div>
          {intro && (
            <div className="text-sm sm:text-[15px] text-brown-mid leading-relaxed mt-4 space-y-3">
              {intro}
            </div>
          )}
        </header>

        <article>
          {children}
        </article>
      </div>
    </div>
  );
}

export function LegalSection({ n, title, children }) {
  return (
    <section className="mb-9 last:mb-0 pb-9 border-b border-beige-dark/30 last:border-b-0 last:pb-0" id={`section-${n}`}>
      <h2 className="text-base sm:text-lg font-bold text-brown-dark mb-2.5 flex gap-2">
        <span className="text-green-mid shrink-0">{n}.</span>
        <span>{title}</span>
      </h2>
      <div className="text-[14px] sm:text-[15px] text-brown-mid leading-relaxed space-y-3 pl-[22px]">
        {children}
      </div>
    </section>
  );
}

/** Bold mini-header for a bulleted group within a section (no numbering). */
export function LegalSubheading({ title, children }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <p className="text-[13.5px] sm:text-sm font-bold text-brown-dark mb-1.5">{title}</p>
      {children}
    </div>
  );
}
