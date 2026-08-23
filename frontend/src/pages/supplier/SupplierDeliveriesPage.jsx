import { useEffect, useState } from "react";
import {
  LuTruck, LuFlaskConical, LuCheck, LuX, LuClock,
  LuChevronDown, LuChevronUp,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmt3(n) { return Number(n ?? 0).toFixed(3); }

function contractLabel(d) {
  const allocs = (d.delivery_allocations ?? []).filter(a => a.contract_id);
  if (allocs.length === 0) return d.contract?.contract_number ?? null;
  const nums = [...new Set(allocs.map(a => a.contract?.contract_number).filter(Boolean))];
  if (nums.length === 1) return nums[0];
  return `${nums.length} Contracts`;
}

const STATUS_META = {
  Pending:   { color: "bg-beige text-brown-mid",        label: "Pending",   icon: LuClock },
  Weighed:   { color: "bg-blue-50 text-blue-600",        label: "Weighed",   icon: LuTruck },
  Inspected: { color: "bg-purple-50 text-purple-600",    label: "Inspected", icon: LuFlaskConical },
  Accepted:  { color: "bg-green-pale text-green-dark",   label: "Accepted",  icon: LuCheck },
  Rejected:  { color: "bg-red-50 text-red-600",          label: "Rejected",  icon: LuX },
};

const FILTERS = ["All", "Pending", "Weighed", "Accepted", "Rejected"];

export default function SupplierDeliveriesPage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [filter, setFilter] = useState("All");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeliveries() {
      const { data } = await supabase
        .from("deliveries")
        .select(`
          delivery_id, delivery_status, delivery_date, delivery_source,
          truck_plate_number, batch_number,
          contract:contract_id(contract_number, due_date, negotiated_price_per_kg),
          delivery_allocations(contract_id, allocated_weight_kg, price_type, sequence_order,
            contract:contract_id(contract_number)),
          weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg, weighed_at),
          laboratory_inspections(moisture_content_pct, inspected_at),
          quality_results(result, remarks),
          payments(payment_id, payment_status, total_amount)
        `)
        .eq("supplier_id", user.id)
        .eq("delivery_source", "Contract-based")
        .order("delivery_date", { ascending: false });

      setDeliveries(data ?? []);
      setLoading(false);
    }
    fetchDeliveries();
  }, [user.id]);

  const filtered = filter === "All" ? deliveries : deliveries.filter(d => d.delivery_status === filter);

  return (
    <div>
      <div className="flex items-center gap-3 mt-5 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <LuTruck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Deliveries</h1>
          <p className="text-brown-light text-sm">All your contractual delivery records</p>
        </div>
        {!loading && (
          <span className="ml-auto text-xs text-brown-light">{deliveries.length} total</span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-1 bg-beige rounded-xl p-1 mb-6 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
              ${filter === f ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-mid"}`}>
            {f}
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
            const payment = d.payments;
            const allocs = (d.delivery_allocations ?? [])
              .slice()
              .sort((a, b) => a.sequence_order - b.sequence_order);
            const label = contractLabel(d);

            // Compute discount from remarks
            const remarkMatch = qr?.remarks?.match(/Discount:\s*([\d.]+)%/);
            const discountPct = remarkMatch ? parseFloat(remarkMatch[1]) : 0;
            const finalKg = wr ? Number(wr.net_weight_kg) * (1 - discountPct / 100) : null;

            // Derive overall price type from allocations
            const hasSpot = allocs.some(a => a.price_type === "Spot");
            const hasNeg  = allocs.some(a => a.price_type === "Negotiated");
            const priceTypeLabel = hasSpot && hasNeg ? "Mixed (Negotiated + Spot)"
              : hasSpot ? "Spot" : hasNeg ? "Negotiated" : null;

            return (
              <div key={d.delivery_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : d.delivery_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/20 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.color.split(" ")[0]}`}>
                    <StatusIcon className={`w-5 h-5 ${meta.color.split(" ")[1]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-brown-dark">{label ?? "—"}</p>
                    </div>
                    <p className="text-brown-light text-xs">{fmtDate(d.delivery_date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
                      {meta.label}
                    </span>
                    {wr && (
                      <p className="text-xs text-brown-light mt-1">{fmt3(wr.net_weight_kg)} kg net</p>
                    )}
                  </div>
                  {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-5 py-4 space-y-4">
                    {/* Weighing */}
                    {wr && (
                      <Section title="Weighing" icon={LuTruck}>
                        <Grid items={[
                          { label: "Gross Weight", value: `${fmt3(wr.gross_weight_kg)} kg` },
                          { label: "Tare Weight",  value: `${fmt3(wr.tare_weight_kg)} kg` },
                          { label: "Net Weight",   value: `${fmt3(wr.net_weight_kg)} kg` },
                          { label: "Weighed At",   value: fmtDate(wr.weighed_at) },
                        ]} />
                      </Section>
                    )}

                    {/* Quality */}
                    {li && (
                      <Section title="Quality Inspection" icon={LuFlaskConical}>
                        <Grid items={[
                          { label: "Moisture Content", value: `${li.moisture_content_pct}%` },
                          { label: "PCA Discount",     value: `${discountPct}%` },
                          { label: "Final Weight",     value: finalKg !== null ? `${finalKg.toFixed(3)} kg` : "—" },
                          { label: "Result",           value: qr?.result ?? "—", highlight: qr?.result },
                        ]} />
                      </Section>
                    )}

                    {/* Allocation breakdown */}
                    {allocs.length > 0 && (
                      <Section title="Allocation" icon={LuCheck}>
                        <div className="space-y-1.5">
                          {allocs.map((a, i) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-beige rounded-lg px-3 py-2">
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
                              <span className="font-semibold text-brown-dark">{fmt3(a.allocated_weight_kg)} kg</span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Payment */}
                    {payment && (
                      <Section title="Payment" icon={LuCheck}>
                        <Grid items={[
                          { label: "Status",     value: payment.payment_status },
                          priceTypeLabel && { label: "Price Type", value: priceTypeLabel },
                        ].filter(Boolean)} />
                      </Section>
                    )}

                    {/* Truck info */}
                    {(d.truck_plate_number || d.batch_number) && (
                      <Section title="Delivery Info" icon={LuTruck}>
                        <Grid items={[
                          d.batch_number    && { label: "Batch #",    value: d.batch_number },
                          d.truck_plate_number && { label: "Plate #", value: d.truck_plate_number },
                        ].filter(Boolean)} />
                      </Section>
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

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <p className="text-xs text-brown-light font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5" /> {title}
      </p>
      {children}
    </div>
  );
}

function Grid({ items }) {
  return (
    <div className="bg-beige rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3">
      {items.map((item, i) => (
        <div key={i}>
          <p className="text-brown-light text-xs">{item.label}</p>
          <p className={`font-semibold text-sm mt-0.5 ${
            item.highlight === "Accepted" ? "text-green-dark" :
            item.highlight === "Rejected" ? "text-red-600" :
            "text-brown-dark"
          }`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
