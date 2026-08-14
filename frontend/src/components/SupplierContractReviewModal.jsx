import { useState } from "react";
import {
  LuX, LuFileText, LuCheck, LuLoader, LuShieldCheck,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";

/**
 * SupplierContractReviewModal — shown to the Supplier when they tap "Review &
 * Sign Contract" on a contract card in chat. Embeds the DocuSeal document
 * preview and requires the Supplier to check an authorization box before the
 * `sign-contract` Edge Function is called.
 *
 * Props:
 *   contract    – { contract_id, contract_number, price_per_kg, contracted_tons,
 *                   due_date, preview_url }
 *   onClose     – () => void
 *   onSigned    – ({ contract_document_url, activation_date }) => void
 */
export default function SupplierContractReviewModal({ contract, onClose, onSigned }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  function peso(n) {
    return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  }

  function fmtDate(d) {
    if (!d) return "To be set on activation";
    return new Date(d).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  }

  async function handleSign() {
    if (!authorized) return;
    setLoading(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/sign-contract`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        contract_id: contract.contract_id,
        authorized:  true,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to sign contract. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
    onSigned?.(data);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-card w-full max-w-3xl relative max-h-[92vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8b7355] hover:text-[#3d2b1f] transition-colors z-10"
        >
          <LuX className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 p-6 pb-4 border-b border-[#f0e8d8]">
          <div className="w-10 h-10 bg-[#2d5a27]/10 rounded-xl flex items-center justify-center">
            <LuFileText className="w-5 h-5 text-[#2d5a27]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#3d2b1f]">Review & Sign Contract</h2>
            <p className="text-[#8b7355] text-sm">{contract.contract_number}</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Contract summary */}
          <div className="bg-[#faf7f0] rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8b7355]">Price per kg</span>
              <span className="font-semibold text-[#3d2b1f]">{peso(contract.price_per_kg)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8b7355]">Committed volume</span>
              <span className="font-semibold text-[#3d2b1f]">
                {Number(contract.contracted_tons).toLocaleString()} tons
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8b7355]">Delivery deadline</span>
              <span className="font-semibold text-[#3d2b1f]">{fmtDate(contract.due_date)}</span>
            </div>
          </div>

          {/* Document preview */}
          {contract.preview_url ? (
            <div className="rounded-2xl overflow-hidden border border-[#e8e0d0]">
              <iframe
                src={contract.preview_url}
                title="Contract preview"
                className="w-full h-[420px] bg-white"
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-[#faf7f0] p-6 text-center text-[#8b7355] text-sm">
              Contract preview will appear here once available.
            </div>
          )}

          {/* Authorization notice */}
          <div className="bg-[#2d5a27]/5 rounded-2xl p-4 flex gap-3 items-start">
            <LuShieldCheck className="w-5 h-5 text-[#2d5a27] shrink-0 mt-0.5" />
            <div className="text-xs text-[#3d2b1f] leading-relaxed">
              By confirming below, you authorize CopTrax to apply your electronic signature
              submitted during account registration. The date and time of your acceptance
              will be recorded. Once signed, the contract's status will change to
              <strong> Active</strong> and it becomes eligible to receive deliveries.
            </div>
          </div>

          {/* Checkbox */}
          <label className="flex gap-3 items-start cursor-pointer select-none">
            <input
              type="checkbox"
              checked={authorized}
              onChange={e => setAuthorized(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-[#c5b9a8] text-[#2d5a27] focus:ring-[#2d5a27]/30 cursor-pointer accent-[#2d5a27]"
              disabled={loading}
            />
            <span className="text-sm text-[#3d2b1f] leading-relaxed">
              I have reviewed and agreed to the terms of this contract and authorize
              the use of my registered electronic signature.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-[#f0e8d8]">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-[#e8e0d0] text-[#5c4a32] font-semibold text-sm hover:bg-[#faf7f0] transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={!authorized || loading}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#2d5a27] to-[#3d7a35] text-white font-bold text-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading
              ? <><LuLoader className="w-4 h-4 animate-spin" /> Signing…</>
              : <><LuCheck className="w-4 h-4" /> Sign & Submit</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
