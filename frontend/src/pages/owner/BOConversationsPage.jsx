import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuMessageSquare, LuClock } from "react-icons/lu";
import { supabase } from "../../lib/supabase";

export default function BOConversationsPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select(`
        conversation_id, status, created_at,
        supplier:supplier_id(first_name, last_name, email),
        messages(message_text, sent_at)
      `)
      .order("created_at", { ascending: false });

    const enriched = (data ?? []).map(c => ({
      ...c,
      lastMessage: c.messages?.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0] ?? null,
    }));
    setConversations(enriched);
    setLoading(false);
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const diff = Date.now() - d;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuMessageSquare className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Supplier Negotiations</h1>
          <p className="text-brown-light text-sm">Review and respond to supplier price proposals</p>
        </div>
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
            <p className="text-brown-light text-sm mt-1">Suppliers will appear here when they start a negotiation.</p>
          </div>
        ) : (
          <ul className="divide-y divide-beige-dark/20">
            {conversations.map(c => (
              <li key={c.conversation_id}>
                <button
                  onClick={() => navigate(`/dashboard/owner/conversations/${c.conversation_id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/40 transition-colors duration-150 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {[c.supplier?.first_name?.[0], c.supplier?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-brown-dark text-sm">
                        {c.supplier?.first_name} {c.supplier?.last_name}
                      </p>
                      <span className="text-xs text-brown-light shrink-0 flex items-center gap-1">
                        <LuClock className="w-3 h-3" />
                        {formatTime(c.lastMessage?.sent_at ?? c.created_at)}
                      </span>
                    </div>
                    <p className="text-brown-light text-xs mt-0.5 truncate">
                      {c.lastMessage?.message_text ?? "No messages yet"}
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
