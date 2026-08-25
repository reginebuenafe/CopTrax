import { useEffect, useState, useCallback } from "react";
import {
  LuBoxes, LuLeaf, LuTruck, LuCheck, LuClock, LuX,
  LuCircleAlert, LuLoader, LuCalendar, LuArrowRightLeft,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const TABS = ["Resecada Pool", "Walk-in Holding", "Ready to Merge"];

function fmt3(n) { return Number(n ?? 0).toFixed(3); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function InventoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [resecada, setResecada] = useState([]);
  const [walkin, setWalkin] = useState([]);
  const [readyToMerge, setReadyToMerge] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mergeModal, setMergeModal] = useState(null); // { batch, action: 'approve'|'hold' }
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [resRes, wRes, rtmRes] = await Promise.all([
      supabase.from("inventory_batches")
        .select(`
          inventory_batch_id, weight_kg, recorded_date, merged_at,
          delivery:delivery_id(
            delivery_date, delivery_source,
            supplier:supplier_id(first_name, last_name),
            contract:contract_id(contract_number),
            walkin_supplier:walkin_supplier_id(first_name, last_name)
          )
        `)
        .eq("batch_status", "Resecada")
        .order("recorded_date", { ascending: false }),

      supabase.from("inventory_batches")
        .select(`
          inventory_batch_id, weight_kg, recorded_date, merge_eligible_date,
          delivery:delivery_id(
            delivery_date, delivery_source,
            walkin_supplier:walkin_supplier_id(first_name, last_name)
          )
        `)
        .eq("batch_status", "Walk-in Holding")
        .order("recorded_date", { ascending: false }),

      supabase.from("inventory_batches")
        .select(`
          inventory_batch_id, weight_kg, recorded_date, merge_eligible_date,
          delivery:delivery_id(
            delivery_date, delivery_source,
            walkin_supplier:walkin_supplier_id(first_name, last_name)
          )
        `)
        .eq("batch_status", "Ready to Merge")
        .order("merge_eligible_date", { ascending: true }),
    ]);

    setResecada(resRes.data ?? []);
    setWalkin(wRes.data ?? []);
    setReadyToMerge(rtmRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Merge / Hold action ──────────────────────────────────────────────────
  async function confirmMergeAction() {
    const { batch, action } = mergeModal;
    setProcessing(true);

    if (action === "approve") {
      // 1. Update batch status → Resecada
      const { error: updateErr } = await supabase.from("inventory_batches")
        .update({
          batch_status: "Resecada",
          reviewed_by_user_id: user.id,
          reviewed_at: new Date().toISOString(),
          review_decision: "Approved",
          merged_at: new Date().toISOString(),
        })
        .eq("inventory_batch_id", batch.inventory_batch_id);

      if (updateErr) {
        showToast("Failed to approve merge.", "error");
        setProcessing(false);
        setMergeModal(null);
        return;
      }

      // 2. Log inventory transaction
      const { error: txErr } = await supabase.from("inventory_transactions").insert({
        inventory_batch_id: batch.inventory_batch_id,
        transaction_type: "Merge to Resecada",
        quantity_kg: batch.weight_kg,
        performed_by: user.id,
      });
      if (txErr) {
        showToast("Merge approved but audit log failed — please contact support.", "error");
      }

      // 3. Notify BO (self-notification confirming the merge)
      await supabase.from("notifications").insert({
        user_id: user.id,
        message: `${fmt3(batch.weight_kg)} kg walk-in batch has been successfully merged into Resecada.`,
        notification_type: "Merge Completed",
        related_entity_type: "inventory_batches",
        related_entity_id: batch.inventory_batch_id,
      });

      showToast(`${fmt3(batch.weight_kg)} kg merged into Resecada.`);
    } else {
      // Hold — keep in Ready to Merge, record decision
      const { error: holdErr } = await supabase.from("inventory_batches")
        .update({
          reviewed_by_user_id: user.id,
          reviewed_at: new Date().toISOString(),
          review_decision: "Held",
        })
        .eq("inventory_batch_id", batch.inventory_batch_id);

      if (holdErr) {
        showToast("Failed to hold batch. Please try again.", "error");
        setProcessing(false);
        setMergeModal(null);
        return;
      }

      showToast("Batch held — will remain in Ready to Merge queue.");
    }

    setProcessing(false);
    setMergeModal(null);
    fetchData();
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const resecadaTotal = resecada.reduce((s, b) => s + Number(b.weight_kg), 0);
  const walkinTotal = walkin.reduce((s, b) => s + Number(b.weight_kg), 0);
  const readyTotal = readyToMerge.reduce((s, b) => s + Number(b.weight_kg), 0);

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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuBoxes className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Inventory</h1>
          <p className="text-brown-light text-sm">Resecada pool · Walk-in Holding · Merge queue</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard
          label="Resecada Pool"
          value={`${fmt3(resecadaTotal)} kg`}
          count={resecada.length}
          color="bg-green-pale"
          textColor="text-green-dark"
          icon={LuLeaf}
        />
        <SummaryCard
          label="Walk-in Holding"
          value={`${fmt3(walkinTotal)} kg`}
          count={walkin.length}
          color="bg-orange-50"
          textColor="text-orange-600"
          icon={LuTruck}
        />
        <SummaryCard
          label="Ready to Merge"
          value={`${fmt3(readyTotal)} kg`}
          count={readyToMerge.length}
          color="bg-amber-50"
          textColor="text-amber-600"
          icon={LuArrowRightLeft}
          badge={readyToMerge.length > 0}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-beige rounded-xl p-1 mb-6 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${tab === i ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-mid"}`}>
            {t}
            {i === 2 && readyToMerge.length > 0 && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                {readyToMerge.length}
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
        <ResecadaTab batches={resecada} total={resecadaTotal} />
      ) : tab === 1 ? (
        <WalkinHoldingTab batches={walkin} total={walkinTotal} />
      ) : (
        <ReadyToMergeTab
          batches={readyToMerge}
          total={readyTotal}
          onAction={(batch, action) => setMergeModal({ batch, action })}
        />
      )}

      {/* Merge confirmation modal */}
      {mergeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card w-full max-w-md p-6 relative">
            <button onClick={() => setMergeModal(null)} className="absolute top-4 right-4 text-brown-light hover:text-brown-dark transition-colors">
              <LuX className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                mergeModal.action === "approve" ? "bg-green-pale" : "bg-amber-50"
              }`}>
                {mergeModal.action === "approve"
                  ? <LuArrowRightLeft className="w-5 h-5 text-green-dark" />
                  : <LuClock className="w-5 h-5 text-amber-600" />
                }
              </div>
              <div>
                <h2 className="text-lg font-bold text-brown-dark">
                  {mergeModal.action === "approve" ? "Approve Merge" : "Hold Batch"}
                </h2>
                <p className="text-brown-light text-sm">
                  {mergeModal.batch.delivery?.walkin_supplier?.first_name} {mergeModal.batch.delivery?.walkin_supplier?.last_name}
                </p>
              </div>
            </div>

            <div className="bg-beige rounded-xl px-4 py-4 mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brown-light">Weight</span>
                <span className="font-bold text-brown-dark">{fmt3(mergeModal.batch.weight_kg)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brown-light">Recorded</span>
                <span className="font-semibold text-brown-dark">{fmtDate(mergeModal.batch.recorded_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brown-light">Eligible Since</span>
                <span className="font-semibold text-brown-dark">{fmtDate(mergeModal.batch.merge_eligible_date)}</span>
              </div>
            </div>

            {mergeModal.action === "approve" ? (
              <p className="text-sm text-brown-light mb-5">
                This batch will be moved from <strong>Walk-in Holding</strong> into the <strong>Resecada pool</strong> and a transaction log will be recorded.
              </p>
            ) : (
              <p className="text-sm text-brown-light mb-5">
                The batch will remain in the <strong>Ready to Merge</strong> queue until you approve it. There is no forced timeout.
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setMergeModal(null)} disabled={processing}
                className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
                Cancel
              </button>
              <button onClick={confirmMergeAction} disabled={processing}
                className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2
                  ${mergeModal.action === "approve"
                    ? "bg-gradient-to-r from-green-dark to-green-mid hover:shadow-glow-green"
                    : "bg-amber-500 hover:bg-amber-600"
                  }`}>
                {processing && <LuLoader className="w-4 h-4 animate-spin" />}
                {mergeModal.action === "approve" ? "Approve Merge" : "Hold Batch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, count, color, textColor, icon: Icon, badge }) {
  return (
    <div className={`bg-white rounded-2xl shadow-card border border-beige-dark/20 p-4 relative ${badge ? "ring-2 ring-amber-300" : ""}`}>
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-400 rounded-full border-2 border-white" />
      )}
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <p className={`text-xl font-extrabold ${textColor}`}>{value}</p>
      <p className="text-brown-light text-xs mt-0.5">{label}</p>
      <p className="text-brown-light text-xs">{count} batch{count !== 1 ? "es" : ""}</p>
    </div>
  );
}

