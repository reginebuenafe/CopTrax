import { useEffect, useState } from "react";
import {
  LuX, LuFileText, LuCheck, LuLoader, LuShieldCheck, LuFingerprint, LuCircleAlert,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";

/**
 * ContractApprovalModal — shown to the Business Owner for a contract that is
 * 'Pending Owner Review' (i.e. the Supplier has already signed). This is the
 * ONLY place a Business Owner can approve & sign a contract; there is no
 * automatic activation anywhere else.
 *
 * Flow:
 *   1. On open, marks `bo_reviewed_at` on the contract (once) so the backend
 *      knows this specific contract was actually opened for review.
 *   2. Shows the interim (Supplier-only-signed) contract PDF for review.
 *   3. "Approve & Sign Contract" opens a confirmation dialog with the exact
 *      required authorization text.
 *   4. Only on confirmation does this call the `approve-contract` Edge
 *      Function, which independently re-validates everything server-side
 *      (caller is the BO, bo_reviewed_at is set, status is still Pending
 *      Owner Review, hash matches) before applying the BO's signature and
 *      activating the contract.
 *
 * Props:
 *   contract    – { contract_id, contract_number, negotiated_price_per_kg,
 *                   contracted_tons, contract_document_url, bo_reviewed_at,
 *                   supplier: { first_name, last_name } }
 *   onClose     – () => void
 *   onApproved  – (result) => void   called after a successful approval
 */
export default function ContractApprovalModal({ contract, onClose, onApproved }) {
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [reviewedAt, setReviewedAt]   = useState(contract.bo_reviewed_at ?? null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // Mark this specific contract as opened-for-review (once) as soon as the
  // modal mounts. The "Approve & Sign Contract" button only ever becomes
  // available after this succeeds, and the backend independently requires
  // it too, so this can't be bypassed by skipping the frontend gate.
  //
  // Always re-check the CURRENT value in the database first rather than
  // trusting the `contract.bo_reviewed_at` prop, which can be stale (e.g. a
  // contract opened once before, then reopened from a contracts list that
  // hasn't refetched) — otherwise the guarded UPDATE below matches zero rows
  // and the button would stay disabled forever with no feedback.
  useEffect(() => {
    let cancelled = false;
    async function ensureReviewed() {
      const { data: current, error: fetchErr } = await supabase
        .from("contracts")
        .select("bo_reviewed_at")
        .eq("contract_id", contract.contract_id)
        .maybeSingle();

      if (cancelled) return;

      if (current?.bo_reviewed_at) {
        setReviewedAt(current.bo_reviewed_at);
        return;
      }

      if (fetchErr) {
        setError("Could not load this contract's review status. Please close and try again.");
        return;
      }

      const nowIso = new Date().toISOString();
      const { data, error: updateError } = await supabase
        .from("contracts")
        .update({ bo_reviewed_at: nowIso })
        .eq("contract_id", contract.contract_id)
        .is("bo_reviewed_at", null)
        .select("bo_reviewed_at")
        .maybeSingle();

      if (cancelled) return;

      if (data?.bo_reviewed_at) {
        setReviewedAt(data.bo_reviewed_at);
      } else if (updateError) {
        setError("Could not mark this contract as reviewed. Please close and reopen it to try again.");
      }
    }
    ensureReviewed();
    return () => { cancelled = true; };
  }, [contract.contract_id]);

  // Fetch a short-lived signed URL for the PDF preview.
  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      if (!contract.contract_document_url) { setPreviewUrl(null); return; }
      const { data, error: urlError } = await supabase.storage
        .from("contracts")
        .createSignedUrl(contract.contract_document_url, 60 * 15);
      if (!cancelled) {
        if (urlError) setPreviewUrl(null);
        else          setPreviewUrl(data?.signedUrl ?? null);
      }
    }
    loadPreview();
    return () => { cancelled = true; };
  }, [contract.contract_document_url]);

  function peso(n) {
    return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  }

  async function handleApprove() {
    setLoading(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/approve-contract`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        contract_id: contract.contract_id,
        confirmed:   true,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to approve contract. Please try again.");
      setLoading(false);
      setConfirmOpen(false);
      return;
    }

    setLoading(false);
    setConfirmOpen(false);
    onApproved?.(data);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-card w-full max-w-3xl relative max-h-[92vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-brown-light hover:text-brown-dark transition-colors z-10"
        >
          <LuX className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 p-6 pb-4 border-b border-beige-dark/30">
          <div className="w-10 h-10 bg-green-dark/10 rounded-xl flex items-center justify-center">
            <LuFileText className="w-5 h-5 text-green-dark" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brown-dark">Review & Approve Contract</h2>
            <p className="text-brown-light text-sm">{contract.contract_number}</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 leading-relaxed flex gap-2.5 items-start">
            <LuCircleAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <p>
              The Supplier has signed this contract. Review its terms below, then explicitly
              approve and sign it to make it <strong>Active</strong>.
            </p>
          </div>

          {/* Contract summary */}
          <div className="bg-beige rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brown-light">Supplier</span>
              <span className="font-semibold text-brown-dark">
                {contract.supplier?.first_name} {contract.supplier?.last_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-brown-light">Price per kg</span>
              <span className="font-semibold text-brown-dark">{peso(contract.negotiated_price_per_kg)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brown-light">Committed volume</span>
              <span className="font-semibold text-brown-dark">
                {Number(contract.contracted_tons ?? 0).toLocaleString()} tons
              </span>
            </div>
          </div>

          {/* Document preview */}
          {previewUrl ? (
            <div className="rounded-2xl overflow-hidden border border-beige-dark/40">
              <iframe
                src={previewUrl}
                title="Contract preview"
                className="w-full h-[420px] bg-white"
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-beige p-6 text-center text-brown-light text-sm">
              {contract.contract_document_url ? "Loading contract preview…" : "Contract preview will appear here once available."}
            </div>
          )}

          {/* Cryptographic hash — makes the security binding visible */}
          {contract.contract_hash && (
            <div className="bg-beige rounded-2xl p-3 flex gap-2 items-center">
              <LuFingerprint className="w-4 h-4 text-green-dark shrink-0" />
              <div className="text-[10px] text-brown-light leading-tight break-all font-mono">
                <span className="uppercase tracking-wider text-brown-dark font-semibold">Contract hash · </span>
                {contract.contract_hash}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-beige-dark/30">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!reviewedAt || loading}
            title={!reviewedAt ? "Please wait, marking this contract as reviewed…" : undefined}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <LuCheck className="w-4 h-4" /> Approve & Sign Contract
          </button>
        </div>
      </div>

      {/* Explicit confirmation dialog — required before the BO's signature
          is ever applied. */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-card w-full max-w-md p-6 relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-dark/10 rounded-xl flex items-center justify-center">
                <LuShieldCheck className="w-5 h-5 text-green-dark" />
              </div>
              <h3 className="text-lg font-bold text-brown-dark">Confirm Approval</h3>
            </div>
            <p className="text-sm text-brown-dark leading-relaxed mb-6">
              I confirm that I have reviewed the contract terms and authorize my signature to be
              applied to this contract.
            </p>
            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading
                  ? <><LuLoader className="w-4 h-4 animate-spin" /> Signing…</>
                  : <><LuCheck className="w-4 h-4" /> Confirm & Sign</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
