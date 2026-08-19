import { useEffect, useState, useCallback } from "react";
import {
  LuWallet, LuCheck, LuClock, LuCircleAlert, LuChevronDown, LuChevronUp,
  LuReceipt, LuX, LuLoader, LuPackage, LuBanknote,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useSensitiveSessionTimeout } from "../../hooks/useSensitiveSessionTimeout";

const TABS = ["Ready to Pay", "Payment Batches"];

// ── helpers ──────────────────────────────────────────────────────────────────
function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt3(n) { return Number(n ?? 0).toFixed(3); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ── main component ────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [readyDeliveries, setReadyDeliveries] = useState([]); // ungrouped Accepted contractual deliveries without payment
  const [batches, setBatches] = useState([]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSupplier, setExpandedSupplier] = useState(null);
  const [batchModal, setBatchModal] = useState(null);   // { supplierId, name, deliveries }
  const [releaseModal, setReleaseModal] = useState(null); // { payment }
  useSensitiveSessionTimeout(Boolean(releaseModal));
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── data fetching ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);

    const [deliveriesRes, batchesRes, spotRes] = await Promise.all([
      supabase.from("deliveries").select(`
        delivery_id, delivery_date, delivery_source, created_at,
        supplier:supplier_id(user_id, first_name, last_name),
        delivery_allocations(allocation_id, contract_id, allocated_weight_kg, price_type, sequence_order,
          contract:contract_id(contract_number, negotiated_price_per_kg)),
        weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg),
        laboratory_inspections(moisture_content_pct),
        quality_results(result, remarks)
      `)
        .eq("delivery_source", "Contract-based")
        .eq("delivery_status", "Accepted")
        .is("payment_id", null),

      supabase.from("payments").select(`
        payment_id, payment_week, total_amount, payment_status,
        reference_number, payment_date, created_at, payment_method,
        supplier:supplier_id(first_name, last_name),
        payment_details(
          payment_detail_id, delivery_id, gross_weight_kg, tare_weight_kg,
          net_weight_kg, moisture_content_pct, moisture_deduction_kg,
          final_weight_kg, price_type, price_per_kg_used, pca_discount_amount, line_amount
        ),
        e_receipts(receipt_number)
      `).order("created_at", { ascending: false }),

      supabase.from("spot_price").select("price_per_kg").limit(1).single(),
    ]);

    const spot = spotRes.data?.price_per_kg ?? 0;
    setSpotPrice(spot);

    // Enrich each delivery with computed payment line and payment week
    const enriched = (deliveriesRes.data ?? []).map(d => ({
      ...d,
      _computed: computeLine(d, spot),
      _paymentWeek: getPaymentFriday(d.created_at),
    })).filter(d => d._computed !== null);

    setReadyDeliveries(enriched);
    setBatches(batchesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── payment computation: allocation-aware (spec §3.5) ────────────────────
  function computeLine(delivery, spot) {
    const wr   = delivery.weighing_records?.[0];
    const li   = delivery.laboratory_inspections?.[0];
    const qr   = delivery.quality_results?.[0];
    const allocs = (delivery.delivery_allocations ?? [])
      .slice()
      .sort((a, b) => a.sequence_order - b.sequence_order);

    if (!wr || !li || !qr) return null;
    if (qr.result !== "Accepted") return null;
    if (allocs.length === 0) return null;

    const mc     = parseFloat(li.moisture_content_pct);
    const netKg  = parseFloat(wr.net_weight_kg);
    const grossKg = parseFloat(wr.gross_weight_kg);
    const tareKg  = parseFloat(wr.tare_weight_kg);

    // Derive discount % from quality result remarks
    const qrRemarks  = qr.remarks ?? "";
    const remarkMatch = qrRemarks.match(/Discount:\s*([\d.]+)%/);
    const discountPct = remarkMatch ? parseFloat(remarkMatch[1]) : 0;

    const deductionKg = netKg * (discountPct / 100);
    const finalKg     = netKg - deductionKg;

    // Per-allocation line amounts; moisture discount applied proportionally
    let lineAmount = 0;
    for (const alloc of allocs) {
      const allocFinalKg   = finalKg * (parseFloat(alloc.allocated_weight_kg) / netKg);
      const allocPricePerKg = alloc.contract_id
        ? parseFloat(alloc.contract?.negotiated_price_per_kg ?? 0)
        : parseFloat(spot);
      lineAmount += allocFinalKg * allocPricePerKg;
    }

    const hasSpot  = allocs.some(a => !a.contract_id);
    const hasNeg   = allocs.some(a =>  a.contract_id);
    const priceType = hasSpot && hasNeg ? "Mixed" : hasSpot ? "Spot" : "Negotiated";
    const effectivePricePerKg = finalKg > 0 ? lineAmount / finalKg : 0;

    return {
      grossKg, tareKg, netKg, mc, discountPct, deductionKg, finalKg,
      priceType,
      pricePerKg: effectivePricePerKg,
      lineAmount,
      allocs,
    };
  }

  // ── group ready deliveries by (supplier, payment week) ───────────────────
  // Key: "userId::YYYY-MM-DD" (the disbursement Friday)
  const supplierGroups = readyDeliveries.reduce((acc, d) => {
    const sid  = d.supplier?.user_id;
    const week = d._paymentWeek;
    if (!sid) return acc;
    const key = `${sid}::${week}`;
    if (!acc[key]) acc[key] = { supplier: d.supplier, paymentWeek: week, deliveries: [] };
    acc[key].deliveries.push(d);
    return acc;
  }, {});

  // ── create payment batch ─────────────────────────────────────────────────
  async function createBatch() {
    const { supplierId, deliveries, paymentWeek } = batchModal;
    setProcessing(true);

    const totalAmount = deliveries.reduce((s, d) => s + (d._computed?.lineAmount ?? 0), 0);

    // 1. Insert payment header
    const { data: payment, error: pErr } = await supabase.from("payments").insert({
      supplier_id:       supplierId,
      business_owner_id: user.id,
      payment_week:      paymentWeek,
      total_amount:      Math.round(totalAmount * 100) / 100,
      payment_status:    "Pending",
      payment_method:    "Bank Transfer",
    }).select("payment_id").single();

    if (pErr) { showToast("Failed to create payment batch.", "error"); setProcessing(false); return; }

    // 2. Insert payment details (one row per delivery)
    const details = deliveries.map(d => {
      const c = d._computed;
      return {
        payment_id:           payment.payment_id,
        delivery_id:          d.delivery_id,
        gross_weight_kg:      c.grossKg,
        tare_weight_kg:       c.tareKg,
        net_weight_kg:        c.netKg,
        moisture_content_pct: c.mc,
        moisture_deduction_kg: c.deductionKg,
        final_weight_kg:      c.finalKg,
        price_type:           c.priceType === "Mixed" ? "Negotiated" : c.priceType, // mixed → dominant
        price_per_kg_used:    c.pricePerKg,
        pca_discount_amount:  c.deductionKg,
        line_amount:          Math.round(c.lineAmount * 100) / 100,
      };
    });

    const { error: dErr } = await supabase.from("payment_details").insert(details);
    if (dErr) { showToast("Batch created but detail lines failed.", "error"); setProcessing(false); return; }

    // 3. Stamp payment_id on each delivery
    for (const d of deliveries) {
      await supabase.from("deliveries").update({ payment_id: payment.payment_id })
        .eq("delivery_id", d.delivery_id);
    }

    // 4. Notify supplier
    await supabase.from("notifications").insert({
      user_id:              supplierId,
      message:              `A payment of ${peso(totalAmount)} for ${deliveries.length} delivery(ies) is ready for release on ${fmtDate(paymentWeek)}.`,
      notification_type:    "Weekly Payment Ready",
      related_entity_type:  "payments",
      related_entity_id:    payment.payment_id,
    });

    setProcessing(false);
    setBatchModal(null);
    showToast("Payment batch created successfully.");
    fetchData();
  }

  // ── release payment (calls Edge Function) ───────────────────────────────
  async function releasePayment() {
    setProcessing(true);

    const res = await supabase.functions.invoke("process-payment", {
      body: { payment_id: releaseModal.payment.payment_id },
    });

    if (res.error || res.data?.error) {
      showToast(res.data?.error ?? "Failed to release payment.", "error");
    } else {
      showToast(`Payment released · Receipt ${res.data.receipt_number}`);
    }
    setProcessing(false);
    setReleaseModal(null);
    fetchData();
  }

  // ── Friday 5PM PHT disbursement week helper ──────────────────────────────
  // Each delivery's created_at determines its payment week (Friday date).
  // Week spans Sat 00:00 → Fri 17:00 Philippine Time (UTC+8).
  // Deliveries recorded after 5:00 PM on Friday go to the NEXT Friday.
  function getPaymentFriday(isoTimestamp) {
    const phMs  = new Date(isoTimestamp).getTime() + 8 * 3600 * 1000; // shift to UTC+8
    const ph    = new Date(phMs);
    const day   = ph.getUTCDay();    // 0=Sun … 5=Fri … 6=Sat (in PH time)
    const hour  = ph.getUTCHours();
    const min   = ph.getUTCMinutes();

    // Days until the disbursement Friday
    let daysToFriday = ((5 - day) + 7) % 7;
    // Friday after 5:00 PM → next Friday
    if (day === 5 && (hour > 17 || (hour === 17 && min > 0))) daysToFriday = 7;

    const fridayPhMs = phMs + daysToFriday * 24 * 3600 * 1000;
    const f = new Date(fridayPhMs);
    const y = f.getUTCFullYear();
    const m = String(f.getUTCMonth() + 1).padStart(2, "0");
    const d = String(f.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-card text-sm font-semibold
          ${toast.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-pale border border-green-mid/30 text-green-dark"}`}>
          {toast.type === "error" ? <LuCircleAlert className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <LuWallet className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-brown-dark">Payments</h1>
            <p className="text-brown-light text-sm">Manage supplier disbursements</p>
          </div>
        </div>
        {spotPrice !== null && (
          <div className="text-right">
            <p className="text-xs text-brown-light">Current Spot Price</p>
            <p className="text-lg font-bold text-brown-dark">{peso(spotPrice)}<span className="text-brown-light text-sm font-normal">/kg</span></p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-beige rounded-xl p-1 mb-6 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${tab === i ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-mid"}`}>
            {t}
            {i === 0 && Object.keys(supplierGroups).length > 0 && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                {Object.keys(supplierGroups).length}
              </span>
            )}          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 0 ? (
        <ReadyToPayTab
          groups={supplierGroups}
          expandedSupplier={expandedSupplier}
          setExpandedSupplier={setExpandedSupplier}
          onCreateBatch={setBatchModal}
        />
      ) : (
        <BatchesTab
          batches={batches}
          onRelease={setReleaseModal}
        />
      )}

      {/* Create Batch Modal */}
      {batchModal && (
        <Modal onClose={() => setBatchModal(null)}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <LuPackage className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brown-dark">Create Payment Batch</h2>
              <p className="text-brown-light text-sm">{batchModal.name}</p>
            </div>
          </div>

          <div className="bg-beige rounded-xl divide-y divide-beige-dark/30 mb-4 max-h-56 overflow-y-auto">
            {batchModal.deliveries.map(d => {
              const c = d._computed;
              const contractNums = (d.delivery_allocations ?? [])
                .filter(a => a.contract_id)
                .map(a => a.contract?.contract_number)
                .filter(Boolean)
                .join(", ");
              return (
                <div key={d.delivery_id} className="px-4 py-3 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-brown-dark">{contractNums || "Spot Price"}</p>
                      <p className="text-brown-light text-xs">{fmtDate(d.delivery_date)} · {fmt3(c.finalKg)} kg final</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-brown-dark">{peso(c.lineAmount)}</p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        c.priceType === "Spot" ? "bg-red-50 text-red-600"
                          : c.priceType === "Mixed" ? "bg-amber-50 text-amber-700"
                          : "bg-green-pale text-green-dark"
                      }`}>
                        {c.priceType}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center bg-white rounded-xl px-4 py-3 mb-5 border border-beige-dark">
            <p className="font-semibold text-brown-dark">Total Payable</p>
            <p className="text-xl font-bold text-green-dark">
              {peso(batchModal.deliveries.reduce((s, d) => s + (d._computed?.lineAmount ?? 0), 0))}
            </p>
          </div>

          {batchModal.deliveries.some(d => d._computed?.priceType !== "Negotiated") && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
              <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Some deliveries include <strong>Spot Price</strong> allocations (excess beyond available contract capacity).</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setBatchModal(null)} disabled={processing}
              className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Cancel
            </button>
            <button onClick={createBatch} disabled={processing}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {processing && <LuLoader className="w-4 h-4 animate-spin" />}
              Create Batch
            </button>
          </div>
        </Modal>
      )}

      {/* Release Payment Modal */}
      {releaseModal && (
        <Modal onClose={() => setReleaseModal(null)}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
              <LuBanknote className="w-5 h-5 text-green-dark" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brown-dark">Release Payment</h2>
              <p className="text-brown-light text-sm">
                {releaseModal.payment.supplier?.first_name} {releaseModal.payment.supplier?.last_name}
              </p>
            </div>
          </div>

          <div className="bg-beige rounded-xl px-4 py-4 mb-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brown-light">Payment Week</span>
              <span className="font-semibold text-brown-dark">{fmtDate(releaseModal.payment.payment_week)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brown-light">Deliveries</span>
              <span className="font-semibold text-brown-dark">{releaseModal.payment.payment_details?.length ?? 0}</span>
            </div>
            <div className="flex justify-between border-t border-beige-dark/30 pt-2 mt-2">
              <span className="font-semibold text-brown-dark">Total Amount</span>
              <span className="text-xl font-bold text-green-dark">{peso(releaseModal.payment.total_amount)}</span>
            </div>
          </div>

          <p className="text-sm text-brown-light mb-5">
            This will trigger a Xendit disbursement to the supplier's registered bank account and generate an e-receipt.
          </p>

          <div className="flex gap-3">
            <button onClick={() => setReleaseModal(null)} disabled={processing}
              className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Cancel
            </button>
            <button onClick={releasePayment} disabled={processing}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {processing && <LuLoader className="w-4 h-4 animate-spin" />}
              Release ₱{Number(releaseModal.payment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Ready to Pay Tab ────────────────────────────────────────────────────────
function ReadyToPayTab({ groups, expandedSupplier, setExpandedSupplier, onCreateBatch }) {
  const groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
          <LuWallet className="w-7 h-7 text-brown-light" />
        </div>
        <p className="text-brown-dark font-semibold">No deliveries awaiting payment</p>
        <p className="text-brown-light text-sm mt-1">All accepted deliveries have been batched.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groupKeys.map(key => {
        const { supplier, paymentWeek, deliveries } = groups[key];
        const totalAmount = deliveries.reduce((s, d) => s + (d._computed?.lineAmount ?? 0), 0);
        const hasMixed = deliveries.some(d => d._computed?.priceType !== "Negotiated");
        const isOpen = expandedSupplier === key;

        return (
          <div key={key} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
            {/* Supplier row header */}
            <button
              onClick={() => setExpandedSupplier(isOpen ? null : key)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/30 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white font-bold text-sm shrink-0">
                {supplier.first_name?.[0]}{supplier.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brown-dark">{supplier.first_name} {supplier.last_name}</p>
                <p className="text-brown-light text-xs">
                  {deliveries.length} delivery(ies) · Disbursement Friday: {fmtDate(paymentWeek)}
                </p>
              </div>
              {hasMixed && (
                <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
                  Includes Spot
                </span>
              )}
              <div className="text-right shrink-0">
                <p className="font-bold text-brown-dark">{peso(totalAmount)}</p>
                <p className="text-brown-light text-xs">total payable</p>
              </div>
              {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light shrink-0" /> : <LuChevronDown className="w-4 h-4 text-brown-light shrink-0" />}
            </button>

            {/* Expanded delivery table */}
            {isOpen && (
              <div className="border-t border-beige-dark/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-beige text-brown-light text-xs uppercase tracking-wide">
                      <tr>
                        {["Allocations", "Date", "Net kg", "MC%", "Final kg", "Effective ₱/kg", "Amount", "Type"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige-dark/20">
                      {deliveries.map(d => {
                        const c = d._computed;
                        const contractNums = (d.delivery_allocations ?? [])
                          .filter(a => a.contract_id)
                          .map(a => a.contract?.contract_number)
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <tr key={d.delivery_id}>
                            <td className="px-4 py-3 font-medium text-brown-dark text-xs">{contractNums || "—"}</td>
                            <td className="px-4 py-3 text-brown-mid text-xs whitespace-nowrap">{fmtDate(d.delivery_date)}</td>
                            <td className="px-4 py-3 text-brown-mid">{fmt3(c.netKg)}</td>
                            <td className="px-4 py-3 text-brown-mid">{c.mc}%</td>
                            <td className="px-4 py-3 font-semibold text-brown-dark">{fmt3(c.finalKg)}</td>
                            <td className="px-4 py-3 text-brown-mid">
                              {peso(c.pricePerKg)}
                              <span className={`ml-1 text-xs font-semibold px-1 rounded ${
                                c.priceType === "Spot" ? "text-red-500"
                                  : c.priceType === "Mixed" ? "text-amber-600"
                                  : "text-green-dark"
                              }`}>
                                ({c.priceType})
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-brown-dark">{peso(c.lineAmount)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                c.priceType === "Spot" ? "bg-red-50 text-red-600"
                                  : c.priceType === "Mixed" ? "bg-amber-50 text-amber-700"
                                  : "bg-green-pale text-green-dark"
                              }`}>
                                {c.priceType}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-5 py-4 bg-beige/50 border-t border-beige-dark/20">
                  <p className="font-semibold text-brown-dark">{peso(totalAmount)} total · Disburse {fmtDate(paymentWeek)}</p>
                  <button
                    onClick={() => onCreateBatch({
                      supplierId: supplier.user_id,
                      name: `${supplier.first_name} ${supplier.last_name}`,
                      deliveries,
                      paymentWeek,
                    })}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all"
                  >
                    <LuPackage className="w-4 h-4" /> Create Batch
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Batches Tab ───────────────────────────────────────────────────────────
function BatchesTab({ batches, onRelease }) {
  if (batches.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
          <LuReceipt className="w-7 h-7 text-brown-light" />
        </div>
        <p className="text-brown-dark font-semibold">No payment batches yet</p>
        <p className="text-brown-light text-sm mt-1">Batches created from the Ready to Pay tab appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map(b => {
        const receiptNum = b.e_receipts?.[0]?.receipt_number;
        const isPending = b.payment_status === "Pending";
        const isReleased = b.payment_status === "Released";

        return (
          <div key={b.payment_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isReleased ? "bg-green-pale" : isPending ? "bg-amber-50" : "bg-red-50"
              }`}>
                {isReleased ? <LuCheck className="w-5 h-5 text-green-dark" />
                  : isPending ? <LuClock className="w-5 h-5 text-amber-500" />
                  : <LuX className="w-5 h-5 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-brown-dark">{b.supplier?.first_name} {b.supplier?.last_name}</p>
                    <p className="text-brown-light text-xs mt-0.5">Week of {fmtDate(b.payment_week)} · {b.payment_details?.length ?? 0} delivery(ies)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-brown-dark text-lg">{peso(b.total_amount)}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isReleased ? "bg-green-pale text-green-dark"
                        : isPending ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-600"
                    }`}>
                      {b.payment_status}
                    </span>
                  </div>
                </div>

                {receiptNum && (
                  <p className="text-xs text-brown-light mt-2">Receipt: <span className="font-mono text-brown-mid">{receiptNum}</span></p>
                )}
                {b.reference_number && (
                  <p className="text-xs text-brown-light">Ref: <span className="font-mono text-brown-mid">{b.reference_number}</span></p>
                )}

                {/* Delivery breakdown (collapsed) */}
                <details className="mt-3 group">
                  <summary className="text-xs text-brown-light cursor-pointer hover:text-brown-mid select-none flex items-center gap-1">
                    <LuChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" /> View delivery breakdown
                  </summary>
                  <div className="mt-2 bg-beige rounded-xl divide-y divide-beige-dark/30 text-xs">
                    {(b.payment_details ?? []).map(pd => (
                      <div key={pd.payment_detail_id} className="px-3 py-2 flex justify-between gap-3">
                        <span className="text-brown-mid">
                          {fmt3(pd.net_weight_kg)} kg net → {fmt3(pd.final_weight_kg)} kg final
                          · {pd.moisture_content_pct}% MC · {pd.price_type}
                        </span>
                        <span className="font-semibold text-brown-dark shrink-0">{peso(pd.line_amount)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            {isPending && (
              <div className="mt-4 pt-4 border-t border-beige-dark/20">
                <button onClick={() => onRelease({ payment: b })}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all flex items-center justify-center gap-2">
                  <LuBanknote className="w-4 h-4" /> Release Payment
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Generic modal wrapper ────────────────────────────────────────────────────
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-brown-light hover:text-brown-dark transition-colors">
          <LuX className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}
