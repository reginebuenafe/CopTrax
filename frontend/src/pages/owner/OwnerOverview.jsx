import { useEffect, useState } from "react";
import {
  LuPencil, LuCheck, LuX, LuCircleAlert, LuTrendingUp,
  LuUserPlus, LuFlaskConical, LuTruck, LuStar,
  LuFileText, LuWallet, LuActivity,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import CreateStaffModal from "../../components/CreateStaffModal";

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


// ── SVG Area/Line Chart ─────────────────────────────────────────────────────
function AreaChart({ data, maxVal }) {
  if (!data.length) return <p className="text-xs text-brown-light py-4 text-center">No data yet</p>;

  const W = 500, H = 110, padL = 8, padR = 8, padT = 10, padB = 20;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;
  const xStep = n > 1 ? innerW / (n - 1) : innerW;

  const yFor = val => {
    const norm = maxVal > 0 ? val / maxVal : 0;
    return padT + innerH * (1 - norm);
  };
  const xFor = i => padL + (n > 1 ? i * xStep : innerW / 2);

  const pts = data.map((d, i) => [xFor(i), yFor(d.value)]);
  const linePts = pts.map(([x, y]) => `${x},${y}`).join(" ");
  // area: go down to baseline on each side
  const areaD = [
    `M ${pts[0][0]},${padT + innerH}`,
    ...pts.map(([x, y]) => `L ${x},${y}`),
    `L ${pts[pts.length - 1][0]},${padT + innerH}`,
    "Z",
  ].join(" ");

  const gridLines = [0.25, 0.5, 0.75].map(r => padT + innerH * (1 - r));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a27" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2d5a27" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grid lines */}
        {gridLines.map((y, i) => (
          <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E7DCC9" strokeWidth="0.8" />
        ))}
        {/* baseline */}
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#C9B99A" strokeWidth="1" />

        {/* area fill */}
        <path d={areaD} fill="url(#areaGrad)" />

        {/* line */}
        <polyline points={linePts} fill="none" stroke="#2d5a27" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* dots + labels */}
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="3" fill="#2d5a27" />
            {data[i].value > 0 && (
              <circle cx={x} cy={y} r="5" fill="#2d5a27" fillOpacity="0.15" />
            )}
            {/* month label */}
            <text
              x={x} y={H - 2}
              textAnchor="middle"
              fontSize="9"
              fill="#9A857A"
            >{data[i].label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ProgressBar({ pct, color = "bg-green-dark" }) {
  return (
    <div className="w-full h-1.5 bg-beige rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children, iconColor = "text-green-dark", iconBg = "bg-green-pale" }) {
  const Icon = icon;
  return (
    <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <p className="text-sm font-bold text-brown-dark">{title}</p>
      </div>
      {children}
    </div>
  );
}

export default function OwnerOverview() {
  const { user } = useAuth();

  // ── existing state (unchanged) ──────────────────────────────────────────
  const [spotPrice, setSpotPrice]   = useState(null);
  const [editing, setEditing]       = useState(false);
  const [newPrice, setNewPrice]     = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [stats, setStats]           = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [toast, setToast]           = useState(null);

  // ── analytics state ─────────────────────────────────────────────────────
  const [deliveryVolume, setDeliveryVolume] = useState([]);   // [{label, value, tooltip}] last 6 months
  const [currentMonthKg, setCurrentMonthKg] = useState(0);
  const [prevMonthKg, setPrevMonthKg]       = useState(null);
  const [contracts, setContracts]           = useState([]);   // active contracts with progress
  const [quality, setQuality]               = useState(null); // {accepted, rejected, pending, avgMC, avgDiscount}
  const [paymentSummary, setPaymentSummary] = useState(null); // {readyAmount, readyCount, paidAmount, pendingBatches}
  const [topSuppliers, setTopSuppliers]     = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    async function loadAll() {
      // ── summary stats (existing) ─────────────────────────────────────
      const [spotRes, pendingRes, contractRes, deliveryRes, payRes] = await Promise.all([
        supabase.from("spot_price").select("price_per_kg").limit(1).single(),
        supabase.from("users").select("user_id", { count: "exact", head: true }).eq("account_status", "Pending"),
        supabase.from("contracts").select("contract_id", { count: "exact", head: true }).eq("status", "Active"),
        supabase.from("deliveries").select("delivery_id", { count: "exact", head: true }).eq("delivery_status", "Weighed"),
        supabase.from("payments").select("payment_id", { count: "exact", head: true }).eq("payment_status", "Pending"),
      ]);
      setSpotPrice(spotRes.data?.price_per_kg ?? 0);
      setStats({
        pendingApprovals:   pendingRes.count ?? 0,
        activeContracts:    contractRes.count ?? 0,
        awaitingInspection: deliveryRes.count ?? 0,
        pendingPayments:    payRes.count ?? 0,
      });

      // ── 1. Delivery volume — last 6 months of accepted deliveries ────
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const { data: acceptedDeliveries } = await supabase
        .from("deliveries")
        .select("delivery_date, weighing_records(net_weight_kg)")
        .eq("delivery_status", "Accepted")
        .gte("delivery_date", sixMonthsAgo.toISOString().slice(0, 10));

      const monthMap = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-PH", { month: "short" });
        monthMap[key] = { label, value: 0 };
      }
      (acceptedDeliveries ?? []).forEach(d => {
        const key = d.delivery_date?.slice(0, 7);
        if (monthMap[key]) {
          monthMap[key].value += parseFloat(d.weighing_records?.[0]?.net_weight_kg ?? 0);
        }
      });
      const volumeData = Object.entries(monthMap).map(([, v]) => ({
        label: v.label,
        value: v.value,
        tooltip: `${(v.value / 1000).toFixed(2)} t`,
      }));
      setDeliveryVolume(volumeData);
      const months = Object.keys(monthMap);
      setCurrentMonthKg(monthMap[months[months.length - 1]]?.value ?? 0);
      const prev = monthMap[months[months.length - 2]]?.value ?? 0;
      setPrevMonthKg(prev);

      // ── 2. Contract progress — active contracts ──────────────────────
      const { data: activeContracts } = await supabase
        .from("contracts")
        .select("contract_id, contract_number, contracted_tons, supplier:supplier_id(first_name, last_name)")
        .eq("status", "Active")
        .order("due_date", { ascending: true })
        .limit(10);

      if (activeContracts?.length) {
        const ids = activeContracts.map(c => c.contract_id);
        const { data: allocs } = await supabase
          .from("delivery_allocations")
          .select("contract_id, allocated_weight_kg, delivery:delivery_id(delivery_status)")
          .in("contract_id", ids);

        const acceptedMap = (allocs ?? []).reduce((acc, a) => {
          if (a.delivery?.delivery_status === "Accepted") {
            acc[a.contract_id] = (acc[a.contract_id] ?? 0) + Number(a.allocated_weight_kg ?? 0);
          }
          return acc;
        }, {});

        setContracts(activeContracts.map(c => {
          const contractedKg = Number(c.contracted_tons ?? 0) * 1000;
          const deliveredKg  = acceptedMap[c.contract_id] ?? 0;
          const remainingKg  = Math.max(0, contractedKg - deliveredKg);
          const pct          = contractedKg > 0 ? (deliveredKg / contractedKg) * 100 : 0;
          return { ...c, contractedKg, deliveredKg, remainingKg, pct };
        }));
      }

      // ── 3. Quality overview ──────────────────────────────────────────
      const { data: inspections } = await supabase
        .from("laboratory_inspections")
        .select("moisture_content_pct, quality_results(result, remarks)");

      if (inspections?.length) {
        let accepted = 0, rejected = 0, mcSum = 0, discountSum = 0, discountCount = 0;
        for (const li of inspections) {
          const result = li.quality_results?.[0]?.result;
          const mc     = parseFloat(li.moisture_content_pct ?? 0);
          mcSum += mc;
          if (result === "Accepted") {
            accepted++;
            const m = (li.quality_results?.[0]?.remarks ?? "").match(/Discount:\s*([\d.]+)%/);
            if (m) { discountSum += parseFloat(m[1]); discountCount++; }
          } else if (result === "Rejected") rejected++;
        }
        const { count: pendingQty } = await supabase
          .from("deliveries")
          .select("delivery_id", { count: "exact", head: true })
          .eq("delivery_status", "Weighed");
        setQuality({
          accepted,
          rejected,
          pending: pendingQty ?? 0,
          avgMC:       inspections.length ? (mcSum / inspections.length).toFixed(1) : null,
          avgDiscount: discountCount ? (discountSum / discountCount).toFixed(1) : null,
        });
      }

      // ── 4. Payment summary ───────────────────────────────────────────
      const [paymentsRes, readyRes] = await Promise.all([
        supabase.from("payments").select("total_amount, payment_status"),
        supabase.from("deliveries")
          .select("delivery_id", { count: "exact", head: true })
          .eq("delivery_status", "Accepted")
          .is("payment_id", null),
      ]);
      const allPayments = paymentsRes.data ?? [];
      const paidTotal   = allPayments.filter(p => p.payment_status === "Released").reduce((s, p) => s + Number(p.total_amount ?? 0), 0);
      const pendingTotal = allPayments.filter(p => p.payment_status === "Pending").reduce((s, p) => s + Number(p.total_amount ?? 0), 0);
      const pendingBatches = allPayments.filter(p => p.payment_status === "Pending").length;
      setPaymentSummary({
        paidTotal,
        pendingTotal,
        pendingBatches,
        readyCount: readyRes.count ?? 0,
      });

      // ── 5. Top suppliers by rating ───────────────────────────────────
      const { data: snapshots } = await supabase
        .from("supplier_performance_snapshot")
        .select("supplier_id, overall_supplier_rating, supplier:supplier_id(first_name, last_name)")
        .order("overall_supplier_rating", { ascending: false });

      if (snapshots?.length) {
        // Keep latest snapshot per supplier
        const seen = new Set();
        const top = [];
        for (const s of snapshots) {
          if (!seen.has(s.supplier_id)) {
            seen.add(s.supplier_id);
            top.push(s);
            if (top.length === 5) break;
          }
        }
        setTopSuppliers(top);
      }

      // ── 6. Recent activity (BO notifications) ───────────────────────
      if (user?.id) {
        const { data: notifs } = await supabase
          .from("notifications")
          .select("notification_id, notification_type, message, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(8);
        setRecentActivity(notifs ?? []);
      }
    }

    loadAll();
  }, [user?.id]);

  // ── existing spot-price handlers (unchanged) ────────────────────────────
  async function saveSpotPrice() {
    const val = parseFloat(newPrice);
    if (isNaN(val) || val <= 0) { setError("Enter a valid positive price."); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("spot_price")
      .update({ price_per_kg: val, updated_at: new Date().toISOString() })
      .gte("price_per_kg", 0);
    setSaving(false);
    if (err) { setError("Failed to update spot price."); return; }
    setSpotPrice(val); setEditing(false); setNewPrice("");
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }


  const STAT_CARDS = stats ? [
    { label: "Pending Approvals",   value: stats.pendingApprovals,   color: "bg-amber-50 text-amber-600" },
    { label: "Active Contracts",    value: stats.activeContracts,    color: "bg-green-pale text-green-dark" },
    { label: "Awaiting Inspection", value: stats.awaitingInspection, color: "bg-purple-50 text-purple-600" },
    { label: "Pending Payments",    value: stats.pendingPayments,    color: "bg-blue-50 text-blue-600" },
  ] : [];

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const weekday = now.toLocaleDateString("en-PH", { weekday: "long" });
  const calendarDate = now.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

  const maxVolume = Math.max(...deliveryVolume.map(d => d.value), 1);
  const monthDiff = prevMonthKg !== null ? currentMonthKg - prevMonthKg : null;

  const NOTIF_META = {
    "Delivery Accepted":    { icon: LuTruck,    color: "bg-green-pale text-green-dark" },
    "Delivery Rejected":    { icon: LuTruck,    color: "bg-red-50 text-red-600" },
    "Contract Completed":   { icon: LuFileText, color: "bg-blue-50 text-blue-600" },
    "Contract Breached":    { icon: LuFileText, color: "bg-red-50 text-red-600" },
    "Contract Signed":      { icon: LuFileText, color: "bg-green-pale text-green-dark" },
    "Weekly Payment Ready": { icon: LuWallet,   color: "bg-amber-50 text-amber-700" },
    "Payment Released":     { icon: LuWallet,   color: "bg-green-pale text-green-dark" },
    "Supplier Approved":    { icon: LuUserPlus, color: "bg-purple-50 text-purple-600" },
  };
  const fallbackNotif = { icon: LuActivity, color: "bg-beige text-brown-mid" };

  return (
    <div className="space-y-5">
      {/* ── Header (greeting only) ── */}
      <section>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold">
            <span className="text-[#60463D]">{weekday}, </span>
            <span className="text-[#17682D]">{calendarDate}</span>
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-[#60463D] sm:text-[28px]">
            {greeting}, NERC
          </h1>
          <p className="mt-1 text-xs text-[#9A857A]">
            Here&apos;s what&apos;s moving through your trading operation today.
          </p>
        </div>
      </section>

      {/* ── Quick-action row: Create Staff (left) + Spot Price (right) ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Create Staff Account */}
        <button onClick={() => setCreateModal(true)}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-beige-dark/40 bg-white
            hover:bg-beige/60 hover:border-beige-dark transition-all text-left group shrink-0">
          <div className="w-7 h-7 bg-beige rounded-lg flex items-center justify-center shrink-0 group-hover:bg-beige-dark/40 transition-colors">
            <LuUserPlus className="w-3.5 h-3.5 text-brown-mid" />
          </div>
          <span className="text-xs font-semibold text-brown-dark">Create Staff Account</span>
        </button>

        {/* Current Spot Price */}
        <div className={`transition-[width] shrink-0 ${editing ? "w-full sm:w-auto" : ""}`}>
          <div className="flex items-center gap-3.5 rounded-2xl border-2 border-[#2E7D32] bg-[#024023] px-4 py-3 text-white shadow-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <LuTrendingUp className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/80">Current Spot Price</p>
              {editing ? (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="font-bold">₱</span>
                  <input type="number" step="0.01" min="0" autoFocus value={newPrice}
                    onChange={e => { setNewPrice(e.target.value); setError(""); }}
                    placeholder={String(spotPrice)}
                    className="w-20 rounded-lg border border-white/40 bg-white px-2 py-1 text-center text-sm font-bold text-[#3E2723] focus:outline-none focus:ring-2 focus:ring-white/60"
                  />
                  <span className="text-sm text-white/80">/kg</span>
                  <button type="button" onClick={saveSpotPrice} disabled={saving}
                    className="rounded-md p-1 text-white/85 hover:bg-white/15 hover:text-white disabled:opacity-50" aria-label="Save spot price">
                    <LuCheck className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setNewPrice(""); setError(""); }}
                    className="rounded-md p-1 text-white/70 hover:bg-white/15 hover:text-white" aria-label="Cancel">
                    <LuX className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-lg font-extrabold leading-tight">
                    {spotPrice !== null
                      ? `₱${Number(spotPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                    <span className="ml-1 text-xs font-normal text-emerald-200/80">/kg</span>
                  </p>
                  <button type="button" onClick={() => { setEditing(true); setNewPrice(String(spotPrice ?? "")); }}
                    className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                    aria-label="Update spot price" title="Update spot price">
                    <LuPencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
          {error && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-600 justify-end">
              <LuCircleAlert className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </div>
      </div>

      {/* ── Summary stat cards ── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* ── Row 3: Delivery Volume Trend (2/3) + Top Suppliers (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Delivery Volume Trend */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-pale rounded-xl flex items-center justify-center shrink-0">
                  <LuTruck className="w-4 h-4 text-green-dark" />
                </div>
                <p className="text-sm font-bold text-brown-dark">Delivery Volume Trend</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-brown-light uppercase tracking-wide">This Month</p>
                <p className="text-lg font-extrabold text-brown-dark leading-none">
                  {(currentMonthKg / 1000).toFixed(2)}
                  <span className="text-xs font-normal text-brown-light ml-0.5">t</span>
                </p>
                {monthDiff !== null && (
                  <span className={`text-[10px] font-semibold ${monthDiff >= 0 ? "text-green-dark" : "text-red-500"}`}>
                    {monthDiff >= 0 ? "▲" : "▼"} {(Math.abs(monthDiff) / 1000).toFixed(2)}t vs prev
                  </span>
                )}
              </div>
            </div>
            <AreaChart data={deliveryVolume} maxVal={maxVolume} />
          </div>
        </div>

        {/* Top Suppliers */}
        <div className="lg:col-span-1">
          <Section title="Top Suppliers" icon={LuStar} iconColor="text-amber-500" iconBg="bg-amber-50">
            {topSuppliers.length === 0 ? (
              <p className="text-xs text-brown-light py-4 text-center">No ratings yet</p>
            ) : (
              <div className="space-y-3">
                {topSuppliers.map((s, i) => {
                  const rating = Number(s.overall_supplier_rating ?? 0);
                  const pct    = (rating / 5) * 100;
                  return (
                    <div key={s.supplier_id} className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-brown-light w-4 shrink-0 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-brown-dark truncate">
                          {s.supplier?.first_name} {s.supplier?.last_name}
                        </p>
                        <ProgressBar pct={pct} color="bg-amber-400" />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span className="text-xs font-bold text-brown-dark">{rating.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* ── Row 4: Contract Progress (1/2) + Quality Overview (1/2) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Section title="Active Contract Progress" icon={LuFileText} iconColor="text-blue-600" iconBg="bg-blue-50">
          {contracts.length === 0 ? (
            <p className="text-xs text-brown-light py-4 text-center">No active contracts</p>
          ) : (
            <div className="space-y-3">
              {contracts.map(c => (
                <div key={c.contract_id}>
                  <div className="flex justify-between items-baseline mb-1">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-brown-dark">{c.contract_number}</span>
                      <span className="text-[11px] text-brown-light ml-1.5">
                        {c.supplier?.first_name} {c.supplier?.last_name}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-green-dark ml-2 shrink-0">{c.pct.toFixed(1)}%</span>
                  </div>
                  <ProgressBar pct={c.pct} color={c.pct >= 100 ? "bg-green-dark" : "bg-green-mid"} />
                  <p className="text-[11px] text-brown-light mt-0.5">
                    {(c.deliveredKg / 1000).toFixed(2)}t delivered · {(c.remainingKg / 1000).toFixed(2)}t remaining of {(c.contractedKg / 1000).toFixed(0)}t
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Quality Overview" icon={LuFlaskConical} iconColor="text-purple-600" iconBg="bg-purple-50">
          {quality ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-green-pale rounded-xl px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-green-dark">{quality.accepted}</p>
                <p className="text-[11px] text-brown-light mt-0.5">Accepted</p>
              </div>
              <div className="bg-red-50 rounded-xl px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-red-600">{quality.rejected}</p>
                <p className="text-[11px] text-brown-light mt-0.5">Rejected</p>
              </div>
              <div className="bg-purple-50 rounded-xl px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-purple-600">{quality.pending}</p>
                <p className="text-[11px] text-brown-light mt-0.5">Awaiting</p>
              </div>
              <div className="bg-beige rounded-xl px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-brown-dark">
                  {quality.avgMC ?? "—"}
                  <span className="text-sm font-normal text-brown-light">cc</span>
                </p>
                <p className="text-[11px] text-brown-light mt-0.5">Avg MC</p>
              </div>
              {quality.avgDiscount !== null && (
                <div className="col-span-2 bg-amber-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-base font-extrabold text-amber-700">
                    {quality.avgDiscount}%
                    <span className="text-xs font-normal text-brown-light ml-1">avg PCA discount</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </Section>
      </div>

      {/* ── Row 5: Payment Summary (1/2) + Recent Activity (1/2) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Section title="Payment Summary" icon={LuWallet} iconColor="text-amber-600" iconBg="bg-amber-50">
          {paymentSummary ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between bg-beige rounded-xl px-4 py-3">
                <p className="text-xs text-brown-light">Total Paid (Released)</p>
                <p className="text-sm font-extrabold text-green-dark">{peso(paymentSummary.paidTotal)}</p>
              </div>
              <div className="flex items-center justify-between bg-beige rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs text-brown-light">Pending Batches</p>
                  <p className="text-[10px] text-brown-light">{paymentSummary.pendingBatches} batch(es) awaiting release</p>
                </div>
                <p className="text-sm font-extrabold text-amber-600">{peso(paymentSummary.pendingTotal)}</p>
              </div>
              <div className="flex items-center justify-between bg-beige rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs text-brown-light">Ready to Batch</p>
                  <p className="text-[10px] text-brown-light">accepted delivery(ies) unbatched</p>
                </div>
                <p className="text-sm font-extrabold text-blue-600">{paymentSummary.readyCount}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </Section>

        <Section title="Recent Activity" icon={LuActivity} iconColor="text-indigo-600" iconBg="bg-indigo-50">
          {recentActivity.length === 0 ? (
            <p className="text-xs text-brown-light py-4 text-center">No recent activity</p>
          ) : (
            <div className="divide-y divide-beige-dark/15">
              {recentActivity.map(n => {
                const meta = NOTIF_META[n.notification_type] ?? fallbackNotif;
                const NIcon = meta.icon;
                return (
                  <div key={n.notification_id} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${meta.color.split(" ")[0]}`}>
                      <NIcon className={`w-3 h-3 ${meta.color.split(" ")[1]}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-brown-dark leading-none">{n.notification_type}</p>
                      <p className="text-[11px] text-brown-mid leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-brown-light mt-0.5">{fmtRelative(n.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Create Staff Modal */}
      {createModal && (
        <CreateStaffModal
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
