import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LuPencil, LuCheck, LuX, LuCircleAlert, LuTrendingUp,
  LuUserPlus, LuTruck, LuStar, LuBot,
  LuFileText, LuWallet, LuActivity, LuChevronDown, LuChartLine,
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
function AreaChart({ data, maxVal, showYAxis = false, height = 130 }) {
  if (!data.length) return <p className="text-xs text-brown-light py-4 text-center">No data yet</p>;

  const W = 900;
  const padL = showYAxis ? 52 : 16;
  const padR = 36;  // enough room so the last month label isn't clipped
  const padT = 14;
  const padB = 34;  // enough room below the baseline for month labels
  const H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;
  const xStep = n > 1 ? innerW / (n - 1) : innerW;

  const yFor = val => padT + innerH * (1 - (maxVal > 0 ? val / maxVal : 0));
  const xFor = i => padL + (n > 1 ? i * xStep : innerW / 2);

  const pts = data.map((d, i) => [xFor(i), yFor(d.value)]);
  const linePts = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const areaD = [
    `M ${pts[0][0]},${padT + innerH}`,
    ...pts.map(([x, y]) => `L ${x},${y}`),
    `L ${pts[pts.length - 1][0]},${padT + innerH}`, "Z",
  ].join(" ");

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => ({
    y: padT + innerH * (1 - r),
    val: maxVal * r,
  }));

  const fmtY = v => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a27" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2d5a27" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLines.map(({ y, val }, i) => (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E7DCC9" strokeWidth="1" />
            {showYAxis && (
              <text x={padL - 7} y={y + 5} textAnchor="end" fontSize="14" fill="#9A857A" fontWeight="500">
                {fmtY(val)}
              </text>
            )}
          </g>
        ))}
        {/* Baseline */}
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#C9B99A" strokeWidth="1.5" />
        <path d={areaD} fill="url(#areaGrad2)" />
        <polyline points={linePts} fill="none" stroke="#2d5a27" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="5" fill="#2d5a27" />
            {data[i].value > 0 && <circle cx={x} cy={y} r="9" fill="#2d5a27" fillOpacity="0.12" />}
            {/* Month label below baseline */}
            <text x={x} y={padT + innerH + 22} textAnchor="middle" fontSize="15" fill="#9A857A" fontWeight="500">
              {data[i].label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Tooltip-enabled chart for analytics modal ────────────────────────────────
function AnalyticsChart({ data, maxVal }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data.length) return (
    <div className="flex items-center justify-center h-80 text-xs text-brown-light">No delivery data for this period</div>
  );

  const W = 1200, H = 200;
  const padL = 52, padR = 16, padT = 16, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;
  const xStep = n > 1 ? innerW / (n - 1) : innerW;

  const yFor = val => padT + innerH * (1 - (maxVal > 0 ? val / maxVal : 0));
  const xFor = i => padL + (n > 1 ? i * xStep : innerW / 2);

  const pts = data.map((d, i) => [xFor(i), yFor(d.value)]);
  const linePts = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const areaD = [
    `M ${pts[0][0]},${padT + innerH}`,
    ...pts.map(([x, y]) => `L ${x},${y}`),
    `L ${pts[pts.length - 1][0]},${padT + innerH}`, "Z",
  ].join(" ");

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: padT + innerH * (1 - r), val: maxVal * r }));
  const fmtY = v => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;

  // Decide how many labels to show so they don't overlap
  const labelStep = n <= 12 ? 1 : n <= 30 ? Math.ceil(n / 12) : Math.ceil(n / 8);

  return (
    <div className="relative w-full select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 320 }}
        onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a27" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2d5a27" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridVals.map(({ y, val }, i) => (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E7DCC9" strokeWidth="0.6" strokeDasharray={i === 0 ? "0" : "3,3"} />
            <text x={padL - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="#9A857A">{fmtY(val)}</text>
          </g>
        ))}
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#C9B99A" strokeWidth="1" />
        <path d={areaD} fill="url(#analyticsGrad)" />
        <polyline points={linePts} fill="none" stroke="#2d5a27" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <g key={i}>
            {i % labelStep === 0 && (
              <text x={x} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#9A857A">{data[i].label}</text>
            )}
            <circle cx={x} cy={y} r="4" fill="transparent"
              onMouseEnter={() => setTooltip({ x, y, ...data[i] })} />
            {tooltip?.label === data[i].label && (
              <circle cx={x} cy={y} r="4" fill="#2d5a27" />
            )}
          </g>
        ))}
      </svg>
      {tooltip && (
        <div className="absolute pointer-events-none z-10 bg-[#1a3d17] text-white text-xs rounded-xl px-3 py-2 shadow-lg"
          style={{
            left: `${(tooltip.x / W) * 100}%`,
            top: `${(tooltip.y / H) * 100}%`,
            transform: "translate(-50%, -110%)",
          }}>
          <p className="font-bold">{tooltip.label}</p>
          <p className="opacity-80">{(tooltip.value / 1000).toFixed(2)} t</p>
          <p className="opacity-80">{Math.round(tooltip.value).toLocaleString()} kg</p>
        </div>
      )}
    </div>
  );
}

