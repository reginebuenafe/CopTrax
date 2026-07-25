import { useEffect, useState } from "react";
import {
  LuFlaskConical, LuCheck, LuX, LuSearch,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmt3(n) { return Number(n ?? 0).toFixed(3); }

export default function BOQualityPage() {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchAll() {
      const { data } = await supabase
        .from("laboratory_inspections")
        .select(`
          inspection_id, moisture_content_pct, inspected_at,
          lab_staff:lab_staff_id(first_name, last_name),
          delivery:delivery_id(
            delivery_id, delivery_source, delivery_date,
            contract:contract_id(contract_number, supplier:supplier_id(first_name, last_name)),
            walkin_supplier:walkin_supplier_id(first_name, last_name),
            weighing_records(net_weight_kg)
          ),
          quality_results(result, remarks)
        `)
        .order("inspected_at", { ascending: false });
      setInspections(data ?? []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  function getSupplierName(d) {
    if (!d) return "—";
    return d.delivery_source === "Walkin"
      ? `${d.walkin_supplier?.first_name ?? ""} ${d.walkin_supplier?.last_name ?? ""}`.trim()
      : `${d.contract?.supplier?.first_name ?? ""} ${d.contract?.supplier?.last_name ?? ""}`.trim();
  }

  const filtered = inspections.filter(i => {
    const result = i.quality_results?.[0]?.result;
    if (filter === "Accepted" && result !== "Accepted") return false;
    if (filter === "Rejected" && result !== "Rejected") return false;
    if (search) {
      const q = search.toLowerCase();
      return getSupplierName(i.delivery).toLowerCase().includes(q) ||
        i.delivery?.contract?.contract_number?.toLowerCase().includes(q);
    }
    return true;
  });

  const acceptedCount = inspections.filter(i => i.quality_results?.[0]?.result === "Accepted").length;
  const rejectedCount = inspections.filter(i => i.quality_results?.[0]?.result === "Rejected").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
          <LuFlaskConical className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Quality Results</h1>
          <p className="text-brown-light text-sm">All laboratory inspection records</p>
        </div>
      </div>

      {/* Summary */}
      {!loading && inspections.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 px-5 py-4">
            <p className="text-xs text-brown-light mb-1">Total Inspections</p>
            <p className="text-2xl font-extrabold text-brown-dark">{inspections.length}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 px-5 py-4">
            <p className="text-xs text-brown-light mb-1">Accepted</p>
            <p className="text-2xl font-extrabold text-green-dark">{acceptedCount}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 px-5 py-4">
            <p className="text-xs text-brown-light mb-1">Rejected</p>
            <p className="text-2xl font-extrabold text-red-600">{rejectedCount}</p>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, contract…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
          />
        </div>
        <div className="flex gap-1 bg-beige rounded-xl p-1">
          {["All", "Accepted", "Rejected"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
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
            <LuFlaskConical className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No quality records found</p>
          <p className="text-brown-light text-sm mt-1">Lab inspections will appear here after Laboratory Staff records moisture content.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-beige text-brown-light text-xs uppercase tracking-wide">
                <tr>
                  {["Supplier", "Type", "Date", "Net Weight", "Moisture %", "Discount %", "Final Weight", "Result", "Inspector"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-beige-dark/20">
                {filtered.map(i => {
                  const result = i.quality_results?.[0]?.result;
                  const remarkMatch = i.quality_results?.[0]?.remarks?.match(/Discount:\s*([\d.]+)%/);
                  const discountPct = remarkMatch ? parseFloat(remarkMatch[1]) : 0;
                  const netKg = i.delivery?.weighing_records?.[0]?.net_weight_kg ?? 0;
                  const finalKg = Number(netKg) * (1 - discountPct / 100);

                  return (
                    <tr key={i.inspection_id} className="hover:bg-beige/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-brown-dark">{getSupplierName(i.delivery)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          i.delivery?.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                        }`}>
                          {i.delivery?.delivery_source === "Walkin" ? "Walk-in" : "Contractual"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brown-mid whitespace-nowrap">{fmtDate(i.delivery?.delivery_date)}</td>
                      <td className="px-4 py-3 text-brown-mid">{fmt3(netKg)} kg</td>
                      <td className="px-4 py-3 font-semibold text-brown-dark">{i.moisture_content_pct}%</td>
                      <td className="px-4 py-3 text-brown-mid">{result === "Rejected" ? "—" : `${discountPct}%`}</td>
                      <td className="px-4 py-3 font-semibold text-brown-dark">{result === "Rejected" ? "—" : `${finalKg.toFixed(3)} kg`}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                          result === "Accepted" ? "bg-green-pale text-green-dark" : "bg-red-50 text-red-600"
                        }`}>
                          {result === "Accepted" ? <LuCheck className="w-3 h-3" /> : <LuX className="w-3 h-3" />}
                          {result ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brown-light text-xs">
                        {i.lab_staff?.first_name} {i.lab_staff?.last_name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-beige-dark/20">
            {filtered.map(i => {
              const result = i.quality_results?.[0]?.result;
              const remarkMatch = i.quality_results?.[0]?.remarks?.match(/Discount:\s*([\d.]+)%/);
              const discountPct = remarkMatch ? parseFloat(remarkMatch[1]) : 0;
              const netKg = i.delivery?.weighing_records?.[0]?.net_weight_kg ?? 0;
              const finalKg = Number(netKg) * (1 - discountPct / 100);
              return (
                <li key={i.inspection_id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-semibold text-brown-dark text-sm">{getSupplierName(i.delivery)}</p>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      result === "Accepted" ? "bg-green-pale text-green-dark" : "bg-red-50 text-red-600"
                    }`}>
                      {result === "Accepted" ? <LuCheck className="w-3 h-3" /> : <LuX className="w-3 h-3" />}
                      {result}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-brown-mid">
                    <p>Moisture: <span className="font-semibold text-brown-dark">{i.moisture_content_pct}%</span></p>
                    <p>Net: <span className="font-semibold text-brown-dark">{fmt3(netKg)} kg</span></p>
                    {result === "Accepted" && <>
                      <p>Discount: <span className="font-semibold text-brown-dark">{discountPct}%</span></p>
                      <p>Final: <span className="font-semibold text-green-dark">{finalKg.toFixed(3)} kg</span></p>
                    </>}
                    <p className="col-span-2 text-brown-light">{fmtDate(i.delivery?.delivery_date)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
