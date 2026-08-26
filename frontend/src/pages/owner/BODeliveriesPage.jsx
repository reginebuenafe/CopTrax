import { useEffect, useState } from "react";
import {
  LuTruck, LuFlaskConical, LuCheck, LuX, LuClock,
  LuChevronDown, LuChevronUp, LuSearch,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmt3(n) { return Number(n ?? 0).toFixed(2); }
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
  Weighed:   { color: "bg-blue-50 text-blue-600",          label: "Weighed",   icon: LuTruck },
  Inspected: { color: "bg-purple-50 text-purple-600",      label: "Inspected", icon: LuFlaskConical },
  Accepted:  { color: "bg-green-pale text-green-dark",     label: "Accepted",  icon: LuCheck },
  Rejected:  { color: "bg-red-50 text-red-600",            label: "Rejected",  icon: LuX },
};
const FILTERS = ["All", "Pending", "Weighed", "Inspected", "Accepted", "Rejected"];

export default function BODeliveriesPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

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

  const filtered = deliveries.filter(d => {
    if (filter !== "All" && d.delivery_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return getSupplierName(d).toLowerCase().includes(q) ||
        d.contract?.contract_number?.toLowerCase().includes(q) ||
        d.batch_number?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="pt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <LuTruck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Deliveries</h1>
          <p className="text-brown-light text-sm">All delivery records — contractual and walk-in</p>
        </div>
        {!loading && <span className="ml-auto text-xs text-brown-light">{deliveries.length} total</span>}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, contract, batch…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
          />
        </div>
        <div className="flex gap-1 bg-beige rounded-xl p-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${filter === f ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-mid"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuTruck className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No deliveries found</p>
          <p className="text-brown-light text-sm mt-1">Deliveries recorded by weighers will appear here.</p>
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
            const remarkMatch = qr?.remarks?.match(/Discount:\s*([\d.]+)%/);
            const discountPct = remarkMatch ? parseFloat(remarkMatch[1]) : 0;
            const finalKg = wr ? Number(wr.net_weight_kg) * (1 - discountPct / 100) : null;
            const contractRef = d.delivery_source === "Contract-based" ? contractLabel(d) : null;
            const allocs = (d.delivery_allocations ?? [])
              .slice()
              .sort((a, b) => a.sequence_order - b.sequence_order);

            return (
              <div key={d.delivery_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : d.delivery_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/20 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.color.split(" ")[0]}`}>
                    <StatusIcon className={`w-5 h-5 ${meta.color.split(" ")[1]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-brown-dark text-sm">{getSupplierName(d)}</p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        d.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                      }`}>
                        {d.delivery_source === "Walkin" ? "Walk-in" : "Contractual"}
                      </span>
                    </div>
                    <p className="text-brown-light text-xs">
                      {fmtDate(d.delivery_date)}
                      {contractRef ? ` · ${contractRef}` : ""}
                      {wr ? ` · ${fmt3(wr.net_weight_kg)} kg net` : ""}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${meta.color}`}>
                    {meta.label}
                  </span>
                  {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-5 py-4">
                    {/* Weighing + Quality grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                      {wr && d.delivery_source === "Walkin" ? <>
                        {/* Walk-in: show only Gross Weight, Quality, Net Weight, Weigher */}
                        <InfoItem label="Gross Weight" value={`${fmt3(wr.gross_weight_kg)} kg`} />
                        <InfoItem label="Quality" value={wr.copra_condition ?? "—"} />
                        <InfoItem label="Net Weight"   value={`${fmt3(wr.net_weight_kg)} kg`} />
                        <InfoItem label="Weigher"      value={`${d.weigher?.first_name ?? ""} ${d.weigher?.last_name ?? ""}`.trim() || "—"} />
                      </> : !wr && d.delivery_source === "Walkin" ? (
                        <div className="col-span-4 text-center py-2 text-brown-light text-xs italic">
                          Weighing record unavailable — this delivery was recorded before the condition tracking update. Please delete and re-record it.
                        </div>
                      ) : wr ? <>
                        <InfoItem label="Gross Weight" value={`${fmt3(wr.gross_weight_kg)} kg`} />
                        <InfoItem label="Tare Weight"  value={`${fmt3(wr.tare_weight_kg)} kg`} />
                        <InfoItem label="Net Weight"   value={`${fmt3(wr.net_weight_kg)} kg`} />
                        <InfoItem label="Weigher"      value={`${d.weigher?.first_name ?? ""} ${d.weigher?.last_name ?? ""}`.trim() || "—"} />
                      </> : null}
                      {d.delivery_source !== "Walkin" && (
                        li ? <>
                          <InfoItem label="Moisture (cc)" value={`${li.moisture_content_pct}cc`} />
                          <InfoItem label="PCA Discount" value={`${discountPct}%`} />
                          <InfoItem label="Final Weight" value={finalKg !== null ? `${finalKg.toFixed(2)} kg` : "—"} />
                          <InfoItem label="Quality Result" value={qr?.result ?? "—"} highlight={qr?.result} />
                        </> : (
                          <InfoItem label="Quality Result" value="Pending" />
                        )
                      )}
                    </div>
                    {/* Lab staff + inspected date — contractual only */}
                    {d.delivery_source !== "Walkin" && li && (
                      <div className="flex flex-wrap gap-4 text-xs text-brown-light mb-3">
                        <span>
                          Lab Staff:{" "}
                          <span className="font-semibold text-brown-mid">
                            {`${li.lab_staff?.first_name ?? ""} ${li.lab_staff?.last_name ?? ""}`.trim() || "—"}
                          </span>
                        </span>
                        {li.inspected_at && (
                          <span>
                            Inspected:{" "}
                            <span className="font-semibold text-brown-mid">{fmtDate(li.inspected_at)}</span>
                          </span>
                        )}
                        {qr?.remarks && (
                          <span>
                            Remarks:{" "}
                            <span className="font-semibold text-brown-mid">{qr.remarks}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {(d.truck_plate_number || d.batch_number) && (
                      <div className="flex gap-4 text-xs text-brown-light">
                        {d.batch_number && <span>Batch: <span className="font-semibold text-brown-mid">{d.batch_number}</span></span>}
                        {d.truck_plate_number && <span>Plate: <span className="font-semibold text-brown-mid">{d.truck_plate_number}</span></span>}
                      </div>
                    )}
                    {/* Allocation breakdown — shown only for contractual deliveries with allocation data */}
                    {d.delivery_source === "Contract-based" && allocs.length > 0 && (
                      <div className="mt-3 bg-beige rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-brown-light uppercase tracking-wide mb-2">
                          Allocation Breakdown
                        </p>
                        <div className="space-y-1.5">
                          {allocs.map((a, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded-full font-semibold ${
                                  a.price_type === "Spot"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-green-pale text-green-dark"
                                }`}>
                                  {a.price_type}
                                </span>
                                <span className="font-semibold text-brown-dark">
                                  {a.contract_id
                                    ? (a.contract?.contract_number ?? "Contract")
                                    : "Spot Price"
                                  }
                                </span>
                              </div>
                              <div className="text-right text-brown-mid">
                                <span className="font-semibold">{fmt3(a.allocated_weight_kg)} kg</span>
                                {a.contract_id && a.contract?.negotiated_price_per_kg && (
                                  <span className="text-brown-light ml-2">{peso(a.contract.negotiated_price_per_kg)}/kg</span>
                                )}
                              </div>
                            </div>
                          ))}
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

function InfoItem({ label, value, highlight }) {
  return (
    <div className="bg-beige rounded-xl px-3 py-2.5">
      <p className="text-brown-light text-xs mb-0.5">{label}</p>
      <p className={`font-semibold text-sm ${
        highlight === "Accepted" ? "text-green-dark" :
        highlight === "Rejected" ? "text-red-600" : "text-brown-dark"
      }`}>{value}</p>
    </div>
  );
}
