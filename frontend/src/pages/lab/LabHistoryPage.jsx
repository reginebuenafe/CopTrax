import { useEffect, useState } from "react";
import { LuClipboardList, LuCheck, LuX, LuFlaskConical } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function LabHistoryPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const { data } = await supabase
        .from("laboratory_inspections")
        .select(`
          inspection_id, moisture_content_pct, created_at,
          delivery:delivery_id(
            delivery_id, delivery_source, delivery_date,
            contract:contract_id(contract_number, supplier:supplier_id(first_name, last_name)),
            walkin_supplier:walkin_supplier_id(first_name, last_name),
            weighing_records(net_weight_kg)
          ),
          quality_results(result, remarks)
        `)
        .eq("lab_staff_id", user.id)
        .order("created_at", { ascending: false });

      setRecords(data ?? []);
      setLoading(false);
    }
    fetchHistory();
  }, [user.id]);

  function getSupplierName(delivery) {
    if (!delivery) return "—";
    return delivery.delivery_source === "Walkin"
      ? `${delivery.walkin_supplier?.first_name ?? ""} ${delivery.walkin_supplier?.last_name ?? ""}`.trim()
      : `${delivery.contract?.supplier?.first_name ?? ""} ${delivery.contract?.supplier?.last_name ?? ""}`.trim();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-beige rounded-xl flex items-center justify-center">
          <LuClipboardList className="w-5 h-5 text-brown-mid" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Inspection History</h1>
          <p className="text-brown-light text-sm">Your completed quality inspections</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuClipboardList className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">No inspections yet</p>
            <p className="text-brown-light text-sm mt-1">Your completed inspections will appear here.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-beige text-brown-light text-xs uppercase tracking-wide">
                  <tr>
                    {["Supplier", "Type", "Date", "Net Weight", "Moisture %", "Discount", "Final Weight", "Result"].map(h => (
                      <th key={h} className="px-5 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige-dark/20">
                  {records.map(r => {
                    const d = r.delivery;
                    const result = r.quality_results?.[0]?.result ?? "—";
                    const netKg = d?.weighing_records?.[0]?.net_weight_kg ?? 0;
                    const mc = r.moisture_content_pct;
                    const discount = mc >= 5.0 && mc <= 20.2
                      ? null  // already stored, show from remarks or re-derive
                      : 0;

                    // Parse discount from remarks: "Discount: X%"
                    const remarksMatch = r.quality_results?.[0]?.remarks?.match(/Discount: ([\d.]+)%/);
                    const discountPct = remarksMatch ? parseFloat(remarksMatch[1]) : 0;
                    const finalKg = netKg * (1 - discountPct / 100);

                    return (
                      <tr key={r.inspection_id} className="hover:bg-beige/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-brown-dark">{getSupplierName(d)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            d?.delivery_source === "Walkin"
                              ? "bg-orange-50 text-orange-600"
                              : "bg-green-pale text-green-dark"
                          }`}>
                            {d?.delivery_source === "Walkin" ? "Walk-in" : "Contractual"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-brown-mid">
                          {d?.delivery_date ? new Date(d.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-brown-mid">{Number(netKg).toFixed(3)} kg</td>
                        <td className="px-5 py-3.5 font-semibold text-brown-dark">{mc}%</td>
                        <td className="px-5 py-3.5 text-brown-mid">
                          {result === "Rejected" ? "—" : `${discountPct}%`}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-brown-dark">
                          {result === "Rejected" ? "—" : `${finalKg.toFixed(3)} kg`}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                            result === "Accepted"
                              ? "bg-green-pale text-green-dark"
                              : "bg-red-50 text-red-600"
                          }`}>
                            {result === "Accepted"
                              ? <><LuCheck className="w-3 h-3" />Accepted</>
                              : <><LuX className="w-3 h-3" />Rejected</>
                            }
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-beige-dark/20">
              {records.map(r => {
                const d = r.delivery;
                const result = r.quality_results?.[0]?.result ?? "—";
                const netKg = d?.weighing_records?.[0]?.net_weight_kg ?? 0;
                const mc = r.moisture_content_pct;
                const remarksMatch = r.quality_results?.[0]?.remarks?.match(/Discount: ([\d.]+)%/);
                const discountPct = remarksMatch ? parseFloat(remarksMatch[1]) : 0;
                const finalKg = netKg * (1 - discountPct / 100);

                return (
                  <li key={r.inspection_id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                          <LuFlaskConical className="w-4 h-4 text-purple-500" />
                        </div>
                        <p className="font-semibold text-brown-dark text-sm">{getSupplierName(d)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        result === "Accepted" ? "bg-green-pale text-green-dark" : "bg-red-50 text-red-600"
                      }`}>
                        {result === "Accepted" ? <LuCheck className="w-3 h-3" /> : <LuX className="w-3 h-3" />}
                        {result}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs text-brown-mid ml-10.5">
                      <p>Moisture: <span className="font-semibold text-brown-dark">{mc}%</span></p>
                      <p>Net: <span className="font-semibold text-brown-dark">{Number(netKg).toFixed(3)} kg</span></p>
                      {result === "Accepted" && <>
                        <p>Discount: <span className="font-semibold text-brown-dark">{discountPct}%</span></p>
                        <p>Final: <span className="font-semibold text-green-dark">{finalKg.toFixed(3)} kg</span></p>
                      </>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
