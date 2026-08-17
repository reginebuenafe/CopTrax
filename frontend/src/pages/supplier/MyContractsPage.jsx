import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuFileText, LuMessageSquare, LuCalendar, LuArrowRight,
  LuCircleCheck, LuCircleAlert, LuClock, LuBanknote, LuTruck,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_META = {
  Pending:   { label: "Pending",   color: "bg-beige text-brown-mid",        dot: "bg-brown-light" },
  Active:    { label: "Active",    color: "bg-green-pale text-green-dark",   dot: "bg-green-mid" },
  Completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700",  dot: "bg-emerald-500" },
  Breached:  { label: "Breached",  color: "bg-red-50 text-red-600",          dot: "bg-red-500" },
};

const FILTERS = ["All", "Pending", "Active", "Completed", "Breached"];

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function daysLeft(due) {
  if (!due) return null;
  return Math.ceil((new Date(due) - new Date()) / (1000 * 60 * 60 * 24));
}

export default function MyContractsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  const fetchContracts = useCallback(async () => {
    const { data } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, status, created_at,
        conversations(conversation_id),
        deliveries(delivery_id, delivery_status)
      `)
      .eq("supplier_id", user.id)
      .order("created_at", { ascending: false });
    setContracts(data ?? []);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  // Realtime: re-fetch when any of this supplier's contracts change status
  useEffect(() => {
    const channel = supabase
      .channel(`supplier-contracts:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" },
        () => fetchContracts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contracts" },
        () => fetchContracts())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id, fetchContracts]);

  const filtered = filter === "All" ? contracts : contracts.filter(c => c.status === filter);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <LuFileText className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">My Contracts</h1>
          <p className="text-brown-light text-sm">All negotiated contracts with NERC Copra Trading</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-beige rounded-xl p-1 mb-6 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap
              ${filter === f ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-mid"}`}>
            {f}
            {f === "All" && contracts.length > 0 && (
              <span className="ml-1 opacity-60">({contracts.length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
            <LuFileText className="w-7 h-7 text-brown-light" />
          </div>
          <p className="text-brown-dark font-semibold">No contracts {filter !== "All" ? `with status "${filter}"` : "yet"}</p>
          <p className="text-brown-light text-sm mt-1">
            {filter === "All" ? "Start a negotiation to get your first contract." : "Try a different filter."}
          </p>
          {filter === "All" && (
            <button onClick={() => navigate("/dashboard/supplier/conversations")}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all">
              <LuMessageSquare className="w-4 h-4" /> Start a Negotiation
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.Pending;
            const days = daysLeft(c.due_date);
            const deliveredCount = c.deliveries?.filter(d => d.delivery_status === "Accepted").length ?? 0;
            const totalDeliveries = c.deliveries?.length ?? 0;
            const conversationId = c.conversations?.[0]?.conversation_id;

            return (
              <div key={c.contract_id} className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-brown-dark">{c.contract_number}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-brown-light text-xs">Created {fmtDate(c.created_at)}</p>
                  </div>
                  {conversationId && (
                    <button
                      onClick={() => navigate(`/dashboard/supplier/conversations/${conversationId}`)}
                      className="flex items-center gap-1.5 text-xs text-green-dark font-semibold hover:underline shrink-0"
                    >
                      <LuMessageSquare className="w-3.5 h-3.5" /> View Chat
                    </button>
                  )}
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Detail label="Price / kg" value={peso(c.negotiated_price_per_kg)} />
                  <Detail label="Volume" value={`${Number(c.contracted_tons).toLocaleString()} tons`} />
                  <Detail label="Signing Date" value={fmtDate(c.signing_date)} />
                  <Detail label="Due Date">
                    <div>
                      <p className="font-semibold text-brown-dark text-sm">{fmtDate(c.due_date)}</p>
                      {days !== null && c.status === "Active" && (
                        <p className={`text-xs font-medium mt-0.5 ${days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-brown-light"}`}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                        </p>
                      )}
                    </div>
                  </Detail>
                </div>

                {/* Delivery progress */}
                {totalDeliveries > 0 && (
                  <div className="bg-beige rounded-xl px-4 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-brown-mid">
                      <LuTruck className="w-4 h-4" />
                      <span>{deliveredCount} of {totalDeliveries} deliveries accepted</span>
                    </div>
                    <button onClick={() => navigate("/dashboard/supplier/deliveries")}
                      className="text-xs text-green-dark font-semibold flex items-center gap-1 hover:underline">
                      View <LuArrowRight className="w-3 h-3" />
                    </button>
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

function Detail({ label, value, children }) {
  return (
    <div>
      <p className="text-brown-light text-xs mb-0.5">{label}</p>
      {children ?? <p className="font-semibold text-brown-dark text-sm">{value}</p>}
    </div>
  );
}
