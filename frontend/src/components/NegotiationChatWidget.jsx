import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LuX, LuSend, LuFileText,
  LuMessageSquare, LuCheckCheck, LuLeaf, LuMaximize2,
  LuCoins, LuCheck, LuPencil, LuClock,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import ProposePriceModal from "./ProposePriceModal";
import { isProposalSubmissionMessage } from "../utils/negotiationMessages";

function getDateLabel(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Today, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getSupplierProposalEvent(message = "", isMine = false) {
  const rawMessage = message.trim();

  const decision = rawMessage.match(
    /^Proposal (accepted|rejected):\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons\.?$/i,
  );
  if (decision) {
    const action = decision[1].toLowerCase();
    return {
      tone: action === "accepted" ? "accepted" : "rejected",
      text: `NERC Copra Trading ${action} your proposal of ₱${decision[2]}/kg for ${decision[3]} tons.`,
    };
  }

  const counterDecision = rawMessage.match(
    /^Counteroffer (accepted|rejected):\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons\.?$/i,
  );
  if (counterDecision) {
    const action = counterDecision[1].toLowerCase();
    return {
      tone: action === "accepted" ? "accepted" : "rejected",
      text: `You ${action} NERC Copra Trading's counteroffer of ₱${counterDecision[2]}/kg for ${counterDecision[3]} tons.`,
    };
  }

  const legacyAcceptedCounter = rawMessage.match(
    /^✅\s*Counteroffer accepted:\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons\.?$/i,
  );
  if (legacyAcceptedCounter) {
    return {
      tone: "accepted",
      text: `You accepted NERC Copra Trading's counteroffer of ₱${legacyAcceptedCounter[1]}/kg for ${legacyAcceptedCounter[2]} tons.`,
    };
  }

  if (/^❌\s*Counteroffer declined\.?$/i.test(rawMessage)) {
    return {
      tone: "rejected",
      text: "You rejected NERC Copra Trading's counteroffer.",
    };
  }

  if (
    /^You accepted .+['’]s proposal form\./i.test(rawMessage)
    || /^NERC accepted your proposal form\./i.test(rawMessage)
  ) {
    return {
      tone: "accepted",
      text: rawMessage.replace(
        /^(?:You accepted .+['’]s proposal form|NERC accepted your proposal form)\./i,
        "NERC accepted your proposal form.",
      ),
    };
  }

  const rejected = rawMessage.match(
    /^❌\s*Proposal declined:\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons\.?$/i,
  );

  if (rejected && !isMine) {
    return {
      tone: "rejected",
      text: `NERC rejected your proposal form.\nPrice: ₱${rejected[1]}/kg Volume: ${rejected[2]} tons`,
    };
  }

  const counteroffer = rawMessage.match(
    /^🔄\s*Counteroffer:\s*₱?([\d,.]+)\/kg for ([\d,.]+) tons\.?$/i,
  );
  if (counteroffer && !isMine) {
    return {
      tone: "counteroffer",
      text: `NERC sent you a counteroffer.\nPrice: ₱${counteroffer[1]}/kg Volume: ${counteroffer[2]} tons`,
    };
  }

  return null;
}

export default function NegotiationChatWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [counteringProposal, setCounteringProposal] = useState(null);
  const [businessOwnerId, setBusinessOwnerId] = useState(null); 
  const messagesEndRef = useRef(null);
  const proposalActionInFlight = useRef(new Set());

  useEffect(() => {
    localStorage.setItem("coptrax_chat_widget_open", String(isOpen));
  }, [isOpen]);

  // Initialize by loading the Business Owner ID and checking for existing conversation
  // Do NOT create a conversation on widget open
  useEffect(() => {
    if (!user?.id) return;

    async function initialize() {
      setLoading(true);
      const { data: boRows } = await supabase
        .from("users")
        .select("user_id, first_name, last_name, roles!inner(role_name)")
        .eq("roles.role_name", "Business Owner")
        .eq("account_status", "Active");

      const boUser = boRows?.[0];
      if (!boUser?.user_id) { setLoading(false); return; }
      setBusinessOwnerId(boUser.user_id);

      const { data: convData } = await supabase
        .from("conversations")
        .select("*, business_owner:business_owner_id(first_name, last_name)")
        .eq("supplier_id", user.id)
        .eq("business_owner_id", boUser.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (convData) {
        setConversation(convData);
        const [{ data: messageRows }, { data: proposalRows }] = await Promise.all([
          supabase.from("messages").select("*").eq("conversation_id", convData.conversation_id).order("sent_at", { ascending: true }),
          supabase.from("proposal_forms").select("*").eq("conversation_id", convData.conversation_id).order("submitted_at", { ascending: true }),
        ]);
        setMessages(messageRows ?? []);
        setProposals(proposalRows ?? []);
      }
      setLoading(false);
    }

    initialize();
  }, [user?.id]);

  // Subscribe to realtime messages & proposals when active conversation is ready
  useEffect(() => {
    if (!conversation?.conversation_id) return;

    const convId = conversation.conversation_id;

    const refreshProposals = async () => {
      const { data } = await supabase.from("proposal_forms").select("*")
        .eq("conversation_id", convId).order("submitted_at", { ascending: true });
      setProposals(data ?? []);
    };
    const applyProposalChange = ({ new: incoming }) => {
      setProposals(previous => {
        const withoutIncoming = previous.filter(
          proposal => proposal.proposal_id !== incoming.proposal_id,
        );
        return [...withoutIncoming, incoming].sort(
          (a, b) => new Date(a.submitted_at) - new Date(b.submitted_at),
        );
      });
    };

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
        applyProposalChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "proposal_forms",
          filter: `conversation_id=eq.${convId}`,
        },
        applyProposalChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `conversation_id=eq.${convId}`,
        },
        ({ new: updatedConversation }) => {
          setConversation(previous => previous ? { ...previous, ...updatedConversation } : previous);
        },
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") refreshProposals();
      });

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

  // Helper: Ensure a conversation exists, creating one if needed
  async function ensureConversationExists() {
    if (conversation?.conversation_id) {
      return conversation; // Already exists
    }

    if (!businessOwnerId) {
      console.error("Business Owner ID not available");
      return null;
    }

    // Create a new conversation
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ 
        supplier_id: user.id, 
        business_owner_id: businessOwnerId, 
        status: "Open" 
      })
      .select("*, business_owner:business_owner_id(first_name, last_name)")
      .single();

    if (error) {
      console.error("Failed to create conversation:", error);
      return null;
    }

    if (newConv) {
      setConversation(newConv);
      return newConv;
    }
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
    if (!inputText.trim() || sending) return;

    setSending(true);

    // Ensure conversation exists before sending message
    const conv = await ensureConversationExists();
    if (!conv) {
      setSending(false);
      alert("Unable to start conversation. Please try again.");
      return;
    }

    const textToSend = inputText.trim();
    setInputText("");

    const { error } = await supabase.from("messages").insert({
      conversation_id: conv.conversation_id,
      sender_id: user.id,
      message_type: "Text",
      message_text: textToSend,
    });

    setSending(false);
    if (!error) {
      fetchMessages(conv.conversation_id);
    }
  }

  async function handleProposalSubmitted(_message, targetConversationId) {
    const counteredProposal = counteringProposal;
    setShowProposeModal(false);
    setCounteringProposal(null);
    const convId = targetConversationId ?? conversation?.conversation_id;
    if (counteredProposal && convId) {
      await supabase.from("proposal_forms")
        .update({ proposal_status: "Modified", reviewed_by: user.id })
        .eq("proposal_id", counteredProposal.proposal_id)
        .eq("proposal_status", "Pending");
      await supabase.from("notifications").insert({
        user_id: conversation?.business_owner_id ?? businessOwnerId,
        notification_type: "New Proposal",
        message: "The Supplier sent a counteroffer.",
        related_entity_type: "conversations",
        related_entity_id: convId,
      });
    }
    if (convId) {
      await fetchMessages(convId);
      await fetchProposals(convId);
    }
  }

  async function respondToCounteroffer(proposal, decision) {
    if (proposalActionInFlight.current.has(proposal.proposal_id)) return;
    proposalActionInFlight.current.add(proposal.proposal_id);
    try {
      let decided = null;
      let finalized = null;
      if (decision === "accepted") {
        const { data: finalizedRows } = await supabase.rpc("finalize_negotiation", {
          p_proposal_id: proposal.proposal_id,
        });
        finalized = finalizedRows?.[0] ?? null;
        decided = finalized;
      } else {
        const { data } = await supabase.from("proposal_forms")
          .update({ proposal_status: "Rejected", reviewed_by: user.id })
          .eq("proposal_id", proposal.proposal_id)
          .eq("proposal_status", "Pending")
          .select("proposal_id")
          .maybeSingle();
        decided = data;
      }
      if (!decided) return;

      const action = decision === "accepted" ? "accepted" : "rejected";
      const convId = conversation.conversation_id;
      await supabase.from("messages").insert({
        conversation_id: convId,
        sender_id: user.id,
        message_type: "Contract Form",
        message_text: `Counteroffer ${action}: ₱${Number(proposal.proposed_price_per_kg).toFixed(2)}/kg for ${proposal.proposed_volume_tons} tons.`,
      });
      await supabase.from("notifications").insert({
        user_id: conversation.business_owner_id ?? businessOwnerId,
        notification_type: decision === "accepted" ? "Proposal Accepted" : "Proposal Rejected",
        message: `The Supplier ${action} your counteroffer.`,
        related_entity_type: "proposal_forms",
        related_entity_id: proposal.proposal_id,
      });
      if (finalized) {
        setConversation(previous => ({
          ...previous,
          accepted_proposal_id: finalized.final_proposal_id,
          agreed_price_per_kg: finalized.final_price_per_kg,
          agreed_volume_tons: finalized.final_volume_tons,
          negotiation_finalized_at: finalized.finalized_at,
        }));
      }
      await fetchMessages(convId);
      await fetchProposals(convId);
    } finally {
      proposalActionInFlight.current.delete(proposal.proposal_id);
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function maximizeChat() {
    setIsOpen(false);
    const path = conversation?.conversation_id
      ? `/dashboard/supplier/conversations/${conversation.conversation_id}`
      : "/dashboard/supplier/conversations";
    navigate(path, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
  }

  const boName = conversation?.business_owner
    ? `${conversation.business_owner.first_name} ${conversation.business_owner.last_name}`
    : "Edison Buenafe";
  const negotiationFinalized = Boolean(
    conversation?.negotiation_finalized_at
    || proposals.some(proposal => proposal.proposal_status === "Accepted"),
  );
  // Merge messages and proposal cards chronologically for chat feed display
  const combinedItems = [];
  messages.forEach((m) => {
    combinedItems.push({ type: "message", date: new Date(m.sent_at), data: m });
  });
  proposals.forEach((p, proposalIndex) => {
    if (p.proposal_status !== "Pending") return;
    combinedItems.push({
      type: "proposal",
      date: new Date(p.submitted_at),
      data: p,
      proposalIndex,
    });
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-dark to-green-light text-white flex items-center justify-center shadow-sm border border-white/20 shrink-0">
                <LuLeaf className="w-5 h-5 text-white" />
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
              onClick={maximizeChat}
              className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Maximize chat"
              aria-label="Open full negotiation chat"
            >
              <LuMaximize2 className="w-4.5 h-4.5 text-white" />
            </button>
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
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !conversation ? (
            // No conversation yet - show welcome state
            <div className="h-full flex flex-col items-center justify-center text-center py-8 px-3">
              <div className="w-12 h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center mb-4">
                <LuMessageSquare className="w-6 h-6 text-[#2E7D32]" />
              </div>
              <h4 className="font-bold text-brown-dark text-sm mb-2">Start Your First Message</h4>
              <p className="text-brown-light text-xs leading-relaxed mb-4">
                Send a message or submit a price proposal to begin negotiating with NERC Copra Trading.
              </p>
              <div className="space-y-2 w-full">
                <p className="text-[11px] font-medium text-brown-dark uppercase opacity-70">Quick Actions:</p>
                <button
                  onClick={() => setInputText("I'd like to propose a price.")}
                  className="text-[11px] w-full px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
                >
                  Send First Message
                </button>
                <button
                  onClick={async () => {
                    const conv = await ensureConversationExists();
                    if (conv) setShowProposeModal(true);
                  }}
                  className="text-[11px] w-full px-3 py-2 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100 transition-colors"
                >
                  Submit Price Proposal
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Centered Date Pill */}
              <div className="flex justify-center my-1">
                <span className="px-3.5 py-0.5 rounded-full bg-[#A38D80] text-white text-[11px] font-medium shadow-xs">
                  {getDateLabel(combinedItems[combinedItems.length - 1]?.date || new Date())}
                </span>
              </div>

              {combinedItems.map((item, idx) => {
                if (item.type === "message") {
                  const m = item.data;
                  const isMe = m.sender_id === user?.id;
                  const rawMessage = m.message_text?.trimStart() ?? "";
                  if (isProposalSubmissionMessage(rawMessage)) return null;
                  const proposalEvent = getSupplierProposalEvent(rawMessage, isMe);

                  if (proposalEvent) {
                    const eventColor = proposalEvent.tone === "accepted"
                      ? "text-[#17682D]"
                      : proposalEvent.tone === "rejected"
                        ? "text-[#C62828]"
                        : "text-[#2563EB]";
                    return (
                      <div key={m.message_id || idx} className="flex justify-center px-3 py-2">
                        <p className={`max-w-[90%] whitespace-pre-line text-center text-xs italic leading-relaxed ${eventColor}`}>
                          {proposalEvent.text}
                        </p>
                      </div>
                    );
                  }

                  if (rawMessage.startsWith("CONTRACT_CARD:")) {
                    try {
                      const contract = JSON.parse(rawMessage.replace(/^CONTRACT_CARD:\s*/, ""));
                      return (
                        <div key={m.message_id || idx} className="flex justify-start my-2">
                          <div className="w-[90%] overflow-hidden rounded-2xl rounded-tl-none border border-[#2E7D32]/20 bg-[#EDF7EF] shadow-sm">
                            <div className="flex items-center gap-2 bg-[#2E7D32] px-3.5 py-2.5 text-white">
                              <LuFileText className="w-4 h-4 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-medium text-white/70">Contract received</p>
                                <p className="truncate text-xs font-bold">{contract.contract_number ?? "New Contract"}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 px-3.5 py-3 text-xs">
                              <div>
                                <p className="text-[10px] text-brown-light">Price</p>
                                <p className="font-bold text-brown-dark">₱{Number(contract.price_per_kg ?? 0).toFixed(2)}/kg</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-brown-light">Quantity</p>
                                <p className="font-bold text-brown-dark">{Number(contract.contracted_tons ?? 0).toLocaleString()} tons</p>
                              </div>
                              <div className="col-span-2 flex items-center justify-between border-t border-[#A2D5AB]/50 pt-2">
                                <span className="text-[10px] text-brown-light">
                                  Due {contract.due_date
                                    ? new Date(contract.due_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                                    : "after activation"}
                                </span>
                                <button type="button" onClick={maximizeChat}
                                  className="font-bold text-[#2E7D32] hover:underline">
                                  Review in full chat
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    } catch {
                      // Fall back to the regular message bubble for malformed legacy data.
                    }
                  }

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
                  const isMine = p.submitted_by
                    ? p.submitted_by === user?.id
                    : item.proposalIndex % 2 === 0;

                  return (
                    <div key={p.proposal_id || idx} className="my-2 flex flex-col items-center px-1">
                      <div className="w-[92%] overflow-hidden rounded-2xl border border-[#2E7D32] bg-[#FFFEFB] shadow-sm">
                        {/* Card Header */}
                        <div className="flex items-center gap-2 border-b border-[#B7DDBD] bg-[#EAF6EC] px-3.5 py-3 text-[10px] font-extrabold uppercase text-[#17682D]">
                          {isMine ? (
                            <LuFileText className="w-4 h-4 text-[#024023]" />
                          ) : (
                            <LuCoins className="w-4 h-4 text-[#024023]" />
                          )}
                          <span>{isMine ? "PRICE PROPOSAL SUBMITTED" : "COUNTEROFFER RECEIVED"}</span>
                          {!isMine && (
                            <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold normal-case text-amber-700">
                              <LuClock className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </div>

                        {/* Card Fields */}
                        <div className="space-y-2 px-3.5 py-3 text-xs">
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
                        <div className="mx-3.5 flex items-center justify-between border-t border-[#B7DDBD] py-2.5">
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
                              ? isMine ? "Offer Received" : "Response Required"
                              : status}
                          </span>
                          <span className="text-[10px] text-brown-light font-medium">
                            {formatTime(p.submitted_at)}
                          </span>
                        </div>
                        {!isMine && !negotiationFinalized && (
                          <div className="mx-3.5 flex gap-1.5 border-t border-[#B7DDBD] py-3">
                            <button type="button" onClick={() => respondToCounteroffer(p, "accepted")}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#E8F0E5] py-2 text-[10px] font-semibold text-[#2D5A27] hover:bg-[#D4E5CF]">
                              <LuCheck className="h-3 w-3" /> Accept
                            </button>
                            <button type="button" onClick={() => { setCounteringProposal(p); setShowProposeModal(true); }}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#F5F0E8] py-2 text-[10px] font-semibold text-[#5C4A32] hover:bg-[#EBE5D5]">
                              <LuPencil className="h-3 w-3" /> Counter
                            </button>
                            <button type="button" onClick={() => respondToCounteroffer(p, "rejected")}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-50 py-2 text-[10px] font-semibold text-red-600 hover:bg-red-100">
                              <LuX className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        )}
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
              })}
            </>
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
            disabled={negotiationFinalized}
            onClick={async () => {
              if (negotiationFinalized) return;
              const conv = await ensureConversationExists();
              if (conv) {
                setShowProposeModal(true);
              } else {
                alert("Unable to start conversation. Please try again.");
              }
            }}
            className="w-full bg-[#2E7D32] hover:bg-[#1b5e20] text-white font-bold text-xs sm:text-sm py-2.5 px-4
              rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all duration-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LuFileText className="w-4.5 h-4.5 text-white" />
            {negotiationFinalized ? "Negotiation Finalized" : "Submit Price Proposal"}
          </button>

          {/* Rounded Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="bg-[#EFE8D8] rounded-full px-3.5 py-1.5 flex items-center gap-2 border border-[#E0D5C1]"
          >

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message here..."
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
      {showProposeModal && conversation?.conversation_id && !negotiationFinalized && (
        <ProposePriceModal
          conversationId={conversation.conversation_id}
          userId={user.id}
          supplierId={user.id}
          isCounter={Boolean(counteringProposal)}
          supersedesId={counteringProposal?.proposal_id}
          onClose={() => {
            setShowProposeModal(false);
            setCounteringProposal(null);
          }}
          onSubmitted={handleProposalSubmitted}
        />
      )}
    </>
  );
}
