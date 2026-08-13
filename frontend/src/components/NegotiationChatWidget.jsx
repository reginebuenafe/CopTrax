import { useState, useEffect, useRef } from "react";
import {
  LuX, LuPaperclip, LuSend, LuFileText,
  LuMessageSquare, LuCheckCheck,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import ProposePriceModal from "./ProposePriceModal";

export default function NegotiationChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(() => {
    return localStorage.getItem("coptrax_chat_widget_open") === "true";
  });
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("coptrax_chat_widget_open", String(isOpen));
  }, [isOpen]);

  // Initialize or fetch the active negotiation conversation when user is loaded or widget opens
  useEffect(() => {
    if (user?.id) {
      initActiveConversation();
    }
  }, [user?.id]);

  // Subscribe to realtime messages & proposals when active conversation is ready
  useEffect(() => {
    if (!conversation?.conversation_id) return;

    const convId = conversation.conversation_id;

    const channel = supabase
      .channel(`chat_widget:${convId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.message_id === payload.new.message_id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "proposal_forms",
          filter: `conversation_id=eq.${convId}`,
        },
        () => fetchProposals(convId)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "proposal_forms",
          filter: `conversation_id=eq.${convId}`,
        },
        () => fetchProposals(convId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.conversation_id]);

  // Auto scroll to latest message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, proposals, isOpen]);

  async function initActiveConversation() {
    setLoading(true);

    // 1. Get the Business Owner ID
    const { data: boRows } = await supabase
      .from("users")
      .select("user_id, first_name, last_name, roles!inner(role_name)")
      .eq("roles.role_name", "Business Owner")
      .eq("account_status", "Active");

    const boUser = boRows?.[0];
    const boId = boUser?.user_id;

    if (!boId) {
      setLoading(false);
      return;
    }

    // 2. Fetch existing conversation or create a new one
    let { data: convData } = await supabase
      .from("conversations")
      .select("*, business_owner:business_owner_id(first_name, last_name)")
      .eq("supplier_id", user.id)
      .eq("business_owner_id", boId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!convData) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ supplier_id: user.id, business_owner_id: boId, status: "Open" })
        .select("*, business_owner:business_owner_id(first_name, last_name)")
        .single();
      convData = newConv;
    }

    if (convData) {
      setConversation(convData);
      await Promise.all([
        fetchMessages(convData.conversation_id),
        fetchProposals(convData.conversation_id),
      ]);
    }
    setLoading(false);
  }

  async function fetchMessages(convId) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("sent_at", { ascending: true });
    setMessages(data ?? []);
  }

  async function fetchProposals(convId) {
    const { data } = await supabase
      .from("proposal_forms")
      .select("*")
      .eq("conversation_id", convId)
      .order("submitted_at", { ascending: true });
    setProposals(data ?? []);
  }

  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    if (!inputText.trim() || !conversation || sending) return;

    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversation.conversation_id,
      sender_id: user.id,
      message_type: "Text",
      message_text: textToSend,
    });

    setSending(false);
    if (!error) {
      fetchMessages(conversation.conversation_id);
    }
  }

  async function handleProposalSubmitted(msgText) {
    setShowProposeModal(false);
    if (conversation?.conversation_id) {
      await fetchMessages(conversation.conversation_id);
      await fetchProposals(conversation.conversation_id);
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const boName = conversation?.business_owner
    ? `${conversation.business_owner.first_name} ${conversation.business_owner.last_name}`
    : "Edison Buenafe";
  const boInitials = conversation?.business_owner
    ? `${conversation.business_owner.first_name?.[0] || ""}${conversation.business_owner.last_name?.[0] || ""}`.toUpperCase()
    : "EB";

  // Merge messages and proposal cards chronologically for chat feed display
  const combinedItems = [];
  messages.forEach((m) => {
    combinedItems.push({ type: "message", date: new Date(m.sent_at), data: m });
  });
  proposals.forEach((p) => {
    combinedItems.push({ type: "proposal", date: new Date(p.submitted_at), data: p });
  });
  combinedItems.sort((a, b) => a.date - b.date);

  // Quick response suggestions
  const quickSuggestions = [
    "I'll review the contract shortly.",
    "Can I receive payment earlier?",
    "What moisture content is acceptable?",
  ];

  return (
    <>
      <div
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[380px] h-[580px] max-h-[calc(100vh-4rem)]
          bg-white rounded-3xl shadow-2xl border border-beige-dark/30 flex flex-col overflow-hidden
          transition-all duration-300 ease-out origin-bottom-right
          ${isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none"}`}
      >
        <div className="bg-[#2E7D32] text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[#1b5e20] text-white font-bold text-xs flex items-center justify-center border-2 border-white/20">
                {boInitials}
              </div>
              <span className="w-3 h-3 bg-emerald-400 border-2 border-[#2E7D32] rounded-full absolute -bottom-0.5 -right-0.5"></span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-tight truncate">
                NERC Copra Trading
              </h3>
              <p className="text-[11px] text-white/80 mt-0.5 flex items-center gap-1">
                <span>Business Owner</span>
                <span className="opacity-60">•</span>
                <span className="text-emerald-200 font-medium">Online</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-white/80">
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1"
              title="Close chat"
            >
              <LuX className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* ── Chat Feed Body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-white">
          {/* Centered Date Pill */}
          <div className="flex justify-center my-1">
            <span className="px-3.5 py-0.5 rounded-full bg-[#A38D80] text-white text-[11px] font-medium shadow-xs">
              Today
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            combinedItems.map((item, idx) => {
              if (item.type === "message") {
                const m = item.data;
                const isMe = m.sender_id === user?.id;
                return (
                  <div
                    key={m.message_id || idx}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${isMe
                        ? "bg-[#024023] text-white rounded-tr-none"
                        : "bg-[#FDF7E7] text-brown-dark border border-[#E8DCC8] rounded-tl-none"
                        }`}
                    >
                      {m.message_text}
                      <div
                        className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isMe ? "text-emerald-200/80" : "text-brown-light"
                          }`}
                      >
                        <span>{formatTime(m.sent_at)}</span>
                        {isMe && <LuCheckCheck className="w-3 h-3 text-emerald-300 inline" />}
                      </div>
                    </div>
                  </div>
                );
              } else {
                /* Render Price Proposal Card matching uploaded design */
                const p = item.data;
                const status = p.proposal_status || "Pending";
                const isMine = p.supplier_id === user?.id;

                return (
                  <div key={p.proposal_id || idx} className="my-2">
                    <div className="bg-[#EDF7EF] border-2 border-[#A2D5AB] rounded-2xl p-3.5 shadow-sm">
                      {/* Card Header */}
                      <div className="flex items-center gap-2 text-[#024023] font-bold text-xs uppercase mb-2.5">
                        <LuFileText className="w-4 h-4 text-[#024023]" />
                        <span>PRICE PROPOSAL SUBMITTED</span>
                      </div>

                      {/* Card Fields */}
                      <div className="space-y-1.5 text-xs mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-brown-light font-medium">Proposed Price</span>
                          <span className="font-extrabold text-brown-dark text-sm">
                            ₱{Number(p.proposed_price_per_kg).toFixed(2)}/kg
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-brown-light font-medium">Proposed Volume</span>
                          <span className="font-extrabold text-brown-dark text-sm">
                            {p.proposed_volume_tons} tons
                          </span>
                        </div>
                      </div>

                      {/* Card Footer: Status Badge & Time */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#A2D5AB]/40">
                        <span
                          className={`text-[11px] font-bold px-3 py-0.5 rounded-full ${status === "Accepted"
                            ? "bg-emerald-100 text-emerald-800"
                            : status === "Rejected"
                              ? "bg-red-100 text-red-700"
                              : isMine
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                        >
                          {status === "Pending"
                            ? isMine ? "Offer Received" : "Offer Sent"
                            : status}
                        </span>
                        <span className="text-[10px] text-brown-light font-medium">
                          {formatTime(p.submitted_at)}
                        </span>
                      </div>
                    </div>

                    {/* Editor note under card if counter/edited */}
                    {p.supersedes_proposal_id && (
                      <p className="text-[11px] italic text-[#2E7D32] text-center my-1 font-medium">
                        {boName} edited your proposal form.
                      </p>
                    )}
                  </div>
                );
              }
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Footer Controls ── */}
        <div className="p-3 bg-white border-t border-beige-dark/20 space-y-2 shrink-0">
          {/* Quick Suggestion Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {quickSuggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => setInputText(sug)}
                className={`text-[11px] whitespace-nowrap px-3 py-1 rounded-full border transition-all duration-150 shrink-0 ${i === 0
                  ? "bg-[#8D6E63] text-white border-[#8D6E63] hover:bg-[#6D4C41]"
                  : "bg-[#FDF7E7] text-brown-dark border-[#E8DCC8] hover:bg-[#F5EFEB]"
                  }`}
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Prominent Submit Price Proposal Button */}
          <button
            onClick={() => setShowProposeModal(true)}
            className="w-full bg-[#2E7D32] hover:bg-[#1b5e20] text-white font-bold text-xs sm:text-sm py-2.5 px-4
              rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all duration-200 active:scale-[0.99]"
          >
            <LuFileText className="w-4.5 h-4.5 text-white" />
            Submit Price Proposal
          </button>

          {/* Rounded Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="bg-[#EFE8D8] rounded-full px-3.5 py-1.5 flex items-center gap-2 border border-[#E0D5C1]"
          >
            <button type="button" className="text-[#5D4037] hover:text-[#3E2723] p-1 transition-colors">
              <LuPaperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message Ed..."
              className="flex-1 bg-transparent text-xs text-brown-dark placeholder-[#8D6E63] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="w-8 h-8 rounded-full bg-[#024023] hover:bg-[#1b5e20] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
            >
              <LuSend className="w-4 h-4 ml-0.5" />
            </button>
          </form>
        </div>
      </div>

      {/* ── Floating Bubble Chat Circle (Displayed only when chat is closed) ── */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-[#2E7D32] animate-ping opacity-30 pointer-events-none"></span>

          <button
            onClick={() => setIsOpen(true)}
            className="relative w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center
              bg-gradient-to-br from-[#2E7D32] to-[#1b5e20] shadow-green-900/40 hover:shadow-green-900/60
              transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none"
            title="Open NERC Copra Trading Chat"
          >
            <div className="relative">
              <LuMessageSquare className="w-6 h-6 text-white transition-transform duration-300" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-[#2E7D32]"></span>
            </div>
          </button>
        </div>
      )}

      {/* ── Modal to Propose Price ── */}
      {showProposeModal && conversation && (
        <ProposePriceModal
          conversationId={conversation.conversation_id}
          userId={user.id}
          supplierId={user.id}
          onClose={() => setShowProposeModal(false)}
          onSubmitted={handleProposalSubmitted}
        />
      )}
    </>
  );
}
