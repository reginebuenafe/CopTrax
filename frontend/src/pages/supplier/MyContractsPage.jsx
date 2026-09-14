import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  LuFileText, LuMessageSquare, LuCalendar, LuChevronDown, LuTruck, LuArrowLeft,
  LuSearch, LuX, LuLoader, LuPackage,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ContractDocumentModal from "../../components/ContractDocumentModal";
import { MotionDiv } from "../../components/landing/motion-elements";

const STATUS_META = {
  Pending:   { label: "Pending",   color: "bg-beige text-brown-mid",        dot: "bg-brown-light" },
  "Pending Owner Review": { label: "Pending Review", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  Active:    { label: "Active",    color: "bg-green-pale text-green-dark",   dot: "bg-green-mid" },
  Completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700",  dot: "bg-emerald-500" },
  Breached:  { label: "Breached",  color: "bg-red-50 text-red-600",          dot: "bg-red-500" },
};

const CONTRACT_VIEWS = {
  Active: { label: "Active Contracts", statuses: ["Pending", "Active"] },
  Past: { label: "Past Contracts", statuses: ["Completed", "Breached"] },
};

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

function daysLabel(days) {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}

function contractMatchesSearch(contract, query) {
  const term = query.trim().toLowerCase();
  if (!term) return true;

  const dates = [contract.created_at, contract.signing_date, contract.activation_date, contract.due_date]
    .filter(Boolean)
    .flatMap(date => [date, fmtDate(date), new Date(date).toLocaleDateString("en-PH")]);

  return [contract.contract_number, contract.contract_id, ...dates]
    .some(value => String(value ?? "").toLowerCase().includes(term));
}

export default function MyContractsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [contractView, setContractView] = useState("Active");
  const [statusFilter, setStatusFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContractId, setSelectedContractId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [batchesModal, setBatchesModal] = useState(null); // contract object
  const [viewContract, setViewContract] = useState(null); // { contractId, contractNumber, documentPath }
  const realtimeRefreshTimer = useRef(null);

  const fetchContracts = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);

    // 1. Fetch contracts belonging to this Supplier
    const { data: contractData, error: contractErr } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, status, created_at,
        contract_hash, contract_document_url, activation_date
      `)
      .eq("supplier_id", user.id)
      .order("created_at", { ascending: false });

    if (contractErr || !contractData || contractData.length === 0) {
      setContracts(contractData ?? []);
      setLoading(false);
      return;
    }

    const ids = contractData.map(c => c.contract_id);

    // 2. Fetch delivered weight from delivery_allocations (Accepted deliveries only)
    const { data: allocData } = await supabase
      .from("delivery_allocations")
      .select("contract_id, allocated_weight_kg, delivery:delivery_id(delivery_status)")
      .in("contract_id", ids);

    const acceptedKgMap = {};
    for (const alloc of (allocData ?? [])) {
      if (alloc.delivery?.delivery_status === "Accepted") {
        acceptedKgMap[alloc.contract_id] =
          (acceptedKgMap[alloc.contract_id] ?? 0) + Number(alloc.allocated_weight_kg ?? 0);
      }
    }

    // 3. Fetch conversation IDs linked to these contracts
    const { data: convData } = await supabase
      .from("conversations")
      .select("conversation_id, contract_id")
      .in("contract_id", ids);

    const convMap = {};
    for (const cv of (convData ?? [])) {
      if (cv.contract_id) convMap[cv.contract_id] = cv.conversation_id;
    }

    // Auto-breach any overdue Active contracts before rendering
    await supabase.rpc("auto_breach_overdue_contracts");

    // Re-fetch statuses after potential breach updates
    const { data: refreshedData } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, status, created_at,
        contract_hash, contract_document_url, activation_date
      `)
      .eq("supplier_id", user.id)
      .order("created_at", { ascending: false });

    const finalData = refreshedData ?? contractData;
    setContracts(finalData.map(c => ({
      ...c,
      delivered_kg: acceptedKgMap[c.contract_id] ?? 0,
      conversation_id: convMap[c.contract_id] ?? null,
    })));
    setLoading(false);
  }, [user.id]);

  useEffect(() => { (async () => { await fetchContracts({ showLoading: true }); })(); }, [fetchContracts]);

  // Keep contract cards, fulfillment totals, and conversation links current.
  useEffect(() => {
    function scheduleRefresh() {
      clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => fetchContracts(), 150);
    }

    const channel = supabase
      .channel(`supplier-contracts:${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "contracts", filter: `supplier_id=eq.${user.id}`,
      }, scheduleRefresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "conversations", filter: `supplier_id=eq.${user.id}`,
      }, scheduleRefresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "deliveries", filter: `supplier_id=eq.${user.id}`,
      }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_allocations" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "weighing_records" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "laboratory_inspections" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quality_results" }, scheduleRefresh)
      .subscribe();

    return () => {
      clearTimeout(realtimeRefreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user.id, fetchContracts]);

  const viewStatuses = CONTRACT_VIEWS[contractView].statuses;
  const viewContracts = contracts.filter(c => viewStatuses.includes(c.status));
  const availableYears = [...new Set(viewContracts
    .map(c => c.created_at ? new Date(c.created_at).getFullYear() : null)
    .filter(Boolean))].sort((a, b) => b - a);
  const filtered = viewContracts
    .filter(c => contractMatchesSearch(c, searchQuery))
    .filter(c => statusFilter === "All" || c.status === statusFilter)
    .filter(c => yearFilter === "All" || new Date(c.created_at).getFullYear() === Number(yearFilter))
    .sort((a, b) => sortOrder === "newest"
      ? new Date(b.created_at) - new Date(a.created_at)
      : new Date(a.created_at) - new Date(b.created_at));
  const selectedContract = filtered.find(c => c.contract_id === selectedContractId) ?? null;

  function changeContractView(nextView) {
    setContractView(nextView);
    setStatusFilter("All");
    setYearFilter("All");
    setSearchQuery("");
    setSelectedContractId(null);
  }

  return (
    <div className="pt-6 pb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-black text-brown-dark">My Contracts</h1>
        <p className="text-brown-light text-sm mt-0.5">All negotiated contracts with NERC Copra Trading</p>
      </div>

      {/* Active / past segmented toggle + search */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative inline-grid w-fit grid-cols-2 rounded-full border border-beige-dark bg-beige-dark p-1 shadow-sm">
          {Object.entries(CONTRACT_VIEWS).map(([key, option]) => {
            const selected = contractView === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => changeContractView(key)}
                className={`relative rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors duration-300 sm:px-5 ${selected ? "text-brown-dark" : "text-brown-light hover:text-brown-mid"}`}
              >
                {selected && (
                  <MotionDiv
                    layoutId="contract-view-pill"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_2px_6px_rgba(62,39,35,0.16)]"
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>

        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search contracts by contract ID or date</span>
          <LuSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-light/70" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSelectedContractId(null); }}
            placeholder="Search by ID or date..."
            className="w-full rounded-full border border-beige-dark bg-white py-2.5 pl-11 pr-4 text-xs font-medium text-brown-dark shadow-sm outline-none transition-all duration-300 placeholder:text-brown-light/60 hover:border-brown-light/40 focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
          />
        </label>
      </div>

      {/* Contract filter surface */}
      <div className="mt-3 rounded-2xl border border-green-dark/10 bg-[#1b5e20] px-4 py-5 shadow-card sm:px-6 sm:py-6">
        <p className="text-sm font-semibold text-white">Contract Filter</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
          <select
            aria-label="Filter contracts by status"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setSelectedContractId(null); }}
            className="w-full appearance-none rounded-full border border-beige-dark bg-white py-2.5 pl-4 pr-10 text-xs font-semibold text-brown-mid shadow-sm outline-none transition-all duration-300 hover:border-brown-light/40 focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
          >
            <option value="All">All statuses</option>
            {viewStatuses.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
          <LuChevronDown className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brown-light" />
          </div>
          <div className="relative">
          <select
            aria-label="Filter contracts by year"
            value={yearFilter}
            onChange={e => { setYearFilter(e.target.value); setSelectedContractId(null); }}
            className="w-full appearance-none rounded-full border border-beige-dark bg-white py-2.5 pl-4 pr-10 text-xs font-semibold text-brown-mid shadow-sm outline-none transition-all duration-300 hover:border-brown-light/40 focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
          >
            <option value="All">All years</option>
            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <LuChevronDown className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brown-light" />
          </div>
          <div className="relative">
          <select
            aria-label="Sort contracts"
            value={sortOrder}
            onChange={e => { setSortOrder(e.target.value); setSelectedContractId(null); }}
            className="w-full appearance-none rounded-full border border-beige-dark bg-white py-2.5 pl-4 pr-10 text-xs font-semibold text-brown-mid shadow-sm outline-none transition-all duration-300 hover:border-brown-light/40 focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <LuChevronDown className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brown-light" />
          </div>
        </div>

        {!loading && (
          <p className="mt-4 text-right text-xs font-medium text-white/80">
            {filtered.length} of {viewContracts.length} Contracts
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        searchQuery.trim() ? (
          <div className="mt-5 rounded-2xl border border-beige-dark/70 bg-white px-4 py-20 text-center shadow-card">
            <p className="font-semibold text-brown-dark">No Contracts Found</p>
          </div>
        ) : (
          <div className="mt-5 bg-white border border-beige-dark/70 rounded-2xl flex flex-col items-center justify-center py-20 text-center px-4 shadow-card">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuFileText className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">No contracts {statusFilter !== "All" ? `with status "${statusFilter}"` : "yet"}</p>
            <p className="text-brown-light text-sm mt-1">
              {statusFilter === "All" ? "Start a negotiation to get your first contract." : "Try a different filter."}
            </p>
            {contractView === "Active" && statusFilter === "All" && (
              <button onClick={() => navigate("/dashboard/supplier/conversations")}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-dark text-white font-bold text-sm hover:bg-green-mid hover:-translate-y-0.5 transition-all">
                <LuMessageSquare className="w-4 h-4" /> Start a Negotiation
              </button>
            )}
          </div>
        )
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <MotionDiv
            key={selectedContract ? `detail-${selectedContract.contract_id}` : `list-${contractView}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
          >
            {selectedContract ? (
              <ContractMasterDetail
                contract={selectedContract}
                onBack={() => setSelectedContractId(null)}
                onViewContract={setViewContract}
                onViewBatches={setBatchesModal}
                onViewChat={conversationId => navigate(`/dashboard/supplier/conversations/${conversationId}`)}
              />
            ) : (
              <div className="space-y-4">
                {filtered.map(c => (
                  <ContractListCard
                    key={c.contract_id}
                    contract={c}
                    onSelect={() => setSelectedContractId(c.contract_id)}
                    onViewContract={setViewContract}
                    onViewBatches={setBatchesModal}
                    onViewChat={conversationId => navigate(`/dashboard/supplier/conversations/${conversationId}`)}
                  />
                ))}
              </div>
            )}
          </MotionDiv>
        </AnimatePresence>
      )}

      {/* Delivery Batches Modal */}
      {batchesModal && (
        <SupplierBatchesModal contract={batchesModal} userId={user.id} onClose={() => setBatchesModal(null)} />
      )}

      {/* Contract Document Modal */}
      {viewContract && (
        <ContractDocumentModal
          contractId={viewContract.contractId}
          contractNumber={viewContract.contractNumber}
          documentPath={viewContract.documentPath}
          onClose={() => setViewContract(null)}
        />
      )}
    </div>
  );
}

