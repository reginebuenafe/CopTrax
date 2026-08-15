import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuLayoutDashboard, LuFileText, LuTruck, LuWallet,
  LuStar, LuMessageSquare, LuArrowRight, LuClock,
  LuCircleCheck, LuCircleAlert, LuTrendingUp,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5 text-left w-full
        hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200
        flex items-center justify-between gap-3 ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-brown-mid text-xs font-semibold mb-1">{label}</p>
        <p className="text-2xl font-extrabold text-brown-dark leading-none">{value}</p>
        {sub && <p className="text-brown-light text-xs mt-1 truncate">{sub}</p>}
      </div>
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
    </button>
  );
}

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

export default function SupplierOverview() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [spotPrice, setSpotPrice] = useState(null);
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [contractRes, deliveryRes, paymentRes, ratingRes, spotRes] = await Promise.all([
        supabase.from("contracts")
          .select("contract_id, status")
          .eq("supplier_id", user.id),

        supabase.from("deliveries")
          .select(`
            delivery_id, delivery_status, delivery_date, delivery_source,
            contract:contract_id(contract_number)
          `)
          .eq("delivery_source", "Contract-based")
          .in("contract_id",
            (await supabase.from("contracts").select("contract_id").eq("supplier_id", user.id)).data?.map(c => c.contract_id) ?? []
          )
          .order("delivery_date", { ascending: false })
          .limit(5),

        supabase.from("payments")
          .select("total_amount, payment_status")
          .eq("supplier_id", user.id),

        supabase.from("supplier_performance_snapshot")
          .select("overall_supplier_rating")
          .eq("supplier_id", user.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single(),

        supabase.from("spot_price").select("price_per_kg").limit(1).single(),
      ]);

      const contracts = contractRes.data ?? [];
      const payments = paymentRes.data ?? [];

      setStats({
        activeContracts: contracts.filter(c => c.status === "Active").length,
        totalContracts: contracts.length,
        pendingDeliveries: (deliveryRes.data ?? []).filter(d => ["Pending", "Weighed", "Inspected"].includes(d.delivery_status)).length,
        totalEarned: payments.filter(p => p.payment_status === "Released").reduce((s, p) => s + Number(p.total_amount), 0),
        pendingPayment: payments.filter(p => p.payment_status === "Pending").reduce((s, p) => s + Number(p.total_amount), 0),
        overallRating: ratingRes.data?.overall_supplier_rating ?? null,
      });

      setSpotPrice(spotRes.data?.price_per_kg ?? null);

      setRecentDeliveries(deliveryRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  const STATUS_META = {
    Pending: { label: "Pending", color: "bg-beige text-brown-mid", icon: LuClock },
    Weighed: { label: "Weighed", color: "bg-blue-50 text-blue-600", icon: LuClock },
    Inspected: { label: "Inspected", color: "bg-purple-50 text-purple-600", icon: LuClock },
    Accepted: { label: "Accepted", color: "bg-green-pale text-green-dark", icon: LuCircleCheck },
    Rejected: { label: "Rejected", color: "bg-red-50 text-red-600", icon: LuCircleAlert },
  };

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      {/* Header section with Welcome text & Spot Price */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 mb-6">
        <div>
          <p className="text-xs font-medium text-brown-light mb-3">
            {todayFormatted}
          </p>
          <h1 className="text-2xl font-bold text-brown-dark">
            Welcome Back, {profile?.first_name} 👋
          </h1>
          <p className="text-brown-light text-sm mt-0.5">Here's a summary of your account activity</p>
        </div>

        {/* Spot Price badge */}
        <div className="bg-[#024023] border-2 border-[#2E7D32] rounded-2xl px-4 py-4 text-white shrink-0 flex items-center gap-3.5 shadow-sm">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
            <LuTrendingUp className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <p className="text-[9px] font-medium text-white-100/50 uppercase opacity-80 mb-1 tracking-wider">
              Current Spot Price
            </p>
            <p className="text-xl font-extrabold text-white leading-tight">
              {spotPrice !== null
                ? `₱${Number(spotPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "—"}
              <span className="text-emerald-200/80 text-xs font-normal ml-1">/kg</span>
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={LuFileText}
              label="Active Contracts"
              value={stats.activeContracts}
              sub={`${stats.totalContracts} total`}
              color="bg-green-pale text-green-dark"
              onClick={() => navigate("/dashboard/supplier/contracts")}
            />
            <StatCard
              icon={LuTruck}
              label="Pending Deliveries"
              value={stats.pendingDeliveries}
              sub="Awaiting Processing"
              color="bg-blue-50 text-blue-600"
              onClick={() => navigate("/dashboard/supplier/deliveries")}
            />
            <StatCard
              icon={LuWallet}
              label="Total Earned"
              value={peso(stats.totalEarned)}
              sub={stats.pendingPayment > 0 ? `${peso(stats.pendingPayment)} Pending` : "All Released"}
              color="bg-amber-50 text-amber-600"
              onClick={() => navigate("/dashboard/supplier/payments")}
            />
            <StatCard
              icon={LuStar}
              label="My Rating"
              value={stats.overallRating !== null ? `${Number(stats.overallRating).toFixed(1)} / 5` : "—"}
              sub={stats.overallRating !== null ? "Overall Performance" : "No Rated Contracts Yet"}
              color="bg-amber-50 text-amber-500"
              onClick={() => navigate("/dashboard/supplier/rating")}
            />
          </div>



          {/* Recent deliveries */}
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 mb-5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-beige-dark/20">
              <p className="font-bold text-brown-dark text-sm flex items-center gap-2">
                <LuTruck className="w-4 h-4 text-brown-light" /> Recent Deliveries
              </p>
              <button onClick={() => navigate("/dashboard/supplier/deliveries")}
                className="text-xs text-green-dark font-semibold flex items-center gap-1 hover:underline">
                View all <LuArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentDeliveries.length === 0 ? (
              <div className="py-10 text-center text-brown-light text-sm px-4">
                No deliveries recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-beige-dark/10">
                {recentDeliveries.map(d => {
                  const meta = STATUS_META[d.delivery_status] ?? STATUS_META.Pending;
                  const Icon = meta.icon;
                  return (
                    <li key={d.delivery_id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color.split(" ")[0]}`}>
                        <Icon className={`w-4 h-4 ${meta.color.split(" ")[1]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brown-dark">{d.contract?.contract_number ?? "—"}</p>
                        <p className="text-xs text-brown-light">
                          {new Date(d.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${meta.color}`}>
                        {meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Start Negotiation", icon: LuMessageSquare, to: "/dashboard/supplier/conversations", color: "bg-green-pale text-green-dark" },
              { label: "View Contracts", icon: LuFileText, to: "/dashboard/supplier/contracts", color: "bg-blue-50 text-blue-600" },
              { label: "Payment History", icon: LuWallet, to: "/dashboard/supplier/payments", color: "bg-amber-50 text-amber-600" },
            ].map(a => (
              <button key={a.label} onClick={() => navigate(a.to)}
                className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-4 flex items-center gap-3
                  hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 text-left">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.color.split(" ")[0]}`}>
                  <a.icon className={`w-4.5 h-4.5 ${a.color.split(" ")[1]}`} />
                </div>
                <span className="text-sm font-semibold text-brown-dark">{a.label}</span>
                <LuArrowRight className="w-4 h-4 text-brown-light ml-auto" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
