import { useState } from "react";
import {
  LuX, LuFileText, LuCheck, LuLoader, LuExternalLink, LuMapPin, LuStickyNote,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";

/**
 * ContractReviewModal — shown to Business Owner for Pending contracts that
 * don't yet have a generated document.
 *
 * Props:
 *   contract  – contract row (must include supplier { first_name, last_name, email }, negotiated_price_per_kg, contracted_tons)
 *   onClose   – () => void
 *   onGenerated – () => void  called after successful generation
 */
export default function ContractReviewModal({ contract, onClose, onGenerated }) {
  const [deliveryLocation, setDeliveryLocation] = useState(contract.delivery_location ?? "");
  const [specialNotes, setSpecialNotes]         = useState(contract.special_notes ?? "");
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState(null);

  const pricePerTon  = Number(contract.negotiated_price_per_kg) * 1000; 
  const totalAmount  = pricePerTon * Number(contract.contracted_tons);

  function peso(n) {
    return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    // Get the current session token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-contract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        contract_id:       contract.contract_id,
        delivery_location: deliveryLocation.trim() || null,
        special_notes:     specialNotes.trim() || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to generate contract. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
    onGenerated();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-card w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-brown-light hover:text-brown-dark transition-colors">
          <LuX className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <LuFileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brown-dark">Review & Generate Contract</h2>
            <p className="text-brown-light text-sm">{contract.contract_number}</p>
          </div>
        </div>

        {/* Contract summary */}
        <div className="bg-beige rounded-2xl p-4 mb-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-brown-light">Supplier</span>
            <span className="font-semibold text-brown-dark">
              {contract.supplier?.first_name} {contract.supplier?.last_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-brown-light">Price per ton</span>
            <span className="font-semibold text-brown-dark">{peso(pricePerTon)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brown-light">Volume</span>
            <span className="font-semibold text-brown-dark">
              {Number(contract.contracted_tons).toLocaleString()} tons
            </span>
          </div>
          <div className="flex justify-between border-t border-beige-dark/30 pt-2">
            <span className="text-brown-light font-medium">Total Value</span>
            <span className="font-bold text-green-dark">{peso(totalAmount)}</span>
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-sm font-semibold text-brown-dark mb-1.5">
              <LuMapPin className="inline w-3.5 h-3.5 mr-1" />
              Delivery Location
            </label>
            <input
              type="text"
              value={deliveryLocation}
              onChange={e => setDeliveryLocation(e.target.value)}
              placeholder="e.g. NERC Warehouse, General Santos City"
              className="w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-beige/50 text-sm text-brown-dark
                placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-brown-dark mb-1.5">
              <LuStickyNote className="inline w-3.5 h-3.5 mr-1" />
              Special Notes <span className="text-brown-light font-normal">(optional)</span>
            </label>
            <textarea
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              rows={3}
              placeholder="Any additional terms or notes to include in the contract…"
              className="w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-beige/50 text-sm text-brown-dark
                placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all resize-none"
            />
          </div>
        </div>

        {/* In-app signing notice */}
        <div className="bg-blue-50 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 leading-relaxed">
          <strong>What happens next:</strong> A contract PDF is generated with a cryptographic
          hash of these exact terms. It will appear in the chat for the Supplier to review.
          When they authorize the use of their registered e-signature, the contract is signed
          with a tamper-evident audit record and its status becomes <strong>Active</strong>.
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleGenerate} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm
              hover:shadow-glow-green transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {loading
              ? <><LuLoader className="w-4 h-4 animate-spin" /> Generating…</>
              : <><LuCheck className="w-4 h-4" /> Generate & Send for Signing</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
