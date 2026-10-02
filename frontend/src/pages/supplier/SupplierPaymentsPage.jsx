import { useEffect, useState } from "react";
import {
  LuWallet, LuCheck, LuClock, LuX, LuLoader, LuChevronDown, LuChevronUp,
  LuReceipt,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
// Reuse the exact same receipt UI/logic already used in BO Payments —
// do not duplicate the receipt format.
import { BatchReceiptModal } from "../owner/PaymentsPage.jsx";

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt3(n) { return Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_META = {
  Pending:    { color: "bg-amber-50 text-amber-700",  icon: LuClock,  label: "Pending" },
  Processing: { color: "bg-blue-50 text-blue-600",    icon: LuLoader, label: "Processing" },
  Released:   { color: "bg-green-pale text-green-dark", icon: LuCheck, label: "Released" },
  Failed:     { color: "bg-red-50 text-red-600",       icon: LuX,    label: "Failed" },
};

export default function SupplierPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  // Which payment's receipt is currently open in the shared BatchReceiptModal.
  const [receiptPayment, setReceiptPayment] = useState(null);

  useEffect(() => {
    async function fetchPayments() {
      // Scoped server-side to the authenticated Supplier's own user id — never
      // trusted from the frontend alone. RLS on payments/payment_details/
      // e_receipts/bank_accounts independently enforces the same ownership
      // (supplier_id = auth.uid() / user_id = auth.uid()), so this query can
      // never return, and RLS can never be bypassed into returning, another
      // Supplier's payment or receipt data.
      // Field set mirrors the BO Payments query exactly (see PaymentsPage.jsx)
      // so the shared BatchReceiptModal can render this data unmodified.
      const { data } = await supabase
        .from("payments")
        .select(`
          payment_id, payment_week, payment_date, total_amount,
          payment_status, reference_number, payment_method, created_at,
          supplier:supplier_id(first_name, last_name, bank_accounts(bank_name, account_name, account_number)),
          payment_details(
            payment_detail_id, delivery_id, gross_weight_kg, tare_weight_kg,
            net_weight_kg, final_weight_kg,
            moisture_content_pct, price_type, price_per_kg_used,
            moisture_deduction_kg, pca_discount_amount, line_amount,
            delivery:delivery_id(weigher:weigher_id(first_name, last_name))
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
    .filter(p => p.payment_status === "Pending" || p.payment_status === "Processing")
    .reduce((s, p) => s + Number(p.total_amount), 0);

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-brown-dark">Payments</h1>
          <p className="text-brown-light text-sm mt-0.5">Your disbursement history from NERC Copra Trading</p>
        </div>
        {!loading && payments.length > 0 && (
          <span className="text-xs text-brown-light shrink-0">{payments.length} total</span>
        )}
      </div>

      {/* Summary */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-beige-dark/40 rounded-xl px-5 py-4">
            <p className="text-2xl font-bold text-green-dark leading-none">{peso(totalReleased)}</p>
            <p className="text-xs text-brown-light mt-1.5 leading-snug">Total Received</p>
          </div>
          <div className="bg-white border border-beige-dark/40 rounded-xl px-5 py-4">
            <p className="text-2xl font-bold text-amber-600 leading-none">{peso(totalPending)}</p>
            <p className="text-xs text-brown-light mt-1.5 leading-snug">Pending</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4">
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
              <div key={p.payment_id} className="bg-white border border-beige-dark/40 rounded-xl overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : p.payment_id)}
                  className="w-full flex flex-col items-stretch gap-3 px-4 py-4 hover:bg-beige/30 transition-colors text-left sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-brown-dark">Week of {fmtDate(p.payment_week)}</p>
                      <p className="text-brown-light text-xs break-words">
                        {p.payment_details?.length ?? 0} delivery(ies)
                        {p.payment_date ? ` · Paid ${fmtDate(p.payment_date)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:block sm:text-right sm:shrink-0">
                    <p className="text-xl font-extrabold text-brown-dark">{peso(p.total_amount)}</p>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
                      <StatusIcon className="w-3 h-3" />{meta.label}
                    </span>
                    {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0 sm:hidden" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0 sm:hidden" />}
                  </div>
                  {isOpen ? <LuChevronUp className="hidden w-4 h-4 text-brown-light shrink-0 sm:block" /> : <LuChevronDown className="hidden w-4 h-4 text-brown-light shrink-0 sm:block" />}
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

                    {/* View Receipt — same eligibility rule as BO Payments'
                        "E-Receipt" action (payment already Released), and
                        reuses the exact same BatchReceiptModal component. */}
                    {p.payment_status === "Released" && (p.payment_details?.length ?? 0) > 0 && (
                      <button
                        onClick={() => setReceiptPayment(p)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-green-mid/40 text-green-dark font-semibold text-xs hover:bg-green-pale transition-all"
                      >
                        <LuReceipt className="w-3.5 h-3.5" /> View Receipt
                      </button>
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
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <div className="min-w-0 text-sm">
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
                                <p className="font-bold text-brown-dark shrink-0 sm:text-right">{peso(pd.line_amount)}</p>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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

      {/* Same shared receipt modal used by BO Payments — ownership is
          guaranteed by the query above (.eq("supplier_id", user.id)) and by
          RLS on payments/payment_details/e_receipts/bank_accounts, so this
          can only ever render the authenticated Supplier's own receipt. */}
      {receiptPayment && (
        <BatchReceiptModal
          batch={receiptPayment}
          onClose={() => setReceiptPayment(null)}
        />
      )}
    </div>
  );
}
