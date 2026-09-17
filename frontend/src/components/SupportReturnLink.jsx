import { Link, useOutletContext } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";

export default function SupportReturnLink() {
  const { returnTo, returnLabel, navigationPending } = useOutletContext();
  return (
    <Link
      to={returnTo}
      aria-disabled={navigationPending || undefined}
      onClick={event => { if (navigationPending) event.preventDefault(); }}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brown-mid hover:text-green-dark transition-colors mb-8"
    >
      <LuArrowLeft aria-hidden="true" className="w-4 h-4" /> {returnLabel}
    </Link>
  );
}
