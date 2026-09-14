import { createElement, useCallback, useEffect, useRef, useState } from "react";
import {
  LuTruck, LuFlaskConical, LuCheck, LuX, LuClock,
  LuChevronDown, LuChevronUp, LuSearch,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmt3(n) { return Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function contractLabel(d) {
  const allocs = (d.delivery_allocations ?? []).filter(a => a.contract_id);
  if (allocs.length === 0) return d.contract?.contract_number ?? null;
  const nums = [...new Set(allocs.map(a => a.contract?.contract_number).filter(Boolean))];
  if (nums.length === 1) return nums[0];
  return `${nums.length} Contracts`;
}

function buildContractBatchMeta(deliveries) {
  const contractCounts = new Map();
  const batchMeta = new Map();
  const chronological = deliveries.slice().sort((a, b) => {
    const dateDifference = new Date(a.delivery_date ?? a.created_at) - new Date(b.delivery_date ?? b.created_at);
    if (dateDifference !== 0) return dateDifference;

    const createdDifference = new Date(a.created_at) - new Date(b.created_at);
    if (createdDifference !== 0) return createdDifference;
    return a.delivery_id.localeCompare(b.delivery_id);
  });

  for (const delivery of chronological) {
    const primaryAllocation = (delivery.delivery_allocations ?? [])
      .filter(allocation => allocation.contract_id)
      .slice()
      .sort((a, b) => a.sequence_order - b.sequence_order)[0];
    const contractId = delivery.contract_id ?? primaryAllocation?.contract_id;
    const contractNumber = delivery.contract?.contract_number ?? primaryAllocation?.contract?.contract_number;
    const contractKey = contractId ?? contractNumber;

    if (!contractKey) continue;
    const batchNumber = (contractCounts.get(contractKey) ?? 0) + 1;
    contractCounts.set(contractKey, batchNumber);
    batchMeta.set(delivery.delivery_id, { batchNumber, contractNumber });
  }

  return batchMeta;
}

const STATUS_META = {
  Pending:   { color: "bg-beige text-brown-mid",        label: "Pending",   icon: LuClock },
  Weighed:   { color: "bg-blue-50 text-blue-600",        label: "Weighed",   icon: LuTruck },
  Inspected: { color: "bg-purple-50 text-purple-600",    label: "Inspected", icon: LuFlaskConical },
  Accepted:  { color: "bg-green-pale text-green-dark",   label: "Accepted",  icon: LuCheck },
  Rejected:  { color: "bg-red-50 text-red-600",          label: "Rejected",  icon: LuX },
};

const FILTERS = ["All", "Pending", "Weighed", "Inspected", "Accepted", "Rejected"];

const DELIVERY_STEP_INDEX = {
  Pending: 0,
  Weighed: 1,
  Inspected: 2,
  Accepted: 3,
  Rejected: 3,
};

function DeliveryProgressStepper({ status, hasWeighing, hasLabAssessment }) {
  const statusIndex = DELIVERY_STEP_INDEX[status] ?? 0;
  const accepted = status === "Accepted";
  const rejected = status === "Rejected";
  const completedSteps = [
    hasWeighing || statusIndex >= 1,
    hasWeighing || statusIndex >= 1,
    hasLabAssessment || statusIndex >= 2,
    accepted,
  ];
  const firstIncompleteStep = completedSteps.findIndex(completed => !completed);
  const currentIndex = accepted || rejected
    ? 3
    : firstIncompleteStep === -1 ? 3 : firstIncompleteStep;
  const steps = [
    { label: "Pending", icon: LuClock },
    { label: "Weighed", icon: LuTruck },
    { label: "Lab Assessment", icon: LuFlaskConical },
    { label: rejected ? "Rejected" : "Accepted", icon: rejected ? LuX : LuCheck },
  ];

  return (
    <div className="w-full pb-1" aria-label={`Delivery progress: ${steps[currentIndex].label}`}>
      <ol className="grid w-full grid-cols-4 pt-1 sm:px-2">
        {steps.map(({ label, icon: StepIcon }, index) => {
          const isRejectedStep = rejected && index === 3;
          const isCompleted = completedSteps[index];
          const isCurrent = !accepted && !rejected && index === currentIndex;
          const connectorColor = isCompleted ? "bg-green-mid" : "bg-slate-200";

          return (
            <li
              key={label}
              className="relative flex min-w-0 flex-col items-center text-center"
              aria-current={isCurrent || index === 3 && (accepted || rejected) ? "step" : undefined}
            >
              {index > 0 && (
                <span className={`absolute right-1/2 top-3.5 h-0.5 w-full sm:top-[18px] ${connectorColor}`} aria-hidden="true" />
              )}
              <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-[3px] sm:h-9 sm:w-9 ${
                isRejectedStep
                  ? "border-red-700 bg-red-500 text-white"
                  : isCompleted
                    ? "border-green-dark bg-green-light text-white"
                    : isCurrent
                      ? "border-blue-500 bg-white text-blue-600"
                      : "border-slate-300 bg-slate-100 text-slate-400"
              }`}>
                {isRejectedStep ? (
                  <LuX className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                ) : isCompleted ? (
                  <LuCheck className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                ) : (
                  createElement(StepIcon, {
                    className: "h-4 w-4 sm:h-[18px] sm:w-[18px]",
                    "aria-hidden": true,
                  })
                )}
              </span>
              <span className="sr-only sm:hidden">{label}</span>
              <span className={`mt-2 hidden text-[11px] font-semibold sm:block ${
                isRejectedStep
                  ? "text-red-600"
                  : isCompleted
                    ? "text-green-dark"
                    : isCurrent
                      ? "text-blue-600"
                      : "text-slate-400"
              }`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MobileDeliveryDetail({ label, value, numeric = false, emphasized = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b-[3px] border-beige-dark py-2.5 last:border-0">
      <dt className="text-xs font-medium text-brown-light">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-right text-sm text-brown-dark ${numeric ? "tabular-nums" : ""} ${emphasized ? "font-extrabold" : "font-semibold"}`}>
        {value}
      </dd>
    </div>
  );
}

const STAFF_AVATAR_COLORS = [
  "border-blue-200 bg-blue-100 text-blue-800",
  "border-emerald-200 bg-emerald-100 text-emerald-800",
  "border-violet-200 bg-violet-100 text-violet-800",
  "border-amber-200 bg-amber-100 text-amber-800",
  "border-rose-200 bg-rose-100 text-rose-800",
  "border-cyan-200 bg-cyan-100 text-cyan-800",
  "border-indigo-200 bg-indigo-100 text-indigo-800",
  "border-orange-200 bg-orange-100 text-orange-800",
];

function stableColorIndex(value) {
  let hash = 0;
  for (const character of String(value ?? "")) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % STAFF_AVATAR_COLORS.length;
}

function staffInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
}

function StaffIdentity({ name, staffId, pending = false }) {
  if (!name || name === "—") {
    return <span className="text-brown-light">{pending ? "Pending" : "—"}</span>;
  }

  const color = STAFF_AVATAR_COLORS[stableColorIndex(staffId ?? name)];
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-extrabold ${color}`}
        aria-hidden="true"
      >
        {staffInitials(name)}
      </span>
      <span className="min-w-0 break-words text-brown-mid">{name}</span>
    </span>
  );
}

function QualityResultBadge({ result }) {
  const meta = result === "Accepted"
    ? { label: "Accepted", color: "border-green-200 bg-green-pale text-green-dark" }
    : result === "Rejected"
      ? { label: "Rejected", color: "border-red-200 bg-red-50 text-red-700" }
      : { label: "Pending", color: "border-amber-200 bg-amber-50 text-amber-700" };

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default function SupplierDeliveriesPage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const realtimeRefreshTimer = useRef(null);

  const fetchDeliveries = useCallback(async () => {
    const { data } = await supabase
      .from("deliveries")
      .select(`
        delivery_id, contract_id, delivery_status, delivery_date, delivery_source,
        truck_plate_number, batch_number, created_at,
        contract:contract_id(contract_number),
        weigher:weigher_id(user_id, first_name, last_name),
        delivery_allocations(contract_id, sequence_order,
          contract:contract_id(contract_number)),
        weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg),
        laboratory_inspections(
          lab_staff:lab_staff_id(user_id, first_name, last_name)),
        quality_results(result)
      `)
      .eq("supplier_id", user.id)
      .eq("delivery_source", "Contract-based")
      .order("created_at", { ascending: false });

    setDeliveries(data ?? []);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    (async () => { await fetchDeliveries(); })();
  }, [fetchDeliveries]);

  useEffect(() => {
    function scheduleRefresh() {
      clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => fetchDeliveries(), 150);
    }

    const channel = supabase
      .channel(`supplier-deliveries-page:${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "deliveries", filter: `supplier_id=eq.${user.id}`,
      }, scheduleRefresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "contracts", filter: `supplier_id=eq.${user.id}`,
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
  }, [user.id, fetchDeliveries]);

  const batchMetaByDelivery = buildContractBatchMeta(deliveries);
  const filtered = deliveries.filter(d => {
    if (filter !== "All" && d.delivery_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const batchMeta = batchMetaByDelivery.get(d.delivery_id);
      const displayedBatch = batchMeta
        ? `Batch ${batchMeta.batchNumber} of ${batchMeta.contractNumber ?? ""}`
        : d.batch_number;
      return d.contract?.contract_number?.toLowerCase().includes(q) ||
        d.batch_number?.toLowerCase().includes(q) ||
        displayedBatch?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-w-0 pt-4 sm:pt-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-brown-dark">Deliveries</h1>
          <p className="text-brown-light text-sm mt-0.5">All your contractual delivery records</p>
        </div>
        {!loading && <span className="text-xs text-brown-light shrink-0">{deliveries.length} total</span>}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative min-w-0 flex-1">
          <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-light" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search contract number or batch…"
            className="min-h-11 w-full rounded-xl border border-beige-dark bg-white py-2.5 pl-10 pr-4 text-sm text-brown-dark
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          aria-label="Filter deliveries by status"
          className="min-h-11 w-full rounded-xl border border-beige-dark bg-white px-3 py-2.5 text-sm text-brown-dark focus:outline-none focus:ring-2 focus:ring-green-mid/30 sm:hidden">
          {FILTERS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Desktop: underline tabs */}
      <div className="mb-6 hidden max-w-full gap-3 overflow-x-auto overscroll-x-contain border-b border-beige-dark/40 sm:flex sm:gap-6">
        {FILTERS.map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-1 text-sm font-medium transition-colors
              ${filter === f ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuTruck className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No deliveries {filter !== "All" ? `with status "${filter}"` : "yet"}</p>
          <p className="text-brown-light text-sm mt-1">Deliveries recorded by the weigher will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => {
            const meta = STATUS_META[d.delivery_status] ?? STATUS_META.Pending;
            const StatusIcon = meta.icon;
            const isOpen = expanded === d.delivery_id;
            const wr = d.weighing_records?.[0];
            const li = d.laboratory_inspections?.[0];
            const qr = d.quality_results?.[0];
            const contractRef = contractLabel(d);
            const weigherName = `${d.weigher?.first_name ?? ""} ${d.weigher?.last_name ?? ""}`.trim() || "—";
            const labName = `${li?.lab_staff?.first_name ?? ""} ${li?.lab_staff?.last_name ?? ""}`.trim() || "—";
            const grossWeight = wr?.gross_weight_kg;
            const tareWeight = wr?.tare_weight_kg;
            const hasWeights = grossWeight !== null && grossWeight !== undefined
              && tareWeight !== null && tareWeight !== undefined;
            const netWeight = hasWeights ? Number(grossWeight) - Number(tareWeight) : null;
            const batchMeta = batchMetaByDelivery.get(d.delivery_id);
            const batchNumber = batchMeta?.batchNumber;
            const batchContractRef = batchMeta?.contractNumber ?? d.contract?.contract_number ?? contractRef;

            return (
              <div key={d.delivery_id} className="min-w-0 overflow-hidden rounded-xl border-2 border-beige-dark/80 bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : d.delivery_id)}
                  aria-expanded={isOpen}
                  className="flex min-h-11 w-full min-w-0 flex-col items-stretch gap-3 px-4 py-4 text-left transition-colors hover:bg-beige/30 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="flex min-w-0 max-w-full items-start gap-3 sm:flex-1">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold">
                        <span className="text-green-dark">Batch {batchNumber ?? "—"}</span>
                        <span className="text-brown-dark"> of {batchContractRef ?? "—"}</span>
                      </p>
                      <p className="mt-0.5 break-words text-xs text-brown-light">
                        {fmtDate(d.delivery_date)}
                        {wr ? ` · ${fmt3(wr.net_weight_kg)} kg Net` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-0 sm:justify-end">
                    {!isOpen && (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${meta.color}`}>
                        <StatusIcon className="w-3 h-3" />{meta.label}
                      </span>
                    )}
                    {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-4 py-5 sm:px-5">
                    <DeliveryProgressStepper
                      status={d.delivery_status}
                      hasWeighing={Boolean(wr)}
                      hasLabAssessment={Boolean(li)}
                    />

                    <div className="mt-5 hidden overflow-x-auto rounded-xl border border-beige-dark/50 md:block">
                      <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
                        <colgroup>
                          <col className="w-[11%]" />
                          <col className="w-[14%]" />
                          <col className="w-[14%]" />
                          <col className="w-[14%]" />
                          <col className="w-[18%]" />
                          <col className="w-[14%]" />
                          <col className="w-[15%]" />
                        </colgroup>
                        <thead className="bg-beige">
                          <tr>
                            <th scope="col" className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Plate Number</th>
                            <th scope="col" className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Gross Weight</th>
                            <th scope="col" className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Tare Weight</th>
                            <th scope="col" className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wide text-brown-light">Net Weight</th>
                            <th scope="col" className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Weighing Staff</th>
                            <th scope="col" className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Quality Result</th>
                            <th scope="col" className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wide text-brown-light">Lab Staff</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-beige-dark/30">
                            <td className="whitespace-nowrap px-5 py-4 font-medium text-brown-mid">{d.truck_plate_number || "—"}</td>
                            <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-brown-mid">{hasWeights ? `${fmt3(grossWeight)} kg` : "—"}</td>
                            <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-brown-mid">{hasWeights ? `${fmt3(tareWeight)} kg` : "—"}</td>
                            <td className="whitespace-nowrap px-5 py-4 text-right font-extrabold tabular-nums text-brown-dark">{hasWeights ? `${fmt3(netWeight)} kg` : "—"}</td>
                            <td className="px-5 py-4 font-medium"><StaffIdentity name={weigherName} staffId={d.weigher?.user_id} /></td>
                            <td className="px-5 py-4"><QualityResultBadge result={qr?.result} /></td>
                            <td className="px-5 py-4 font-medium"><StaffIdentity name={li ? labName : null} staffId={li?.lab_staff?.user_id} pending={!li} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <dl className="mt-5 rounded-xl bg-beige px-4 py-1 md:hidden">
                      <MobileDeliveryDetail label="Plate Number" value={d.truck_plate_number || "—"} />
                      <MobileDeliveryDetail label="Gross Weight" value={hasWeights ? `${fmt3(grossWeight)} kg` : "—"} numeric />
                      <MobileDeliveryDetail label="Tare Weight" value={hasWeights ? `${fmt3(tareWeight)} kg` : "—"} numeric />
                      <MobileDeliveryDetail label="Net Weight" value={hasWeights ? `${fmt3(netWeight)} kg` : "—"} numeric emphasized />
                      <MobileDeliveryDetail label="Weigher" value={<StaffIdentity name={weigherName} staffId={d.weigher?.user_id} />} />
                      <MobileDeliveryDetail label="Quality Result" value={<QualityResultBadge result={qr?.result} />} />
                      <MobileDeliveryDetail label="Lab Staff" value={<StaffIdentity name={li ? labName : null} staffId={li?.lab_staff?.user_id} pending={!li} />} />
                    </dl>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