// ── Resecada Pool Tab ─────────────────────────────────────────────────────────
function ResecadaTab({ batches, total }) {
  function getSupplierName(delivery) {
    if (!delivery) return "—";
    return delivery.delivery_source === "Walkin"
      ? `${delivery.walkin_supplier?.first_name ?? ""} ${delivery.walkin_supplier?.last_name ?? ""}`.trim()
      : `${delivery.supplier?.first_name ?? ""} ${delivery.supplier?.last_name ?? ""}`.trim();
  }

  if (batches.length === 0) {
    return (
      <EmptyState icon={LuLeaf} title="Resecada pool is empty" subtitle="Accepted deliveries will appear here after lab inspection." />
    );
  }

  return (
    <div>
      <div className="bg-green-pale rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <p className="text-sm text-green-dark font-semibold">Total Resecada Stock</p>
        <p className="text-xl font-extrabold text-green-dark">{fmt3(total)} kg</p>
      </div>
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-beige text-brown-light text-xs uppercase tracking-wide">
              <tr>
                {["Supplier", "Source", "Delivery Date", "Recorded", "Weight (kg)"].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-dark/20">
              {batches.map(b => (
                <tr key={b.inventory_batch_id} className="hover:bg-beige/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-brown-dark">
                    {getSupplierName(b.delivery) || <span className="text-brown-light italic text-xs">Unknown supplier</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      b.delivery?.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                    }`}>
                      {b.delivery?.delivery_source === "Walkin" ? "Walk-in (merged)" : "Contractual"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-brown-mid">{fmtDate(b.delivery?.delivery_date)}</td>
                  <td className="px-5 py-3.5 text-brown-mid">{fmtDate(b.recorded_date)}</td>
                  <td className="px-5 py-3.5 font-bold text-green-dark">{fmt3(b.weight_kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MobileList batches={batches} getLabel={b => getSupplierName(b.delivery)} getSubLabel={b => fmtDate(b.recorded_date)} getTag={b => b.delivery?.delivery_source === "Walkin" ? "Walk-in (merged)" : "Contractual"} tagColor={b => b.delivery?.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"} icon={LuLeaf} iconColor="text-green-dark bg-green-pale" />
      </div>
    </div>
  );
}

// ── Walk-in Holding Tab ───────────────────────────────────────────────────────
function WalkinHoldingTab({ batches, total }) {
  if (batches.length === 0) {
    return <EmptyState icon={LuTruck} title="Walk-in holding is empty" subtitle="Walk-in deliveries will appear here while waiting for merge eligibility." />;
  }

  return (
    <div>
      <div className="bg-orange-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <p className="text-sm text-orange-600 font-semibold">Total Walk-in Holding</p>
        <p className="text-xl font-extrabold text-orange-600">{fmt3(total)} kg</p>
      </div>
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-beige text-brown-light text-xs uppercase tracking-wide">
              <tr>
                {["Supplier", "Delivery Date", "Recorded", "Weight (kg)", "Eligible to Merge", "Days Left"].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-dark/20">
              {batches.map(b => {
                const days = b.merge_eligible_date ? daysUntil(b.merge_eligible_date) : null;
                return (
                  <tr key={b.inventory_batch_id} className="hover:bg-beige/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-brown-dark">
                      {b.delivery?.walkin_supplier?.first_name} {b.delivery?.walkin_supplier?.last_name}
                    </td>
                    <td className="px-5 py-3.5 text-brown-mid">{fmtDate(b.delivery?.delivery_date)}</td>
                    <td className="px-5 py-3.5 text-brown-mid">{fmtDate(b.recorded_date)}</td>
                    <td className="px-5 py-3.5 font-bold text-orange-600">{fmt3(b.weight_kg)}</td>
                    <td className="px-5 py-3.5 text-brown-mid">{fmtDate(b.merge_eligible_date)}</td>
                    <td className="px-5 py-3.5">
                      {days !== null ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          days <= 2 ? "bg-amber-50 text-amber-600" : "bg-beige text-brown-mid"
                        }`}>
                          {days > 0 ? `${days}d` : "Today"}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <ul className="md:hidden divide-y divide-beige-dark/20">
          {batches.map(b => {
            const days = b.merge_eligible_date ? daysUntil(b.merge_eligible_date) : null;
            return (
              <li key={b.inventory_batch_id} className="px-5 py-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                    <LuTruck className="w-4 h-4 text-orange-500" />
                  </div>
                  <p className="font-semibold text-brown-dark text-sm">
                    {b.delivery?.walkin_supplier?.first_name} {b.delivery?.walkin_supplier?.last_name}
                  </p>
                  <span className="ml-auto font-bold text-orange-600">{fmt3(b.weight_kg)} kg</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-brown-mid ml-11">
                  <p>Recorded: {fmtDate(b.recorded_date)}</p>
                  <p>Eligible: {fmtDate(b.merge_eligible_date)}</p>
                  {days !== null && (
                    <p className={days <= 2 ? "text-amber-600 font-semibold" : ""}>
                      {days > 0 ? `${days} days left` : "Eligible today"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Ready to Merge Tab ────────────────────────────────────────────────────────
function ReadyToMergeTab({ batches, total, onAction }) {
  if (batches.length === 0) {
    return <EmptyState icon={LuArrowRightLeft} title="No batches ready to merge" subtitle="Walk-in batches that have passed their 14-day holding period will appear here." />;
  }

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
        <LuCircleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-amber-800 font-semibold">{batches.length} batch{batches.length !== 1 ? "es" : ""} ready · {fmt3(total)} kg</p>
          <p className="text-xs text-amber-700 mt-0.5">Review each batch and choose to Approve (merge into Resecada) or Hold (keep in queue).</p>
        </div>
      </div>

      <div className="space-y-3">
        {batches.map(b => {
          const name = `${b.delivery?.walkin_supplier?.first_name ?? ""} ${b.delivery?.walkin_supplier?.last_name ?? ""}`.trim();
          return (
            <div key={b.inventory_batch_id} className="bg-white rounded-2xl shadow-card border-2 border-amber-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <LuArrowRightLeft className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-brown-dark">{name || "—"}</p>
                    <p className="text-brown-light text-xs">Walk-in · Recorded {fmtDate(b.recorded_date)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-extrabold text-amber-600">{fmt3(b.weight_kg)}</p>
                  <p className="text-brown-light text-xs">kg</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-brown-light mb-5 bg-beige rounded-xl px-3 py-2">
                <LuCalendar className="w-3.5 h-3.5" />
                Eligible since <span className="font-semibold text-brown-dark ml-1">{fmtDate(b.merge_eligible_date)}</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => onAction(b, "hold")}
                  className="flex-1 py-2.5 rounded-xl border border-amber-200 text-amber-700 font-semibold text-sm
                    hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                >
                  <LuClock className="w-4 h-4" /> Hold
                </button>
                <button
                  onClick={() => onAction(b, "approve")}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm
                    hover:shadow-glow-green transition-all flex items-center justify-center gap-2"
                >
                  <LuCheck className="w-4 h-4" /> Approve Merge
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-brown-light" />
      </div>
      <p className="text-brown-dark font-semibold">{title}</p>
      <p className="text-brown-light text-sm mt-1">{subtitle}</p>
    </div>
  );
}

function MobileList({ batches, getLabel, getSubLabel, getTag, tagColor, icon: Icon, iconColor }) {
  return (
    <ul className="md:hidden divide-y divide-beige-dark/20">
      {batches.map(b => (
        <li key={b.inventory_batch_id} className="px-5 py-4 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor.split(" ")[1]} ${iconColor.split(" ")[0]}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-brown-dark text-sm">{getLabel(b)}</p>
            <p className="text-brown-light text-xs">{getSubLabel(b)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-brown-dark text-sm">{fmt3(b.weight_kg)} kg</p>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${tagColor(b)}`}>{getTag(b)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
