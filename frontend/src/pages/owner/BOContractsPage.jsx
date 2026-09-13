import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuFileText, LuCheck, LuX,
  LuCircleAlert, LuLoader, LuMessageSquare, LuPenLine,
  LuSearch, LuArrowUpDown, LuTruck, LuPackage, LuClock,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ContractReviewModal from "../../components/ContractReviewModal";
import ContractApprovalModal from "../../components/ContractApprovalModal";

const STATUS_META = {
  Pending:   { label: "Awaiting Supplier",   color: "bg-amber-50 text-amber-700",      dot: "bg-amber-400" },
  "Pending Owner Review": { label: "Pending Your Review", color: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  Active:    { label: "Active",    color: "bg-green-pale text-green-dark",    dot: "bg-green-mid" },
  Completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700",   dot: "bg-emerald-500" },
  Breached:  { label: "Breached",  color: "bg-red-50 text-red-600",           dot: "bg-red-500" },
};

const FILTERS = ["All", "Pending", "Pending Owner Review", "Active", "Completed", "Breached"];

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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal]       = useState(null); // contract for generation
  const [approvalModal, setApprovalModal]   = useState(null); // contract awaiting BO approval
  const [successMsg, setSuccessMsg]         = useState(null); // success overlay after generation
  const [pdfModal, setPdfModal]             = useState(null); // { url, contractNumber, supplierName }
  const [batchesModal, setBatchesModal]     = useState(null); // contract object
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchContracts = useCallback(async () => {
    setLoading(true);

    const { data: contractData, error: contractErr } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, activation_date, due_date, status, created_at,
        contract_hash, contract_document_url, bo_reviewed_at,
        supplier:supplier_id(user_id, first_name, last_name, email)
      `)
      .order("created_at", { ascending: false });

    if (contractErr) {
      console.error("[BOContracts] fetch error:", contractErr);
      setContracts([]);
      setLoading(false);
      return;
    }

    if (!contractData || contractData.length === 0) {
      setContracts([]);
      setLoading(false);
      return;
    }

    // Fetch accepted delivery weights per contract (two-level join)
    const ids = contractData.map(c => c.contract_id);
    const { data: allocData } = await supabase
      .from("delivery_allocations")
      .select("contract_id, allocated_weight_kg, delivery:delivery_id(delivery_status)")
      .in("contract_id", ids);

    // Fetch conversation IDs linked to these contracts (separate simple query)
    const { data: convData } = await supabase
      .from("conversations")
      .select("conversation_id, contract_id")
      .in("contract_id", ids);
    const convMap = {};
    for (const cv of (convData ?? [])) {
      if (cv.contract_id) convMap[cv.contract_id] = cv.conversation_id;
    }

    const acceptedKgMap = {};
    for (const alloc of (allocData ?? [])) {
      if (alloc.delivery?.delivery_status === "Accepted") {
        acceptedKgMap[alloc.contract_id] =
          (acceptedKgMap[alloc.contract_id] ?? 0) + Number(alloc.allocated_weight_kg ?? 0);
      }
    }

    // Auto-breach any overdue Active contracts before rendering
    await supabase.rpc("auto_breach_overdue_contracts");

    // Re-fetch statuses after potential breach updates
    const { data: refreshedData } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, activation_date, due_date, status, created_at,
        contract_hash, contract_document_url, bo_reviewed_at,
        supplier:supplier_id(user_id, first_name, last_name, email)
      `)
      .order("created_at", { ascending: false });

    const finalData = refreshedData ?? contractData;
    setContracts(finalData.map(c => ({
      ...c,
      delivered_kg: acceptedKgMap[c.contract_id] ?? 0,
      conversation_id: convMap[c.contract_id] ?? null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { (async () => { await fetchContracts(); })(); }, [fetchContracts]);

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

  // Search + status filter + sort
  const filtered = contracts
    .filter(c => filter === "All" || c.status === filter)
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const name = `${c.supplier?.first_name ?? ""} ${c.supplier?.last_name ?? ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (c.contract_number ?? "").toLowerCase().includes(q) ||
        (c.supplier?.email ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "az")      return `${a.supplier?.last_name}${a.supplier?.first_name}`.localeCompare(`${b.supplier?.last_name}${b.supplier?.first_name}`);
      if (sort === "za")      return `${b.supplier?.last_name}${b.supplier?.first_name}`.localeCompare(`${a.supplier?.last_name}${a.supplier?.first_name}`);
      if (sort === "oldest")  return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "price_asc")  return Number(a.negotiated_price_per_kg ?? 0) - Number(b.negotiated_price_per_kg ?? 0);
      if (sort === "price_desc") return Number(b.negotiated_price_per_kg ?? 0) - Number(a.negotiated_price_per_kg ?? 0);
      return new Date(b.created_at) - new Date(a.created_at); // newest default
    });

  async function openPdfModal(c) {
    if (!c.contract_document_url) return;
    const { data } = await supabase.storage.from("contracts").createSignedUrl(c.contract_document_url, 60 * 15);
    if (data?.signedUrl) {
      setPdfModal({
        url: data.signedUrl,
        contractNumber: c.contract_number,
        supplierName: `${c.supplier?.first_name ?? ""} ${c.supplier?.last_name ?? ""}`.trim(),
      });
    }
  }

  return (
    <div className="pt-6">
      {toast && (
        <div className={`fixed left-3 right-3 top-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold sm:left-auto sm:right-5 sm:max-w-sm
          ${toast.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-pale border border-green-mid/30 text-green-dark"}`}>
          {toast.type === "error" ? <LuCircleAlert className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-brown-dark">Contracts</h1>
          <p className="text-brown-light text-sm mt-0.5">Manage all supplier contracts</p>
        </div>
        {!loading && (
          <span className="text-xs text-brown-light shrink-0">{contracts.length} total</span>
        )}
      </div>

      {/* Prominent banner — impossible to miss when a Supplier-signed
          contract is waiting on the Business Owner's review/approval. */}
      {!loading && contracts.filter(c => c.status === "Pending Owner Review").length > 0 && (
        <button
          onClick={() => setFilter("Pending Owner Review")}
          className="w-full flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 mb-4 text-left transition-colors hover:bg-orange-100"
        >
          <LuCircleAlert className="w-5 h-5 text-orange-600 shrink-0" />
          <span className="text-sm text-orange-800 flex-1">
            <strong>{contracts.filter(c => c.status === "Pending Owner Review").length}</strong> contract
            {contracts.filter(c => c.status === "Pending Owner Review").length !== 1 ? "s" : ""} signed by
            the Supplier and awaiting your review &amp; approval.
          </span>
          <span className="text-xs font-bold text-orange-700 shrink-0">Review now →</span>
        </button>
      )}

      {/* Search + Sort row */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[180px]">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier name or contract #…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
              <LuX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative w-full sm:w-auto sm:shrink-0">
          <LuArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brown-light pointer-events-none" />
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="w-full pl-8 pr-8 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm sm:w-auto
              focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all appearance-none cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="az">Supplier A → Z</option>
            <option value="za">Supplier Z → A</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
          </select>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-6 border-b border-beige-dark/40 mb-6 overflow-x-auto">
        {FILTERS.map(f => {
          const tabLabel = STATUS_META[f]?.label ?? f;
          const count = f !== "All" ? contracts.filter(c => c.status === f).length : 0;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
                ${filter === f ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
              {tabLabel}
              {f === "Pending Owner Review" && count > 0 && (
                <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                  {count}
                </span>
              )}
              {f === "Pending" && count > 0 && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuFileText className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No {filter !== "All" ? `"${filter}"` : ""} contracts{search ? ` matching "${search}"` : ""}</p>
          <p className="text-brown-light text-sm mt-1">{search ? "Try a different name or contract number." : "Contracts are created when a price negotiation is accepted."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.Pending;
            const days = daysLeft(c.due_date);
            const conversationId = c.conversation_id ?? null;

            // Weight calculations (delivered_kg pre-computed above, contract in tons)
            const contractedTons = Number(c.contracted_tons ?? 0);
            const deliveredKg = c.delivered_kg ?? 0;
            const deliveredTons = deliveredKg / 1000;
            const remainingTons = Math.max(0, contractedTons - deliveredTons);
            const fulfillmentPct = contractedTons > 0
              ? Math.min(100, Math.round((deliveredTons / contractedTons) * 100))
              : 0;

            return (
              <div key={c.contract_id} className="bg-white border border-beige-dark/40 rounded-xl p-4 sm:p-5">
                {/* Header */}
                <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-bold text-brown-dark break-words">{c.contract_number}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-brown-dark font-medium text-sm">{c.supplier?.first_name} {c.supplier?.last_name}</p>
                    <p className="text-brown-light text-xs break-words">{c.supplier?.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    {conversationId && (
                      <button onClick={() => navigate(`/dashboard/owner/conversations/${conversationId}`)}
                        className="flex items-center gap-1.5 text-xs text-brown-light hover:text-green-dark font-semibold transition-colors px-2.5 py-1.5 rounded-lg hover:bg-green-pale">
                        <LuMessageSquare className="w-3.5 h-3.5" /> Chat
                      </button>
                    )}
                    <button onClick={() => setBatchesModal(c)}
                      className="flex items-center gap-1.5 text-xs text-brown-light hover:text-amber-600 font-semibold transition-colors px-2.5 py-1.5 rounded-lg hover:bg-amber-50">
                      <LuTruck className="w-3.5 h-3.5" /> Batches
                    </button>
                    {c.contract_document_url && (
                      <button onClick={() => openPdfModal(c)}
                        className="flex items-center gap-1.5 text-xs text-brown-light hover:text-blue-600 font-semibold transition-colors px-2.5 py-1.5 rounded-lg hover:bg-blue-50">
                        <LuFileText className="w-3.5 h-3.5" /> Contract
                      </button>
                    )}
                  </div>
                </div>

                {/* Contract details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-brown-light text-xs mb-0.5">Agreed Price</p>
                    <p className="font-semibold text-brown-dark">{peso(c.negotiated_price_per_kg)}<span className="text-xs text-brown-light font-normal">/kg</span></p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-brown-light text-xs mb-0.5">Agreed Quantity</p>
                    <p className="font-semibold text-brown-dark">{Number(c.contracted_tons).toLocaleString()} tons</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-brown-light text-xs mb-0.5">Activation Date</p>
                    <p className="font-semibold text-brown-dark">{fmtDate(c.activation_date)}</p>
                  </div>
                  <div className="min-w-0">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-sm">
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
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-dark text-white font-bold text-xs hover:bg-green-dark/90 transition-colors">
                      <LuPenLine className="w-3.5 h-3.5" /> Review & Generate Contract
                    </button>
                  )}
                  {c.status === "Pending" && c.contract_hash && (
                    <span className="text-xs text-brown-light italic flex items-center gap-1.5">
                      <LuClock className="w-3.5 h-3.5" /> Awaiting Supplier's signature
                    </span>
                  )}
                  {c.status === "Pending Owner Review" && (
                    <button onClick={() => setApprovalModal(c)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-dark text-white font-bold text-xs hover:bg-green-dark/90 transition-colors">
                      <LuCheck className="w-3.5 h-3.5" /> {c.bo_reviewed_at ? "Approve & Sign Contract" : "Review Contract"}
                    </button>
                  )}
                  {(c.status === "Completed" || c.status === "Breached") && (
                    <span className="text-xs text-brown-light italic">Contract finalized, rating computed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ContractApprovalModal — BO must open, review, and explicitly approve
          & sign a contract the Supplier has already signed. This is the ONLY
          path that can activate a contract; it replaces the old client-side
          "Activate Contract" bypass entirely. */}
      {approvalModal && (
        <ContractApprovalModal
          contract={approvalModal}
          onClose={() => setApprovalModal(null)}
          onApproved={() => {
            setApprovalModal(null);
            showToast("Contract approved and signed. It is now Active.");
            fetchContracts();
          }}
        />
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-md p-6 text-center">
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
      {/* PDF Contract Viewer Modal */}
      {pdfModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-3xl flex flex-col" style={{ height: "90vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-beige-dark/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <LuFileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-brown-dark">{pdfModal.contractNumber}</p>
                  <p className="text-xs text-brown-light">{pdfModal.supplierName}</p>
                </div>
              </div>
              <button onClick={() => setPdfModal(null)} className="text-brown-light hover:text-brown-dark transition-colors p-1">
                <LuX className="w-5 h-5" />
              </button>
            </div>
            {/* PDF iframe */}
            <iframe
              src={pdfModal.url}
              className="flex-1 w-full rounded-b-3xl"
              title={pdfModal.contractNumber}
            />
          </div>
        </div>
      )}

      {/* Delivery Batches Modal */}
      {batchesModal && (
        <DeliveryBatchesModal contract={batchesModal} onClose={() => setBatchesModal(null)} />
      )}

    </div>
  );
}

// ── Delivery Batches Modal ────────────────────────────────────────────────────
function DeliveryBatchesModal({ contract, onClose }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("delivery_allocations")
        .select(`
          allocated_weight_kg, price_type, sequence_order,
          delivery:delivery_id(
            delivery_id, batch_number, delivery_date, delivery_status,
            weighing_records(net_weight_kg, gross_weight_kg),
            quality_results(result)
          )
        `)
        .eq("contract_id", contract.contract_id)
        .order("sequence_order", { ascending: true });
      setBatches(data ?? []);
      setLoading(false);
    }
    load();
  }, [contract.contract_id]);

  const RESULT_STYLE = {
    Accepted: "bg-green-pale text-green-dark",
    Rejected:  "bg-red-50 text-red-600",
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-7 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-beige-dark/20 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
              <LuTruck className="w-6 h-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-brown-dark">Delivery Batches</h2>
              <p className="text-sm text-brown-light break-words">{contract.contract_number} · {contract.supplier?.first_name} {contract.supplier?.last_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors shrink-0">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <LuLoader className="w-6 h-6 text-brown-light animate-spin" />
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 bg-beige rounded-2xl flex items-center justify-center mb-3">
                <LuPackage className="w-6 h-6 text-brown-light" />
              </div>
              <p className="text-brown-dark font-semibold">No deliveries yet</p>
              <p className="text-brown-light text-sm mt-1">Batches delivered under this contract will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((a, i) => {
                const d = a.delivery;
                const wr = d?.weighing_records?.[0];
                const result = d?.quality_results?.[0]?.result;
                return (
                  <div key={i} className="flex items-start justify-between gap-2 px-4 py-3 rounded-xl bg-beige/50 border border-beige-dark/20">
                    <div className="flex items-start gap-2.5 flex-wrap min-w-0 flex-1">
                      <span className="font-semibold text-brown-dark whitespace-nowrap">{d?.batch_number ?? `Batch ${i + 1}`}</span>
                      {result && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${RESULT_STYLE[result] ?? "bg-beige text-brown-mid"}`}>
                          {result}
                        </span>
                      )}
                      <span className="text-sm text-brown-light break-words">
                        {d?.delivery_date ? new Date(d.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        {wr && ` · G:${Number(wr.gross_weight_kg ?? 0).toLocaleString("en-PH")}kg N:${Number(wr.net_weight_kg ?? 0).toLocaleString("en-PH")}kg`}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-brown-dark">{Number(a.allocated_weight_kg ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                      <span className={`ml-2 text-sm font-semibold ${a.price_type === "Spot" ? "text-amber-700" : "text-green-dark"}`}>
                        {a.price_type}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!loading && batches.length > 0 && (
          <div className="px-4 sm:px-7 py-4 border-t border-beige-dark/20 shrink-0">
            <div className="flex justify-between items-center">
              <span className="text-sm text-brown-light">{batches.length} batch{batches.length !== 1 ? "es" : ""}</span>
              <span className="font-bold text-brown-dark">
                {(batches.reduce((s, a) => s + Number(a.allocated_weight_kg ?? 0), 0) / 1000).toFixed(2)} tons total
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
