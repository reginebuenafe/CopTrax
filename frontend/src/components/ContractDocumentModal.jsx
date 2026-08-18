import { useCallback, useEffect, useState } from "react";
import { LuFileText, LuLoader, LuX } from "react-icons/lu";
import { supabase } from "../lib/supabase";

export default function ContractDocumentModal({
  contractId,
  contractNumber,
  documentPath,
  onClose,
}) {
  const [documentUrl, setDocumentUrl] = useState("");
  const [resolvedNumber, setResolvedNumber] = useState(contractNumber ?? "Contract Document");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDocument = useCallback(async (updatedContract = null) => {
    setLoading(true);
    setError("");

    let contract = updatedContract;
    if (!contract && contractId) {
      const { data, error: contractError } = await supabase
        .from("contracts")
        .select("contract_id, contract_number, status, contract_document_url")
        .eq("contract_id", contractId)
        .single();
      if (contractError) {
        setError("The contract document could not be loaded.");
        setLoading(false);
        return;
      }
      contract = data;
    }

    const latestPath = contract?.contract_document_url ?? documentPath;
    if (!latestPath) {
      setError("This contract does not have a document available yet.");
      setLoading(false);
      return;
    }

    const { data, error: urlError } = await supabase.storage
      .from("contracts")
      .createSignedUrl(latestPath, 60 * 15);
    if (urlError || !data?.signedUrl) {
      setError("The contract document could not be opened.");
      setLoading(false);
      return;
    }

    setResolvedNumber(contract?.contract_number ?? contractNumber ?? "Contract Document");
    setStatus(contract?.status ?? "");
    setDocumentUrl(data.signedUrl);
    setLoading(false);
  }, [contractId, contractNumber, documentPath]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadDocument(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocument]);

  useEffect(() => {
    if (!contractId) return undefined;
    const channel = supabase
      .channel(`contract-document-modal:${contractId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contracts", filter: `contract_id=eq.${contractId}` },
        ({ new: updatedContract }) => loadDocument(updatedContract),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [contractId, loadDocument]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="contract-document-title"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] border border-[#DCCDB4] bg-[#FFFEFB] shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#E7DCC9] px-4 py-3.5 sm:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F5E9] text-[#17682D]">
            <LuFileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="contract-document-title" className="truncate font-bold text-[#4E342E]">{resolvedNumber}</h2>
            <p className="text-xs text-[#8B7368]">{status === "Active" ? "Signed contract document" : "Contract document preview"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close contract document"
            className="rounded-lg p-2 text-[#765D52] transition-colors hover:bg-[#F4EBDD]">
            <LuX className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-[#EEE9E0]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[#17682D]">
              <LuLoader className="h-7 w-7 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-600">{error}</div>
          ) : (
            <iframe key={documentUrl} src={documentUrl} title={`${resolvedNumber} document`}
              className="h-full w-full border-0 bg-white" />
          )}
        </div>
      </section>
    </div>
  );
}