// ── Delivery Analytics Modal ─────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "3 Months", value: "3m" },
  { label: "6 Months", value: "6m" },
  { label: "Year to Date", value: "ytd" },
  { label: "Custom", value: "custom" },
];

function getDateRange(preset, customFrom, customTo) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (preset === "7d") {
    const f = new Date(); f.setDate(f.getDate() - 6);
    return { from: f.toISOString().slice(0, 10), to };
  }
  if (preset === "30d") {
    const f = new Date(); f.setDate(f.getDate() - 29);
    return { from: f.toISOString().slice(0, 10), to };
  }
  if (preset === "3m") {
    const f = new Date(); f.setMonth(f.getMonth() - 3);
    return { from: f.toISOString().slice(0, 10), to };
  }
  if (preset === "6m") {
    const f = new Date(); f.setMonth(f.getMonth() - 6);
    return { from: f.toISOString().slice(0, 10), to };
  }
  if (preset === "ytd") {
    return { from: `${now.getFullYear()}-01-01`, to };
  }
  // custom
  return { from: customFrom || `${now.getFullYear()}-01-01`, to: customTo || to };
}

function groupDeliveries(rows, grouping) {
  if (!rows.length) return [];

  const map = {};
  rows.forEach(d => {
    const date = new Date(d.delivery_date);
    let key, label;
    if (grouping === "daily") {
      key = d.delivery_date;
      label = date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    } else if (grouping === "weekly") {
      // ISO week start (Monday)
      const day = date.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      const mon = new Date(date); mon.setDate(date.getDate() + diff);
      key = mon.toISOString().slice(0, 10);
      label = mon.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    } else {
      key = d.delivery_date.slice(0, 7);
      const dt = new Date(d.delivery_date + "-01");
      label = dt.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
    }
    if (!map[key]) map[key] = { label, value: 0 };
    map[key].value += d.netKg;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

function DeliveryAnalyticsModal({ onClose }) {
  const [preset, setPreset]     = useState("6m");
  const [customFrom, setFrom]   = useState("");
  const [customTo, setTo]       = useState("");
  const [grouping, setGrouping] = useState("monthly");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [loading, setLoading]   = useState(true);
  const [rawRows, setRawRows]   = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(preset, customFrom, customTo);
    const { data } = await supabase
      .from("deliveries")
      .select(`
        delivery_date, supplier_id,
        supplier:supplier_id(first_name, last_name),
        weighing_records(net_weight_kg)
      `)
      .eq("delivery_status", "Accepted")
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .order("delivery_date", { ascending: true });

    const rows = (data ?? []).map(d => ({
      delivery_date: d.delivery_date,
      supplier_id: d.supplier_id,
      supplierName: d.supplier ? `${d.supplier.first_name} ${d.supplier.last_name}` : "Unknown",
      netKg: parseFloat(d.weighing_records?.[0]?.net_weight_kg ?? 0),
    }));

    // Build supplier list for filter dropdown
    const suppMap = {};
    rows.forEach(r => { if (r.supplier_id) suppMap[r.supplier_id] = r.supplierName; });
    setSuppliers(Object.entries(suppMap).map(([id, name]) => ({ id, name })));
    setRawRows(rows);
    setLoading(false);
  }, [preset, customFrom, customTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-select grouping based on range
  useEffect(() => {
    if (preset === "7d" || preset === "30d") setGrouping("daily");
    else if (preset === "3m") setGrouping("weekly");
    else setGrouping("monthly");
  }, [preset]);

  const filtered = supplierFilter === "all"
    ? rawRows
    : rawRows.filter(r => r.supplier_id === supplierFilter);

  const chartData = groupDeliveries(filtered, grouping);
  const maxVal = Math.max(...chartData.map(d => d.value), 1);
  const totalKg = filtered.reduce((s, r) => s + r.netKg, 0);
  const avgKg = chartData.length ? totalKg / chartData.length : 0;
  const highestPeriod = chartData.reduce((best, d) => d.value > (best?.value ?? 0) ? d : best, null);

  // Compare vs previous period
  const { from: currFrom, to: currTo } = getDateRange(preset, customFrom, customTo);
  const periodDays = Math.round((new Date(currTo) - new Date(currFrom)) / 86400000) + 1;
  const prevFromDate = new Date(currFrom); prevFromDate.setDate(prevFromDate.getDate() - periodDays);
  const prevToDate = new Date(currFrom); prevToDate.setDate(prevToDate.getDate() - 1);
  const prevRows = rawRows.filter(r => {
    const d = r.delivery_date;
    return d >= prevFromDate.toISOString().slice(0, 10) && d <= prevToDate.toISOString().slice(0, 10);
  });
  const prevTotal = prevRows.reduce((s, r) => s + r.netKg, 0);
  const changePct = prevTotal > 0 ? ((totalKg - prevTotal) / prevTotal) * 100 : null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-card w-full max-w-7xl min-h-[90vh] max-h-[95vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-beige-dark/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
              <LuChartLine className="w-5 h-5 text-green-dark" />
            </div>
            <div>
              <p className="text-base font-bold text-brown-dark">Delivery Analytics</p>
              <p className="text-xs text-brown-light">Accepted deliveries — net weight</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-7 py-6 space-y-5">
          {/* Filters row */}
          <div className="flex flex-wrap gap-2 items-end">
            {/* Date preset pills */}
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map(p => (
                <button key={p.value} onClick={() => setPreset(p.value)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    preset === p.value
                      ? "bg-green-dark text-white"
                      : "bg-beige text-brown-mid hover:bg-beige-dark/60"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Grouping */}
            <div className="relative">
              <select value={grouping} onChange={e => setGrouping(e.target.value)}
                className="text-sm font-semibold text-brown-dark bg-beige rounded-xl px-3.5 py-2 pr-8 appearance-none focus:outline-none cursor-pointer">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <LuChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brown-light pointer-events-none" />
            </div>

            {/* Supplier filter */}
            {suppliers.length > 1 && (
              <div className="relative">
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}
                  className="text-sm font-semibold text-brown-dark bg-beige rounded-xl px-3.5 py-2 pr-8 appearance-none focus:outline-none cursor-pointer max-w-[200px]">
                  <option value="all">All Suppliers</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <LuChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brown-light pointer-events-none" />
              </div>
            )}
          </div>

          {/* Custom date range */}
          {preset === "custom" && (
            <div className="flex gap-3 items-center flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-brown-light font-medium">From</label>
                <input type="date" value={customFrom} onChange={e => setFrom(e.target.value)}
                  className="text-sm border border-beige-dark rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-dark/30" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-brown-light font-medium">To</label>
                <input type="date" value={customTo} onChange={e => setTo(e.target.value)}
                  className="text-sm border border-beige-dark rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-dark/30" />
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-beige rounded-2xl px-4 py-4">
                  <p className="text-xs text-brown-light uppercase tracking-wide mb-1.5">Total Volume</p>
                  <p className="text-xl font-extrabold text-brown-dark leading-none">{(totalKg / 1000).toFixed(2)}<span className="text-sm font-normal text-brown-light ml-1">t</span></p>
                  <p className="text-xs text-brown-light mt-1">{Math.round(totalKg).toLocaleString()} kg</p>
                </div>
                <div className="bg-beige rounded-2xl px-4 py-4">
                  <p className="text-xs text-brown-light uppercase tracking-wide mb-1.5">Avg / {grouping === "daily" ? "Day" : grouping === "weekly" ? "Week" : "Month"}</p>
                  <p className="text-xl font-extrabold text-brown-dark leading-none">{(avgKg / 1000).toFixed(2)}<span className="text-sm font-normal text-brown-light ml-1">t</span></p>
                  <p className="text-xs text-brown-light mt-1">{Math.round(avgKg).toLocaleString()} kg</p>
                </div>
                <div className="bg-beige rounded-2xl px-4 py-4">
                  <p className="text-xs text-brown-light uppercase tracking-wide mb-1.5">Highest Period</p>
                  {highestPeriod ? (
                    <>
                      <p className="text-xl font-extrabold text-brown-dark leading-none">{(highestPeriod.value / 1000).toFixed(2)}<span className="text-sm font-normal text-brown-light ml-1">t</span></p>
                      <p className="text-xs text-brown-light mt-1">{highestPeriod.label}</p>
                    </>
                  ) : <p className="text-sm text-brown-light">—</p>}
                </div>
                <div className="bg-beige rounded-2xl px-4 py-4">
                  <p className="text-xs text-brown-light uppercase tracking-wide mb-1.5">vs Prev Period</p>
                  {changePct !== null ? (
                    <>
                      <p className={`text-xl font-extrabold leading-none ${changePct >= 0 ? "text-green-dark" : "text-red-500"}`}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
                      </p>
                      <p className="text-xs text-brown-light mt-1">{changePct >= 0 ? "increase" : "decrease"}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-extrabold text-brown-light leading-none">—</p>
                      <p className="text-xs text-brown-light mt-1">no prior data</p>
                    </>
                  )}
                </div>
              </div>

              {/* Chart */}
              <div className="bg-beige/50 rounded-2xl p-5">
                <AnalyticsChart data={chartData} maxVal={maxVal} />
              </div>

              {/* No data state */}
              {chartData.length === 0 && (
                <p className="text-sm text-brown-light text-center py-4">No accepted deliveries found for this period.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  , document.body);
}

// ── All Rankings Modal ───────────────────────────────────────────────────────
function AllRankingsModal({ suppliers, onClose }) {
  const stars = n => {
    const full = Math.floor(n);
    const half = n - full >= 0.5 ? 1 : 0;
    return { full, half, empty: 5 - full - half };
  };
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-card w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-beige-dark/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <LuStar className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-brown-dark">Supplier Rankings</p>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-2">
          {suppliers.length === 0 ? (
            <p className="text-xs text-brown-light py-8 text-center">No supplier ratings yet</p>
          ) : suppliers.map((s, i) => {
            const rating = Number(s.overall_supplier_rating ?? 0);
            const isTop = i === 0;
            const { full, half, empty } = stars(rating);
            return (
              <div key={s.supplier_id}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${
                  isTop ? "bg-amber-50 border border-amber-200/60" : "bg-beige/60"
                }`}>
                {/* Rank badge */}
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-xs ${
                  i === 0 ? "bg-amber-400 text-white"
                  : i === 1 ? "bg-gray-300 text-gray-700"
                  : i === 2 ? "bg-amber-700/60 text-white"
                  : "bg-beige-dark text-brown-light"
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${isTop ? "text-amber-800" : "text-brown-dark"} truncate`}>
                    {s.supplier?.first_name} {s.supplier?.last_name}
                  </p>
                  {/* Star icons */}
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {Array.from({ length: full }).map((_, j) => (
                      <LuStar key={`f${j}`} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                    {half === 1 && <LuStar className="w-3 h-3 text-amber-400 opacity-60" />}
                    {Array.from({ length: empty }).map((_, j) => (
                      <LuStar key={`e${j}`} className="w-3 h-3 text-beige-dark" />
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-base font-extrabold ${isTop ? "text-amber-700" : "text-brown-dark"}`}>
                    {rating.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-brown-light">/ 5.00</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  , document.body);
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
  const [aiAutoGlobal, setAiAutoGlobal] = useState(false);
  const [aiSaving, setAiSaving]     = useState(false);
  const [aiFaqGlobal, setAiFaqGlobal] = useState(false);
  const [aiFaqSaving, setAiFaqSaving] = useState(false);

  // ── analytics state ─────────────────────────────────────────────────────
  const [deliveryVolume, setDeliveryVolume] = useState([]);   // [{label, value, tooltip}] last 6 months
  const [currentMonthKg, setCurrentMonthKg] = useState(0);
  const [prevMonthKg, setPrevMonthKg]       = useState(null);
  const [contracts, setContracts]           = useState([]);   // active contracts with progress
  const [paymentSummary, setPaymentSummary] = useState(null); // {readyAmount, readyCount, paidAmount, pendingBatches}
  const [topSuppliers, setTopSuppliers]     = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [showAnalytics, setShowAnalytics]   = useState(false);
  const [showRankings, setShowRankings]     = useState(false);

  useEffect(() => {
    async function loadAll() {
      // ── summary stats (existing) ─────────────────────────────────────
      const [spotRes, pendingRes, contractRes, deliveryRes, payRes, aiRes, faqRes] = await Promise.all([
        supabase.from("spot_price").select("price_per_kg").limit(1).single(),
        supabase.from("users").select("user_id", { count: "exact", head: true }).eq("account_status", "Pending"),
        supabase.from("contracts").select("contract_id", { count: "exact", head: true }).eq("status", "Active"),
        supabase.from("deliveries").select("delivery_id", { count: "exact", head: true }).eq("delivery_status", "Weighed"),
        supabase.from("payments").select("payment_id", { count: "exact", head: true }).eq("payment_status", "Pending"),
        supabase.from("app_config").select("value").eq("key", "ai_auto_negotiate_global").maybeSingle(),
        supabase.from("app_config").select("value").eq("key", "ai_faq_global").maybeSingle(),
      ]);
      setSpotPrice(spotRes.data?.price_per_kg ?? 0);
      setAiAutoGlobal(aiRes.data?.value === "true");
      setAiFaqGlobal(faqRes.data?.value === "true");
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

      // ── 3. Payment summary ───────────────────────────────────────────
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
        // Keep latest snapshot per supplier (deduplicated)
        const seen = new Set();
        const deduped = [];
        for (const s of snapshots) {
          if (!seen.has(s.supplier_id)) {
            seen.add(s.supplier_id);
            deduped.push(s);
          }
        }
        setTopSuppliers(deduped); // store all for rankings modal; card shows top 4
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

  async function toggleAiAutoGlobal() {
    setAiSaving(true);
    const next = !aiAutoGlobal;
    setAiAutoGlobal(next);
    await supabase.from("app_config")
      .upsert({ key: "ai_auto_negotiate_global", value: String(next) }, { onConflict: "key" });
    setAiSaving(false);
    showToast(next ? "AI Auto-Negotiate enabled for all suppliers." : "AI Auto-Negotiate disabled.");
  }

  async function toggleAiFaqGlobal() {
    setAiFaqSaving(true);
    const next = !aiFaqGlobal;
    setAiFaqGlobal(next);
    await supabase.from("app_config")
      .upsert({ key: "ai_faq_global", value: String(next) }, { onConflict: "key" });
    setAiFaqSaving(false);
    showToast(next ? "AI FAQ Assistant enabled." : "AI FAQ Assistant disabled.");
  }


  const STAT_CARDS = stats ? [
    { label: "Pending Approvals",   value: stats.pendingApprovals,   color: "bg-amber-50 text-amber-600" },
    { label: "Active Contracts",    value: stats.activeContracts,    color: "bg-green-pale text-green-dark" },
    { label: "Total Amount Paid",   value: paymentSummary
        ? "₱" + Number(paymentSummary.paidTotal ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—",
      color: "bg-purple-50 text-purple-700", small: true },
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
    <div className="space-y-5 pt-6">
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

      {/* ── Quick-action row: Create Staff (left) + AI Toggle + Spot Price (right) ── */}
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

        <div className="flex items-center gap-3 flex-wrap">
          {/* AI Auto-Negotiate toggle */}
          <div className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm transition-colors duration-200 ${
            aiAutoGlobal ? "border-[#2E7D32] bg-[#024023]" : "border-[#c5b9a8] bg-[#f5f0e8]"
          }`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${aiAutoGlobal ? "bg-white/10" : "bg-[#e0d9cc]"}`}>
              <LuBot className={`h-4 w-4 ${aiAutoGlobal ? "text-emerald-300" : "text-brown-mid"}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-[9px] font-medium uppercase tracking-wider ${aiAutoGlobal ? "text-white/80" : "text-brown-light"}`}>AI Auto-Negotiate</p>
              <p className={`text-[11px] font-semibold mt-0.5 ${aiAutoGlobal ? "text-emerald-200" : "text-brown-mid"}`}>
                {aiAutoGlobal ? "Active" : "Off"}
              </p>
            </div>
            <button
              onClick={toggleAiAutoGlobal}
              disabled={aiSaving}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                aiAutoGlobal ? "bg-emerald-400" : "bg-[#c5b9a8]"
              }`}
              title={aiAutoGlobal ? "Disable AI auto-negotiate" : "Enable AI auto-negotiate"}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${aiAutoGlobal ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* AI FAQ Assistant toggle */}
          <div className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm transition-colors duration-200 ${
            aiFaqGlobal ? "border-[#2E7D32] bg-[#024023]" : "border-[#c5b9a8] bg-[#f5f0e8]"
          }`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${aiFaqGlobal ? "bg-white/10" : "bg-[#e0d9cc]"}`}>
              <LuBot className={`h-4 w-4 ${aiFaqGlobal ? "text-emerald-300" : "text-brown-mid"}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-[9px] font-medium uppercase tracking-wider ${aiFaqGlobal ? "text-white/80" : "text-brown-light"}`}>AI FAQ Assistant</p>
              <p className={`text-[11px] font-semibold mt-0.5 ${aiFaqGlobal ? "text-emerald-200" : "text-brown-mid"}`}>
                {aiFaqGlobal ? "Active" : "Off"}
              </p>
            </div>
            <button
              onClick={toggleAiFaqGlobal}
              disabled={aiFaqSaving}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                aiFaqGlobal ? "bg-emerald-400" : "bg-[#c5b9a8]"
              }`}
              title={aiFaqGlobal ? "Disable AI FAQ assistant" : "Enable AI FAQ assistant"}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${aiFaqGlobal ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
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
        </div>{/* end right-side flex group */}
      </div>

      {/* ── Summary stat cards ── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STAT_CARDS.map(s => (
            <div key={s.label} className="bg-white rounded-xl shadow-card border border-beige-dark/20 px-4 py-3 flex items-center gap-3">
              <div className={`inline-flex items-center justify-center shrink-0 rounded-lg px-2 py-1.5 ${s.small ? "min-w-8" : "w-8 h-8"} ${s.color.split(" ")[0]}`}>
                <span className={`font-extrabold ${s.small ? "text-xs leading-tight" : "text-base"} ${s.color.split(" ")[1]}`}>{s.value}</span>
              </div>
              <p className="text-brown-light text-xs font-medium leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Row 3: Delivery Volume Trend (2/3) + Top Suppliers (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Delivery Volume Trend */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5 flex-1">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-pale rounded-xl flex items-center justify-center shrink-0">
                  <LuTruck className="w-4 h-4 text-green-dark" />
                </div>
                <div>
                  <p className="text-sm font-bold text-brown-dark">Delivery Volume Trend</p>
                  <p className="text-[10px] text-brown-light">Last 6 months · accepted net weight</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
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
                <button onClick={() => setShowAnalytics(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-pale text-green-dark text-xs font-semibold hover:bg-green-mid/20 transition-all">
                  <LuChartLine className="w-3.5 h-3.5" /> View Analytics
                </button>
              </div>
            </div>
            <AreaChart data={deliveryVolume} maxVal={maxVolume} showYAxis height={240} />
          </div>
        </div>

        {/* Top Suppliers */}
        <div className="lg:col-span-1 flex flex-col">
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5 flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <LuStar className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-sm font-bold text-brown-dark">Top Suppliers</p>
            </div>
            {/* Content — flex-1 so it fills space */}
            <div className="flex-1">
              {topSuppliers.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[80px]">
                  <p className="text-xs text-brown-light text-center">No ratings yet</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topSuppliers.slice(0, 4).map((s, i) => {
                    const rating = Number(s.overall_supplier_rating ?? 0);
                    const pct    = (rating / 5) * 100;
                    const isFirst = i === 0;
                    return (
                      <div key={s.supplier_id}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${isFirst ? "bg-amber-50 border border-amber-200/50" : ""}`}>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-extrabold ${
                          i === 0 ? "bg-amber-400 text-white"
                          : i === 1 ? "bg-gray-200 text-gray-600"
                          : i === 2 ? "bg-amber-700/50 text-white"
                          : "text-brown-light"
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${isFirst ? "text-amber-800" : "text-brown-dark"}`}>
                            {s.supplier?.first_name} {s.supplier?.last_name}
                          </p>
                          <ProgressBar pct={pct} color={isFirst ? "bg-amber-400" : "bg-amber-300"} />
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className={`text-xs font-bold ${isFirst ? "text-amber-700" : "text-brown-dark"}`}>{rating.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* View All Rankings — anchored to bottom */}
            <div className="mt-4 pt-3 border-t border-beige-dark/20">
              <button onClick={() => setShowRankings(true)}
                className="w-full py-2 rounded-xl text-xs font-semibold text-brown-mid hover:text-green-dark hover:bg-green-pale/60 transition-all">
                View All Rankings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 4: Contract Progress ── */}
      <div>
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

      {/* Delivery Analytics Modal */}
      {showAnalytics && <DeliveryAnalyticsModal onClose={() => setShowAnalytics(false)} />}

      {/* All Rankings Modal */}
      {showRankings && <AllRankingsModal suppliers={topSuppliers} onClose={() => setShowRankings(false)} />}

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
