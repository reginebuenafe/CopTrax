import { useEffect, useState } from "react";
import { LuStar, LuTrendingUp, LuCheck, LuX } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function StarDisplay({ rating, size = "md" }) {
  const stars = Math.round(rating ?? 0);
  const sz = size === "lg" ? "w-7 h-7" : "w-4.5 h-4.5";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <LuStar key={i} className={`${sz} ${i <= stars ? "text-amber-400 fill-amber-400" : "text-beige-dark"}`} />
      ))}
    </div>
  );
}

function ScoreBar({ label, value, weight }) {
  const pct = Number(value ?? 0);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-brown-mid font-medium">{label} <span className="text-brown-light">({weight})</span></span>
        <span className={`font-bold ${pct >= 80 ? "text-green-dark" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-beige-dark/30 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${pct >= 80 ? "bg-green-mid" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MyRatingPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMyRating() {
      const { data } = await supabase
        .from("supplier_performance_snapshot")
        .select(`
          snapshot_id, snapshot_date, performance_score, supplier_rating,
          overall_supplier_rating, contract_fulfillment_score,
          delivered_volume_score, copra_quality_score,
          contract:contract_id(
            contract_number, status, due_date,
            negotiated_price_per_kg
          )
        `)
        .eq("supplier_id", user.id)
        .order("snapshot_date", { ascending: false });

      setSnapshots(data ?? []);
      setLoading(false);
    }
    fetchMyRating();
  }, [user.id]);

  const overall = snapshots[0]?.overall_supplier_rating ?? null;

  return (
    <div>
      <div className="flex items-center gap-3 mt-5 mb-6">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <LuStar className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">My Rating</h1>
          <p className="text-brown-light text-sm">Performance across your completed and breached contracts</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuStar className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No rating yet</p>
          <p className="text-brown-light text-sm mt-1 max-w-xs">Your rating will appear here once a contract is marked Completed or Breached.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overall rating card */}
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
            <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-4">Overall Supplier Rating</p>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-5xl font-extrabold text-amber-500 leading-none">{Number(overall).toFixed(1)}</p>
                <p className="text-brown-light text-xs mt-1">out of 5.0</p>
              </div>
              <div>
                <StarDisplay rating={overall} size="lg" />
                <p className="text-brown-light text-sm mt-2">{snapshots.length} contract{snapshots.length !== 1 ? "s" : ""} rated</p>
              </div>
            </div>
            <p className="text-xs text-brown-light mt-4 bg-beige rounded-xl px-3 py-2">
              Your overall rating is the average across all your completed and breached contracts. It updates automatically when a contract is finalized.
            </p>
          </div>

          {/* Per-contract breakdown */}
          <div>
            <p className="text-sm font-bold text-brown-dark mb-3">Per-Contract Breakdown</p>
            <div className="space-y-4">
              {snapshots.map(snap => (
                <div key={snap.snapshot_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="font-bold text-brown-dark">{snap.contract?.contract_number ?? "—"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          snap.contract?.status === "Completed"
                            ? "bg-green-pale text-green-dark"
                            : "bg-red-50 text-red-600"
                        }`}>
                          {snap.contract?.status === "Completed"
                            ? <LuCheck className="w-3 h-3" />
                            : <LuX className="w-3 h-3" />
                          }
                          {snap.contract?.status ?? "—"}
                        </span>
                        <span className="text-brown-light text-xs">
                          {snap.snapshot_date ? new Date(snap.snapshot_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : ""}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <StarDisplay rating={snap.supplier_rating} />
                      <p className="text-xs text-brown-light mt-1">{snap.supplier_rating}/5 stars</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <ScoreBar label="Contract Fulfillment" value={snap.contract_fulfillment_score} weight="60%" />
                    <ScoreBar label="Delivered Volume" value={snap.delivered_volume_score} weight="20%" />
                    <ScoreBar label="Copra Quality (Moisture)" value={snap.copra_quality_score} weight="20%" />
                  </div>

                  <div className="mt-4 pt-3 border-t border-beige-dark/20 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-brown-light">
                      <LuTrendingUp className="w-3.5 h-3.5" />
                      Performance Score
                    </div>
                    <span className={`text-sm font-extrabold px-2.5 py-1 rounded-full ${
                      Number(snap.performance_score) >= 70 ? "bg-green-pale text-green-dark" :
                      Number(snap.performance_score) >= 50 ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-600"
                    }`}>
                      {Number(snap.performance_score ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
