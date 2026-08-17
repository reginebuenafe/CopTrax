import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuMessageSquare, LuPlus, LuClock } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function SupplierConversationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select(`
        conversation_id, status, created_at,
        messages(message_text, sent_at, sender_id)
      `)
      .eq("supplier_id", user.id)
      .order("created_at", { ascending: false });

    // Sort messages inside each conversation to get the latest
    const enriched = (data ?? []).map(c => ({
      ...c,
      lastMessage: c.messages?.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0] ?? null,
    }));
    setConversations(enriched);
    setLoading(false);
  }

  async function startNewConversation() {
    setStarting(true);

    const { data: boRows } = await supabase
      .from("users")
      .select("user_id, roles!inner(role_name)")
      .eq("roles.role_name", "Business Owner")
      .eq("account_status", "Active");

    const boId = boRows?.[0]?.user_id;

    if (!boId) {
      setStarting(false);
      alert("Could not find the Business Owner account. Please contact support.");
      return;
    }

    // ── UPSERT: reuse existing conversation, never create a duplicate ──────
    const { data: existing } = await supabase
      .from("conversations")
      .select("conversation_id")
      .eq("supplier_id", user.id)
      .eq("business_owner_id", boId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      setStarting(false);
      navigate(`/dashboard/supplier/conversations/${existing.conversation_id}`);
      return;
    }

    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({ supplier_id: user.id, business_owner_id: boId, status: "Open" })
      .select("conversation_id")
      .single();

    setStarting(false);
    if (!error) navigate(`/dashboard/supplier/conversations/${conv.conversation_id}`);
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
            <LuMessageSquare className="w-5 h-5 text-green-dark" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-brown-dark">Negotiations</h1>
            <p className="text-brown-light text-sm">Chat with NERC to negotiate your price</p>
          </div>
        </div>
        <button
          onClick={startNewConversation}
          disabled={starting}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-green-dark to-green-mid text-white
            font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow-glow-green
            transition-all duration-200 disabled:opacity-60"
        >
          {starting
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <LuPlus className="w-4 h-4" />
          }
          New Negotiation
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuMessageSquare className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">No negotiations yet</p>
            <p className="text-brown-light text-sm mt-1 mb-5">Start a new negotiation to propose a price to NERC.</p>
            <button
              onClick={startNewConversation}
              disabled={starting}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-green-dark to-green-mid text-white
                font-semibold text-sm px-5 py-2.5 rounded-xl shadow-sm hover:shadow-glow-green transition-all duration-200"
            >
              <LuPlus className="w-4 h-4" /> Start First Negotiation
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-beige-dark/20">
            {conversations.map(c => (
              <li key={c.conversation_id}>
                <button
                  onClick={() => navigate(`/dashboard/supplier/conversations/${c.conversation_id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/40 transition-colors duration-150 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-green-pale flex items-center justify-center shrink-0">
                    <LuMessageSquare className="w-5 h-5 text-green-dark" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-brown-dark text-sm">NERC Copra Trading</p>
                      <span className="text-xs text-brown-light shrink-0 flex items-center gap-1">
                        <LuClock className="w-3 h-3" />
                        {formatTime(c.lastMessage?.sent_at ?? c.created_at)}
                      </span>
                    </div>
                    <p className="text-brown-light text-xs mt-0.5 truncate">
                      {c.lastMessage?.message_text ?? "No messages yet — start the conversation!"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    c.status === "Open" ? "bg-green-pale text-green-dark" : "bg-beige text-brown-light"
                  }`}>
                    {c.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
