import { useEffect, useMemo, useState } from "react";
import { DocusealForm } from "@docuseal/react";
import { LuClock3, LuFileText, LuLoader, LuShieldCheck, LuX } from "react-icons/lu";
import { supabase } from "../lib/supabase";

/**
 * Embedded DocuSeal review/signing surface for the Business Owner.
 *
 * DocuSeal's own preview mode is used until the Supplier has signed. This is
 * intentionally stronger than only disabling a CopTrax button: the embedded
 * DocuSeal form itself cannot be submitted while it is in preview mode.
 */
export default function BOContractReviewModal({ contract, onClose, onCompleted }) {
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentUrl, setDocumentUrl] = useState(contract?.contract_document_url ?? null);
  const [updatingFormatting, setUpdatingFormatting] = useState(false);

  const supplierHasSigned = Boolean(contract?.supplier_authorized_at);
  const boHasSigned = Boolean(contract?.bo_signed_at);
  const canSign = contract?.status === "Pending" && supplierHasSigned && !boHasSigned;
  const isFinalized = ["Active", "Completed", "Breached", "Signed"].includes(contract?.status) || boHasSigned;
  const isViewOnly = !canSign;

  const docusealUrl = useMemo(() => {
    if (contract?.docuseal_bo_sign_url) return contract.docuseal_bo_sign_url;
    if (contract?.docuseal_supplier_slug) {
      return `https://docuseal.com/s/${contract.docuseal_supplier_slug}`;
    }
    return null;
  }, [contract]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = event => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  // Refresh unsigned legacy previews when opened so updated field typography
  // also reaches submissions that were created before the styling change.
  useEffect(() => {
    if (!contract?.contract_id || !contract?.docuseal_submission_id
        || contract.status !== "Pending" || contract.supplier_authorized_at) return undefined;

    let cancelled = false;
    async function refreshUnsignedPreview() {
      setUpdatingFormatting(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setUpdatingFormatting(false);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-contract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ contract_id: contract.contract_id, refresh_existing: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!cancelled) {
        if (response.ok && result.preview_url) setDocumentUrl(result.preview_url);
        setUpdatingFormatting(false);
      }
    }

    refreshUnsignedPreview();
    return () => { cancelled = true; };
  }, [contract?.contract_id, contract?.docuseal_submission_id, contract?.status, contract?.supplier_authorized_at]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bo-contract-review-title"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div className="flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#E4D5BD] bg-[#FFFEFB] shadow-2xl sm:h-[94vh] sm:rounded-[24px]">
        <header className="flex shrink-0 items-start gap-3 border-b border-[#E7DCC9] px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E4F1E5] text-[#17682D]">
            <LuFileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="bo-contract-review-title" className="truncate text-base font-extrabold text-[#402413] sm:text-lg">
              Review Contract {contract?.contract_number ? `— ${contract.contract_number}` : ""}
            </h2>
            <p className="mt-0.5 text-xs text-[#8B7355]">
              The entire DocuSeal contract is displayed inside CopTrax.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6D5147] transition-colors hover:bg-[#F2E8D8]"
            aria-label="Close contract review"
          >
            <LuX className="h-5 w-5" />
          </button>
        </header>

        <div className={`flex shrink-0 items-start gap-3 border-b px-4 py-3 text-xs sm:px-6 ${
          canSign || isFinalized
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          {canSign || isFinalized ? <LuShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <LuClock3 className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            <p className="font-bold">
              {isFinalized
                ? "Signed contract — available for review."
                : canSign
                  ? "Supplier signature received — BO signing is available."
                  : "Review only — awaiting the supplier's signature."}
            </p>
            <p className="mt-0.5 opacity-80">
              {isFinalized
                ? "This document is displayed in read-only mode."
                : canSign
                  ? "Review the final terms before completing the Business Owner signature."
                  : "DocuSeal preview mode prevents this document from being submitted by the Business Owner yet."}
            </p>
          </div>
        </div>

        <main className="relative min-h-0 flex-1 overflow-y-auto bg-[#F6F1E8]">
          {(documentLoading || updatingFormatting) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#F6F1E8]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#6D5147]">
                <LuLoader className="h-5 w-5 animate-spin text-[#17682D]" />
                {updatingFormatting ? "Applying contract formatting…" : "Loading contract…"}
              </div>
            </div>
          )}

          {documentUrl && !canSign ? (
            <iframe
              src={documentUrl}
              title={`Contract ${contract.contract_number ?? "document"}`}
              className="h-full min-h-[680px] w-full bg-white"
              onLoad={() => setDocumentLoading(false)}
            />
          ) : docusealUrl ? (
            <DocusealForm
              src={docusealUrl}
              preview={isViewOnly}
              expand
              withDecline={false}
              withSendCopyButton={false}
              sendCopyEmail={false}
              backgroundColor="#F6F1E8"
              onInit={() => setDocumentLoading(false)}
              onLoad={() => setDocumentLoading(false)}
              onComplete={onCompleted}
              className="block min-h-full w-full"
              style={{ minHeight: "720px" }}
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center text-sm text-[#8B7355]">
              This contract does not have an available DocuSeal document yet.
            </div>
          )}
        </main>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[#E7DCC9] bg-[#FFFEFB] px-4 py-3 sm:px-6">
          <p className="hidden text-[11px] text-[#8B7355] sm:block">
            Press Esc or use Close when you are finished reviewing.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg bg-[#17682D] px-6 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#105523]"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
