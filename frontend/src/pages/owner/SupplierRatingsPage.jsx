import { useEffect, useState } from "react";
import { LuStar, LuChevronDown, LuChevronUp, LuTrendingUp } from "react-icons/lu";
import { supabase } from "../../lib/supabase";

function StarRating({ rating, size = "sm" }) {
  const stars = Math.round(rating ?? 0);
  return (
    <div className={`flex items-center gap-0.5 ${size === "lg" ? "gap-1" : ""}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <LuStar
          key={i}
          className={`${size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5"} ${i <= stars ? "text-amber-400 fill-amber-400" : "text-beige-dark"}`}
        />
      ))}
    </div>
  );
}

function ratingColor(r) {
  if (r >= 4.5) return "text-green-dark bg-green-pale";
  if (r >= 3.5) return "text-blue-600 bg-blue-50";
  if (r >= 2.5) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

export default function SupplierRatingsPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    async function fetchRatings() {
      // Get all performance snapshots grouped by supplier
      const { data } = await supabase
        .from("supplier_performance_snapshot")
        .select(`
          snapshot_id, snapshot_date, performance_score, supplier_rating,
          overall_supplier_rating, contract_fulfillment_score,
          delivered_volume_score, copra_quality_score,
          supplier:supplier_id(user_id, first_name, last_name, email),
          contract:contract_id(contract_number, status, due_date)
        `)
        .order("snapshot_date", { ascending: false });

      if (!data) { setLoading(false); return; }

      // Group by supplier, deduplicate snapshots by contract_id (keep latest per contract)
      const grouped = data.reduce((acc, snap) => {
        const sid = snap.supplier?.user_id;
        if (!sid) return acc;
        if (!acc[sid]) {
          acc[sid] = {
            supplier: snap.supplier,
            overall: snap.overall_supplier_rating,
            snapshots: {},
          };
        }
        // Always keep the latest overall rating
        if (new Date(snap.snapshot_date) >= new Date(Object.values(acc[sid].snapshots)[0]?.snapshot_date ?? "2000-01-01")) {
          acc[sid].overall = snap.overall_supplier_rating;
        }
        // Keep only the latest snapshot per contract_id
        const cid = snap.contract?.contract_number ?? snap.snapshot_id;
        if (!acc[sid].snapshots[cid] || new Date(snap.snapshot_date) > new Date(acc[sid].snapshots[cid].snapshot_date)) {
          acc[sid].snapshots[cid] = snap;
        }
        return acc;
      }, {});

      // Convert snapshot map back to array
      const sorted = Object.values(grouped)
        .map(s => ({ ...s, snapshots: Object.values(s.snapshots) }))
        .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
      setSuppliers(sorted);
      setLoading(false);
    }
    fetchRatings();
  }, []);

  return (
    <div className="pt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <LuStar className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Supplier Ratings</h1>
          <p className="text-brown-light text-sm">Performance rankings across all completed/breached contracts</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuStar className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No ratings yet</p>
          <p className="text-brown-light text-sm mt-1">Ratings are computed when a contract is marked Completed or Breached.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s, idx) => {
            const isOpen = expanded === s.supplier.user_id;
            const overall = Number(s.overall ?? 0);
            return (
              <div key={s.supplier.user_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : s.supplier.user_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/20 transition-colors text-left"
                >
                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 ${
                    idx === 0 ? "bg-amber-100 text-amber-600" :
                    idx === 1 ? "bg-gray-100 text-gray-500" :
                    idx === 2 ? "bg-orange-100 text-orange-500" : "bg-beige text-brown-light"
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {s.supplier.first_name?.[0]}{s.supplier.last_name?.[0]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brown-dark">{s.supplier.first_name} {s.supplier.last_name}</p>
                    <p className="text-brown-light text-xs">{s.snapshots.length} contract{s.snapshots.length !== 1 ? "s" : ""} rated</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <StarRating rating={overall} />
                      <p className="text-xs text-brown-light mt-0.5">{overall.toFixed(2)} / 5.00</p>
                    </div>
                    <span className={`text-sm font-extrabold px-2.5 py-1 rounded-full ${ratingColor(overall)}`}>
                      {overall.toFixed(1)}
                    </span>
                    {isOpen ? <LuChevronUp className="w-4 h-4 text-brown-light" /> : <LuChevronDown className="w-4 h-4 text-brown-light" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-beige-dark/20 px-5 py-4">
                    <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-3">Per-Contract Breakdown</p>
                    <div className="space-y-3">
                      {s.snapshots.map(snap => (
                        <div key={snap.snapshot_id} className="bg-beige rounded-xl p-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <p className="font-semibold text-brown-dark text-sm">{snap.contract?.contract_number ?? "—"}</p>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                snap.contract?.status === "Completed" ? "bg-green-pale text-green-dark" : "bg-red-50 text-red-600"
                              }`}>
                                {snap.contract?.status ?? "—"}
                              </span>
                            </div>
                            <div className="text-right">
                              <StarRating rating={snap.supplier_rating} size="lg" />
                              <p className="text-xs text-brown-light mt-0.5">Rating: {snap.supplier_rating}/5</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <ScoreBar label="Fulfillment" value={snap.contract_fulfillment_score} weight="60%" />
                            <ScoreBar label="Volume" value={snap.delivered_volume_score} weight="20%" />
                            <ScoreBar label="Quality" value={snap.copra_quality_score} weight="20%" />
                          </div>
                          <div className="mt-2 pt-2 border-t border-beige-dark/30 flex justify-between text-xs">
                            <span className="text-brown-light">Performance score</span>
                            <span className="font-bold text-brown-dark">{Number(snap.performance_score ?? 0).toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, weight }) {
  const pct = Number(value ?? 0);
  return (
    <div className="bg-white rounded-lg px-2.5 py-2">
      <div className="flex justify-between mb-1">
        <span className="text-brown-light font-medium">{label}</span>
        <span className="text-brown-light opacity-70">{weight}</span>
      </div>
      <div className="w-full bg-beige-dark/30 rounded-full h-1.5 mb-1">
        <div
          className={`h-1.5 rounded-full transition-all ${pct >= 80 ? "bg-green-mid" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-bold ${pct >= 80 ? "text-green-dark" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>{pct.toFixed(0)}%</span>
    </div>
  );
}
