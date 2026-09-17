import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuTruck, LuFlaskConical, LuCheck, LuX,
  LuChevronDown, LuChevronUp, LuSearch,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmt3(n) { return Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function contractLabel(d) {
  const allocations = d.delivery_allocations ?? [];
  const contractAllocations = allocations.filter(a => a.contract_id);
  const hasSpot = allocations.some(a => !a.contract_id || a.price_type === "Spot");
  if (contractAllocations.length === 0) return hasSpot ? "Spot" : d.contract?.contract_number ?? null;
  const nums = [...new Set(contractAllocations.map(a => a.contract?.contract_number).filter(Boolean))];
  if (nums.length === 0) {
    const fallback = d.contract?.contract_number ?? "Contract";
    return `${fallback}${hasSpot ? " + Spot" : ""}`;
  }
  if (nums.length === 1) return `${nums[0]}${hasSpot ? " + Spot" : ""}`;
  return `${nums.length} Contracts${hasSpot ? " + Spot" : ""}`;
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
  Weighed:  { color: "bg-blue-50 text-blue-700",      label: "Weighed",  icon: LuTruck },
  Assessed: { color: "bg-amber-50 text-amber-700",    label: "Assessed", icon: LuFlaskConical },
  Accepted: { color: "bg-green-dark text-white", label: "Accepted", icon: LuCheck },
  Rejected: { color: "bg-red-50 text-red-600",        label: "Rejected", icon: LuX },
};

const FILTERS = ["All", "Pending", "Weighed", "Inspected", "Accepted", "Rejected"];

function supplierStatusKey(status, hasWeighing, hasAssessment, qualityResult) {
  if (status === "Rejected" || qualityResult === "Rejected") return "Rejected";
  if (status === "Accepted" || qualityResult === "Accepted") return "Accepted";
  if (status === "Inspected" || hasAssessment) return "Assessed";
  if (status === "Weighed" || hasWeighing) return "Weighed";
  return null;
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
    const { data: deliveryData } = await supabase
      .from("deliveries")
      .select(`
        delivery_id, contract_id, delivery_status, delivery_date, delivery_source,
        truck_plate_number, batch_number, created_at,
        contract:contract_id(contract_number),
        weigher:weigher_id(user_id, first_name, last_name),
        weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg),
        laboratory_inspections(moisture_content_pct, inspected_at,
          lab_staff:lab_staff_id(user_id, first_name, last_name)),
        quality_results(result, remarks)
      `)
      .eq("supplier_id", user.id)
      .eq("delivery_source", "Contract-based")
      .order("created_at", { ascending: false });

    const deliveryIds = (deliveryData ?? []).map(delivery => delivery.delivery_id);
    let allocationData = [];

    if (deliveryIds.length > 0) {
      const { data } = await supabase
        .from("delivery_allocations")
        .select(`
          allocation_id, delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order,
          contract:contract_id(contract_number, negotiated_price_per_kg)
        `)
        .in("delivery_id", deliveryIds)
        .order("sequence_order", { ascending: true });
      allocationData = data ?? [];
    }

    const allocationsByDelivery = new Map();
    for (const allocation of allocationData) {
      const existing = allocationsByDelivery.get(allocation.delivery_id) ?? [];
      existing.push(allocation);
      allocationsByDelivery.set(allocation.delivery_id, existing);
    }

    setDeliveries((deliveryData ?? []).map(delivery => ({
      ...delivery,
      delivery_allocations: allocationsByDelivery.get(delivery.delivery_id) ?? [],
    })));
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
      const allocationMatch = (d.delivery_allocations ?? []).some(allocation =>
        allocation.contract?.contract_number?.toLowerCase().includes(q)
        || allocation.price_type?.toLowerCase().includes(q)
        || (!allocation.contract_id && "spot".includes(q))
      );
      return d.contract?.contract_number?.toLowerCase().includes(q) ||
        d.batch_number?.toLowerCase().includes(q) ||
        displayedBatch?.toLowerCase().includes(q) ||
        allocationMatch;
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
      <div className="mb-6 hidden max-w-full gap-3 overflow-x-auto overscroll-x-contain border-b border-beige-dark/40 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex sm:gap-6">
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
            const isOpen = expanded === d.delivery_id;
            const wr = d.weighing_records?.[0];
            const li = d.laboratory_inspections?.[0];
            const qr = d.quality_results?.[0];
            const displayStatus = supplierStatusKey(d.delivery_status, Boolean(wr), Boolean(li), qr?.result);
            const meta = displayStatus ? STATUS_META[displayStatus] : null;
            const StatusIcon = meta?.icon;
            const contractRef = contractLabel(d);
            const weigherName = `${d.weigher?.first_name ?? ""} ${d.weigher?.last_name ?? ""}`.trim() || "—";
            const labName = `${li?.lab_staff?.first_name ?? ""} ${li?.lab_staff?.last_name ?? ""}`.trim() || null;
            const grossWeight = wr?.gross_weight_kg;
            const tareWeight = wr?.tare_weight_kg;
            const hasWeights = grossWeight !== null && grossWeight !== undefined
              && tareWeight !== null && tareWeight !== undefined;
            const storedNetWeight = wr?.net_weight_kg;
            const netWeight = storedNetWeight !== null && storedNetWeight !== undefined
              ? Number(storedNetWeight)
              : hasWeights ? Number(grossWeight) - Number(tareWeight) : null;
            const remarkMatch = qr?.remarks?.match(/(?:Discount|Deduction):\s*([\d.]+)%/i);
            const discountPct = remarkMatch ? Number(remarkMatch[1]) : 0;
            const finalWeight = li && netWeight !== null ? netWeight * (1 - discountPct / 100) : null;
            const moisture = li?.moisture_content_pct;
            const hasMoisture = moisture !== null && moisture !== undefined;
            const allocs = (d.delivery_allocations ?? [])
              .slice()
              .sort((a, b) => a.sequence_order - b.sequence_order);
            const inspectedDate = li?.inspected_at;

            return (
              <div key={d.delivery_id} className="min-w-0 overflow-hidden rounded-xl border-2 border-beige-dark/80 bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : d.delivery_id)}
                  aria-expanded={isOpen}
                  className="flex min-h-11 w-full min-w-0 flex-col items-stretch gap-3 px-4 py-4 text-left transition-colors hover:bg-beige/30 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="w-full min-w-0 md:hidden">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="break-words text-sm font-bold text-brown-dark">{fmtDate(d.delivery_date)}</p>
                        {contractRef && (
                          <span className="rounded-full bg-green-pale px-2 py-0.5 text-[11px] font-semibold text-green-dark">
                            {contractRef}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {meta && (
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>
                            <StatusIcon className="h-3 w-3" aria-hidden="true" />{meta.label}
                          </span>
                        )}
                        {isOpen ? <LuChevronUp className="h-4 w-4 shrink-0 text-brown-light" /> : <LuChevronDown className="h-4 w-4 shrink-0 text-brown-light" />}
                      </div>
                    </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-brown-light">
                        <span>
                          Net Weight: <span className="font-semibold text-brown-dark">{netWeight !== null ? `${fmt3(netWeight)} kg` : "—"}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Moisture: {hasMoisture ? (
                            <span className="font-semibold text-brown-dark">{moisture}cc</span>
                          ) : (
                            <span className="font-medium text-orange-600">Not yet assessed</span>
                          )}
                        </span>
                      </p>
                  </div>
                  <div className="hidden md:contents">
                  <div className="flex min-w-0 max-w-full items-start gap-3 sm:flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="break-words text-sm font-bold text-brown-dark">{fmtDate(d.delivery_date)}</p>
                        {contractRef && (
                          <span className="rounded-full bg-green-pale px-2 py-0.5 text-[11px] font-semibold text-green-dark">
                            {contractRef}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-brown-light">
                        <span>
                          Net Weight: <span className="font-semibold text-brown-dark">{netWeight !== null ? `${fmt3(netWeight)} kg` : "—"}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Moisture: {hasMoisture ? (
                            <span className="font-semibold text-brown-dark">{moisture}cc</span>
                          ) : (
                            <span className="font-medium text-orange-600">Not yet assessed</span>
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-0 sm:justify-end">
                    {meta && (
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>
                        <StatusIcon className="h-3 w-3" aria-hidden="true" />{meta.label}
                      </span>
                    )}
                    {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
                  </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-4 py-5 sm:px-5">
                    <div className="hidden overflow-hidden rounded-xl border border-beige-dark/50 md:block">
                      <table className="w-full table-fixed border-collapse text-xs text-brown-mid">
                        <colgroup>
                          <col className="w-[10%]" />
                          <col className="w-[10%]" />
                          <col className="w-[10%]" />
                          <col className="w-[10%]" />
                          <col className="w-[13%]" />
                          <col className="w-[9%]" />
                          <col className="w-[11%]" />
                          <col className="w-[11%]" />
                          <col className="w-[16%]" />
                        </colgroup>
                        <thead className="bg-beige">
                          <tr>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-left text-[10px] font-bold uppercase tracking-tight text-brown-light">Truck Number</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-right text-[10px] font-bold uppercase tracking-tight text-brown-light">Gross Weight</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-right text-[10px] font-bold uppercase tracking-tight text-brown-light">Tare Weight</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-right text-[10px] font-bold uppercase tracking-tight text-brown-light">Net Weight</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-left text-[10px] font-bold uppercase tracking-tight text-brown-light">Weighing Staff</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-left text-[10px] font-bold uppercase tracking-tight text-brown-light">Moisture</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-right text-[10px] font-bold uppercase tracking-tight text-brown-light">PCA Deduction</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-right text-[10px] font-bold uppercase tracking-tight text-brown-light">Final Weight</th>
                            <th scope="col" className="whitespace-nowrap px-2 py-3 text-left text-[10px] font-bold uppercase tracking-tight text-brown-light">Lab Staff</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-beige-dark/30 transition-colors hover:bg-beige/30">
                            <td className="break-words px-2 py-4 text-left font-medium">{d.truck_plate_number || "—"}</td>
                            <td className="px-2 py-4 text-right tabular-nums">{grossWeight !== null && grossWeight !== undefined ? `${fmt3(grossWeight)} kg` : "—"}</td>
                            <td className="px-2 py-4 text-right tabular-nums">{tareWeight !== null && tareWeight !== undefined ? `${fmt3(tareWeight)} kg` : "—"}</td>
                            <td className="px-2 py-4 text-right font-bold tabular-nums text-brown-dark">{netWeight !== null ? `${fmt3(netWeight)} kg` : "—"}</td>
                            <td className="break-words px-2 py-4 text-left">{weigherName}</td>
                            <td className={`break-words px-2 py-4 text-left ${hasMoisture ? "" : "font-medium text-orange-600"}`}>
                              {hasMoisture ? `${moisture}cc` : "Not yet assessed"}
                            </td>
                            <td className={`px-2 py-4 text-right tabular-nums ${li ? "" : "font-medium text-orange-600"}`}>
                              {li ? `${discountPct}%` : "Not yet assessed"}
                            </td>
                            <td className={`px-2 py-4 text-right font-bold tabular-nums ${finalWeight !== null ? "text-brown-dark" : "text-orange-600"}`}>
                              {finalWeight !== null ? `${fmt3(finalWeight)} kg` : "Not yet assessed"}
                            </td>
                            <td className={`break-words px-2 py-4 text-left ${labName ? "" : "font-medium text-orange-600"}`}>
                              {labName ? (
                                <span className="block">
                                  <span className="block font-medium text-brown-dark">{labName}</span>
                                  <span className={`mt-0.5 block text-[11px] ${inspectedDate ? "text-brown-light" : "font-medium text-orange-600"}`}>
                                    {inspectedDate ? fmtDate(inspectedDate) : "Not yet assessed"}
                                  </span>
                                </span>
                              ) : "Not yet assessed"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <dl className="rounded-xl border border-beige-dark/50 bg-white px-4 py-1 md:hidden">
                      <MobileDetail label="Truck Number" value={d.truck_plate_number || "—"} prominent />
                      <MobileDetail label="Gross Weight" value={grossWeight !== null && grossWeight !== undefined ? `${fmt3(grossWeight)} kg` : "—"} numeric />
                      <MobileDetail label="Tare Weight" value={tareWeight !== null && tareWeight !== undefined ? `${fmt3(tareWeight)} kg` : "—"} numeric />
                      <MobileDetail label="Net Weight" value={netWeight !== null ? `${fmt3(netWeight)} kg` : "—"} numeric prominent />
                      <MobileDetail label="Weighing Staff" value={weigherName} />
                      <MobileDetail label="Moisture" value={hasMoisture ? `${moisture}cc` : "Not yet assessed"} pending={!hasMoisture} />
                      <MobileDetail label="PCA Deduction" value={li ? `${discountPct}%` : "Not yet assessed"} numeric={Boolean(li)} pending={!li} />
                      <MobileDetail label="Final Weight" value={finalWeight !== null ? `${fmt3(finalWeight)} kg` : "Not yet assessed"} numeric={finalWeight !== null} pending={finalWeight === null} prominent />
                      <MobileDetail
                        label="Lab Staff"
                        pending={!labName}
                        value={labName ? (
                          <span className="block">
                            <span className="block font-medium text-brown-dark">{labName}</span>
                            <span className={`mt-0.5 block text-xs ${inspectedDate ? "font-normal text-brown-light" : "font-medium text-orange-600"}`}>
                              {inspectedDate ? fmtDate(inspectedDate) : "Not yet assessed"}
                            </span>
                          </span>
                        ) : "Not yet assessed"}
                      />
                    </dl>

                    {allocs.length > 0 && (
                      <div className="mt-3 rounded-xl bg-beige px-4 py-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brown-light">
                          Allocation Breakdown
                        </p>
                        <div className="space-y-1.5">
                          {allocs.map((allocation, index) => {
                            const priceType = allocation.price_type ?? (allocation.contract_id ? "Negotiated" : "Spot");
                            return (
                              <div
                                key={allocation.allocation_id ?? index}
                                className="flex min-w-0 flex-nowrap items-center justify-between gap-1 text-[9px] max-[359px]:text-[8px] min-[480px]:text-[10px] md:gap-2 md:text-xs"
                              >
                                <div className="flex shrink-0 flex-nowrap items-center gap-1 md:min-w-0 md:shrink md:flex-wrap md:gap-2">
                                  <span className={`whitespace-nowrap rounded-full px-1 py-0.5 font-semibold md:px-1.5 ${
                                    priceType === "Spot"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-green-pale text-green-dark"
                                  }`}>
                                    {priceType}
                                  </span>
                                  <span className="whitespace-nowrap font-semibold text-brown-dark">
                                    {allocation.contract_id
                                      ? (allocation.contract?.contract_number ?? "Contract")
                                      : "Spot Price"}
                                  </span>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1 text-right text-brown-mid md:flex-none md:shrink-0 md:gap-3">
                                  <span className="shrink-0 whitespace-nowrap font-semibold">{fmt3(allocation.allocated_weight_kg)} kg</span>
                                  {allocation.contract_id && allocation.contract?.negotiated_price_per_kg !== null && allocation.contract?.negotiated_price_per_kg !== undefined && (
                                    <span title={`${peso(allocation.contract.negotiated_price_per_kg)}/kg`} className="min-w-0 truncate text-brown-light md:overflow-visible md:whitespace-normal md:text-clip">{peso(allocation.contract.negotiated_price_per_kg)}/kg</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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

function MobileDetail({ label, value, numeric = false, pending = false, prominent = false }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-beige-dark/40 py-3 last:border-0">
      <dt className="shrink-0 text-xs font-medium text-brown-light">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-sm ${numeric ? "tabular-nums" : ""} ${prominent ? "font-bold" : "font-medium"} ${pending ? "text-orange-600" : "text-brown-dark"}`}>
        {value}
      </dd>
    </div>
  );
}
