import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  LuFileText, LuMessageSquare, LuChevronDown, LuTruck, LuArrowLeft,
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

const CONTRACT_TABS = ["All", "Pending", "Active", "Completed", "Breached"];

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

function deadlineTimingLabel(days) {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}
// Truncates (never rounds up) to 1 decimal place so a near-100% but not
// actually fully-delivered contract can never display as a misleading
// "100.0%" — the DB's exact >= comparison is what decides Completed
// status, and the display must always agree with it.
function fmtProgressPct(value) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (Math.floor(safeValue * 10) / 10).toFixed(1);
}

function tons(value) {
  return `${Number(value ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} tons`;
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
  const [statusFilter, setStatusFilter] = useState("All");
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

  const filtered = contracts
    .filter(c => contractMatchesSearch(c, searchQuery))
    .filter(c => (
      statusFilter === "All"
      || (statusFilter === "Pending" && ["Pending", "Pending Owner Review"].includes(c.status))
      || c.status === statusFilter
    ))
    .sort((a, b) => sortOrder === "newest"
      ? new Date(b.created_at) - new Date(a.created_at)
      : new Date(a.created_at) - new Date(b.created_at));
  const selectedContract = filtered.find(c => c.contract_id === selectedContractId) ?? null;

  return (
    <div className="pt-6 pb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-black text-brown-dark">My Contracts</h1>
        <p className="text-brown-light text-sm mt-0.5">All negotiated contracts with NERC Copra Trading</p>
      </div>

      <div className="mt-6 flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <nav aria-label="Contract status filters" className="min-w-0 border-b border-beige-dark/70">
          <div className="flex min-w-full flex-wrap items-end gap-x-1 gap-y-1 sm:gap-x-3">
            {CONTRACT_TABS.map(status => {
              const selected = statusFilter === status;
              const tabCount = status === "All"
                ? contracts.length
                : contracts.filter(c => status === "Pending"
                  ? ["Pending", "Pending Owner Review"].includes(c.status)
                  : c.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => { setStatusFilter(status); setSelectedContractId(null); }}
                  className={`relative min-h-11 shrink-0 px-3 pb-3 pt-2 text-sm font-semibold transition-colors sm:px-4 ${selected ? "text-green-dark" : "text-brown-light hover:text-brown-dark"}`}
                >
                  {status}{(status === "All" || tabCount > 0) ? ` (${tabCount})` : ""}
                  {selected && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-green-dark" />}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row xl:w-auto xl:shrink-0">
          <label className="relative block min-w-0 flex-1 sm:min-w-64 xl:w-72">
            <span className="sr-only">Search contracts by contract ID or date</span>
            <LuSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-light/70" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedContractId(null); }}
              placeholder="Search contract # or date..."
              className="min-h-11 w-full rounded-xl border border-beige-dark bg-white py-2.5 pl-11 pr-4 text-sm font-medium text-brown-dark shadow-sm outline-none transition-all placeholder:text-brown-light/60 hover:border-brown-light/50 focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
            />
          </label>

          <label className="relative block w-full sm:w-44">
            <span className="sr-only">Sort contracts</span>
            <select
              aria-label="Sort contracts"
              value={sortOrder}
              onChange={e => { setSortOrder(e.target.value); setSelectedContractId(null); }}
              className="min-h-11 w-full appearance-none rounded-xl border border-beige-dark bg-white py-2.5 pl-4 pr-10 text-sm font-semibold text-brown-mid shadow-sm outline-none transition-all hover:border-brown-light/50 focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <LuChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-light" />
          </label>
        </div>
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
            {statusFilter === "All" && (
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
            key={selectedContract ? `detail-${selectedContract.contract_id}` : `list-${statusFilter}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
          >
            {selectedContract ? (
              <ContractMasterDetail
                contract={selectedContract}
                onBack={() => setSelectedContractId(null)}
                onViewContract={setViewContract}
                onViewBatches={setBatchesModal}
              />
            ) : (
              <ContractList
                contracts={filtered}
                totalCount={contracts.length}
                onSelect={contractId => setSelectedContractId(contractId)}
                onViewContract={setViewContract}
                onViewBatches={setBatchesModal}
              />
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

function contractDisplayValues(c) {
  const contractedKg = Number(c.contracted_tons ?? 0) * 1000;
  const deliveredKg = Number(c.delivered_kg ?? 0);
  const remainingKg = Math.max(0, contractedKg - deliveredKg);

  return {
    deliveredKg,
    remainingKg,
    // Completed contracts always display 100% regardless of the exact
    // computed fraction (display-only; does not change deliveredKg or
    // the Active/Breached completion logic itself).
    fulfillment: c.status === "Completed" ? 100 : (contractedKg > 0 ? Math.min(100, (deliveredKg / contractedKg) * 100) : 0),
    days: daysLeft(c.due_date),
  };
}

function ContractStatusBadge({ status, compact = false }) {
  const meta = STATUS_META[status] ?? STATUS_META.Pending;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full py-1 font-semibold ${compact ? "gap-1 px-2 text-[10px]" : "gap-1.5 px-2.5 text-[11px]"} ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function ContractActions({ contract: c, onViewContract, onViewBatches, revealOnRowInteraction = false }) {
  const buttonClass = "inline-flex h-11 w-11 shrink-0 items-center justify-center p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  const iconClass = "h-4 w-4";

  return (
    <div className={`flex shrink-0 items-center justify-center gap-1 ${revealOnRowInteraction ? "opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100" : ""}`}>
      <button
        type="button"
        aria-label="View Contract"
        title="View Contract"
        onClick={e => {
          e.stopPropagation();
          onViewContract({
            contractId: c.contract_id,
            contractNumber: c.contract_number,
            documentPath: c.contract_document_url,
          });
        }}
        className={`${buttonClass} text-brown-dark hover:text-brown-mid focus-visible:ring-brown-dark/25`}
      >
        <LuFileText aria-hidden="true" className={iconClass} />
      </button>
      <button
        type="button"
        aria-label="View Delivery Batches"
        title="View Batches"
        onClick={e => { e.stopPropagation(); onViewBatches(c); }}
        className={`${buttonClass} text-green-dark hover:text-green-mid focus-visible:ring-green-dark/25`}
      >
        <LuTruck aria-hidden="true" className={iconClass} />
      </button>
    </div>
  );
}

function ContractTableRow({ contract: c, isLast, onSelect, onViewContract, onViewBatches }) {
  const { deliveredKg, remainingKg, fulfillment, days } = contractDisplayValues(c);
  // Countdown ("N days left"/"overdue") only makes sense while a contract
  // is still Active — Completed/Breached contracts hide it (display-only).
  const timing = c.status === "Active" ? deadlineTimingLabel(days) : null;
  const rowBorder = isLast ? "" : "border-b border-beige-dark/40";

  return (
    <tr
      tabIndex={0}
      aria-label={`Open details for ${c.contract_number}`}
      onClick={() => onSelect(c.contract_id)}
      onKeyDown={e => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(c.contract_id);
        }
      }}
      className="group cursor-pointer bg-white outline-none transition-colors duration-150 ease-out hover:bg-beige/60 focus-within:bg-beige/60 focus-visible:bg-green-pale/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-dark/25"
    >
      <td className={`border-l-[5px] border-l-transparent px-2 py-4 text-left align-middle transition-colors duration-150 ease-out group-hover:border-l-brown-dark group-focus-within:border-l-brown-dark ${rowBorder}`}>
        <p className="font-extrabold tracking-wide text-brown-dark">{c.contract_number}</p>
        <p className="mt-1 whitespace-nowrap text-[10px] text-brown-light">Created {fmtDate(c.created_at)}</p>
      </td>
      <td className={`px-2 py-4 text-center align-middle ${rowBorder}`}><ContractStatusBadge status={c.status} compact /></td>
      <td className={`whitespace-nowrap px-2 py-4 text-right text-xs font-bold tabular-nums text-brown-dark ${rowBorder}`}>{peso(c.negotiated_price_per_kg)}</td>
      <td className={`px-2 py-4 text-right text-xs tabular-nums text-brown-mid ${rowBorder}`}>{tons(c.contracted_tons)}</td>
      <td className={`px-2 py-4 text-right text-xs tabular-nums text-brown-mid ${rowBorder}`}>{tons(deliveredKg / 1000)}</td>
      <td className={`px-2 py-4 text-right text-xs tabular-nums text-brown-mid ${rowBorder}`}>{tons(remainingKg / 1000)}</td>
      <td className={`px-2 py-4 text-left text-xs text-brown-mid ${rowBorder}`}>{fmtDate(c.activation_date)}</td>
      <td className={`px-2 py-4 text-left text-xs text-brown-mid ${rowBorder}`}>
        <p>{fmtDate(c.due_date)}</p>
        {timing && (
          <p className={`mt-1 text-[11px] font-semibold ${days < 0 ? "text-red-500" : days === 0 ? "text-amber-600" : "text-green-dark"}`}>
            {timing}
          </p>
        )}
      </td>
      <td className={`px-2 py-4 text-left align-middle ${rowBorder}`}>
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1"><ProgressBar value={fulfillment} status={c.status} /></div>
          <span className="w-10 whitespace-nowrap text-right text-[11px] font-extrabold tabular-nums text-brown-dark">{fmtProgressPct(fulfillment)}%</span>
        </div>
      </td>
      <td className={`px-0 py-4 text-left align-middle ${rowBorder}`}>
        <ContractActions
          contract={c}
          onViewContract={onViewContract}
          onViewBatches={onViewBatches}
          revealOnRowInteraction
        />
      </td>
    </tr>
  );
}

function ContractMobileCard({ contract: c, onSelect, onViewContract, onViewBatches }) {
  const { fulfillment } = contractDisplayValues(c);

  return (
    <article
      tabIndex={0}
      aria-label={`Open details for ${c.contract_number}`}
      onClick={() => onSelect(c.contract_id)}
      onKeyDown={e => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(c.contract_id);
        }
      }}
      className="cursor-pointer rounded-2xl border-2 border-beige-dark/80 bg-white p-4 shadow-card outline-none transition-colors hover:border-green-dark/30 focus-visible:ring-2 focus-visible:ring-green-dark/25"
    >
      <div className="border-b border-beige-dark/40 pb-3">
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate whitespace-nowrap font-extrabold tracking-wide text-brown-dark" title={c.contract_number}>
            {c.contract_number}
          </h2>
          <ContractStatusBadge status={c.status} />
          <ContractActions contract={c} onViewContract={onViewContract} onViewBatches={onViewBatches} />
        </div>
        <p className="mt-2 text-xs text-brown-light">Created {fmtDate(c.created_at)}</p>
      </div>

      <div className="py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-brown-light">Progress</span>
          <span className="whitespace-nowrap text-sm font-extrabold tabular-nums text-green-dark">{fmtProgressPct(fulfillment)}%</span>
        </div>
        <ProgressBar value={fulfillment} status={c.status} />
        <p className="mt-2 text-[11px] text-brown-light">Accepted allocated net weight only</p>
      </div>

    </article>
  );
}

function ContractList({ contracts, totalCount, onSelect, onViewContract, onViewBatches }) {
  return (
    <section aria-label="Contracts">
      <div className="hidden overflow-hidden rounded-2xl border border-beige-dark/70 bg-white shadow-card xl:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-base">
          <caption className="sr-only">Supplier contracts</caption>
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-beige">
            <tr className="text-left">
              <th scope="col" className="whitespace-nowrap rounded-tl-2xl border-b border-beige-dark/60 px-2 py-3.5 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Contract #</th>
              <th scope="col" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-center text-[11px] font-bold uppercase tracking-wide text-brown-light">Status</th>
              <th scope="col" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Price (₱/kg)</th>
              <th scope="col" title="Agreed Quantity" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Quantity</th>
              <th scope="col" title="Accepted allocated quantity" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Accepted</th>
              <th scope="col" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Remaining</th>
              <th scope="col" title="Activation Date" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Activated</th>
              <th scope="col" title="Delivery Deadline" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Deadline</th>
              <th scope="col" className="whitespace-nowrap border-b border-beige-dark/60 px-2 py-3.5 text-center text-[11px] font-bold uppercase tracking-wide text-brown-light">Progress</th>
              <th scope="col" className="rounded-tr-2xl border-b border-beige-dark/60 px-0 py-3.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c, idx) => (
              <ContractTableRow
                key={c.contract_id}
                contract={c}
                isLast={idx === contracts.length - 1}
                onSelect={onSelect}
                onViewContract={onViewContract}
                onViewBatches={onViewBatches}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {contracts.map(c => (
          <ContractMobileCard
            key={c.contract_id}
            contract={c}
            onSelect={onSelect}
            onViewContract={onViewContract}
            onViewBatches={onViewBatches}
          />
        ))}
      </div>

      <p className="mt-4 text-xs font-medium text-brown-light">
        Showing {contracts.length} of {totalCount} contract{totalCount === 1 ? "" : "s"}
      </p>
    </section>
  );
}

function ContractMasterDetail({ contract: c, onBack, onViewContract, onViewBatches }) {
  const meta = STATUS_META[c.status] ?? STATUS_META.Pending;
  const days = daysLeft(c.due_date);
  const contractedKg = Number(c.contracted_tons ?? 0) * 1000;
  const deliveredKg = c.delivered_kg ?? 0;
  const remainingKg = Math.max(0, contractedKg - deliveredKg);
  // Completed contracts always display 100% regardless of the exact
  // computed fraction (display-only; does not change deliveredKg or
  // the Active/Breached completion logic itself).
  const fulfillment = c.status === "Completed" ? 100 : (contractedKg > 0 ? Math.min(100, (deliveredKg / contractedKg) * 100) : 0);

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
            {(deliveredKg / 1000).toFixed(2)} Tons Accepted
          </p>

          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-brown-light">Fulfillment</span>
              <span className="text-sm font-extrabold text-green-dark">{fmtProgressPct(fulfillment)}%</span>
            </div>
            <ProgressBar value={fulfillment} status={c.status} />
            <p className="mt-2 text-[11px] text-brown-light">Rejected and pending allocations are excluded from fulfillment.</p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-3 rounded-2xl bg-beige p-4 sm:grid-cols-3">
            <MiniMetric label="Negotiated Price" value={peso(c.negotiated_price_per_kg) + "/kg"} />
            <MiniMetric label="Due Date" value={fmtDate(c.due_date)} />
            <MiniMetric label="Days Remaining" value={c.status === "Active" ? daysLabel(days) : "—"} valueClass={c.status === "Active" && days !== null && days < 0 ? "text-red-500" : "text-brown-dark"} />
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
            <DetailRow label="Price" value={peso(c.negotiated_price_per_kg) + "/kg"} />
            <DetailRow label="Quantity" value={`${Number(c.contracted_tons).toLocaleString()} tons`} />
            <DetailRow label="Accepted Qty" value={`${(deliveredKg / 1000).toFixed(2)} tons`} valueClass="text-green-dark" />
            <DetailRow label="Remaining Qty" value={`${(remainingKg / 1000).toFixed(2)} tons`} />
            <DetailRow label="Activation Date" value={fmtDate(c.activation_date)} />
            <DetailRow label="Delivery Deadline" value={fmtDate(c.due_date)} />
            <DetailRow label="Days Left" value={c.status === "Active" ? daysLabel(days) : "—"} valueClass={c.status === "Active" && days !== null && days < 0 ? "text-red-500" : "text-brown-dark"} />
            <DetailRow label="Fulfillment" value={`${fmtProgressPct(fulfillment)}%`} valueClass="text-green-dark" />
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
          </div>
        </section>
      </div>
    </div>
  );
}

function ProgressBar({ value, status }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const fillColor = status === "Breached"
    ? "bg-red-500"
    : safeValue < 34
      ? "bg-red-500"
      : safeValue < 67
        ? "bg-amber-400"
        : "bg-green-dark";

  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-beige-dark">
      <div
        className={`h-full rounded-full transition-all duration-500 ${fillColor}`}
        style={{ width: `${safeValue}%` }}
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
  })}cc`;
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
          delivery_id, batch_number, delivery_date, delivery_status, truck_plate_number, created_at,
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
      allocatedWeight: allocation.allocated_weight_kg,
      priceType: allocation.price_type ?? "Negotiated",
      createdAt: delivery?.created_at,
      sequenceOrder: allocation.sequence_order,
    };
  }).sort((a, b) => {
    const newestFirst = new Date(b.createdAt ?? b.date ?? 0) - new Date(a.createdAt ?? a.date ?? 0);
    if (newestFirst !== 0) return newestFirst;
    return Number(b.sequenceOrder ?? 0) - Number(a.sequenceOrder ?? 0);
  });
  const acceptedAllocatedKg = rows
    .filter(row => row.status === "Accepted")
    .reduce((sum, row) => sum + Number(row.allocatedWeight ?? 0), 0);
  const rejectedCount = rows.filter(row => row.status === "Rejected").length;

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

        <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-7 md:overflow-hidden">
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
              <div className="hidden max-h-[60vh] overflow-auto overscroll-contain rounded-xl border border-beige-dark/50 md:block">
                <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-base">
                  <thead>
                    <tr>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-brown-light">Batch</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-brown-light">Date</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-brown-light">Truck</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-brown-light">Gross Weight</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-brown-light">Tare Weight</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-brown-light">Net Weight</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-brown-light">Moisture</th>
                      <th scope="col" className="sticky top-0 z-20 border-b border-beige-dark/50 bg-beige px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brown-light">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige-dark/30">
                    {rows.map(row => {
                      return (
                      <tr key={row.key} className={`group transition-colors duration-150 ease-out hover:bg-beige/60 ${row.status === "Rejected" ? "bg-red-50/30" : ""}`}>
                        <td className="border-l-[5px] border-l-transparent px-4 py-3.5 text-left transition-colors duration-150 ease-out group-hover:border-l-brown-dark">
                          <p className="whitespace-nowrap font-bold text-brown-dark">{row.batch}</p>
                          <p className="mt-1 whitespace-nowrap text-[10px] font-semibold text-brown-light">
                            {batchWeight(row.allocatedWeight)} allocated · {row.priceType}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-left text-brown-mid">{batchDate(row.date)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-left font-medium text-brown-mid">{row.truck}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-brown-mid">{batchWeight(row.grossWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-brown-mid">{batchWeight(row.tareWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-bold tabular-nums text-brown-dark">{batchWeight(row.netWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-brown-mid">{batchMoisture(row.moisture)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-center"><BatchStatusBadge status={row.status} /></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map(row => {
                  return (
                  <article key={row.key} className={`rounded-2xl border p-4 shadow-sm ${row.status === "Rejected" ? "border-red-200 bg-red-50/30" : "border-beige-dark/50 bg-white"}`}>
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
                      <MobileBatchField
                        label="Allocated Net"
                        value={(
                          <span className="block">
                            <span className="block">{batchWeight(row.allocatedWeight)} · {row.priceType}</span>
                          </span>
                        )}
                        numeric
                      />
                      <MobileBatchField label="Moisture" value={batchMoisture(row.moisture)} numeric />
                    </dl>
                  </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!loading && rows.length > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-beige-dark/30 px-4 py-4 sm:px-7">
            <span className="text-sm text-brown-light">{rows.length} batch{rows.length !== 1 ? "es" : ""}</span>
            <div className="text-right">
              <p className="font-bold text-brown-dark">
                {(acceptedAllocatedKg / 1000).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} tons Accepted
              </p>
              <p className="mt-0.5 text-[11px] text-brown-light">
                Accepted allocated net weight only{rejectedCount > 0 ? ` · ${rejectedCount} rejected excluded` : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
