import { useEffect, useState, useCallback, useRef } from "react";
import {
  LuWallet, LuCheck, LuClock, LuCircleAlert, LuChevronDown,
  LuReceipt, LuX, LuLoader, LuPackage, LuBanknote, LuTruck,
  LuChevronLeft, LuChevronRight, LuDownload, LuPrinter,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useSensitiveSessionTimeout } from "../../hooks/useSensitiveSessionTimeout";

const TABS = ["Ready to Pay", "Payment Batches", "Walk-In Payments"];

// ── helpers ──────────────────────────────────────────────────────────────────
function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt3(n) { return Number(n ?? 0).toFixed(2); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
// Escape HTML for any injected strings (e.g. in download filenames)
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── main component ────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState(0);
  const [readyDeliveries, setReadyDeliveries] = useState([]); // ungrouped Accepted contractual deliveries without payment
  const [batches, setBatches] = useState([]);
  const [walkinDeliveries, setWalkinDeliveries] = useState([]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [loading, setLoading] = useState(true);
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

    const [deliveriesRes, batchesRes, spotRes, walkinRes] = await Promise.all([
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
          final_weight_kg, price_type, price_per_kg_used, pca_discount_amount, line_amount,
          delivery:delivery_id(weigher:weigher_id(first_name, last_name))
        ),
        e_receipts(receipt_number)
      `).order("created_at", { ascending: false }),

      supabase.from("spot_price").select("price_per_kg").limit(1).maybeSingle(),

      supabase.from("deliveries").select(`
        delivery_id, delivery_date, created_at, walkin_paid_at,
        walkin_spot_price_kg, walkin_amount_paid,
        walkin_supplier:walkin_supplier_id(first_name, last_name),
        weigher:weigher_id(first_name, last_name),
        paid_by:walkin_paid_by(first_name, last_name),
        weighing_records(gross_weight_kg, net_weight_kg, copra_condition, num_sacks)
      `)
        .eq("delivery_source", "Walkin")
        .eq("delivery_status", "Accepted")
        .order("created_at", { ascending: false }),
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
    setWalkinDeliveries(walkinRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── payment computation: one line per allocation (spec §3.5) ──────────────
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

    const mc      = parseFloat(li.moisture_content_pct);
    const netKg   = parseFloat(wr.net_weight_kg);
    const grossKg = parseFloat(wr.gross_weight_kg);
    const tareKg  = parseFloat(wr.tare_weight_kg);

    // Derive discount % from quality result remarks
    const remarkMatch = (qr.remarks ?? "").match(/Discount:\s*([\d.]+)%/);
    const discountPct  = remarkMatch ? parseFloat(remarkMatch[1]) : 0;
    const deductionKg  = netKg * (discountPct / 100);
    const finalKgTotal = netKg - deductionKg;

    // One line per allocation — each gets its proportional share of the
    // moisture deduction applied to its own allocated weight
    const allocLines = allocs.map(alloc => {
      const allocNetKg   = parseFloat(alloc.allocated_weight_kg);
      const deductedKg   = allocNetKg * (discountPct / 100);
      const allocFinalKg = allocNetKg - deductedKg;
      const pricePerKg   = alloc.contract_id
        ? parseFloat(alloc.contract?.negotiated_price_per_kg ?? 0)
        : parseFloat(spot);
      const lineAmount   = allocFinalKg * pricePerKg;
      const priceType    = alloc.contract_id ? "Negotiated" : "Spot";
      return {
        allocationId:    alloc.allocation_id,
        contractId:      alloc.contract_id,
        contractNumber:  alloc.contract?.contract_number ?? null,
        allocNetKg,
        deductedKg,
        allocFinalKg,
        pricePerKg,
        priceType,
        lineAmount,
        // shared MC fields (same for every alloc in the same physical delivery)
        mc,
        discountPct,
        grossKg,
        tareKg,
      };
    });

    const totalLineAmount = allocLines.reduce((s, l) => s + l.lineAmount, 0);
    const hasSpot = allocLines.some(l => l.priceType === "Spot");
    const hasNeg  = allocLines.some(l => l.priceType === "Negotiated");

    return {
      grossKg, tareKg, netKg, mc, discountPct, deductionKg, finalKg: finalKgTotal,
      allocLines,
      totalLineAmount,
      // kept for backward-compat with total/badge checks
      lineAmount: totalLineAmount,
      priceType: hasSpot && hasNeg ? "Mixed" : hasSpot ? "Spot" : "Negotiated",
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

  // ── create payment batch (atomic via PostgreSQL RPC) ─────────────────────
  async function createBatch() {
    const { supplierId, deliveries, paymentWeek } = batchModal;
    setProcessing(true);

    const totalAmount = deliveries.reduce((s, d) => s + (d._computed?.lineAmount ?? 0), 0);

    const details = deliveries.flatMap(d => {
      const c = d._computed;
      return c.allocLines.map(l => ({
        delivery_id:           d.delivery_id,
        gross_weight_kg:       l.grossKg,
        tare_weight_kg:        l.tareKg,
        net_weight_kg:         l.allocNetKg,
        moisture_content_pct:  l.mc,
        moisture_deduction_kg: l.deductedKg,
        final_weight_kg:       l.allocFinalKg,
        price_type:            l.priceType,
        price_per_kg_used:     l.pricePerKg,
        pca_discount_amount:   l.deductedKg,
        line_amount:           Math.round(l.lineAmount * 100) / 100,
      }));
    });

    const { error } = await supabase.rpc("create_payment_batch", {
      p_supplier_id:       supplierId,
      p_business_owner_id: user.id,
      p_payment_week:      paymentWeek,
      p_total_amount:      Math.round(totalAmount * 100) / 100,
      p_notification_msg:  `A payment of ${peso(totalAmount)} for ${deliveries.length} delivery(ies) is ready for release on ${fmtDate(paymentWeek)}.`,
      p_details:           details,
    });

    if (error) {
      console.error("[createBatch] RPC error:", error);
      showToast(error.message ?? "Failed to create payment batch. No changes were made.", "error");
      setProcessing(false);
      return;
    }

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
    } else if (res.data?.processing) {
      showToast("Payout submitted. Payment is now Processing. It will update to Released once Xendit confirms.");
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
    <div className="pt-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed left-3 right-3 top-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold sm:left-auto sm:right-5 sm:max-w-sm
          ${toast.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-pale border border-green-mid/30 text-green-dark"}`}>
          {toast.type === "error" ? <LuCircleAlert className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-brown-dark">Payments</h1>
          <p className="text-brown-light text-sm mt-0.5">Manage supplier disbursements</p>
        </div>
        {spotPrice !== null && (
          <span className="text-xs text-brown-light text-right">
            Spot price <span className="font-semibold text-brown-dark">{peso(spotPrice)}/kg</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-beige-dark/40 mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px inline-flex items-center
              ${tab === i ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
            {/* Shorter label on mobile */}
            <span className="sm:hidden">
              {t === "Ready to Pay" ? "Ready" : t === "Payment Batches" ? "Batches" : "Walk-In"}
            </span>
            <span className="hidden sm:inline">{t}</span>
            {i === 0 && Object.keys(supplierGroups).length > 0 && (
              <span className="ml-1.5 sm:ml-2 text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                {Object.keys(supplierGroups).length}
              </span>
            )}
            {i === 2 && walkinDeliveries.filter(d => !d.walkin_paid_at).length > 0 && (
              <span className="ml-1.5 sm:ml-2 text-xs bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full">
                {walkinDeliveries.filter(d => !d.walkin_paid_at).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 0 ? (
        <ReadyToPayTab
          groups={supplierGroups}
          onCreateBatch={setBatchModal}
        />
      ) : tab === 1 ? (
        <BatchesTab
          batches={batches}
          onRelease={setReleaseModal}
        />
      ) : (
        <WalkinPaymentsTab
          deliveries={walkinDeliveries}
          spotPrice={spotPrice}
          user={user}
          profile={profile}
          onRefresh={fetchData}
          onToast={showToast}
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
            {batchModal.deliveries.flatMap(d => {
              const c = d._computed;
              return c.allocLines.map((l, i) => (
                <div key={`${d.delivery_id}-${i}`} className="px-4 py-3 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-brown-dark">{l.contractNumber ?? "Spot Price"}</p>
                      <p className="text-brown-light text-xs">
                        {fmtDate(d.delivery_date)} · {fmt3(l.allocFinalKg)} kg final · {l.mc}cc MC
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-brown-dark">{peso(l.lineAmount)}</p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        l.priceType === "Spot"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-green-pale text-green-dark"
                      }`}>
                        {l.priceType} · {peso(l.pricePerKg)}/kg
                      </span>
                    </div>
                  </div>
                </div>
              ));
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
              className="flex-1 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
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
              <span className="text-brown-light">Allocation Lines</span>
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
              className="flex-1 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
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
function ReadyToPayTab({ groups, onCreateBatch }) {
  const groupKeys = Object.keys(groups);
  const [selectedKey, setSelectedKey] = useState(groupKeys[0] ?? null);

  // Keep selection valid when data refreshes
  const activeKey = groupKeys.includes(selectedKey) ? selectedKey : (groupKeys[0] ?? null);
  const selected  = activeKey ? groups[activeKey] : null;

  if (groupKeys.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-beige-dark/40 flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-14 h-14 bg-beige rounded-xl flex items-center justify-center mb-4">
          <LuWallet className="w-7 h-7 text-brown-light" />
        </div>
        <p className="text-brown-dark font-semibold">No deliveries awaiting payment</p>
        <p className="text-brown-light text-sm mt-1">All accepted deliveries have been batched.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 items-start">
      {/* ── Left: supplier list ── */}
      <div className="w-full md:w-[44%] shrink-0 space-y-2">
        {groupKeys.map(key => {
          const { supplier, paymentWeek, deliveries } = groups[key];
          const totalAmount  = deliveries.reduce((s, d) => s + (d._computed?.lineAmount ?? 0), 0);
          const totalNetKg   = deliveries.reduce((s, d) => s + (d._computed?.netKg ?? 0), 0);
          const hasMixed     = deliveries.some(d => d._computed?.priceType !== "Negotiated");
          const isSelected   = key === activeKey;

          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`w-full text-left rounded-xl border transition-all px-4 py-3 flex items-center gap-3
                ${isSelected
                  ? "bg-green-pale border-green-mid/40"
                  : "bg-white border-beige-dark/40 hover:bg-beige/30"}`}
            >
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0
                ${isSelected ? "bg-green-dark" : "bg-brown-mid"}`}>
                {supplier.first_name?.[0]}{supplier.last_name?.[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold text-brown-dark text-sm">{supplier.first_name} {supplier.last_name}</p>
                  {hasMixed && (
                    <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-1.5 py-0.5 rounded-full border border-amber-200">Spot</span>
                  )}
                </div>
                <p className="text-brown-light text-xs mt-0.5">
                  {deliveries.length} delivery(ies) · {totalNetKg.toFixed(2)} kg · {fmtDate(paymentWeek)}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="font-bold text-brown-dark text-sm">{peso(totalAmount)}</p>
                <span className="text-xs font-semibold text-amber-600">Pending</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Right: payment preview ── */}
      {selected && (
        <PaymentPreviewPanel
          group={selected}
          onCreateBatch={onCreateBatch}
        />
      )}
    </div>
  );
}

function PaymentPreviewPanel({ group, onCreateBatch }) {
  const { supplier, paymentWeek, deliveries } = group;
  const [currentIdx, setCurrentIdx] = useState(0);

  // Reset to first delivery whenever the selected group changes
  useEffect(() => { setCurrentIdx(0); }, [group]);

  const total = deliveries.length;
  const delivery = deliveries[Math.min(currentIdx, total - 1)];

  // Per-delivery computed lines
  const deliveryLines = delivery?._computed?.allocLines ?? [];
  const deliveryGrossKg = parseFloat(delivery?.weighing_records?.[0]?.gross_weight_kg ?? 0);
  const deliveryTareKg  = parseFloat(delivery?.weighing_records?.[0]?.tare_weight_kg ?? 0);
  const deliveryNetKg   = deliveryLines.reduce((s, l) => s + l.allocNetKg, 0);
  const deliveryMoistKg = deliveryLines.reduce((s, l) => s + l.deductedKg, 0);
  const deliveryFinalKg = deliveryLines.reduce((s, l) => s + l.allocFinalKg, 0);
  const deliveryMc     = delivery?._computed?.mc ?? null;
  const deliveryDiscPct = deliveryNetKg > 0 ? (deliveryMoistKg / deliveryNetKg * 100).toFixed(2) : "0.00";
  const deliveryUniformPrice = deliveryLines.length > 0 && deliveryLines.every(l => l.pricePerKg === deliveryLines[0].pricePerKg);
  const deliveryPriceType = deliveryLines.every(l => l.priceType === "Negotiated") ? "Negotiated"
    : deliveryLines.every(l => l.priceType === "Spot") ? "Spot" : "Mixed";

  // Overall totals (always shown at bottom)
  const allLines     = deliveries.flatMap(d => (d._computed?.allocLines ?? []));
  const netPayable   = allLines.reduce((s, l) => s + l.lineAmount, 0);

  return (
    <div className="flex-1 bg-white rounded-xl border border-beige-dark/40 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-beige-dark/40 bg-beige/40">
        <p className="text-xs font-bold text-brown-light uppercase tracking-wide">Payment Preview</p>
        <p className="text-lg font-bold text-brown-dark mt-0.5">{supplier.first_name} {supplier.last_name}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Delivery navigator */}
        <div className="px-5 py-3 border-b border-beige-dark/40 flex items-center justify-between gap-3">
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="p-1.5 rounded-lg border border-beige-dark/60 text-brown-light hover:text-brown-dark hover:bg-beige transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <LuChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-xs font-bold text-brown-dark">
              Delivery {currentIdx + 1} <span className="text-brown-light font-normal">of {total}</span>
            </p>
            <p className="text-xs text-brown-light mt-0.5">{fmtDate(delivery?.delivery_date)}</p>
          </div>
          <button
            onClick={() => setCurrentIdx(i => Math.min(total - 1, i + 1))}
            disabled={currentIdx === total - 1}
            className="p-1.5 rounded-lg border border-beige-dark/60 text-brown-light hover:text-brown-dark hover:bg-beige transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <LuChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Per-delivery info */}
        <div className="px-5 py-3 space-y-2.5 border-b border-beige-dark/40">
          <div className="flex justify-between text-sm items-center">
            <span className="text-brown-light">Disbursement Date</span>
            <span className="font-semibold text-brown-dark">{fmtDate(paymentWeek)}</span>
          </div>
          <div className="flex justify-between text-sm items-center">
            <span className="text-brown-light">Price Type</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              deliveryPriceType === "Negotiated" ? "bg-green-pale text-green-dark"
              : deliveryPriceType === "Spot" ? "bg-amber-50 text-amber-700"
              : "bg-blue-50 text-blue-600"
            }`}>{deliveryPriceType}</span>
          </div>
          <div className="flex justify-between text-sm items-center">
            <span className="text-brown-light">Price per kg</span>
            {deliveryUniformPrice && deliveryLines.length > 0
              ? <span className="font-semibold text-brown-dark">{peso(deliveryLines[0].pricePerKg)}<span className="text-brown-light font-normal">/kg</span></span>
              : <span className="text-xs text-brown-light italic">Multiple, see breakdown</span>
            }
          </div>
        </div>

        {/* Weight breakdown — per selected delivery */}
        <div className="px-5 py-3 border-b border-beige-dark/40">
          <p className="text-xs font-bold text-brown-light uppercase tracking-wide mb-3">Weight Breakdown</p>
          <div className="bg-beige rounded-xl px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brown-light">Gross Weight</span>
              <span className="font-semibold text-brown-dark">{fmt3(deliveryGrossKg)} kg</span>
            </div>
            <div className="flex justify-between text-xs pl-3 text-brown-light">
              <span>Tare Weight</span>
              <span className="text-brown-mid">−{fmt3(deliveryTareKg)} kg</span>
            </div>
            <div className="flex justify-between font-semibold pt-1 border-t border-beige-dark/40 text-sm">
              <span className="text-brown-dark">Net Weight</span>
              <span className="text-brown-dark">{fmt3(deliveryNetKg)} kg</span>
            </div>
            <div className="flex justify-between text-xs pl-3 text-brown-light">
              <span>Moisture/PCA Deduction <span className="text-red-400">({deliveryMc != null ? `${deliveryMc}cc / ` : ""}{deliveryDiscPct}%)</span></span>
              <span className="text-red-500">−{fmt3(deliveryMoistKg)} kg</span>
            </div>
            <div className="flex justify-between font-semibold pt-1 border-t border-beige-dark/40 text-sm">
              <span className="text-brown-dark">Final Weight</span>
              <span className="text-green-dark">{fmt3(deliveryFinalKg)} kg</span>
            </div>
          </div>
        </div>

        {/* Allocation breakdown — per selected delivery */}
        <div className="px-5 py-3 border-b border-beige-dark/40">
          <p className="text-xs font-bold text-brown-light uppercase tracking-wide mb-2">Allocation Breakdown</p>
          <div className="bg-beige rounded-xl divide-y divide-beige-dark/30 text-xs">
            {deliveryLines.length === 0 ? (
              <p className="px-3 py-2 text-brown-light italic">No allocation data</p>
            ) : deliveryLines.map((l, li) => (
              <div key={li} className="px-3 py-2 flex justify-between gap-2">
                <div>
                  <span className="font-semibold text-brown-dark">{l.contractNumber ?? "Spot Price"}</span>
                  <span className="text-brown-light ml-1.5">{fmtDate(delivery?.delivery_date)}</span>
                  <span className="text-brown-light ml-1.5">{peso(l.pricePerKg)}/kg</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-brown-dark">{peso(l.lineAmount)}</span>
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full font-semibold ${
                    l.priceType === "Spot" ? "bg-amber-50 text-amber-700" : "bg-green-pale text-green-dark"
                  }`}>{l.priceType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Net Payable — always total across ALL deliveries */}
        <div className="px-5 py-4 flex justify-between items-center">
          <div>
            <p className="font-bold text-brown-dark text-sm">Net Payable</p>
            <p className="text-xs text-brown-light mt-0.5">Total across all {total} delivery(ies)</p>
          </div>
          <p className="text-2xl font-bold text-green-dark">{peso(netPayable)}</p>
        </div>
      </div>

      {/* Create Batch button */}
      <div className="px-5 pb-5 pt-1">
        <button
          onClick={() => onCreateBatch({
            supplierId: supplier.user_id,
            name: `${supplier.first_name} ${supplier.last_name}`,
            deliveries,
            paymentWeek,
          })}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all"
        >
          <LuPackage className="w-4 h-4" /> Create Batch
        </button>
        <p className="text-center text-xs text-brown-light mt-2">
          Payment will be auto-released on <span className="font-semibold text-brown-mid">{fmtDate(paymentWeek)}</span>
        </p>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-3 text-sm">
      <span className="text-brown-light">{label}</span>
      <span className="font-semibold text-brown-dark text-right">{value}</span>
    </div>
  );
}

// ── Batches Tab ───────────────────────────────────────────────────────────
function BatchesTab({ batches, onRelease }) {
  const [filter, setFilter]           = useState("All");
  const [receiptBatch, setReceiptBatch] = useState(null);

  const BATCH_FILTERS = [
    { label: "All",        match: () => true },
    { label: "Pending",    match: b => b.payment_status === "Pending" },
    { label: "Processing", match: b => b.payment_status === "Processing" },
    { label: "Done",       match: b => b.payment_status === "Released" },
    { label: "Failed",     match: b => b.payment_status === "Failed" },
  ];

  const shown = batches.filter(BATCH_FILTERS.find(f => f.label === filter)?.match ?? (() => true));

  if (batches.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-beige-dark/40 flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-14 h-14 bg-beige rounded-xl flex items-center justify-center mb-4">
          <LuReceipt className="w-7 h-7 text-brown-light" />
        </div>
        <p className="text-brown-dark font-semibold">No payment batches yet</p>
        <p className="text-brown-light text-sm mt-1">Batches created from the Ready to Pay tab appear here.</p>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-6 border-b border-beige-dark/40 mb-6 overflow-x-auto">
        {BATCH_FILTERS.map(f => {
          const count = batches.filter(f.match).length;
          return (
            <button key={f.label} onClick={() => setFilter(f.label)}
              className={`pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px inline-flex items-center
                ${filter === f.label ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
              {f.label}
              {count > 0 && f.label !== "All" && (
                <span className={`ml-1.5 font-bold px-1.5 py-0.5 rounded-full text-xs
                  ${f.label === "Done"       ? "bg-green-pale text-green-dark"
                  : f.label === "Pending"    ? "bg-amber-50 text-amber-700"
                  : f.label === "Processing" ? "bg-blue-50 text-blue-600"
                  : "bg-red-50 text-red-600"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-beige-dark/40 flex items-center justify-center py-12">
          <p className="text-brown-light text-sm">No {filter.toLowerCase()} batches.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(b => {
            const receiptNum   = b.e_receipts?.[0]?.receipt_number;
            const isPending    = b.payment_status === "Pending";
            const isProcessing = b.payment_status === "Processing";
            const isReleased   = b.payment_status === "Released";
            const isFailed     = b.payment_status === "Failed";

            const statusColor = isReleased ? "bg-green-pale text-green-dark"
              : isPending    ? "bg-amber-50 text-amber-700"
              : isProcessing ? "bg-blue-50 text-blue-600"
              : "bg-red-50 text-red-600";
            const StatusIcon  = isReleased ? LuCheck : isPending ? LuClock : isProcessing ? LuLoader : LuX;

            return (
              <div key={b.payment_id} className={`bg-white rounded-xl border ${isReleased ? "border-green-mid/40" : "border-beige-dark/40"}`}>
                {/* Main row */}
                <div className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-brown-dark text-sm">{b.supplier?.first_name} {b.supplier?.last_name}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${statusColor}`}>
                        <StatusIcon className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />{b.payment_status}
                      </span>
                    </div>
                    <p className="text-brown-light text-xs mt-0.5">
                      Week of {fmtDate(b.payment_week)} · {b.payment_details?.length ?? 0} line(s)
                      {receiptNum && <> · <span className="font-mono">{receiptNum}</span></>}
                    </p>
                    {b.reference_number && (
                      <p className="text-brown-light text-xs font-mono truncate max-w-xs">Ref: {b.reference_number}</p>
                    )}
                  </div>

                  <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end sm:shrink-0">
                    <p className="font-bold text-brown-dark text-base">{peso(b.total_amount)}</p>
                    {isPending && (
                      <button
                        onClick={() => onRelease({ payment: b })}
                        className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-dark text-white font-bold text-xs hover:bg-green-dark/90 transition-all"
                      >
                        <LuBanknote className="w-3 h-3" /> Release
                      </button>
                    )}
                    {isFailed && (
                      <button
                        onClick={() => onRelease({ payment: b })}
                        className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500 text-white font-bold text-xs hover:opacity-90 transition-all"
                      >
                        <LuBanknote className="w-3 h-3" /> Retry
                      </button>
                    )}
                    {isProcessing && (
                      <p className="text-xs text-blue-500 font-semibold mt-1 whitespace-nowrap">Awaiting Xendit…</p>
                    )}
                    {isReleased && (
                      <button
                        onClick={() => setReceiptBatch(b)}
                        className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-mid/40 text-green-dark font-semibold text-xs hover:bg-green-pale transition-all"
                      >
                        <LuReceipt className="w-3 h-3" /> E-Receipt
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible breakdown */}
                <details className="group border-t border-beige-dark/10">
                  <summary className="px-4 py-2 text-xs text-brown-light cursor-pointer hover:text-brown-mid select-none flex items-center gap-1">
                    <LuChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform shrink-0" />
                    View delivery breakdown
                  </summary>
                  <div className="pb-2 px-4">
                    <div className="space-y-2 text-xs">
                      {(b.payment_details ?? []).map(pd => {
                        const grossKg = Number(pd.gross_weight_kg ?? 0);
                        const tareKg  = Number(pd.tare_weight_kg ?? 0);
                        const netKg   = Number(pd.net_weight_kg ?? 0);
                        const mcDedKg = Number(pd.moisture_deduction_kg ?? 0);
                        const finalKg = Number(pd.final_weight_kg ?? 0);
                        const mcPct   = netKg > 0 ? (mcDedKg / netKg * 100).toFixed(2) : "0.00";
                        return (
                          <div key={pd.payment_detail_id} className="bg-beige rounded-xl px-3 py-2.5">
                            {/* Header row: type badge + price + amount */}
                            <div className="flex justify-between items-center mb-2">
                              <span className={`font-semibold px-2 py-0.5 rounded-full ${
                                pd.price_type === "Spot" ? "bg-amber-50 text-amber-700" : "bg-green-pale text-green-dark"
                              }`}>{pd.price_type} · {peso(pd.price_per_kg_used)}/kg</span>
                              <span className="font-bold text-brown-dark">{peso(pd.line_amount)}</span>
                            </div>
                            {/* Weight breakdown rows */}
                            <div className="space-y-1 text-brown-light">
                              <div className="flex justify-between">
                                <span>Gross Weight</span>
                                <span className="text-brown-dark font-medium">{grossKg.toFixed(2)} kg</span>
                              </div>
                              <div className="flex justify-between pl-3">
                                <span>Tare Weight</span>
                                <span className="text-brown-mid">−{tareKg.toFixed(2)} kg</span>
                              </div>
                              <div className="flex justify-between font-semibold text-brown-dark border-t border-beige-dark/40 pt-1">
                                <span>Net Weight</span>
                                <span>{netKg.toFixed(2)} kg</span>
                              </div>
                              <div className="flex justify-between pl-3">
                                <span>Moisture/PCA ({mcPct}%)</span>
                                <span className="text-red-500">−{mcDedKg.toFixed(2)} kg</span>
                              </div>
                              <div className="flex justify-between font-semibold text-green-dark border-t border-beige-dark/40 pt-1">
                                <span>Final Weight</span>
                                <span>{finalKg.toFixed(2)} kg</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>

      {receiptBatch && (
        <BatchReceiptModal
          batch={receiptBatch}
          onClose={() => setReceiptBatch(null)}
        />
      )}
    </>
  );
} // ── Batch E-Receipt Modal ─────────────────────────────────────────────────────
function BatchReceiptModal({ batch: b, onClose }) {
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const receiptRef = useRef(null);

  const receiptNum   = b.e_receipts?.[0]?.receipt_number;
  const supplierName = `${b.supplier?.first_name ?? ""} ${b.supplier?.last_name ?? ""}`.trim();
  const details      = b.payment_details ?? [];
  const totalPaid    = Number(b.total_amount ?? 0);

  const paidDate = b.payment_date
    ? new Date(b.payment_date).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : fmtDate(b.payment_week);

  const pd = details[page] ?? details[0];
  if (!pd) return null;

  const grossKg    = Number(pd.gross_weight_kg ?? 0);
  const tareKg     = Number(pd.tare_weight_kg ?? 0);
  const netKg      = Number(pd.net_weight_kg ?? 0);
  const finalKg    = Number(pd.final_weight_kg ?? 0);
  const mc         = Number(pd.moisture_content_pct ?? 0);
  const pcaDeductKg = Number(pd.pca_discount_amount ?? 0);
  const pcaPct     = netKg > 0 ? ((pcaDeductKg / netKg) * 100).toFixed(2) : "0.00";
  const pricePerKg = Number(pd.price_per_kg_used ?? 0);
  const lineAmt    = Number(pd.line_amount ?? 0);
  const isSpot     = pd.price_type === "Spot";
  const weigherName = pd.delivery?.weigher
    ? `${pd.delivery.weigher.first_name ?? ""} ${pd.delivery.weigher.last_name ?? ""}`.trim()
    : "—";

  async function handleDownload() {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(receiptRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const link = document.createElement("a");
      const pageLabel = details.length > 1 ? `_${page + 1}of${details.length}` : "";
      link.download = `ereceipt_${receiptNum ?? supplierName.replace(/\s+/g, "_")}${pageLabel}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-beige-dark/40 w-full max-w-sm flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-beige-dark/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-pale rounded-xl flex items-center justify-center">
              <LuReceipt className="w-5 h-5 text-green-dark" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brown-dark">E-Receipt</h2>
              <p className="text-brown-light text-xs">{receiptNum ?? supplierName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Pagination — only shown when multiple allocations */}
        {details.length > 1 && (
          <div className="flex items-center justify-between px-6 py-2 border-b border-beige-dark/40 shrink-0 bg-beige/40">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-beige disabled:opacity-30 transition-colors">
              <LuChevronLeft className="w-4 h-4 text-brown-mid" />
            </button>
            <div className="text-center">
              <p className="text-xs font-semibold text-brown-dark">
                Allocation {page + 1} of {details.length}
              </p>
              <p className={`text-[10px] font-bold ${isSpot ? "text-amber-700" : "text-green-dark"}`}>
                {pd.price_type}
              </p>
            </div>
            <button onClick={() => setPage(p => Math.min(details.length - 1, p + 1))} disabled={page === details.length - 1}
              className="p-1.5 rounded-lg hover:bg-beige disabled:opacity-30 transition-colors">
              <LuChevronRight className="w-4 h-4 text-brown-mid" />
            </button>
          </div>
        )}

        {/* Scrollable receipt preview */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div ref={receiptRef} className="bg-white border border-beige-dark rounded-xl p-5 font-mono text-xs space-y-1 mx-auto" style={{ maxWidth: "320px" }}>
            <p className="text-center font-bold text-sm text-brown-dark">NERC COPRA TRADING</p>
            <p className="text-center text-brown-light">Electronic Payment Receipt</p>
            <div className="border-t border-dashed border-brown-light/40 my-2" />

            {receiptNum && (
              <div className="flex justify-between"><span className="text-brown-light">Receipt #</span><span className="font-bold text-brown-dark">{receiptNum}</span></div>
            )}
            <div className="flex justify-between"><span className="text-brown-light">Supplier</span><span className="font-semibold text-brown-dark text-right">{supplierName}</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Payment Week</span><span className="text-brown-dark">{fmtDate(b.payment_week)}</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Method</span><span className="text-brown-dark">{b.payment_method ?? "Bank Transfer"}</span></div>
            {b.reference_number && (
              <div className="flex justify-between gap-2"><span className="text-brown-light shrink-0">Ref</span><span className="text-brown-mid text-right break-all" style={{ fontSize: "10px" }}>{b.reference_number}</span></div>
            )}

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <p className="text-center font-bold text-brown-dark">DELIVERY DETAILS</p>
            <div className="flex justify-between"><span className="text-brown-light">Gross Weight</span><span className="text-brown-dark">{grossKg.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Tare Weight</span><span className="text-brown-dark">{tareKg.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Net Weight</span><span className="text-brown-dark">{netKg.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Moisture (cc)</span><span className="text-brown-dark">{mc}cc</span></div>
            <div className="flex justify-between"><span className="text-brown-light">PCA Discount</span><span className="text-brown-dark">{pcaPct}%</span></div>
            <div className="flex justify-between font-semibold"><span className="text-brown-light">Final Weight</span><span className="text-brown-dark">{finalKg.toFixed(2)} kg</span></div>

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <div className="flex justify-between">
              <span className="text-brown-light">Price Type</span>
              <span className={`font-bold ${isSpot ? "text-amber-700" : "text-green-dark"}`}>{pd.price_type}</span>
            </div>
            <div className="flex justify-between"><span className="text-brown-light">Price per kg</span><span className="text-brown-dark">{peso(pricePerKg)}/kg</span></div>
            <div className="flex justify-between font-semibold"><span className="text-brown-light">Line Amount</span><span className="text-brown-dark">{peso(lineAmt)}</span></div>

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-brown-dark">TOTAL PAID</span>
              <span className="font-bold text-green-dark text-base">{peso(totalPaid)}</span>
            </div>

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <p className="text-center font-bold text-green-dark text-sm">PAYMENT RELEASED</p>
            <p className="text-center text-brown-light">{paidDate}</p>

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <p className="text-center text-brown-light italic">Official electronic payment receipt</p>
            <p className="text-center text-brown-light">NERC Copra Trading · CopTrax</p>
          </div>
        </div>

        {/* Download button */}
        <div className="px-6 pb-6 pt-4 border-t border-beige-dark/40 shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all disabled:opacity-60"
          >
            {downloading ? <LuLoader className="w-4 h-4 animate-spin" /> : <LuDownload className="w-4 h-4" />}
            {downloading ? "Generating…" : `Download Receipt${details.length > 1 ? ` (${page + 1}/${details.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function WalkinPaymentsTab({ deliveries, spotPrice, user, profile, onRefresh, onToast }) {
  const [marking, setMarking]           = useState(null);
  const [receiptData, setReceiptData]   = useState(null);
  const [walkinFilter, setWalkinFilter] = useState("Pending");

  async function markAsPaid(d) {
    setMarking(d.delivery_id);
    const paidAt = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("deliveries")
      .update({ walkin_paid_at: paidAt, walkin_paid_by: user.id })
      .eq("delivery_id", d.delivery_id)
      .is("walkin_paid_at", null)   // guard: only update if not already paid
      .select("delivery_id");
    setMarking(null);
    if (error) {
      onToast("Failed to mark as paid.", "error");
    } else if (!updated || updated.length === 0) {
      onToast("This delivery has already been marked as paid.", "error");
      onRefresh();
    } else {
      setReceiptData({
        ...d,
        walkin_paid_at: paidAt,
        paid_by: {
          first_name: profile?.first_name ?? "",
          last_name:  profile?.last_name  ?? "",
        },
      });
      onRefresh();
    }
  }

  const pending   = deliveries.filter(d => !d.walkin_paid_at);
  const completed = deliveries
    .filter(d => d.walkin_paid_at)
    .sort((a, b) => new Date(b.walkin_paid_at) - new Date(a.walkin_paid_at));
  const shown     = walkinFilter === "Pending" ? pending : completed;

  if (deliveries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-beige-dark/40 flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-14 h-14 bg-beige rounded-xl flex items-center justify-center mb-4">
          <LuTruck className="w-7 h-7 text-brown-light" />
        </div>
        <p className="text-brown-dark font-semibold">No walk-in payments</p>
        <p className="text-brown-light text-sm mt-1">Walk-in deliveries recorded by weighers will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Sub-filter tabs */}
        <div className="flex gap-6 border-b border-beige-dark/40 mb-6 overflow-x-auto">
          {["Pending", "Completed"].map(f => (
            <button key={f} onClick={() => setWalkinFilter(f)}
              className={`pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px inline-flex items-center
                ${walkinFilter === f ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
              {f}
              {f === "Pending" && pending.length > 0 && (
                <span className="ml-1.5 bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>
              )}
              {f === "Completed" && completed.length > 0 && (
                <span className="ml-1.5 bg-green-pale text-green-dark font-bold px-1.5 py-0.5 rounded-full">{completed.length}</span>
              )}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="bg-white rounded-xl border border-beige-dark/40 flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-brown-dark font-semibold">No {walkinFilter.toLowerCase()} walk-in payments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map(d => (
              <WalkinCard
                key={d.delivery_id}
                d={d}
                spotPrice={spotPrice}
                marking={marking}
                onMark={markAsPaid}
                onPrintReceipt={setReceiptData}
              />
            ))}
          </div>
        )}
      </div>

      {receiptData && (
        <WalkinReceiptModal
          d={receiptData}
          spotPrice={spotPrice}
          onClose={() => setReceiptData(null)}
        />
      )}
    </>
  );
}

function WalkinCard({ d, spotPrice, marking, onMark, onPrintReceipt }) {
  const wr         = d.weighing_records?.[0];
  const sellerName = `${d.walkin_supplier?.first_name ?? ""} ${d.walkin_supplier?.last_name ?? ""}`.trim() || "Unknown";
  const condition  = wr?.copra_condition ?? "Dry";
  const numSacks   = parseInt(wr?.num_sacks ?? 0, 10);
  const grossKg    = parseFloat(wr?.gross_weight_kg ?? 0);   // true gross = entered weight
  const netKg      = parseFloat(wr?.net_weight_kg ?? 0);     // stored final weight
  const sacksDeduct = parseInt(wr?.num_sacks ?? 0, 10) / 2;
  const deductedKg = condition === "Wet" ? grossKg * 0.10 : 0;  // 10% of GROSS
  // Use stored price snapshot if available (locked in at delivery creation); fall back to live spot price
  const spot       = d.walkin_spot_price_kg != null ? parseFloat(d.walkin_spot_price_kg) : parseFloat(spotPrice ?? 0);
  const amountDue  = d.walkin_amount_paid   != null ? parseFloat(d.walkin_amount_paid)   : netKg * spot;
  const isPaid     = Boolean(d.walkin_paid_at);

  return (
    <div className={`bg-white rounded-xl border ${isPaid ? "border-green-mid/30" : "border-beige-dark/40"}`}>
      <div className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Name + date + details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-brown-dark text-sm break-words">{sellerName}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
              isPaid ? "bg-green-pale text-green-dark" : "bg-amber-50 text-amber-700"
            }`}>
              {isPaid ? <LuCheck className="w-3 h-3" /> : <LuTruck className="w-3 h-3" />}{isPaid ? "Paid" : "Pending"}
            </span>
          </div>
          {/* Compact detail strip */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-brown-light">
            <span>{fmtDate(d.delivery_date)}</span>
            {numSacks > 0 && <>
              <span className="text-beige-dark">·</span>
              <span><span className="text-brown-mid font-medium">{numSacks}</span> sacks</span>
            </>}
            <span className="text-beige-dark">·</span>
            <span>Gross <span className="text-brown-mid font-medium">{grossKg.toFixed(2)} kg</span></span>
            <span className="text-beige-dark">·</span>
            <span className={`font-medium ${condition === "Wet" ? "text-blue-600" : "text-green-dark"}`}>{condition}</span>
            {condition === "Wet" && <>
              <span className="text-beige-dark">·</span>
              <span>Ded <span className="text-red-500 font-medium">−{deductedKg.toFixed(2)} kg</span></span>
            </>}
            <span className="text-beige-dark">·</span>
            <span>Final <span className="text-brown-mid font-medium">{netKg.toFixed(2)} kg</span></span>
            <span className="text-beige-dark">·</span>
            <span>{peso(spot)}/kg</span>
          </div>
          {isPaid && d.walkin_paid_at && (
            <p className="text-xs text-brown-light mt-0.5">
              Paid {new Date(d.walkin_paid_at).toLocaleString("en-PH", {
                month: "short", day: "numeric", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
              {d.paid_by?.first_name && <> · {d.paid_by.first_name} {d.paid_by.last_name}</>}
            </p>
          )}
        </div>

        {/* Amount + action */}
        <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end sm:shrink-0">
          <p className="font-bold text-brown-dark text-base leading-none">{peso(amountDue)}</p>
          {!isPaid ? (
            <button
              onClick={() => onMark(d)}
              disabled={marking === d.delivery_id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-dark text-white font-bold text-xs hover:bg-green-dark/90 transition-all disabled:opacity-60 whitespace-nowrap"
            >
              {marking === d.delivery_id
                ? <LuLoader className="w-3 h-3 animate-spin" />
                : <LuCheck className="w-3 h-3" />}
              Mark as Paid
            </button>
          ) : (
            <button
              onClick={() => onPrintReceipt(d)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-mid/40 text-green-dark font-semibold text-xs hover:bg-green-pale transition-all whitespace-nowrap"
            >
              <LuReceipt className="w-3 h-3" /> Print Receipt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Walk-In Receipt Modal ─────────────────────────────────────────────────────
function WalkinReceiptModal({ d, spotPrice, onClose }) {
  const receiptRef = useRef(null);
  const wr           = d.weighing_records?.[0];
  const sellerName   = `${d.walkin_supplier?.first_name ?? ""} ${d.walkin_supplier?.last_name ?? ""}`.trim() || "Unknown";
  const weigherName  = `${d.weigher?.first_name ?? ""} ${d.weigher?.last_name ?? ""}`.trim() || "—";
  const condition    = wr?.copra_condition ?? "Dry";
  const numSacks     = parseInt(wr?.num_sacks ?? 0, 10);
  const sacksDeduct  = numSacks / 2;
  const grossKg      = parseFloat(wr?.gross_weight_kg ?? 0);  // true gross = entered weight
  const netAfterSacks = Math.max(grossKg - sacksDeduct, 0);   // net after sacks
  const finalKg      = parseFloat(wr?.net_weight_kg ?? 0);    // stored final weight
  const wetDeductKg  = condition === "Wet" ? grossKg * 0.10 : 0;  // 10% of GROSS
  const spot         = d.walkin_spot_price_kg != null ? parseFloat(d.walkin_spot_price_kg) : parseFloat(spotPrice ?? 0);
  const amountDue    = d.walkin_amount_paid   != null ? parseFloat(d.walkin_amount_paid)   : finalKg * spot;
  const paidAt       = d.walkin_paid_at
    ? new Date(d.walkin_paid_at).toLocaleString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;
  const paidByName = d.paid_by?.first_name
    ? `${d.paid_by.first_name} ${d.paid_by.last_name ?? ""}`.trim()
    : null;

  function handlePrint() {
    const styleId = "coptrax-walkin-print-style";
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #walkin-receipt-content,
        #walkin-receipt-content * { visibility: visible !important; }
        #walkin-receipt-content {
          position: fixed !important;
          top: 0 !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 300px !important;
          padding: 20px !important;
          background: white !important;
        }
      }
    `;
    document.head.appendChild(style);

    window.print();

    window.addEventListener("afterprint", () => {
      document.getElementById(styleId)?.remove();
    }, { once: true });
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-beige-dark/40 w-full max-w-sm flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-beige-dark/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-pale rounded-xl flex items-center justify-center">
              <LuReceipt className="w-5 h-5 text-green-dark" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brown-dark">Cash Payment Receipt</h2>
              <p className="text-brown-light text-xs">{sellerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable receipt preview */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div ref={receiptRef} id="walkin-receipt-content" className="bg-white border border-beige-dark rounded-xl p-5 font-mono text-xs space-y-1 mx-auto" style={{ maxWidth: "300px" }}>
            <p className="text-center font-bold text-sm text-brown-dark">NERC COPRA TRADING</p>
            <p className="text-center text-brown-light text-xs">Walk-In Cash Payment Receipt</p>
            <div className="border-t border-dashed border-brown-light/40 my-2" />

            <div className="flex justify-between"><span className="text-brown-light">Seller</span><span className="font-semibold text-brown-dark text-right">{sellerName}</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Date</span><span className="text-brown-dark">{fmtDate(d.delivery_date)}</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Recorded by</span><span className="text-brown-dark">{weigherName}</span></div>

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <p className="text-center font-bold text-brown-dark">WEIGHT DETAILS</p>
            <div className="flex justify-between"><span className="text-brown-light">Gross Weight</span><span className="text-brown-dark">{grossKg.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span className="text-brown-light">No. of Sacks</span><span className="text-brown-dark">{numSacks}</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Sacks Deduction</span><span className="text-red-500">−{sacksDeduct.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Net Weight</span><span className="text-brown-dark">{netAfterSacks.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span className="text-brown-light">Condition</span><span className={condition === "Wet" ? "text-blue-600 font-semibold" : "text-green-dark font-semibold"}>{condition}</span></div>
            {condition === "Wet" && (
              <div className="flex justify-between"><span className="text-brown-light">Wet Deduction</span><span className="text-red-500">−{wetDeductKg.toFixed(2)} kg</span></div>
            )}
            <div className="flex justify-between font-semibold"><span className="text-brown-light">Final Weight</span><span className="text-brown-dark">{finalKg.toFixed(2)} kg</span></div>

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <p className="text-center font-bold text-brown-dark">PAYMENT</p>
            <div className="flex justify-between"><span className="text-brown-light">Spot Price</span><span className="text-brown-dark">{peso(spot)}/kg</span></div>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-brown-light/20">
              <span className="font-bold text-brown-dark">AMOUNT PAID</span>
              <span className="font-bold text-green-dark text-base">{peso(amountDue)}</span>
            </div>

            {paidAt && <>
              <div className="border-t border-dashed border-brown-light/40 my-2" />
              <p className="text-center font-bold text-green-dark text-sm">PAID IN CASH</p>
              <p className="text-center text-brown-light">{paidAt}</p>
              {paidByName && <p className="text-center text-brown-light">Authorized by: {paidByName}</p>}
            </>}

            <div className="border-t border-dashed border-brown-light/40 my-2" />
            <p className="text-center text-brown-light italic">Official cash payment receipt</p>
            <p className="text-center text-brown-light">NERC Copra Trading · CopTrax</p>
          </div>
        </div>

        {/* Print button */}
        <div className="px-6 pb-6 pt-4 border-t border-beige-dark/40 shrink-0">
          <button
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all"
          >
            <LuPrinter className="w-4 h-4" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generic modal wrapper ────────────────────────────────────────────────────
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-beige-dark/40 w-full max-w-md max-h-[92vh] overflow-y-auto p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-brown-light hover:text-brown-dark transition-colors">
          <LuX className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}