function ContractListCard({ contract: c, onSelect, onViewContract, onViewBatches, onViewChat }) {
  const meta = STATUS_META[c.status] ?? STATUS_META.Pending;
  const days = daysLeft(c.due_date);
  const contractedKg = Number(c.contracted_tons ?? 0) * 1000;
  const deliveredKg = c.delivered_kg ?? 0;
  const remainingKg = Math.max(0, contractedKg - deliveredKg);
  const fulfillment = contractedKg > 0 ? Math.min(100, (deliveredKg / contractedKg) * 100) : 0;

  return (
    <article
      tabIndex={0}
      aria-label={`Open details for ${c.contract_number}`}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer rounded-2xl border border-beige-dark bg-white p-4 shadow-card outline-none transition-all duration-300 hover:-translate-y-0.5 hover:border-green-dark/25 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-green-dark/25 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <p className="break-words font-extrabold tracking-wide text-brown-dark">{c.contract_number}</p>
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${meta.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-brown-light">
            <LuCalendar className="h-3.5 w-3.5 shrink-0" />
            Created {fmtDate(c.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {c.contract_document_url && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onViewContract({
                  contractId: c.contract_id,
                  contractNumber: c.contract_number,
                  documentPath: c.contract_document_url,
                });
              }}
              className="flex items-center gap-1.5 rounded-full border border-beige-dark bg-beige px-4 py-2 text-xs font-semibold text-brown-mid shadow-sm transition-all hover:-translate-y-0.5 hover:bg-beige-dark hover:text-brown-dark"
            >
              <LuFileText className="h-3.5 w-3.5" /> View Contract
            </button>
          )}
          {c.conversation_id && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onViewChat(c.conversation_id); }}
              className="flex items-center gap-1.5 rounded-full border border-beige-dark bg-beige px-4 py-2 text-xs font-semibold text-brown-mid shadow-sm transition-all hover:-translate-y-0.5 hover:bg-beige-dark hover:text-brown-dark"
            >
              <LuMessageSquare className="h-3.5 w-3.5" /> View Chat
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agreed Price" value={peso(c.negotiated_price_per_kg) + "/kg"} />
        <Stat label="Agreed Quantity" value={`${Number(c.contracted_tons).toLocaleString()} tons`} />
        <Stat label="Delivered Qty" value={`${(deliveredKg / 1000).toFixed(2)} tons`} highlighted />
        <Stat label="Remaining Qty" value={`${(remainingKg / 1000).toFixed(2)} tons`} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="text-xs text-brown-light">Fulfillment</p>
          <span className="whitespace-nowrap text-xs font-bold text-brown-mid">{fulfillment.toFixed(1)}%</span>
        </div>
        <ProgressBar value={fulfillment} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-beige-dark/35 pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-brown-light">
          <span>Activation Date <strong className="text-brown-dark">{fmtDate(c.activation_date)}</strong></span>
          <span>Delivery Deadline <strong className="text-brown-dark">{fmtDate(c.due_date)}</strong></span>
          <span className={days !== null && days < 0 ? "text-red-500" : ""}>{daysLabel(days)}</span>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onViewBatches(c); }}
          className="flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-brown-mid transition-colors hover:bg-beige hover:text-green-dark"
        >
          <LuChevronDown className="h-3.5 w-3.5" /> Batches
        </button>
      </div>
    </article>
  );
}

