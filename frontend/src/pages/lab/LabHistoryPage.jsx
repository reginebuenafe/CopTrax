import { useEffect, useState } from "react";
import { LuClipboardList, LuFlaskConical } from "react-icons/lu";
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
          inspection_id, moisture_content_pct, inspected_at,
          delivery:delivery_id(
            delivery_id, delivery_source, delivery_date,
            supplier:supplier_id(first_name, last_name),
            walkin_supplier:walkin_supplier_id(first_name, last_name),
            weighing_records(net_weight_kg)
          ),
          quality_results(result, remarks)
        `)
        .eq("lab_staff_id", user.id)
        .order("inspected_at", { ascending: false });

      setRecords(data ?? []);
      setLoading(false);
    }
    fetchHistory();
  }, [user.id]);

  function getSupplierName(delivery) {
    if (!delivery) return "—";
    return delivery.delivery_source === "Walkin"
      ? `${delivery.walkin_supplier?.first_name ?? ""} ${delivery.walkin_supplier?.last_name ?? ""}`.trim()
      : `${delivery.supplier?.first_name ?? ""} ${delivery.supplier?.last_name ?? ""}`.trim();
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
            {/* Desktop table — Supplier, Date, Net Weight, Moisture (cc) only */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-beige text-brown-light text-xs uppercase tracking-wide">
                  <tr>
                    {["Supplier", "Date", "Moisture (cc)"].map(h => (
                      <th key={h} className="px-5 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige-dark/20">
                  {records.map(r => {
                    const d = r.delivery;
                    const mc = r.moisture_content_pct;
                    return (
                      <tr key={r.inspection_id} className="hover:bg-beige/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-brown-dark">
                          {getSupplierName(d) || <span className="text-brown-light italic text-xs">Unknown supplier</span>}
                        </td>
                        <td className="px-5 py-3.5 text-brown-mid">
                          {d?.delivery_date ? new Date(d.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-brown-dark">{mc} cc</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — Supplier, Date, Moisture (cc) only */}
            <div className="md:hidden space-y-3 p-4">
              {records.map(r => {
                const d = r.delivery;
                const mc = r.moisture_content_pct;

                return (
                  <div key={r.inspection_id} className="bg-white rounded-xl border border-beige-dark/40 p-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2.5 mb-1">
                        <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                          <LuFlaskConical className="w-4 h-4 text-purple-500" />
                        </div>
                        <p className="font-semibold text-brown-dark">{getSupplierName(d)}</p>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-brown-light">Date</span>
                        <span className="font-semibold text-brown-dark text-right">
                          {d?.delivery_date ? new Date(d.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-brown-light">Moisture (cc)</span>
                        <span className="font-semibold text-brown-dark text-right">{mc} cc</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}