import { useEffect, useState, useCallback } from "react";
import {
  LuLeaf, LuTruck, LuCheck, LuCircleAlert, LuArrowRightLeft,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

const TABS = ["Resecada Pool", "Walk-in Holding"];

function fmt3(n) { return Number(n ?? 0).toFixed(2); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function InventoryPage() {
  const [tab, setTab] = useState(0);
  const [resecada, setResecada] = useState([]);
  const [walkin, setWalkin] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [resRes, wRes] = await Promise.all([
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
    ]);

    setResecada(resRes.data ?? []);
    setWalkin(wRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const resecadaTotal = resecada.reduce((s, b) => s + Number(b.weight_kg), 0);
  const walkinTotal = walkin.reduce((s, b) => s + Number(b.weight_kg), 0);

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
          <h1 className="text-2xl font-black text-brown-dark">Inventory</h1>
          <p className="text-brown-light text-sm mt-0.5">Resecada pool · Walk-in Holding</p>
        </div>
        <span className="text-xs text-brown-light">{resecada.length + walkin.length} total</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-beige-dark/40 mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`pb-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
              ${tab === i ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 0 ? (
        <ResecadaTab batches={resecada} total={resecadaTotal} />
      ) : (
        <WalkinHoldingTab batches={walkin} total={walkinTotal} />
      )}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, count, color, textColor, icon: Icon, badge }) {
  return (
    <div className={`bg-white rounded-xl border border-beige-dark/40 p-4 relative ${badge ? "ring-2 ring-amber-300" : ""}`}>
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-400 rounded-full border-2 border-white" />
      )}
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <p className={`break-words text-xl font-extrabold ${textColor}`}>{value}</p>
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
      <div className="bg-green-pale rounded-xl px-4 py-3 mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-green-dark font-semibold">Total Resecada Stock</p>
        <p className="text-xl font-extrabold text-green-dark">{fmt3(total)} kg</p>
      </div>
      <div className="bg-white rounded-xl border border-beige-dark/40 overflow-hidden">
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
        <div className="md:hidden space-y-3 p-4">
          {batches.map(b => (
            <div key={b.inventory_batch_id} className="bg-white rounded-xl border border-beige-dark/40 p-4 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-brown-dark">
                  {getSupplierName(b.delivery) || <span className="text-brown-light italic text-xs">Unknown supplier</span>}
                </p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  b.delivery?.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                }`}>
                  {b.delivery?.delivery_source === "Walkin" ? "Walk-in (merged)" : "Contractual"}
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-brown-light">Source</span>
                  <span className={`font-semibold text-right ${
                    b.delivery?.delivery_source === "Walkin" ? "text-orange-600" : "text-green-dark"
                  }`}>
                    {b.delivery?.delivery_source === "Walkin" ? "Walk-in (merged)" : "Contractual"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-brown-light">Delivery Date</span>
                  <span className="font-semibold text-brown-dark text-right">{fmtDate(b.delivery?.delivery_date)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-brown-light">Recorded</span>
                  <span className="font-semibold text-brown-dark text-right">{fmtDate(b.recorded_date)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-brown-light">Weight (kg)</span>
                  <span className="font-semibold text-green-dark text-right">{fmt3(b.weight_kg)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
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
      <div className="bg-orange-50 rounded-xl px-4 py-3 mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-orange-600 font-semibold">Total Walk-in Holding</p>
        <p className="text-xl font-extrabold text-orange-600">{fmt3(total)} kg</p>
      </div>
      <div className="bg-white rounded-xl border border-beige-dark/40 overflow-hidden">
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
        <div className="md:hidden space-y-3 p-4">
          {batches.map(b => {
            const days = b.merge_eligible_date ? daysUntil(b.merge_eligible_date) : null;
            return (
              <div key={b.inventory_batch_id} className="bg-white rounded-xl border border-beige-dark/40 p-4 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-brown-dark">
                    {b.delivery?.walkin_supplier?.first_name} {b.delivery?.walkin_supplier?.last_name}
                  </p>
                  <span className="font-bold text-orange-600 shrink-0">{fmt3(b.weight_kg)} kg</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-brown-light">Delivery Date</span>
                    <span className="font-semibold text-brown-dark text-right">{fmtDate(b.delivery?.delivery_date)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-brown-light">Recorded</span>
                    <span className="font-semibold text-brown-dark text-right">{fmtDate(b.recorded_date)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-brown-light">Eligible to Merge</span>
                    <span className="font-semibold text-brown-dark text-right">{fmtDate(b.merge_eligible_date)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-brown-light">Days Left</span>
                    <span className={`font-semibold text-right ${days !== null && days <= 2 ? "text-amber-600" : "text-brown-dark"}`}>
                      {days !== null ? (days > 0 ? `${days}d` : "Today") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Ready to Merge Tab — removed (auto-merge via cron, no manual action needed) ──

// ── helpers ───────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white rounded-xl border border-beige-dark/40 flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-14 h-14 bg-beige rounded-xl flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-brown-light" />
      </div>
      <p className="text-brown-dark font-semibold">{title}</p>
      <p className="text-brown-light text-sm mt-1">{subtitle}</p>
    </div>
  );
}
