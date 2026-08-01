import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuLayoutDashboard, LuTrendingUp, LuPencil, LuCheck, LuX, LuCircleAlert,
  LuUserPlus, LuScale, LuFlaskConical,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import CreateStaffModal from "../../components/CreateStaffModal";

export default function OwnerOverview() {
  const navigate = useNavigate();
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

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuLayoutDashboard className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Dashboard Overview</h1>
          <p className="text-brown-light text-sm">Welcome back to CopTrax</p>
        </div>
      </div>

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

      {/* Spot Price card */}
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <LuTrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-0.5">Today's Spot Price</p>
              {editing ? (
                <div className="flex items-center gap-2">
                  <span className="text-brown-dark font-bold">₱</span>
                  <input
                    type="number" step="0.01" min="0" autoFocus
                    value={newPrice}
                    onChange={e => { setNewPrice(e.target.value); setError(""); }}
                    placeholder={String(spotPrice)}
                    className="w-32 px-3 py-1.5 rounded-lg border border-beige-dark text-brown-dark font-bold text-lg
                      focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
                  />
                  <span className="text-brown-light text-sm">/kg</span>
                  <button onClick={saveSpotPrice} disabled={saving}
                    className="p-1.5 rounded-lg bg-green-pale text-green-dark hover:bg-green-mid/20 transition-colors">
                    <LuCheck className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditing(false); setNewPrice(""); setError(""); }}
                    className="p-1.5 rounded-lg hover:bg-beige text-brown-light hover:text-brown-mid transition-colors">
                    <LuX className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <p className="text-2xl font-extrabold text-brown-dark">
                  {spotPrice !== null ? `₱${Number(spotPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—"}
                  <span className="text-brown-light text-base font-normal ml-1">/kg</span>
                </p>
              )}
              {error && (
                <p className="flex items-center gap-1.5 text-red-600 text-xs mt-1">
                  <LuCircleAlert className="w-3.5 h-3.5" /> {error}
                </p>
              )}
            </div>
          </div>
          {!editing && (
            <button onClick={() => { setEditing(true); setNewPrice(String(spotPrice ?? "")); }}
              className="flex items-center gap-1.5 text-xs text-brown-light hover:text-brown-mid transition-colors mt-1 px-3 py-1.5 rounded-lg hover:bg-beige">
              <LuPencil className="w-3.5 h-3.5" /> Update
            </button>
          )}
        </div>
        <p className="text-xs text-brown-light mt-3">
          This is the current spot price used for late deliveries. Updating it takes effect immediately on all future payment computations.
        </p>
      </div>

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