function ContractMasterDetail({ contract: c, onBack, onViewContract, onViewBatches, onViewChat }) {
  const meta = STATUS_META[c.status] ?? STATUS_META.Pending;
  const days = daysLeft(c.due_date);
  const contractedKg = Number(c.contracted_tons ?? 0) * 1000;
  const deliveredKg = c.delivered_kg ?? 0;
  const remainingKg = Math.max(0, contractedKg - deliveredKg);
  const fulfillment = contractedKg > 0 ? Math.min(100, (deliveredKg / contractedKg) * 100) : 0;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-brown-mid transition-colors hover:bg-white hover:text-green-dark"
      >
        <LuArrowLeft className="h-4 w-4" /> Back to contracts
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-2xl border border-beige-dark bg-white p-5 shadow-card sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-brown-light">{c.contract_number}</p>
              <h2 className="mt-1 text-lg font-bold text-brown-dark">Contract Progress</h2>
            </div>
            <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${meta.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>

          <p className="mt-7 text-sm font-semibold text-brown-mid">
            {Number(c.contracted_tons).toLocaleString()} Tons Agreed
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-green-dark sm:text-4xl">
            {(deliveredKg / 1000).toFixed(2)} Tons Delivered
          </p>

          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-brown-light">Fulfillment</span>
              <span className="text-sm font-extrabold text-green-dark">{fulfillment.toFixed(1)}%</span>
            </div>
            <ProgressBar value={fulfillment} />
          </div>

          <div className="mt-7 grid grid-cols-1 gap-3 rounded-2xl bg-beige p-4 sm:grid-cols-3">
            <MiniMetric label="Negotiated Price" value={peso(c.negotiated_price_per_kg) + "/kg"} />
            <MiniMetric label="Due Date" value={fmtDate(c.due_date)} />
            <MiniMetric label="Days Remaining" value={daysLabel(days)} valueClass={days !== null && days < 0 ? "text-red-500" : "text-brown-dark"} />
          </div>
        </section>

        <section className="rounded-2xl border border-beige-dark bg-white p-5 shadow-card sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-brown-light">{c.contract_number}</p>
              <h2 className="mt-1 text-lg font-bold text-brown-dark">Contract Details</h2>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-beige-dark/55">
            <DetailRow label="Created" value={fmtDate(c.created_at)} />
            <DetailRow label="Status" value={meta.label} valueClass="text-green-dark" />
            <DetailRow label="Agreed Price" value={peso(c.negotiated_price_per_kg) + "/kg"} />
            <DetailRow label="Agreed Quantity" value={`${Number(c.contracted_tons).toLocaleString()} tons`} />
            <DetailRow label="Delivered Qty" value={`${(deliveredKg / 1000).toFixed(2)} tons`} valueClass="text-green-dark" />
            <DetailRow label="Remaining Qty" value={`${(remainingKg / 1000).toFixed(2)} tons`} />
            <DetailRow label="Activation Date" value={fmtDate(c.activation_date)} />
            <DetailRow label="Delivery Deadline" value={fmtDate(c.due_date)} />
            <DetailRow label="Days Left" value={daysLabel(days)} valueClass={days !== null && days < 0 ? "text-red-500" : "text-brown-dark"} />
            <DetailRow label="Fulfillment" value={`${fulfillment.toFixed(1)}%`} valueClass="text-green-dark" />
          </dl>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-beige-dark/55 pt-5">
            {c.contract_document_url && (
              <button
                type="button"
                onClick={() => onViewContract({
                  contractId: c.contract_id,
                  contractNumber: c.contract_number,
                  documentPath: c.contract_document_url,
                })}
                className="flex items-center gap-1.5 rounded-full border border-beige-dark bg-beige px-4 py-2 text-xs font-semibold text-brown-mid shadow-sm transition-all hover:-translate-y-0.5 hover:bg-beige-dark hover:text-brown-dark"
              >
                <LuFileText className="h-3.5 w-3.5" /> View Contract
              </button>
            )}
            <button
              type="button"
              onClick={() => onViewBatches(c)}
              className="flex items-center gap-1.5 rounded-full border border-beige-dark bg-beige px-4 py-2 text-xs font-semibold text-brown-mid shadow-sm transition-all hover:-translate-y-0.5 hover:bg-beige-dark hover:text-brown-dark"
            >
              <LuTruck className="h-3.5 w-3.5" /> Batches
            </button>
            {c.conversation_id && (
              <button
                type="button"
                onClick={() => onViewChat(c.conversation_id)}
                className="flex items-center gap-1.5 rounded-full border border-beige-dark bg-beige px-4 py-2 text-xs font-semibold text-brown-mid shadow-sm transition-all hover:-translate-y-0.5 hover:bg-beige-dark hover:text-brown-dark"
              >
                <LuMessageSquare className="h-3.5 w-3.5" /> View Chat
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, highlighted = false }) {
  return (
    <div className={`min-w-0 rounded-xl border-2 border-beige-dark px-4 py-3 ${highlighted ? "bg-green-pale" : "bg-white"}`}>
      <p className="mb-0.5 text-xs text-brown-light">{label}</p>
      <p className="break-words text-sm font-semibold text-brown-dark">{value}</p>
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-beige-dark">
      <div
        className={`h-full rounded-full transition-all duration-500 ${value >= 100 ? "bg-green-dark" : value > 50 ? "bg-green-mid" : "bg-amber-400"}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function MiniMetric({ label, value, valueClass = "text-brown-dark" }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-brown-light">{label}</p>
      <p className={`mt-1 break-words text-xs font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value, valueClass = "text-brown-dark" }) {
  return (
    <div className="flex items-start justify-between gap-5 py-3">
      <dt className="text-xs text-brown-light">{label}</dt>
      <dd className={`text-right text-sm font-bold ${valueClass}`}>{value}</dd>
    </div>
  );
}

const BATCH_STATUS_META = {
  Pending: {
    label: "Pending",
    color: "border-beige-dark bg-beige text-brown-mid",
  },
  Weighed: {
    label: "Weighed",
    color: "border-blue-200 bg-blue-50 text-blue-700",
  },
  Inspected: {
    label: "Lab Assessment",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  Accepted: {
    label: "Accepted",
    color: "border-green-200 bg-green-50 text-green-700",
  },
  Rejected: {
    label: "Rejected",
    color: "border-red-200 bg-red-50 text-red-700",
  },
};

function batchDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function batchWeight(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kg`;
}

function batchMoisture(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

function BatchStatusBadge({ status }) {
  const meta = BATCH_STATUS_META[status] ?? {
    label: status || "Pending",
    color: "border-beige-dark bg-beige text-brown-mid",
  };

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function MobileBatchField({ label, value, numeric = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-beige-dark/20 py-2.5 last:border-0">
      <dt className="text-xs font-medium text-brown-light">{label}</dt>
      <dd className={`text-sm font-semibold text-brown-dark ${numeric ? "text-right tabular-nums" : "text-right"}`}>
        {value}
      </dd>
    </div>
  );
}

function SupplierBatchesModal({ contract, userId, onClose }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const realtimeRefreshTimer = useRef(null);

  const loadBatches = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    const { data } = await supabase
      .from("delivery_allocations")
      .select(`
        allocation_id, allocated_weight_kg, price_type, sequence_order,
        delivery:delivery_id(
          delivery_id, batch_number, delivery_date, delivery_status, truck_plate_number,
          weighing_records(gross_weight_kg, tare_weight_kg, copra_condition),
          laboratory_inspections(moisture_content_pct)
        )
      `)
      .eq("contract_id", contract.contract_id)
      .order("sequence_order", { ascending: true });
    setBatches(data ?? []);
    setLoading(false);
  }, [contract.contract_id]);

  useEffect(() => {
    (async () => { await loadBatches({ showLoading: true }); })();
  }, [loadBatches]);

  useEffect(() => {
    function scheduleRefresh() {
      clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => loadBatches(), 150);
    }

    const channel = supabase
      .channel(`supplier-contract-batches:${contract.contract_id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "delivery_allocations", filter: `contract_id=eq.${contract.contract_id}`,
      }, scheduleRefresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "deliveries", filter: `supplier_id=eq.${userId}`,
      }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "weighing_records" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "laboratory_inspections" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quality_results" }, scheduleRefresh)
      .subscribe();

    return () => {
      clearTimeout(realtimeRefreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [contract.contract_id, userId, loadBatches]);

  const rows = batches.map((allocation, index) => {
    const delivery = allocation.delivery;
    const weighing = delivery?.weighing_records?.[0];
    const inspection = delivery?.laboratory_inspections?.[0];
    const grossWeight = weighing?.gross_weight_kg;
    const tareWeight = weighing?.tare_weight_kg;
    const hasWeights = grossWeight !== null && grossWeight !== undefined
      && tareWeight !== null && tareWeight !== undefined;

    return {
      key: allocation.allocation_id ?? delivery?.delivery_id ?? index,
      batch: delivery?.batch_number ?? `Batch ${index + 1}`,
      date: delivery?.delivery_date,
      truck: delivery?.truck_plate_number || "—",
      grossWeight,
      tareWeight,
      netWeight: hasWeights ? Number(grossWeight) - Number(tareWeight) : null,
      moisture: inspection?.moisture_content_pct,
      status: delivery?.delivery_status,
    };
  }).sort((a, b) => a.batch.localeCompare(b.batch, "en", { numeric: true, sensitivity: "base" }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 backdrop-blur-sm sm:p-4">
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-beige-dark bg-white shadow-card sm:max-h-[88vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-batches-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-beige-dark/30 px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <LuTruck className="h-6 w-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 id="delivery-batches-title" className="text-lg font-bold text-brown-dark">Delivery Batches</h2>
              <p className="break-words text-sm text-brown-light">{contract.contract_number}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close delivery batches"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brown-light transition-colors hover:bg-beige hover:text-brown-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/25"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-7">
          {loading ? (
            <div className="flex items-center justify-center py-16" role="status" aria-label="Loading delivery batches">
              <LuLoader className="h-6 w-6 animate-spin text-brown-light" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-beige">
                <LuPackage className="h-6 w-6 text-brown-light" />
              </div>
              <p className="font-semibold text-brown-dark">No delivery batches yet</p>
              <p className="mt-1 text-sm text-brown-light">Delivered batches under this contract will appear here.</p>
            </div>
          ) : (
            <>
              <div className="hidden rounded-xl border border-beige-dark/50 md:block">
                <table className="min-w-[1120px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-beige-dark/50">
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Batch</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Date</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Truck</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Gross Weight</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Tare Weight</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Net Weight</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Moisture</th>
                      <th scope="col" className="sticky top-0 z-10 bg-beige px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige-dark/30">
                    {rows.map(row => (
                      <tr key={row.key} className="transition-colors hover:bg-beige/50">
                        <td className="whitespace-nowrap px-4 py-3.5 font-bold text-brown-dark">{row.batch}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-brown-mid">{batchDate(row.date)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-medium text-brown-mid">{row.truck}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-brown-mid">{batchWeight(row.grossWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-brown-mid">{batchWeight(row.tareWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-bold tabular-nums text-brown-dark">{batchWeight(row.netWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-brown-mid">{batchMoisture(row.moisture)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5"><BatchStatusBadge status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map(row => (
                  <article key={row.key} className="rounded-2xl border border-beige-dark/50 bg-white p-4 shadow-sm">
                    <div className="flex min-h-11 items-start justify-between gap-3 border-b border-beige-dark/30 pb-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-brown-light">Batch</p>
                        <h3 className="break-words text-base font-extrabold text-brown-dark">{row.batch}</h3>
                      </div>
                      <BatchStatusBadge status={row.status} />
                    </div>
                    <dl className="pt-1">
                      <MobileBatchField label="Date" value={batchDate(row.date)} />
                      <MobileBatchField label="Truck" value={row.truck} />
                      <MobileBatchField label="Gross Weight" value={batchWeight(row.grossWeight)} numeric />
                      <MobileBatchField label="Tare Weight" value={batchWeight(row.tareWeight)} numeric />
                      <MobileBatchField label="Net Weight" value={batchWeight(row.netWeight)} numeric />
                      <MobileBatchField label="Moisture" value={batchMoisture(row.moisture)} numeric />
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        {!loading && rows.length > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-beige-dark/30 px-4 py-4 sm:px-7">
            <span className="text-sm text-brown-light">{rows.length} batch{rows.length !== 1 ? "es" : ""}</span>
            <span className="text-right font-bold text-brown-dark">
              {(batches.reduce((sum, item) => sum + Number(item.allocated_weight_kg ?? 0), 0) / 1000).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} tons Allocated
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
