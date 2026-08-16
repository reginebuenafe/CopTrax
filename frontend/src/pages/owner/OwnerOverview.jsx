import { useEffect, useState } from "react";
import {
  LuPencil, LuCheck, LuX, LuCircleAlert, LuTrendingUp,
  LuUserPlus, LuScale, LuFlaskConical,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import CreateStaffModal from "../../components/CreateStaffModal";

export default function OwnerOverview() {
  const [spotPrice, setSpotPrice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function loadData() {
      const [spotRes, pendingRes, contractRes, deliveryRes, payRes] = await Promise.all([
        supabase.from("spot_price").select("price_per_kg").limit(1).single(),
        supabase.from("users").select("user_id", { count: "exact", head: true }).eq("account_status", "Pending"),
        supabase.from("contracts").select("contract_id", { count: "exact", head: true }).eq("status", "Active"),
        supabase.from("deliveries").select("delivery_id", { count: "exact", head: true }).eq("delivery_status", "Weighed"),
        supabase.from("payments").select("payment_id", { count: "exact", head: true }).eq("payment_status", "Pending"),
      ]);
      setSpotPrice(spotRes.data?.price_per_kg ?? 0);
      setStats({
        pendingApprovals: pendingRes.count ?? 0,
        activeContracts: contractRes.count ?? 0,
        awaitingInspection: deliveryRes.count ?? 0,
        pendingPayments: payRes.count ?? 0,
      });
    }
    loadData();
  }, []);

  async function saveSpotPrice() {
    const val = parseFloat(newPrice);
    if (isNaN(val) || val <= 0) { setError("Enter a valid positive price."); return; }
    setSaving(true);
    setError("");
    // spot_price always has 1 row — update without a WHERE filter using a throwaway condition
    const { error: err } = await supabase.from("spot_price")
      .update({ price_per_kg: val, updated_at: new Date().toISOString() })
      .gte("price_per_kg", 0);
    setSaving(false);
    if (err) { setError("Failed to update spot price."); return; }
    setSpotPrice(val);
    setEditing(false);
    setNewPrice("");
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  const STAT_CARDS = stats ? [
    { label: "Pending Approvals", value: stats.pendingApprovals, color: "bg-amber-50 text-amber-600", path: "/dashboard/owner/users" },
    { label: "Active Contracts", value: stats.activeContracts, color: "bg-green-pale text-green-dark", path: "/dashboard/owner/contracts" },
    { label: "Awaiting Inspection", value: stats.awaitingInspection, color: "bg-purple-50 text-purple-600", path: "/dashboard/owner/quality" },
    { label: "Pending Payments", value: stats.pendingPayments, color: "bg-blue-50 text-blue-600", path: "/dashboard/owner/payments" },
  ] : [];

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const weekday = now.toLocaleDateString("en-PH", {
    weekday: "long",
  });
  const calendarDate = now.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <section className="mt-6 mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold">
            <span className="text-[#60463D]">{weekday}, </span>
            <span className="text-[#17682D]">{calendarDate}</span>
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-[#60463D] sm:text-[28px]">
            {greeting}, Admin
          </h1>
          <p className="mt-1 text-xs text-[#9A857A]">
            Here&apos;s what&apos;s moving through your trading operation today.
          </p>
        </div>

        <div className={`w-full transition-[width] ${editing ? "sm:w-[320px]" : "sm:w-[220px]"}`}>
          <div className="flex items-center gap-3.5 rounded-2xl border-2 border-[#2E7D32] bg-[#024023] px-4 py-4 text-white shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <LuTrendingUp className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
            <p className="text-[9px] font-medium uppercase tracking-wider text-white/80">Current Spot Price</p>
            {editing ? (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="font-bold">₱</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={newPrice}
                  onChange={e => { setNewPrice(e.target.value); setError(""); }}
                  placeholder={String(spotPrice)}
                  className="w-20 rounded-lg border border-white/40 bg-white px-2 py-1 text-center text-sm font-bold text-[#3E2723] focus:outline-none focus:ring-2 focus:ring-white/60"
                />
                <span className="text-sm text-white/80">/kg</span>
                <button
                  type="button"
                  onClick={saveSpotPrice}
                  disabled={saving}
                  className="rounded-md p-1 text-white/85 hover:bg-white/15 hover:text-white disabled:opacity-50"
                  aria-label="Save spot price"
                >
                  <LuCheck className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setNewPrice(""); setError(""); }}
                  className="rounded-md p-1 text-white/70 hover:bg-white/15 hover:text-white"
                  aria-label="Cancel spot price update"
                >
                  <LuX className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-xl font-extrabold leading-tight">
                  {spotPrice !== null
                    ? `₱${Number(spotPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"}
                  <span className="ml-1 text-xs font-normal text-emerald-200/80">/kg</span>
                </p>
                <button
                  type="button"
                  onClick={() => { setEditing(true); setNewPrice(String(spotPrice ?? "")); }}
                  className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  aria-label="Update spot price"
                  title="Update spot price"
                >
                  <LuPencil className="h-4 w-4" />
                </button>
              </div>
            )}
            </div>
          </div>
          {error && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600 sm:justify-end">
              <LuCircleAlert className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </div>
      </section>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map(s => (
            <div key={s.label} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 px-5 py-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color.split(" ")[0]}`}>
                <span className={`text-xl font-extrabold ${s.color.split(" ")[1]}`}>{s.value}</span>
              </div>
              <p className="text-brown-light text-xs font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions — Staff Account Creation */}
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
        <p className="text-xs font-semibold text-brown-light uppercase tracking-wide mb-4">Staff Account Management</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Create Weigher */}
          <button
            onClick={() => setCreateModal("Weigher")}
            className="flex items-center gap-3 p-4 rounded-2xl border border-beige-dark/30 bg-orange-50/50
              hover:bg-orange-50 hover:border-orange-200 hover:-translate-y-0.5 transition-all duration-200 text-left group">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-orange-200 transition-colors">
              <LuScale className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brown-dark">Create Weigher Account</p>
              <p className="text-xs text-brown-light">Active immediately, no approval needed</p>
            </div>
            <LuUserPlus className="w-4 h-4 text-brown-light ml-auto shrink-0" />
          </button>

          {/* Create Laboratory Staff */}
          <button
            onClick={() => setCreateModal("Laboratory Staff")}
            className="flex items-center gap-3 p-4 rounded-2xl border border-beige-dark/30 bg-purple-50/50
              hover:bg-purple-50 hover:border-purple-200 hover:-translate-y-0.5 transition-all duration-200 text-left group">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-purple-200 transition-colors">
              <LuFlaskConical className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brown-dark">Create Lab Staff Account</p>
              <p className="text-xs text-brown-light">Active immediately, no approval needed</p>
            </div>
            <LuUserPlus className="w-4 h-4 text-brown-light ml-auto shrink-0" />
          </button>
        </div>
        <p className="text-xs text-brown-light mt-3">
          Weigher and Laboratory Staff accounts are created directly by the Business Owner. They are active immediately with no pending or approval step.
        </p>
      </div>

      {/* Create Staff Modal */}
      {createModal && (
        <CreateStaffModal
          defaultRole={createModal}
          onClose={() => setCreateModal(false)}
          onCreated={(firstName, lastName, role) => {
            setCreateModal(false);
            showToast(`${firstName} ${lastName}'s ${role} account has been created successfully.`);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-card-hover
          bg-white border border-green-pale text-green-dark text-sm font-medium animate-fade-in-up">
          <LuCheck className="w-4 h-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
