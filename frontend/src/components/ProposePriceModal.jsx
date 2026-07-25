import { useState } from "react";
import { LuCoins, LuX, LuPackage } from "react-icons/lu";
import { supabase } from "../lib/supabase";

export default function ProposePriceModal({
  conversationId,
  userId,
  supplierId,
  isCounter = false,
  supersedesId = null,
  onClose,
  onSubmitted,
}) {
  const [pricePerKg, setPricePerKg] = useState("");
  const [volumeTons, setVolumeTons] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const price = parseFloat(pricePerKg);
    const volume = parseFloat(volumeTons);

    if (isNaN(price) || price <= 0) { setError("Enter a valid price per kg."); return; }
    if (isNaN(volume) || volume <= 0) { setError("Enter a valid volume in tons."); return; }

    setSubmitting(true);

    const { error: err } = await supabase.from("proposal_forms").insert({
      conversation_id: conversationId,
      supplier_id: supplierId ?? userId,
      proposed_price_per_kg: price,
      proposed_volume_tons: volume,
      proposal_status: "Pending",
      supersedes_proposal_id: supersedesId ?? null,
    });

    setSubmitting(false);

    if (err) {
      setError("Failed to submit proposal. Please try again.");
      return;
    }

    const msg = isCounter
      ? `🔄 Counteroffer: ₱${price.toFixed(2)}/kg for ${volume} tons`
      : `💰 Price proposal: ₱${price.toFixed(2)}/kg for ${volume} tons`;

    onSubmitted(msg);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-sm p-7 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-green-pale rounded-xl flex items-center justify-center">
              <LuCoins className="w-4.5 h-4.5 text-green-dark" />
            </div>
            <h3 className="text-lg font-bold text-brown-dark">
              {isCounter ? "Submit Counteroffer" : "Propose Price"}
            </h3>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors p-1">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <p className="text-brown-light text-sm mb-5">
          {isCounter
            ? "Submit a new price and volume counter to the other party."
            : "Propose your desired price and volume to NERC Copra Trading."}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Price per kg */}
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Price per kg (₱) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brown-light font-semibold text-sm">₱</span>
              <input
                type="number" step="0.01" min="0.01" required
                value={pricePerKg}
                onChange={e => setPricePerKg(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white/70 text-brown-dark
                  text-sm focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
              />
            </div>
          </div>

          {/* Volume */}
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Volume (tons) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <LuPackage className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input
                type="number" step="0.01" min="0.01" required
                value={volumeTons}
                onChange={e => setVolumeTons(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white/70 text-brown-dark
                  text-sm focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
              />
            </div>
          </div>

          {/* Summary */}
          {pricePerKg && volumeTons && !isNaN(parseFloat(pricePerKg)) && !isNaN(parseFloat(volumeTons)) && (
            <div className="bg-green-pale rounded-xl px-4 py-3 text-sm">
              <p className="text-brown-light text-xs mb-1">Estimated Total value</p>
              <p className="font-bold text-green-dark text-lg">
                ₱{(parseFloat(pricePerKg) * parseFloat(volumeTons) * 1000).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-brown-light text-xs">({volumeTons} tons × 1,000 kg × ₱{pricePerKg}/kg)</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm
                hover:shadow-glow-green transition-all disabled:opacity-60">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </span>
              ) : isCounter ? "Send Counteroffer" : "Submit Proposal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
