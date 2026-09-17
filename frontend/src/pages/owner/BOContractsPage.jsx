import { useEffect, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import {
  LuFileText, LuCheck, LuX,
  LuCircleAlert, LuLoader, LuArrowLeft, LuArrowRight,
  LuSearch, LuArrowUpDown, LuTruck, LuPackage,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ContractReviewModal from "../../components/ContractReviewModal";
import ContractApprovalModal from "../../components/ContractApprovalModal";
import { MotionDiv } from "../../components/landing/motion-elements";

const STATUS_META = {
  Pending:   { label: "Pending", color: "bg-beige text-brown-mid", dot: "bg-brown-light" },
  "Pending Owner Review": { label: "Pending Review", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
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
function supplierInitials(first, last) {
  const f = (first ?? "").trim()[0] ?? "";
  const l = (last ?? "").trim()[0] ?? "";
  return (f + l).toUpperCase() || "?";
}
// Truncates (never rounds up) to 1 decimal place so a near-100% but not
// actually fully-delivered contract (e.g. 99.96%) can never display as a
// misleading "100.0%" — the DB's exact >= comparison is what decides
// Completed status, and the display must always agree with it.
function fmtProgressPct(value) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (Math.floor(safeValue * 10) / 10).toFixed(1);
}

export default function BOContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [selectedContractId, setSelectedContractId] = useState(null);
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

    // Auto-complete contracts fully delivered (safety net for any delivery
    // that reached 100% without a live UPDATE→'Accepted' trigger firing),
    // then auto-breach any still-Active, overdue contracts before rendering.
    // Completion is checked first so a fully-delivered contract is never
    // wrongly left/marked Active or Breached past its deadline.
    await supabase.rpc("auto_complete_fulfilled_contracts");
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

  // Group contracts by supplier for the supplier-list landing view — purely
  // presentational aggregation over the already-loaded `contracts` state;
  // no new queries, no changes to contract data/statuses.
  const supplierGroups = (() => {
    const map = new Map();
    for (const c of contracts) {
      const id = c.supplier?.user_id;
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, {
          supplierId: id,
          firstName: c.supplier?.first_name ?? "",
          lastName: c.supplier?.last_name ?? "",
          email: c.supplier?.email ?? "",
          total: 0,
          counts: { Pending: 0, "Pending Owner Review": 0, Active: 0, Completed: 0, Breached: 0 },
        });
      }
      const g = map.get(id);
      g.total += 1;
      if (g.counts[c.status] !== undefined) g.counts[c.status] += 1;
    }
    return Array.from(map.values())
      .map(g => ({
        ...g,
        name: `${g.firstName} ${g.lastName}`.trim() || "—",
        initialsText: supplierInitials(g.firstName, g.lastName),
      }))
      .sort((a, b) => {
        const lastCmp = (a.lastName ?? "").localeCompare(b.lastName ?? "", "en-PH", { sensitivity: "base" });
        if (lastCmp !== 0) return lastCmp;
        return (a.firstName ?? "").localeCompare(b.firstName ?? "", "en-PH", { sensitivity: "base" });
      });
  })();

  const selectedSupplier = supplierGroups.find(s => s.supplierId === selectedSupplierId) ?? null;

  // Filter the supplier landing list by name/email — independent of the
  // per-supplier contracts table's own search box below.
  const filteredSupplierGroups = supplierGroups.filter(s => {
    if (!supplierSearch.trim()) return true;
    const q = supplierSearch.trim().toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  // Scope the existing table's data to the selected supplier only — the
  // search/status-filter/sort logic below (and the reused table component)
  // is completely unchanged, it just now runs over a supplier's subset.
  const scopedContracts = selectedSupplierId
    ? contracts.filter(c => c.supplier?.user_id === selectedSupplierId)
    : contracts;

  // Search + status filter + sort
  const filtered = scopedContracts
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
      if (sort === "az" || sort === "za") {
        const nameA = `${a.supplier?.first_name ?? ""} ${a.supplier?.last_name ?? ""}`.trim();
        const nameB = `${b.supplier?.first_name ?? ""} ${b.supplier?.last_name ?? ""}`.trim();
        const comparison = nameA.localeCompare(nameB, "en-PH", { sensitivity: "base" });
        return sort === "za" ? -comparison : comparison;
      }
      if (sort === "oldest")  return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "price_asc")  return Number(a.negotiated_price_per_kg ?? 0) - Number(b.negotiated_price_per_kg ?? 0);
      if (sort === "price_desc") return Number(b.negotiated_price_per_kg ?? 0) - Number(a.negotiated_price_per_kg ?? 0);
      return new Date(b.created_at) - new Date(a.created_at); // newest default
    });

  // Contracts awaiting BO review, scoped the same way the table above is —
  // all suppliers on the landing page, just the selected supplier once inside.
  const pendingReviewContracts = scopedContracts.filter(c => c.status === "Pending Owner Review");

  const selectedContract = filtered.find(c => c.contract_id === selectedContractId) ?? null;

  function openSupplier(supplierId) {
    setSelectedSupplierId(supplierId);
    setSelectedContractId(null);
    setFilter("All");
    setSearch("");
    setSort("newest");
  }

  function backToSuppliers() {
    setSelectedSupplierId(null);
    setSelectedContractId(null);
  }

  function openContract(c) {
    if (c.status === "Pending" && !c.contract_hash) setReviewModal(c);
    else if (c.status === "Pending Owner Review") setApprovalModal(c);
    else openPdfModal(c);
  }

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
          {selectedSupplier && (
            <button
              onClick={backToSuppliers}
              className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-brown-mid hover:text-brown-dark transition-colors"
            >
              <LuArrowLeft className="w-4 h-4" /> Back to Suppliers
            </button>
          )}
          {selectedSupplier ? (
            <h1 className="text-3xl font-black text-brown-dark sm:text-4xl">{selectedSupplier.name}</h1>
          ) : (
            <>
              <h1 className="text-2xl font-black text-brown-dark">Contracts</h1>
              <p className="text-brown-light text-sm mt-0.5">Manage all supplier contracts</p>
            </>
          )}
        </div>
        {!loading && (
          <span className="text-xs text-brown-light shrink-0">
            {selectedSupplier ? scopedContracts.length : contracts.length} total
          </span>
        )}
      </div>

      {/* Prominent banner — impossible to miss when a Supplier-signed
          contract is waiting on the Business Owner's review/approval.
          Scoped to the selected supplier once inside their contracts view;
          otherwise checks across all suppliers and jumps into the first one
          with a contract awaiting review. */}
      {!loading && pendingReviewContracts.length > 0 && (
        <button
          onClick={() => {
            if (!selectedSupplierId) {
              const supplierId = pendingReviewContracts[0]?.supplier?.user_id;
              if (supplierId) setSelectedSupplierId(supplierId);
            }
            setFilter("Pending Owner Review");
            setSelectedContractId(null);
          }}
          className="w-full flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 mb-4 text-left transition-colors hover:bg-orange-100"
        >
          <LuCircleAlert className="w-5 h-5 text-orange-600 shrink-0" />
          <span className="text-sm text-orange-800 flex-1">
            <strong>{pendingReviewContracts.length}</strong> contract
            {pendingReviewContracts.length !== 1 ? "s" : ""} signed by
            the Supplier and awaiting your review &amp; approval.
          </span>
          <span className="text-xs font-bold text-orange-700 shrink-0">Review now →</span>
        </button>
      )}

      {!selectedSupplierId ? (
        loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
        ) : supplierGroups.length === 0 ? (
          <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuFileText className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">No suppliers with contracts yet</p>
            <p className="text-brown-light text-sm mt-1">Contracts are created when a price negotiation is accepted.</p>
          </div>
        ) : (
          <OwnerSupplierList
            suppliers={filteredSupplierGroups}
            onSelect={openSupplier}
            search={supplierSearch}
            onSearchChange={setSupplierSearch}
          />
        )
      ) : (
        <>
          {/* Status filter tabs + compact search/sort, in one row */}
          <div className="mb-6 flex flex-col gap-3 border-b border-beige-dark/40 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 overflow-x-auto">
              {FILTERS.map(f => {
                const tabLabel = STATUS_META[f]?.label ?? f;
                const count = f !== "All" ? scopedContracts.filter(c => c.status === f).length : 0;
                return (
                  <button key={f} onClick={() => { setFilter(f); setSelectedContractId(null); }}
                    className={`min-h-11 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
                      ${filter === f ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
                    {f === "All" ? `All (${scopedContracts.length})` : tabLabel}
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

            <div className="flex shrink-0 items-center gap-2 pb-2.5">
              <div className="relative w-48 sm:w-60">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedContractId(null); }}
                  placeholder="Search contract #…"
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-beige-dark bg-white text-brown-dark text-sm
                    placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
                />
                {search && (
                  <button onClick={() => { setSearch(""); setSelectedContractId(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                    <LuX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="relative shrink-0">
                <LuArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brown-light pointer-events-none" />
                <select
                  value={sort}
                  onChange={e => { setSort(e.target.value); setSelectedContractId(null); }}
                  className="pl-7 pr-7 py-2 rounded-lg border border-beige-dark bg-white text-brown-dark text-sm
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
            <AnimatePresence mode="wait" initial={false}>
              <MotionDiv
                key={selectedContract ? `detail-${selectedContract.contract_id}` : `list-${filter}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                {selectedContract ? (
                  <OwnerContractMasterDetail
                    contract={selectedContract}
                    onBack={() => setSelectedContractId(null)}
                    onViewContract={openContract}
                    onViewBatches={setBatchesModal}
                  />
                ) : (
                  <OwnerContractList
                    contracts={filtered}
                    totalCount={scopedContracts.length}
                    onSelect={setSelectedContractId}
                    onViewContract={openContract}
                    onViewBatches={setBatchesModal}
                  />
                )}
              </MotionDiv>
            </AnimatePresence>
          )}
        </>
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
// Presentation helpers mirror the supplier contracts table; queries remain above.
function deadlineTimingLabel(days) {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function ContractStatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.Pending;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function ContractProgress({ value, status }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const color = status === "Breached" || safeValue < 34
    ? "bg-red-500" : safeValue < 67 ? "bg-amber-400" : "bg-green-dark";
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div role="progressbar" aria-label="Contract fulfillment" aria-valuenow={safeValue}
        aria-valuemin={0} aria-valuemax={100}
        className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-beige-dark">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${safeValue}%` }} />
      </div>
      <span className="w-11 shrink-0 whitespace-nowrap text-right text-[11px] font-extrabold tabular-nums text-brown-dark">
        {fmtProgressPct(safeValue)}%
      </span>
    </div>
  );
}

function OwnerContractActions({ contract: c, onViewContract, onViewBatches, reveal = false }) {
  const label = c.status === "Pending" && !c.contract_hash
    ? "Review & Generate Contract"
    : c.status === "Pending Owner Review"
      ? (c.bo_reviewed_at ? "Approve & Sign Contract" : "Review Contract")
      : "View Contract";
  const canOpen = (c.status === "Pending" && !c.contract_hash)
    || c.status === "Pending Owner Review" || Boolean(c.contract_document_url);
  const buttonClass = "inline-flex h-11 w-11 shrink-0 items-center justify-center p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  return (
    <div className={`flex shrink-0 items-center justify-center gap-1 ${reveal ? "opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100" : ""}`}>
      <button type="button" aria-label={label} title={canOpen ? label : "Awaiting Supplier's signature"}
        disabled={!canOpen} onClick={e => { e.stopPropagation(); onViewContract(c); }}
        className={`${buttonClass} text-brown-dark hover:text-brown-mid focus-visible:ring-brown-dark/25 disabled:opacity-40`}>
        <LuFileText aria-hidden="true" className="h-4 w-4" />
      </button>
      <button type="button" aria-label="View Delivery Batches" title="View Batches"
        onClick={e => { e.stopPropagation(); onViewBatches(c); }}
        className={`${buttonClass} text-green-dark hover:text-green-mid focus-visible:ring-green-dark/25`}>
        <LuTruck aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

const OWNER_CONTRACT_COLUMNS = [
  { label: "Contract #", width: 14 },
  { label: "Status", width: 12 },
  { label: "Agreed Price", width: 12, numeric: true, title: "Agreed Price (₱/kg)" },
  { label: "Agreed Qty", width: 12, numeric: true, title: "Agreed Quantity" },
  { label: "Activated", width: 12, title: "Activation Date" },
  { label: "Deadline", width: 13, title: "Delivery Deadline" },
  { label: "Progress", width: 15, numeric: true },
  { label: "", width: 10 },
];

const SUPPLIER_STAT_ORDER = ["Active", "Completed", "Breached"];
const SUPPLIER_STAT_ICON_BG = {
  Active: "bg-green-pale",
  Pending: "bg-beige",
  "Pending Owner Review": "bg-amber-50",
  Completed: "bg-blue-50",
  Breached: "bg-red-50",
};
const SUPPLIER_STAT_DOT = {
  Active: "bg-green-mid",
  Pending: "bg-brown-light",
  "Pending Owner Review": "bg-amber-500",
  Completed: "bg-blue-500",
  Breached: "bg-red-500",
};

function SupplierStat({ iconBg, dotColor, icon, value, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon ?? <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />}
      </span>
      <div className="leading-tight">
        <p className="text-lg font-black text-brown-dark">{value}</p>
        <p className="whitespace-nowrap text-xs text-brown-light">{label}</p>
      </div>
    </div>
  );
}

function OwnerSupplierList({ suppliers, onSelect, search, onSearchChange }) {
  return (
    <section aria-label="Suppliers" className="min-w-0">
      {/* Search bar — filters the supplier list below by name or email only;
          does not touch the per-supplier contracts table's own search. */}
      <div className="relative mb-5 max-w-md">
        <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search supplier name or email…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm
            placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
        />
        {search && (
          <button onClick={() => onSearchChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {suppliers.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-16 text-center px-4">
          <p className="text-brown-dark font-semibold">No suppliers matching "{search}"</p>
          <p className="text-brown-light text-sm mt-1">Try a different name or email.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => (
            <article key={s.supplierId}
              className="rounded-2xl border-2 border-beige-dark/80 bg-white p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex min-w-0 items-center gap-4 sm:flex-1 sm:min-w-[180px]">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-pale text-lg font-black text-green-dark">
                    {s.initialsText}
                  </div>
                  <h2 className="truncate text-lg font-black text-brown-dark">{s.name}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <SupplierStat iconBg="bg-orange-50" icon={<LuFileText className="w-4 h-4 text-orange-500" />} value={s.total} label="Contracts" />
                  {SUPPLIER_STAT_ORDER.map(k => (
                    <div key={k} className="flex items-center gap-x-5">
                      <span className="hidden h-9 w-px bg-beige-dark/60 sm:block" />
                      <SupplierStat
                        iconBg={SUPPLIER_STAT_ICON_BG[k]}
                        dotColor={SUPPLIER_STAT_DOT[k]}
                        value={s.counts[k]}
                        label={STATUS_META[k].label}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onSelect(s.supplierId)}
                  className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-green-dark px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-dark/90"
                >
                  View <LuArrowRight className="w-4 h-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OwnerContractList({ contracts, totalCount, onSelect, onViewContract, onViewBatches }) {
  const values = c => {
    const agreedKg = Number(c.contracted_tons ?? 0) * 1000;
    const deliveredKg = Number(c.delivered_kg ?? 0);
    const days = daysLeft(c.due_date);
    return {
      // Completed contracts always display 100% regardless of the exact
      // computed fraction (display-only; does not change delivered_kg,
      // agreedKg, or the Active/Breached completion logic itself).
      progress: c.status === "Completed" ? 100 : (agreedKg > 0 ? Math.min(100, deliveredKg / agreedKg * 100) : 0),
      // Countdown ("N days left"/"overdue") only makes sense while a contract
      // is still Active — Completed/Breached contracts hide it (display-only).
      days, timing: c.status === "Active" ? deadlineTimingLabel(days) : null,
      quantity: `${Number(c.contracted_tons ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tons`,
    };
  };
  const deadline = (c, v) => (
    <div>
      <p>{fmtDate(c.due_date)}</p>
      {v.timing && <p className={`mt-1 text-xs font-semibold ${v.days < 0 ? "text-red-500" : v.days === 0 ? "text-amber-600" : "text-green-dark"}`}>{v.timing}</p>}
    </div>
  );
  return (
    <section aria-label="Owner contracts" className="min-w-0">
      <div className="hidden overflow-hidden rounded-2xl border border-beige-dark/70 bg-white shadow-card xl:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Supplier contracts managed by the owner</caption>
          <colgroup>{OWNER_CONTRACT_COLUMNS.map((col, i) => <col key={i} style={{ width: `${col.width}%` }} />)}</colgroup>
          <thead className="bg-beige">
            <tr>
              {OWNER_CONTRACT_COLUMNS.map((col, i) => (
                <th key={i} scope="col" title={col.title}
                  className={`whitespace-nowrap border-b border-beige-dark/60 px-3 py-3.5 text-xs font-bold text-brown-light ${col.label === "Status" || col.label === "Progress" ? "text-center" : col.numeric ? "text-right" : "text-left"} ${i === 0 ? "rounded-tl-2xl" : ""} ${i === OWNER_CONTRACT_COLUMNS.length - 1 ? "rounded-tr-2xl" : ""}`}>
                  {col.label || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.map((c, idx) => {
              const v = values(c);
              const isLast = idx === contracts.length - 1;
              const rowBorder = isLast ? "" : "border-b border-beige-dark/40";
              return (
                <tr key={c.contract_id} tabIndex={0}
                  aria-label={`Open details for ${c.contract_number}`}
                  onClick={() => onSelect(c.contract_id)}
                  onKeyDown={e => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelect(c.contract_id);
                    }
                  }}
                  className="group cursor-pointer bg-white outline-none transition-colors duration-150 ease-out hover:bg-beige/60 focus-within:bg-beige/60 focus-visible:bg-green-pale/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-dark/25">
                  <td className={`border-l-[5px] border-l-transparent px-3 py-4 text-left align-middle transition-colors duration-150 ease-out group-hover:border-l-brown-dark group-focus-within:border-l-brown-dark ${rowBorder}`}>
                    <p className="font-extrabold tracking-wide text-brown-dark">{c.contract_number}</p>
                    <p className="mt-1 text-xs text-brown-light">Created {fmtDate(c.created_at)}</p>
                  </td>
                  <td className={`px-3 py-4 text-center ${rowBorder}`}><ContractStatusBadge status={c.status} /></td>
                  <td className={`px-3 py-4 text-right font-bold tabular-nums text-brown-dark ${rowBorder}`}>{peso(c.negotiated_price_per_kg)}</td>
                  <td className={`px-3 py-4 text-right tabular-nums text-brown-mid ${rowBorder}`}>{v.quantity}</td>
                  <td className={`px-3 py-4 text-left text-brown-mid ${rowBorder}`}>{fmtDate(c.activation_date)}</td>
                  <td className={`px-3 py-4 text-left text-brown-mid ${rowBorder}`}>{deadline(c, v)}</td>
                  <td className={`px-3 py-4 ${rowBorder}`}><ContractProgress value={v.progress} status={c.status} /></td>
                  <td onClick={e => e.stopPropagation()} className={`px-0 py-4 ${rowBorder}`}><OwnerContractActions contract={c} onViewContract={onViewContract} onViewBatches={onViewBatches} reveal /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 xl:hidden">
        {contracts.map(c => {
          const v = values(c);
          return (
            <article key={c.contract_id} tabIndex={0}
              aria-label={`Open details for ${c.contract_number}`}
              onClick={() => onSelect(c.contract_id)}
              onKeyDown={e => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(c.contract_id);
                }
              }}
              className="min-w-0 cursor-pointer rounded-2xl border-2 border-beige-dark/80 bg-white p-3 shadow-card outline-none transition-colors hover:border-green-dark/30 focus-visible:ring-2 focus-visible:ring-green-dark/25 sm:p-4">
              <div className="flex min-w-0 flex-nowrap items-center justify-between gap-1">
                <h2 title={c.contract_number} className="min-w-0 flex-1 truncate font-extrabold text-brown-dark">{c.contract_number}</h2>
                <ContractStatusBadge status={c.status} />
                <OwnerContractActions contract={c} onViewContract={onViewContract} onViewBatches={onViewBatches} />
              </div>
              <p className="mt-1 text-xs text-brown-light">Created {fmtDate(c.created_at)}</p>
              <div className="mt-4 border-t border-beige-dark/40 pt-3">
                <p className="mb-2 text-xs font-semibold text-brown-light">Progress</p>
                <ContractProgress value={v.progress} status={c.status} />
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-xs font-medium text-brown-light">Showing {contracts.length} of {totalCount} contract{totalCount === 1 ? "" : "s"}</p>
    </section>
  );
}

function OwnerContractMasterDetail({ contract: c, onBack, onViewContract, onViewBatches }) {
  const agreedKg = Number(c.contracted_tons ?? 0) * 1000;
  const deliveredKg = Number(c.delivered_kg ?? 0);
  const remainingKg = Math.max(0, agreedKg - deliveredKg);
  // Completed contracts always display 100% regardless of the exact
  // computed fraction (display-only; does not change delivered_kg,
  // agreedKg, or the Active/Breached completion logic itself).
  const progress = c.status === "Completed" ? 100 : (agreedKg > 0 ? Math.min(100, deliveredKg / agreedKg * 100) : 0);
  const days = daysLeft(c.due_date);
  // Countdown ("N days left"/"overdue") only makes sense while a contract
  // is still Active — Completed/Breached contracts hide it (display-only).
  const timing = c.status === "Active" ? deadlineTimingLabel(days) : null;
  const supplierName = `${c.supplier?.first_name ?? ""} ${c.supplier?.last_name ?? ""}`.trim() || "—";
  const fields = [
    { label: "Supplier Name", value: supplierName },
    { label: "Created", value: fmtDate(c.created_at) },
    { label: "Status", value: <ContractStatusBadge status={c.status} /> },
    { label: "Price", value: peso(c.negotiated_price_per_kg) + "/kg", numeric: true },
    { label: "Quantity", value: `${Number(c.contracted_tons ?? 0).toLocaleString("en-PH")} tons`, numeric: true },
    { label: "Accepted Qty", value: `${(deliveredKg / 1000).toFixed(2)} tons`, numeric: true },
    { label: "Remaining Qty", value: `${(remainingKg / 1000).toFixed(2)} tons`, numeric: true },
    { label: "Activation Date", value: fmtDate(c.activation_date) },
    { label: "Delivery Deadline", value: fmtDate(c.due_date) },
    { label: "Days Left", value: timing || "—", color: days < 0 ? "text-red-500" : days === 0 ? "text-amber-600" : "text-green-dark" },
    { label: "Fulfillment", value: `${fmtProgressPct(progress)}%`, numeric: true },
  ];
  return (
    <div className="min-w-0">
      <button type="button" onClick={onBack}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-brown-mid transition-colors hover:bg-white hover:text-green-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/25">
        <LuArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to contracts
      </button>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="min-w-0 rounded-2xl border border-beige-dark bg-white p-5 shadow-card sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-xs font-medium text-brown-light">{c.contract_number}</p>
              <h2 className="mt-1 text-lg font-bold text-brown-dark">Contract Progress</h2>
            </div>
            <ContractStatusBadge status={c.status} />
          </div>
          <p className="mt-7 text-sm font-semibold text-brown-mid">
            {Number(c.contracted_tons ?? 0).toLocaleString("en-PH")} Tons Agreed
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-green-dark sm:text-4xl">
            {(deliveredKg / 1000).toFixed(2)} Tons Accepted
          </p>
          <div className="mt-7">
            <p className="mb-2 text-xs font-medium text-brown-light">Fulfillment</p>
            <ContractProgress value={progress} status={c.status} />
            <p className="mt-2 text-[11px] text-brown-light">Rejected and pending allocations are excluded from fulfillment.</p>
          </div>
          <dl className="mt-7 grid grid-cols-1 gap-3 rounded-2xl bg-beige p-4 min-[480px]:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-brown-light">Negotiated Price</dt>
              <dd className="mt-1 break-words text-right text-xs font-bold tabular-nums text-brown-dark">{peso(c.negotiated_price_per_kg)}/kg</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-brown-light">Due Date</dt>
              <dd className="mt-1 text-xs font-bold text-brown-dark">{fmtDate(c.due_date)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-brown-light">Days Remaining</dt>
              <dd className={`mt-1 text-xs font-bold ${days < 0 ? "text-red-500" : "text-green-dark"}`}>{timing || "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="min-w-0 rounded-2xl border border-beige-dark bg-white p-5 shadow-card sm:p-7">
          <p className="break-words text-xs font-medium text-brown-light">{c.contract_number}</p>
          <h2 className="mt-1 text-lg font-bold text-brown-dark">Contract Details</h2>
          <dl className="mt-5 divide-y divide-beige-dark/55">
            {fields.map(field => (
              <div key={field.label} className="flex flex-col gap-1 py-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between min-[480px]:gap-5">
                <dt className="shrink-0 text-xs text-brown-light">{field.label}</dt>
                <dd className={`min-w-0 break-words text-sm font-bold ${field.numeric ? "text-right tabular-nums" : "text-left"} ${field.color || "text-brown-dark"}`}>{field.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex justify-end border-t border-beige-dark/55 pt-5">
            <OwnerContractActions contract={c} onViewContract={onViewContract} onViewBatches={onViewBatches} />
          </div>
        </section>
      </div>
    </div>
  );
}

const BATCH_STATUS_META = {
  Pending: { label: "Pending", color: "border-beige-dark bg-beige text-brown-mid" },
  Weighed: { label: "Weighed", color: "border-blue-200 bg-blue-50 text-blue-700" },
  Inspected: { label: "Lab Assessment", color: "border-amber-200 bg-amber-50 text-amber-700" },
  "Lab Assessment": { label: "Lab Assessment", color: "border-amber-200 bg-amber-50 text-amber-700" },
  Accepted: { label: "Accepted", color: "border-green-200 bg-green-50 text-green-700" },
  Rejected: { label: "Rejected", color: "border-red-200 bg-red-50 text-red-700" },
};

function BatchStatusBadge({ status }) {
  const meta = BATCH_STATUS_META[status] ?? { label: status || "Pending", color: "border-beige-dark bg-beige text-brown-mid" };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-1 text-[9px] font-bold lg:px-2.5 lg:text-[11px] ${meta.color}`}>{meta.label}</span>;
}

function batchWeight(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

const OWNER_BATCH_COLUMNS = [
  { label: "Batch", width: 13 },
  { label: "Date", width: 14 },
  { label: "Truck", width: 9 },
  { label: "Gross Weight", width: 14, numeric: true },
  { label: "Tare Weight", width: 13, numeric: true },
  { label: "Net Weight", width: 14, numeric: true },
  { label: "Moisture", width: 10, numeric: true },
  { label: "Status", width: 13 },
];

function OwnerBatchTable({ batches }) {
  const rows = batches.map((allocation, index) => {
    const d = allocation.delivery;
    const wr = Array.isArray(d?.weighing_records) ? d.weighing_records[0] : d?.weighing_records;
    const inspection = Array.isArray(d?.laboratory_inspections) ? d.laboratory_inspections[0] : d?.laboratory_inspections;
    const moisture = inspection?.moisture_content_pct;
    // Use fetched net weight unchanged. Tare is a display-only difference when not fetched.
    const tare = wr?.tare_weight_kg ?? (
      wr?.gross_weight_kg != null && wr?.net_weight_kg != null
        ? Number(wr.gross_weight_kg) - Number(wr.net_weight_kg) : null
    );
    const batchNumber = d?.batch_number;
    return {
      key: `${d?.delivery_id ?? "batch"}-${allocation.sequence_order ?? index}`,
      cells: [
        batchNumber == null ? `Batch ${index + 1}` : /^batch\b/i.test(String(batchNumber)) ? batchNumber : `Batch ${batchNumber}`,
        d?.delivery_date ? new Date(d.delivery_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—",
        d?.truck_plate_number || "—",
        batchWeight(wr?.gross_weight_kg),
        batchWeight(tare),
        batchWeight(wr?.net_weight_kg),
        moisture == null ? "—" : `${Number(moisture).toLocaleString("en-PH", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`,
        <BatchStatusBadge key="status" status={d?.delivery_status} />,
      ],
    };
  });
  return (
    <>
      <div className="hidden max-h-[50vh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-beige-dark/50 md:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">Delivery batches for this contract</caption>
          <colgroup>{OWNER_BATCH_COLUMNS.map(col => <col key={col.label} style={{ width: `${col.width}%` }} />)}</colgroup>
          <thead>
            <tr>
              {OWNER_BATCH_COLUMNS.map(col => (
                <th key={col.label} scope="col" className={`sticky top-0 z-20 whitespace-nowrap border-b border-beige-dark bg-beige px-2 py-3.5 text-[9px] font-bold text-brown-light lg:text-[11px] ${col.label === "Status" ? "text-center" : col.numeric ? "text-right" : "text-left"}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="group bg-white transition-colors duration-150 ease-out hover:bg-beige/60 focus-within:bg-beige/60">
                {row.cells.map((cell, i) => (
                  <td key={i} className={`border-b border-beige-dark/30 px-2 py-4 align-middle text-brown-mid ${OWNER_BATCH_COLUMNS[i].label === "Status" ? "text-center" : OWNER_BATCH_COLUMNS[i].numeric ? "text-right tabular-nums" : "text-left"} ${i === 0 ? "border-l-[5px] border-l-transparent font-bold text-brown-dark transition-colors duration-150 ease-out group-hover:border-l-brown-dark group-focus-within:border-l-brown-dark" : ""} ${i === 5 ? "font-extrabold text-brown-dark" : ""}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map(row => (
          <article key={row.key} className="rounded-xl border border-beige-dark/50 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-brown-dark">{row.cells[0]}</h3>
              {row.cells[7]}
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              {row.cells.slice(1, 7).map((cell, i) => {
                const col = OWNER_BATCH_COLUMNS[i + 1];
                return <div key={col.label} className="min-w-0">
                  <dt className={`text-[10px] text-brown-light ${col.numeric ? "text-right" : "text-left"}`}>{col.label}</dt>
                  <dd className={`mt-1 break-words text-sm text-brown-mid ${col.numeric ? "text-right tabular-nums" : "text-left"} ${i === 4 ? "font-extrabold text-brown-dark" : ""}`}>{cell}</dd>
                </div>;
              })}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="owner-batches-title" className="bg-white rounded-2xl border border-beige-dark/70 shadow-sm w-full max-w-7xl flex flex-col overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-7 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-beige-dark/20 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
              <LuTruck className="w-6 h-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 id="owner-batches-title" className="text-lg font-bold text-brown-dark">Delivery Batches</h2>
              <p className="text-sm text-brown-light break-words">{contract.contract_number} · {contract.supplier?.first_name} {contract.supplier?.last_name}</p>
            </div>
          </div>
          <button type="button" aria-label="Close delivery batches" onClick={onClose} className="flex h-11 w-11 items-center justify-center text-brown-light hover:text-brown-dark transition-colors shrink-0">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-7 py-5 md:overflow-hidden">
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
            <OwnerBatchTable batches={batches} />
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
