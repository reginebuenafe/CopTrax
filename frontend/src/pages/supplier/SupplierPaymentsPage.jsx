import { useEffect, useState } from "react";
import {
  LuWallet, LuCheck, LuClock, LuX, LuChevronDown, LuChevronUp,
  LuReceipt,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt3(n) { return Number(n ?? 0).toFixed(2); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_META = {
  Pending:  { color: "bg-amber-50 text-amber-700",  icon: LuClock, label: "Pending" },
  Released: { color: "bg-green-pale text-green-dark", icon: LuCheck, label: "Released" },
  Failed:   { color: "bg-red-50 text-red-600",       icon: LuX,    label: "Failed" },
};

export default function SupplierPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    async function fetchPayments() {
      const { data } = await supabase
        .from("payments")
        .select(`
          payment_id, payment_week, payment_date, total_amount,
          payment_status, reference_number, payment_method, created_at,
          payment_details(
            payment_detail_id, delivery_id, net_weight_kg, final_weight_kg,
            moisture_content_pct, price_type, price_per_kg_used,
            moisture_deduction_kg, line_amount
          ),
          e_receipts(receipt_number, generated_at)
        `)
        .eq("supplier_id", user.id)
        .order("created_at", { ascending: false });

      setPayments(data ?? []);
      setLoading(false);
    }
    fetchPayments();
  }, [user.id]);

  const totalReleased = payments
    .filter(p => p.payment_status === "Released")
    .reduce((s, p) => s + Number(p.total_amount), 0);
  const totalPending = payments
    .filter(p => p.payment_status === "Pending")
    .reduce((s, p) => s + Number(p.total_amount), 0);

  return (
    <div className="pt-6">
      <div className="flex items-center gap-3 mt-5 mb-6">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <LuWallet className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Payments</h1>
          <p className="text-brown-light text-sm">Your disbursement history from NERC Copra Trading</p>
        </div>
      </div>

      {/* Summary */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 px-5 py-4">
            <p className="text-xs text-brown-light mb-1">Total Received</p>
            <p className="text-xl font-extrabold text-green-dark">{peso(totalReleased)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 px-5 py-4">
            <p className="text-xs text-brown-light mb-1">Pending</p>
            <p className="text-xl font-extrabold text-amber-600">{peso(totalPending)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuWallet className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No payments yet</p>
          <p className="text-brown-light text-sm mt-1">Payments created by the Business Owner will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map(p => {
            const meta = STATUS_META[p.payment_status] ?? STATUS_META.Pending;
            const StatusIcon = meta.icon;
            const isOpen = expanded === p.payment_id;
            const receipt = p.e_receipts?.[0];

            return (
              <div key={p.payment_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : p.payment_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/20 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.color.split(" ")[0]}`}>
                    <StatusIcon className={`w-5 h-5 ${meta.color.split(" ")[1]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brown-dark">Week of {fmtDate(p.payment_week)}</p>
                    <p className="text-brown-light text-xs">
                      {p.payment_details?.length ?? 0} delivery(ies)
                      {p.payment_date ? ` · Paid ${fmtDate(p.payment_date)}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-extrabold text-brown-dark">{peso(p.total_amount)}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-5 py-4 space-y-4">
                    {/* Receipt */}
                    {receipt && (
                      <div className="flex items-center gap-3 bg-green-pale rounded-xl px-4 py-3">
                        <LuReceipt className="w-5 h-5 text-green-dark" />
                        <div>
                          <p className="text-xs text-green-dark font-semibold">E-Receipt Generated</p>
                          <p className="font-mono text-brown-dark text-sm font-bold">{receipt.receipt_number}</p>
                          {receipt.generated_at && (
                            <p className="text-xs text-brown-light">{fmtDate(receipt.generated_at)}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Reference */}
                    {p.reference_number && (
                      <div className="bg-beige rounded-xl px-4 py-3 text-sm">
                        <p className="text-brown-light text-xs mb-0.5">Reference Number</p>
                        <p className="font-mono font-semibold text-brown-dark">{p.reference_number}</p>
                      </div>
                    )}

                    {/* Delivery breakdown */}
                    {(p.payment_details?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-2">Delivery Breakdown</p>
                        <div className="bg-beige rounded-xl divide-y divide-beige-dark/30">
                          {p.payment_details.map((pd, i) => (
                            <div key={pd.payment_detail_id} className="px-4 py-3">
                              <div className="flex justify-between items-start gap-3">
                                <div className="text-sm">
                                  <p className="text-brown-light text-xs">Delivery {i + 1}</p>
                                  <p className="text-brown-mid">
                                    {fmt3(pd.net_weight_kg)} kg net
                                    {pd.moisture_deduction_kg > 0 ? ` − ${fmt3(pd.moisture_deduction_kg)} kg (${pd.moisture_content_pct}cc MC)` : ""}
                                    {" = "}<span className="font-semibold text-brown-dark">{fmt3(pd.final_weight_kg)} kg final</span>
                                  </p>
                                  <p className="text-brown-mid text-xs mt-0.5">
                                    × {peso(pd.price_per_kg_used)}/kg
                                    <span className={`ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                                      pd.price_type === "Spot" ? "bg-red-50 text-red-500" : "bg-green-pale text-green-dark"
                                    }`}>
                                      {pd.price_type === "Spot" ? "Late/Spot" : "On-time"}
                                    </span>
                                  </p>
                                </div>
                                <p className="font-bold text-brown-dark shrink-0">{peso(pd.line_amount)}</p>
                              </div>
                            </div>
                          ))}
                          <div className="px-4 py-3 flex justify-between items-center">
                            <p className="font-semibold text-brown-dark text-sm">Total</p>
                            <p className="text-lg font-extrabold text-green-dark">{peso(p.total_amount)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-beige rounded-xl px-3 py-2.5">
                        <p className="text-xs text-brown-light">Method</p>
                        <p className="font-semibold text-brown-dark">{p.payment_method}</p>
                      </div>
                      <div className="bg-beige rounded-xl px-3 py-2.5">
                        <p className="text-xs text-brown-light">Status</p>
                        <p className={`font-semibold ${meta.color.split(" ")[1]}`}>{p.payment_status}</p>
                      </div>
                    </div>
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
