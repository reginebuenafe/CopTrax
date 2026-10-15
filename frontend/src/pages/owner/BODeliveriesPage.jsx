import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LuTruck, LuCheck, LuX, LuClock,
  LuChevronDown, LuChevronUp, LuSearch, LuArrowUpDown,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmt3(n) { return Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Build a concise contract label from delivery_allocations (or fall back to primary contract)
function contractLabel(d) {
  const allocs = (d.delivery_allocations ?? []).filter(a => a.contract_id);
  if (allocs.length === 0) return d.contract?.contract_number ?? null;
  const nums = [...new Set(allocs.map(a => a.contract?.contract_number).filter(Boolean))];
  if (nums.length === 1) return nums[0];
  return `${nums.length} Contracts`;
}

const STATUS_META = {
  Pending:   { color: "bg-beige text-brown-mid",          label: "Pending",   icon: LuClock },
  Accepted:  { color: "bg-green-dark text-white",         label: "Accepted",  icon: LuCheck },
  Rejected:  { color: "bg-red-50 text-red-600",            label: "Rejected",  icon: LuX },
};
const FILTERS = ["All", "Pending", "Accepted", "Rejected"];

// Weighing and moisture assessment are both pre-decision steps — a delivery
// only ever resolves to Accepted or Rejected once assessed, so any other
// raw delivery_status (Pending, Weighed, or the rarely-used Inspected)
// displays/filters as Pending.
function boDeliveryStatusKey(status) {
  return status === "Accepted" || status === "Rejected" ? status : "Pending";
}

export default function BODeliveriesPage() {
  const [searchParams] = useSearchParams();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [deliveryType, setDeliveryType] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [spotPrice, setSpotPrice] = useState(null);
  const linkedDeliveryId = searchParams.get("deliveryId");

  useEffect(() => {
    async function fetchSpotPrice() {
      const { data } = await supabase.from("spot_price").select("price_per_kg").limit(1).maybeSingle();
      setSpotPrice(data?.price_per_kg ?? null);
    }
    fetchSpotPrice();
  }, []);

  useEffect(() => {
    async function fetchAll() {
      const { data } = await supabase
        .from("deliveries")
        .select(`
          delivery_id, delivery_status, delivery_date, delivery_source,
          truck_plate_number, batch_number, created_at,
          supplier:supplier_id(first_name, last_name),
          contract:contract_id(contract_number),
          walkin_supplier:walkin_supplier_id(first_name, last_name),
          weigher:weigher_id(first_name, last_name),
          weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg, copra_condition),
          laboratory_inspections(moisture_content_pct, inspected_at,
            lab_staff:lab_staff_id(first_name, last_name)),
          quality_results(result, remarks),
          delivery_allocations(allocation_id, contract_id, allocated_weight_kg, price_type, sequence_order,
            contract:contract_id(contract_number, negotiated_price_per_kg))
        `)
        .order("created_at", { ascending: false });
      setDeliveries(data ?? []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  function getSupplierName(d) {
    return d.delivery_source === "Walkin"
      ? `${d.walkin_supplier?.first_name ?? ""} ${d.walkin_supplier?.last_name ?? ""}`.trim()
      : `${d.supplier?.first_name ?? ""} ${d.supplier?.last_name ?? ""}`.trim();
  }

  const activeDeliveryType = deliveryType ?? (
    deliveries.find(d => d.delivery_id === linkedDeliveryId)?.delivery_source === "Walkin"
      ? "Walkin" : "Contract-based"
  );

  const filtered = deliveries.filter(d => {
    if (d.delivery_source !== activeDeliveryType) return false;
    if (linkedDeliveryId) return d.delivery_id === linkedDeliveryId;
    // Status filtering only applies to Contractual deliveries — Walk-in
    // deliveries are shown in full regardless of the (hidden) filter state.
    if (activeDeliveryType === "Contract-based" && filter !== "All" && boDeliveryStatusKey(d.delivery_status) !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return getSupplierName(d).toLowerCase().includes(q) ||
        d.contract?.contract_number?.toLowerCase().includes(q) ||
        d.batch_number?.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    if (sort === "az") return getSupplierName(a).localeCompare(getSupplierName(b), "en-PH", { sensitivity: "base", numeric: true });
    if (sort === "za") return getSupplierName(b).localeCompare(getSupplierName(a), "en-PH", { sensitivity: "base", numeric: true });
    const recordedA = Date.parse(a.created_at ?? a.delivery_date ?? "") || 0;
    const recordedB = Date.parse(b.created_at ?? b.delivery_date ?? "") || 0;
    return sort === "oldest" ? recordedA - recordedB : recordedB - recordedA;
  });

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-brown-dark">Deliveries</h1>
          <p className="text-brown-light text-sm mt-0.5">All delivery records, contractual and walk-in</p>
        </div>
        {!loading && <span className="text-xs text-brown-light shrink-0">{deliveries.length} total</span>}
      </div>

      {/* Type toggle + search/sort; controls stack at narrow mobile widths. */}
      <div className="mb-4 flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Delivery type" className="flex w-full shrink-0 items-center gap-1 rounded-full border border-beige-dark bg-beige p-0.5 md:w-auto">
          {[{ value: "Contract-based", label: "Contractual" }, { value: "Walkin", label: "Walk-in" }].map(type => (
            <button key={type.value} type="button" aria-pressed={activeDeliveryType === type.value}
              onClick={() => setDeliveryType(type.value)}
              className="group inline-flex min-h-11 flex-1 items-center justify-center rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brown-dark/25 md:min-h-8">
              <span className={`inline-flex h-8 w-full items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors ${activeDeliveryType === type.value ? "bg-brown-dark text-white" : "text-brown-mid group-hover:bg-white group-hover:text-brown-dark"}`}>
                {type.label}
              </span>
            </button>
          ))}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 min-[480px]:flex-row md:max-w-xl">
          <div className="relative min-w-0 w-full min-[480px]:flex-1 md:max-w-sm">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search supplier, contract, batch…"
              aria-label="Search deliveries"
              className="min-h-11 w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark
                placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
            />
          </div>
          <div className="relative w-full min-[480px]:w-auto min-[480px]:shrink-0">
            <LuArrowUpDown aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brown-light" />
            <select
              aria-label="Sort deliveries"
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="min-h-11 w-full appearance-none cursor-pointer rounded-xl border border-beige-dark bg-beige py-2.5 pl-8 pr-8 text-sm text-brown-dark transition-all focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="az">Supplier A → Z</option>
              <option value="za">Supplier Z → A</option>
            </select>
            <LuChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brown-light" />
          </div>
        </div>
      </div>
      {/* Status filters only apply to Contractual deliveries — Walk-in
          deliveries never go through the Weighed/Inspected/Accepted/
          Rejected lab pipeline, so the filter tabs are hidden entirely and
          every Walk-in delivery is shown directly (see `filtered` above). */}
      {activeDeliveryType === "Contract-based" && (
        <>
          {/* Mobile: compact status select */}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            aria-label="Filter delivery status"
            className="mb-4 min-h-11 w-full sm:hidden px-3 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark focus:outline-none focus:ring-2 focus:ring-green-mid/30">
            {FILTERS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {/* Desktop: underline tabs */}
          <div className="hidden sm:flex flex-wrap gap-x-6 gap-y-2 border-b border-beige-dark/40 mb-6">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`min-h-11 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
                  ${filter === f ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
                {f}
              </button>
            ))}
          </div>
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuTruck className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No deliveries found</p>
          <p className="text-brown-light text-sm mt-1">Deliveries recorded by weighers will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => {
            const meta = STATUS_META[boDeliveryStatusKey(d.delivery_status)];
            const StatusIcon = meta.icon;
            const isOpen = expanded === d.delivery_id;
            const wr = d.weighing_records?.[0];
            const li = d.laboratory_inspections?.[0];
            const qr = d.quality_results?.[0];
            const remarkMatch = qr?.remarks?.match(/(?:Discount|Deduction):\s*([\d.]+)%/);
            const discountPct = remarkMatch ? parseFloat(remarkMatch[1]) : 0;
            const finalKg = wr ? Number(wr.net_weight_kg) * (1 - discountPct / 100) : null;
            const contractRef = d.delivery_source === "Contract-based" ? contractLabel(d) : null;
            const allocs = (d.delivery_allocations ?? [])
              .slice()
              .sort((a, b) => a.sequence_order - b.sequence_order);

            return (
              <div key={d.delivery_id} className={`min-w-0 bg-white border-2 border-beige-dark/80 rounded-xl overflow-hidden md:border md:border-beige-dark/40 ${linkedDeliveryId === d.delivery_id ? "ring-2 ring-green-mid/40" : ""}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : d.delivery_id)}
                  className="w-full flex flex-col items-stretch gap-3 px-4 py-4 hover:bg-beige/30 transition-colors text-left sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="w-full min-w-0 md:hidden">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="break-words text-sm font-bold text-brown-dark">{getSupplierName(d)}</p>
                        <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${d.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"}`}>
                          {d.delivery_source === "Walkin" ? "Walk-in" : "Contractual"}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />{meta.label}
                        </span>
                        {isOpen ? <LuChevronUp className="h-4 w-4 shrink-0 text-brown-light" /> : <LuChevronDown className="h-4 w-4 shrink-0 text-brown-light" />}
                      </div>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-brown-light">
                      <span>{fmtDate(d.delivery_date)}</span>
                      {contractRef && <><span aria-hidden="true">·</span><span>{contractRef}</span></>}
                      {wr && <><span aria-hidden="true">·</span><span>{fmt3(wr.net_weight_kg)} kg net</span></>}
                    </p>
                  </div>
                  <div className="hidden md:contents">
                  <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-brown-dark text-sm break-words">{getSupplierName(d)}</p>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          d.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                        }`}>
                          {d.delivery_source === "Walkin" ? "Walk-in" : "Contractual"}
                        </span>
                      </div>
                      <p className="text-brown-light text-xs break-words">
                        Date Delivered: {fmtDate(d.delivery_date)}
                        {contractRef ? ` · ${contractRef}` : ""}
                        {wr ? ` · ${fmt3(wr.net_weight_kg)} kg net` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${meta.color}`}>
                      <StatusIcon className="w-3 h-3" />{meta.label}
                    </span>
                    {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
                  </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-4 py-5 sm:px-5 md:py-4">
                    <DeliveryDetailTable delivery={d} weighing={wr} inspection={li} discountPct={discountPct} finalKg={finalKg} />
                    {/* Allocation breakdown — shown only for contractual deliveries with allocation data, hidden entirely for rejected deliveries */}
                    {d.delivery_status !== "Rejected" && d.delivery_source === "Contract-based" && allocs.length > 0 && (
                      <div className="mt-3 rounded-xl bg-beige px-4 py-1">
                        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-brown-light">
                          Allocation Breakdown
                        </p>
                        <div className="divide-y divide-beige-dark/40">
                          {allocs.map((a, i) => {
                            const isSpot = !a.contract_id;
                            const price = isSpot ? spotPrice : a.contract?.negotiated_price_per_kg;
                            return (
                              <div key={a.allocation_id ?? i} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${isSpot ? "bg-amber-500" : "bg-green-dark"}`} aria-hidden="true" />
                                  <span className="truncate text-xs font-semibold text-brown-dark md:text-sm">
                                    {isSpot ? "Spot Price" : (a.contract?.contract_number ?? "Contract")}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-baseline gap-1.5">
                                  <span className="whitespace-nowrap text-xs font-bold text-brown-dark md:text-sm">{fmt3(a.allocated_weight_kg)} kg</span>
                                  {price !== null && price !== undefined && (
                                    <span className="whitespace-nowrap text-[11px] text-brown-light">{peso(price)}/kg</span>
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

const DETAIL_COLUMNS = [
  { label: "Truck Number", short: "Truck" },
  { label: "Gross Weight", short: "Gross", numeric: true },
  { label: "Tare Weight", short: "Tare", numeric: true },
  { label: "Net Weight", short: "Net", numeric: true, prominent: true },
  { label: "Weighing Staff", short: "Weigher" },
  { label: "Moisture", short: "Moisture", numeric: true },
  { label: "PCA Deduction", short: "PCA Ded.", numeric: true },
  { label: "Final Weight", short: "Final", numeric: true, prominent: true },
  { label: "Lab Staff", short: "Lab Staff" },
];

function DeliveryDetailTable({ delivery: d, weighing: wr, inspection: li, discountPct, finalKg }) {
  const isWalkin = d.delivery_source === "Walkin";
  const missingLab = isWalkin ? "Not applicable" : "Not yet assessed";
  const weight = value => value == null ? "—" : `${fmt3(value)} kg`;
  const weigherName = `${d.weigher?.first_name ?? ""} ${d.weigher?.last_name ?? ""}`.trim() || "—";
  const labName = `${li?.lab_staff?.first_name ?? ""} ${li?.lab_staff?.last_name ?? ""}`.trim();
  const hasMoisture = li?.moisture_content_pct != null;
  const hasFinalWeight = Boolean(li) && finalKg !== null;
  const labStaff = labName ? (
    <span className="block">
      <span className="block font-medium text-brown-dark">{labName}</span>
      <span className={`mt-0.5 block text-xs md:text-[11px] ${li?.inspected_at || isWalkin ? "font-normal text-brown-light" : "font-medium text-orange-600"}`}>
        {li?.inspected_at ? fmtDate(li.inspected_at) : missingLab}
      </span>
    </span>
  ) : missingLab;
  const values = [
    { value: d.truck_plate_number || "—" },
    { value: weight(wr?.gross_weight_kg) },
    { value: weight(wr?.tare_weight_kg) },
    { value: weight(wr?.net_weight_kg) },
    { value: weigherName },
    { value: hasMoisture ? `${li.moisture_content_pct}cc` : missingLab, missing: !hasMoisture },
    { value: li ? `${discountPct}%` : missingLab, missing: !li },
    { value: hasFinalWeight ? weight(finalKg) : missingLab, missing: !hasFinalWeight },
    { value: labStaff, missing: !labName },
  ];
  const textClass = (field, col) => [
    col.numeric ? "text-right tabular-nums" : "text-left",
    col.prominent ? "font-bold" : "font-medium",
    field.missing ? (isWalkin ? "text-brown-light" : "text-orange-600") : col.prominent ? "text-brown-dark" : "text-brown-mid",
  ].join(" ");
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-beige-dark/50 md:block">
        <table className="w-full table-auto border-collapse text-sm text-brown-mid">
          <caption className="sr-only">Delivery weighing and laboratory details</caption>
          <thead className="bg-beige">
            <tr>
              {DETAIL_COLUMNS.map(col => (
                <th key={col.label} scope="col" title={col.label}
                  className={`whitespace-nowrap px-3 py-3 text-[11px] font-bold uppercase tracking-tight text-brown-light ${col.numeric ? "text-right" : "text-left"}`}>
                  <span className="xl:hidden">{col.short}</span>
                  <span className="hidden xl:inline">{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-beige-dark/30 transition-colors hover:bg-beige/30">
              {values.map((field, i) => (
                <td key={DETAIL_COLUMNS[i].label} className={`whitespace-nowrap px-3 py-4 align-middle ${textClass(field, DETAIL_COLUMNS[i])}`}>
                  {field.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="rounded-xl border border-beige-dark/50 bg-white px-4 py-1 md:hidden">
        {values.map((field, i) => {
          const col = DETAIL_COLUMNS[i];
          return (
            <div key={col.label} className="flex min-w-0 items-start justify-between gap-4 border-b border-beige-dark/40 py-3 last:border-0">
              <dt className="shrink-0 text-xs font-medium text-brown-light">{col.label}</dt>
              <dd className={`min-w-0 break-words text-right text-sm ${col.numeric ? "tabular-nums" : ""} ${col.prominent || i === 0 ? "font-bold" : "font-medium"} ${field.missing ? (isWalkin ? "text-brown-light" : "text-orange-600") : "text-brown-dark"}`}>{field.value}</dd>
            </div>
          );
        })}
      </dl>
      {isWalkin && wr?.copra_condition && (
        <p className="mt-3 text-xs text-brown-light">Quality: <span className="font-semibold text-brown-mid">{wr.copra_condition}</span></p>
      )}
    </>
  );
}
