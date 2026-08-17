import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuFileText, LuCheck, LuX, LuClock, LuArrowRight,
  LuCircleAlert, LuLoader, LuMessageSquare, LuPenLine,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ContractReviewModal from "../../components/ContractReviewModal";

const STATUS_META = {
  Pending:   { label: "Pending",   color: "bg-amber-50 text-amber-700",      dot: "bg-amber-400" },
  Active:    { label: "Active",    color: "bg-green-pale text-green-dark",    dot: "bg-green-mid" },
  Completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700",   dot: "bg-emerald-500" },
  Breached:  { label: "Breached",  color: "bg-red-50 text-red-600",           dot: "bg-red-500" },
};

const FILTERS = ["All", "Pending", "Active", "Completed", "Breached"];

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function daysLeft(due) {
  if (!due) return null;
  return Math.ceil((new Date(due) - new Date()) / (1000 * 60 * 60 * 24));
}

export default function BOContractsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal]       = useState(null); // { contract, action }
  const [reviewModal, setReviewModal]       = useState(null); // contract for generation
  const [successMsg, setSuccessMsg]         = useState(null); // success overlay after generation
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchContracts = useCallback(async () => {
    setLoading(true);

    // Step 1: Fetch base contract data — no triple-nested join
    const { data: contractData, error: contractErr } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, status, created_at,
        contract_hash, contract_document_url,
        supplier:supplier_id(user_id, first_name, last_name, email),
        conversations(conversation_id)
      `)
      .order("created_at", { ascending: false });

    if (contractErr) {
      console.error("[BOContracts] fetch error:", contractErr);
      setLoading(false);
      return;
    }

    if (!contractData || contractData.length === 0) {
      setContracts([]);
      setLoading(false);
      return;
    }

    // Step 2: Fetch accepted delivery weights per contract (two-level join — reliable)
    const ids = contractData.map(c => c.contract_id);
    const { data: allocData } = await supabase
      .from("delivery_allocations")
      .select("contract_id, allocated_weight_kg, delivery:delivery_id(delivery_status)")
      .in("contract_id", ids);

    // Build map: contract_id → total accepted kg
    const acceptedKgMap = {};
    for (const alloc of (allocData ?? [])) {
      if (alloc.delivery?.delivery_status === "Accepted") {
        acceptedKgMap[alloc.contract_id] =
          (acceptedKgMap[alloc.contract_id] ?? 0) + Number(alloc.allocated_weight_kg ?? 0);
      }
    }

    setContracts(contractData.map(c => ({ ...c, delivered_kg: acceptedKgMap[c.contract_id] ?? 0 })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  // Realtime: update when any contract changes (e.g., supplier signs → Active)
  useEffect(() => {
    const channel = supabase
      .channel(`bo-contracts:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" },
        () => fetchContracts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contracts" },
        () => fetchContracts())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id, fetchContracts]);

  const filtered = filter === "All" ? contracts : contracts.filter(c => c.status === filter);

  async function handleAction() {
    const { contract, action } = actionModal;
    setProcessing(true);

    const updates = {};
    let notifType = null;
    let notifMsg = "";

    if (action === "activate") {
      updates.status = "Active";
      updates.signing_date = new Date().toISOString().slice(0, 10);
      notifType = "Contract Activated";
      notifMsg = `Contract ${contract.contract_number} has been activated. Deliveries can now be recorded.`;

      // Insert BO signature record
      await supabase.from("contract_signatures").insert({
        contract_id: contract.contract_id,
        signer_id: user.id,
        signer_role: "Business Owner",
        signature_order: 1,
        signed_at: new Date().toISOString(),
      });
      // Insert supplier signature (auto-apply)
      await supabase.from("contract_signatures").insert({
        contract_id: contract.contract_id,
        signer_id: contract.supplier.user_id,
        signer_role: "Supplier",
        signature_order: 2,
        signed_at: new Date().toISOString(),
      });
    } else if (action === "complete") {
      updates.status = "Completed";
      notifType = "Contract Completed";
      notifMsg = `Contract ${contract.contract_number} has been marked as Completed.`;

      // Trigger supplier rating computation
      await supabase.rpc("compute_supplier_rating", { p_contract_id: contract.contract_id });
    } else if (action === "breach") {
      updates.status = "Breached";
      notifType = "Contract Breached";
      notifMsg = `Contract ${contract.contract_number} has been marked as Breached.`;

      await supabase.rpc("compute_supplier_rating", { p_contract_id: contract.contract_id });
    }

    const { error } = await supabase.from("contracts").update(updates).eq("contract_id", contract.contract_id);

    if (error) {
      showToast("Action failed. Please try again.", "error");
    } else {
      // Notify supplier
      if (notifType) {
        await supabase.from("notifications").insert({
          user_id: contract.supplier.user_id,
          notification_type: notifType,
          message: notifMsg,
          related_entity_type: "contracts",
          related_entity_id: contract.contract_id,
        });
        // Notify conversation
        if (contract.conversations?.[0]?.conversation_id) {
          await supabase.from("messages").insert({
            conversation_id: contract.conversations[0].conversation_id,
            sender_id: user.id,
            message_type: "Contract Form",
            message_text: notifMsg,
          });
        }
      }
      showToast(
        action === "activate" ? "Contract activated — deliveries can now be recorded." :
        action === "complete" ? "Contract marked Completed. Supplier rating computed." :
        "Contract marked Breached. Supplier rating computed."
      );
      fetchContracts();
    }

    setProcessing(false);
    setActionModal(null);
  }

  return (
    <div>
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-card text-sm font-semibold
          ${toast.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-pale border border-green-mid/30 text-green-dark"}`}>
          {toast.type === "error" ? <LuCircleAlert className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <LuFileText className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Contracts</h1>
          <p className="text-brown-light text-sm">Manage all supplier contracts</p>
        </div>
        {!loading && (
          <span className="ml-auto text-xs text-brown-light">{contracts.length} total</span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-1 bg-beige rounded-xl p-1 mb-6 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap
              ${filter === f ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-mid"}`}>
            {f}
            {f === "Pending" && contracts.filter(c => c.status === "Pending").length > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                {contracts.filter(c => c.status === "Pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuFileText className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No {filter !== "All" ? `"${filter}"` : ""} contracts</p>
          <p className="text-brown-light text-sm mt-1">Contracts are created when a price negotiation is accepted.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.Pending;
            const days = daysLeft(c.due_date);
            const conversationId = c.conversations?.[0]?.conversation_id;

            // Weight calculations (delivered_kg pre-computed above, contract in tons)
            const contractedTons = Number(c.contracted_tons ?? 0);
            const deliveredKg = c.delivered_kg ?? 0;
            const deliveredTons = deliveredKg / 1000;
            const remainingTons = Math.max(0, contractedTons - deliveredTons);
            const fulfillmentPct = contractedTons > 0
              ? Math.min(100, Math.round((deliveredTons / contractedTons) * 100))
              : 0;

            return (
              <div key={c.contract_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-bold text-brown-dark">{c.contract_number}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-brown-dark font-medium text-sm">{c.supplier?.first_name} {c.supplier?.last_name}</p>
                    <p className="text-brown-light text-xs">{c.supplier?.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {conversationId && (
                      <button onClick={() => navigate(`/dashboard/owner/conversations/${conversationId}`)}
                        className="flex items-center gap-1.5 text-xs text-brown-light hover:text-green-dark font-semibold transition-colors px-2.5 py-1.5 rounded-lg hover:bg-green-pale">
                        <LuMessageSquare className="w-3.5 h-3.5" /> Chat
                      </button>
                    )}
                  </div>
                </div>

                {/* Contract details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-sm">
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Agreed Price</p>
                    <p className="font-semibold text-brown-dark">{peso(c.negotiated_price_per_kg)}<span className="text-xs text-brown-light font-normal">/kg</span></p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Agreed Quantity</p>
                    <p className="font-semibold text-brown-dark">{Number(c.contracted_tons).toLocaleString()} tons</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Activation Date</p>
                    <p className="font-semibold text-brown-dark">{fmtDate(c.signing_date)}</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Delivery Deadline</p>
                    <p className="font-semibold text-brown-dark">{fmtDate(c.due_date)}</p>
                    {days !== null && c.status === "Active" && (
                      <p className={`text-xs font-medium mt-0.5 ${days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-brown-light"}`}>
                        {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Delivery quantities + fulfillment */}
                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Delivered Qty</p>
                    <p className="font-semibold text-brown-dark">{deliveredTons.toFixed(2)} tons</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Remaining Qty</p>
                    <p className={`font-semibold ${remainingTons > 0 ? "text-brown-dark" : "text-emerald-600"}`}>
                      {remainingTons.toFixed(2)} tons
                    </p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Fulfillment</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-beige rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${fulfillmentPct >= 100 ? "bg-emerald-500" : "bg-green-mid"}`}
                          style={{ width: `${fulfillmentPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-brown-dark shrink-0">{fulfillmentPct}%</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-1 border-t border-beige-dark/20 mt-1 flex-wrap">
                  {c.status === "Pending" && !c.contract_hash && (
                    <button onClick={() => setReviewModal(c)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-xs hover:shadow-glow-green transition-all">
                      <LuPenLine className="w-3.5 h-3.5" /> Review & Generate Contract
                    </button>
                  )}
                  {c.status === "Pending" && c.contract_hash && c.contract_document_url && (
                    <button onClick={async () => {
                      const { data } = await supabase.storage.from("contracts").createSignedUrl(c.contract_document_url, 60 * 15);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-all">
                      <LuFileText className="w-3.5 h-3.5" /> View Contract PDF
                    </button>
                  )}
                  {c.status === "Pending" && c.contract_hash && !c.contract_document_url && (
                    <button onClick={() => setActionModal({ contract: c, action: "activate" })}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-xs hover:shadow-glow-green transition-all">
                      <LuCheck className="w-3.5 h-3.5" /> Activate Contract
                    </button>
                  )}
                  {c.status === "Active" && (
                    <>
                      <button onClick={() => setActionModal({ contract: c, action: "complete" })}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-all border border-emerald-200">
                        <LuCheck className="w-3.5 h-3.5" /> Mark Completed
                      </button>
                      <button onClick={() => setActionModal({ contract: c, action: "breach" })}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 transition-all border border-red-200">
                        <LuX className="w-3.5 h-3.5" /> Mark Breached
                      </button>
                    </>
                  )}
                  {(c.status === "Completed" || c.status === "Breached") && (
                    <span className="text-xs text-brown-light italic">Contract finalized — rating computed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card w-full max-w-md p-6 relative">
            <button onClick={() => setActionModal(null)} className="absolute top-4 right-4 text-brown-light hover:text-brown-dark">
              <LuX className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                actionModal.action === "activate" ? "bg-green-pale" :
                actionModal.action === "complete" ? "bg-emerald-50" : "bg-red-50"
              }`}>
                {actionModal.action === "breach"
                  ? <LuX className="w-5 h-5 text-red-600" />
                  : <LuCheck className={`w-5 h-5 ${actionModal.action === "activate" ? "text-green-dark" : "text-emerald-600"}`} />
                }
              </div>
              <div>
                <h2 className="text-lg font-bold text-brown-dark capitalize">
                  {actionModal.action === "activate" ? "Activate Contract" :
                   actionModal.action === "complete" ? "Mark as Completed" : "Mark as Breached"}
                </h2>
                <p className="text-brown-light text-sm">{actionModal.contract.contract_number}</p>
              </div>
            </div>

            <div className="bg-beige rounded-xl px-4 py-3 mb-4 text-sm space-y-1">
              <p className="text-brown-mid">Supplier: <span className="font-semibold text-brown-dark">{actionModal.contract.supplier?.first_name} {actionModal.contract.supplier?.last_name}</span></p>
              <p className="text-brown-mid">Price: <span className="font-semibold text-brown-dark">{peso(actionModal.contract.negotiated_price_per_kg)}/kg</span></p>
              <p className="text-brown-mid">Volume: <span className="font-semibold text-brown-dark">{actionModal.contract.contracted_tons} tons</span></p>
            </div>

            <p className="text-sm text-brown-light mb-5">
              {actionModal.action === "activate"
                ? "Both parties' signatures will be recorded and the contract will become Active. Weighers will then be able to record deliveries under this contract."
                : actionModal.action === "complete"
                ? "The contract will be closed as Completed and the Supplier's performance rating will be computed."
                : "The contract will be closed as Breached. The Supplier's rating will be computed with a 0% Contract Fulfillment score."
              }
            </p>

            <div className="flex gap-3">
              <button onClick={() => setActionModal(null)} disabled={processing}
                className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
                Cancel
              </button>
              <button onClick={handleAction} disabled={processing}
                className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2
                  ${actionModal.action === "breach" ? "bg-red-500 hover:bg-red-600" :
                    actionModal.action === "complete" ? "bg-emerald-600 hover:bg-emerald-700" :
                    "bg-gradient-to-r from-green-dark to-green-mid hover:shadow-glow-green"}`}>
                {processing && <LuLoader className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ContractReviewModal — BO reviews and generates contract */}
      {reviewModal && (
        <ContractReviewModal
          contract={reviewModal}
          onClose={() => setReviewModal(null)}
          onGenerated={() => {
            setReviewModal(null);
            setSuccessMsg("Contract generated and sent to the supplier for review & signature.");
            setTimeout(() => setSuccessMsg(null), 5000);
            fetchContracts();
          }}
        />
      )}

      {/* Success overlay */}
      {successMsg && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card w-full max-w-md p-6 text-center">
            <div className="w-14 h-14 bg-green-pale rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LuCheck className="w-7 h-7 text-green-dark" />
            </div>
            <h2 className="text-xl font-bold text-brown-dark mb-2">Contract Sent!</h2>
            <p className="text-brown-light text-sm mb-5">
              {successMsg}
            </p>
            <button onClick={() => setSuccessMsg(null)}
              className="w-full py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
