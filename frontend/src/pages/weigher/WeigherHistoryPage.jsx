import { useEffect, useState } from "react";
import { LuClipboardList, LuTruck, LuFileText, LuFlaskConical } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_COLORS = {
  Pending:   "bg-gray-100 text-gray-600",
  Weighed:   "bg-blue-50 text-blue-700",
  Inspected: "bg-purple-50 text-purple-700",
  Accepted:  "bg-green-pale text-green-dark",
  Rejected:  "bg-red-50 text-red-600",
};

export default function WeigherHistoryPage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeliveries();
  }, []);

  async function fetchDeliveries() {
    setLoading(true);
    const { data } = await supabase
      .from("deliveries")
      .select(`
        delivery_id, delivery_source, delivery_date, delivery_status,
        truck_plate_number, batch_number, created_at,
        supplier:supplier_id(first_name, last_name),
        contract:contract_id(contract_number),
        walkin_supplier:walkin_supplier_id(first_name, last_name),
        weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg)
      `)
      .eq("weigher_id", user.id)
      .order("created_at", { ascending: false });

    setDeliveries(data ?? []);
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuClipboardList className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Delivery History</h1>
          <p className="text-brown-light text-sm">All deliveries recorded by you</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuClipboardList className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">No deliveries yet</p>
            <p className="text-brown-light text-sm mt-1">Deliveries you record will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beige-dark/30 bg-beige/40">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">Supplier</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">Type</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide hidden lg:table-cell">Net Weight</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige-dark/20">
                {deliveries.map(d => {
                  const supplierName = d.delivery_source === "Walkin"
                    ? `${d.walkin_supplier?.first_name ?? ""} ${d.walkin_supplier?.last_name ?? ""}`.trim()
                    : `${d.supplier?.first_name ?? ""} ${d.supplier?.last_name ?? ""}`.trim();
                  const netWeight = d.weighing_records?.[0]?.net_weight_kg;

                  return (
                    <tr key={d.delivery_id} className="hover:bg-beige/30 transition-colors duration-150">
                      <td className="px-5 py-4">
                       <p className="font-semibold text-brown-dark">{supplierName || <span className="text-brown-light italic text-xs">Unknown supplier</span>}</p>
                        {d.delivery_source === "Contract-based" && d.contract?.contract_number && (
                          <p className="text-xs text-brown-light mt-0.5">{d.contract.contract_number}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                          d.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                        }`}>
                          {d.delivery_source === "Walkin"
                            ? <><LuTruck className="w-3 h-3" /> Walk-in</>
                            : <><LuFileText className="w-3 h-3" /> Contractual</>
                          }
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-brown-mid text-xs">
                          {new Date(d.delivery_date).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                       {netWeight != null
                         ? <p className="font-semibold text-brown-dark">{Number(netWeight).toFixed(3)} kg</p>
                         : <p className="text-brown-light text-xs italic">No weigh record</p>
                       }
                     </td>
                     <td className="px-5 py-4">
                       <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[d.delivery_status] ?? "bg-beige text-brown-mid"}`}>
                         {d.delivery_status}
                       </span>
                     </td>
                   </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
