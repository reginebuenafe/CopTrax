import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuFileText, LuMessageSquare, LuCalendar, LuArrowRight,
  LuCircleCheck, LuCircleAlert, LuClock, LuBanknote, LuTruck,
  LuExternalLink,
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
    setLoading(true);

    // 1. Fetch contracts belonging to this Supplier
    const { data: contractData, error: contractErr } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, status, created_at,
        contract_hash, contract_document_url, activation_date
      `)
      .eq("supplier_id", user.id)
      .order("created_at", { ascending: false });

    if (contractErr || !contractData || contractData.length === 0) {
      setContracts(contractData ?? []);
      setLoading(false);
      return;
    }

    const ids = contractData.map(c => c.contract_id);

    // 2. Fetch delivered weight from delivery_allocations (Accepted deliveries only)
    const { data: allocData } = await supabase
      .from("delivery_allocations")
      .select("contract_id, allocated_weight_kg, delivery:delivery_id(delivery_status)")
      .in("contract_id", ids);

    const acceptedKgMap = {};
    for (const alloc of (allocData ?? [])) {
      if (alloc.delivery?.delivery_status === "Accepted") {
        acceptedKgMap[alloc.contract_id] =
          (acceptedKgMap[alloc.contract_id] ?? 0) + Number(alloc.allocated_weight_kg ?? 0);
      }
    }

    // 3. Fetch conversation IDs linked to these contracts
    const { data: convData } = await supabase
      .from("conversations")
      .select("conversation_id, contract_id")
      .in("contract_id", ids);

    const convMap = {};
    for (const cv of (convData ?? [])) {
      if (cv.contract_id) convMap[cv.contract_id] = cv.conversation_id;
    }

    setContracts(contractData.map(c => ({
      ...c,
      delivered_kg: acceptedKgMap[c.contract_id] ?? 0,
      conversation_id: convMap[c.contract_id] ?? null,
    })));
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  // Realtime: re-fetch when any of this supplier's contracts change
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
            const contractedKg = Number(c.contracted_tons ?? 0) * 1000;
            const deliveredKg = c.delivered_kg ?? 0;
            const remainingKg = Math.max(0, contractedKg - deliveredKg);
            const fulfillment = contractedKg > 0 ? Math.min(100, (deliveredKg / contractedKg) * 100) : 0;

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
                  <div className="flex items-center gap-2 shrink-0">
                    {c.contract_document_url && (
                      <button
                        onClick={async () => {
                          const { data } = await supabase.storage.from("contracts").createSignedUrl(c.contract_document_url, 60 * 15);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                        }}
                        className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline"
                      >
                        <LuExternalLink className="w-3.5 h-3.5" /> View Contract
                      </button>
                    )}
                    {c.conversation_id && (
                      <button
                        onClick={() => navigate(`/dashboard/supplier/conversations/${c.conversation_id}`)}
                        className="flex items-center gap-1.5 text-xs text-green-dark font-semibold hover:underline"
                      >
                        <LuMessageSquare className="w-3.5 h-3.5" /> View Chat
                      </button>
                    )}
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Detail label="Agreed Price" value={peso(c.negotiated_price_per_kg) + "/kg"} />
                  <Detail label="Agreed Quantity" value={`${Number(c.contracted_tons).toLocaleString()} tons`} />
                  <Detail label="Activation Date" value={fmtDate(c.activation_date)} />
                  <Detail label="Delivery Deadline">
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

                {/* Delivery + fulfillment row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Detail label="Delivered Qty" value={`${(deliveredKg / 1000).toFixed(3)} tons`} />
                  <Detail label="Remaining Qty" value={`${(remainingKg / 1000).toFixed(3)} tons`} />
                  <div className="col-span-2">
                    <p className="text-brown-light text-xs mb-1">Fulfillment</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2.5 bg-beige rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            fulfillment >= 100 ? "bg-emerald-500" : fulfillment > 50 ? "bg-green-mid" : "bg-amber-400"
                          }`}
                          style={{ width: `${Math.min(100, fulfillment)}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-brown-dark whitespace-nowrap">
                        {fulfillment.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
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
