import { useSyncExternalStore } from "react";
import { LuInfo, LuX } from "react-icons/lu";
import { FIRST_TIME_PRICING_MESSAGE } from "../utils/supplierPricing";

// Keep dismissal through component remounts/navigation in this page load only.
// Reloading starts with an empty set; no localStorage/sessionStorage is used.
const dismissedNotices = new Set();
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };

export function FirstTimePricingNotice({ dashboard = false, userId }) {
  const noticeKey = `${dashboard ? "dashboard" : "chat"}:${userId ?? "anonymous"}`;
  const dismissed = useSyncExternalStore(subscribe, () => dismissedNotices.has(noticeKey), () => false);
  if (dismissed) return null;
  return (
    <aside aria-label="First-time supplier pricing" className={`flex min-w-0 items-start gap-2.5 rounded-xl border border-green-mid/20 bg-green-pale/60 px-3 py-3 text-brown-dark ${dashboard ? "mb-5" : "mx-3 my-2 shrink-0"}`}>
      <LuInfo className="mt-0.5 h-4 w-4 shrink-0 text-green-dark" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {dashboard && <h2 className="mb-1 text-sm font-semibold text-green-dark">How pricing works</h2>}
        <p className="text-xs leading-relaxed">{FIRST_TIME_PRICING_MESSAGE}</p>
      </div>
      <button type="button" aria-label="Dismiss pricing information" className="shrink-0 rounded p-1 text-brown-light hover:text-brown-dark" onClick={() => {
        dismissedNotices.add(noticeKey);
        listeners.forEach(listener => listener());
      }}><LuX className="h-4 w-4" /></button>
    </aside>
  );
}

export function SpotPriceBasis({ spotPrice, offerPrice }) {
  const price = spotPrice ?? offerPrice;
  return <div className="mb-3 rounded-lg border border-beige-dark bg-beige px-3 py-2 text-xs text-brown-mid">
    <p className="font-semibold text-green-dark">Spot price basis</p>
    {price != null && <p className="mt-0.5">{spotPrice != null ? "Current spot price" : "Offer price"}: ₱{Number(price).toFixed(2)}/kg</p>}
  </div>;
}
