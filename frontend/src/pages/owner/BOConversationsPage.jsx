import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LuMessageSquare, LuSend, LuPaperclip, LuFileText, LuPhone,
  LuVideo, LuEllipsisVertical, LuStar, LuCoins, LuCheck, LuX,
  LuPencil, LuClock, LuCheckCheck, LuFileCheck,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";

export default function BOConversationsPage() {
  const { conversationId: urlConvId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(urlConvId || null);
  const [loading, setLoading] = useState(true);
  const [lastMsgMap, setLastMsgMap] = useState({});

  // Active conversation state
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [supplierRating, setSupplierRating] = useState(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  // Modals
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [counterModal, setCounterModal] = useState(null);
  const [showContractModal, setShowContractModal] = useState(false);

  const messagesEndRef = useRef(null);

  // Sync urlConvId when route changes
  useEffect(() => {
    if (urlConvId && urlConvId !== selectedConvId) {
      setSelectedConvId(urlConvId);
    }
  }, [urlConvId]);

  // 1. Fetch conversations list for Business Owner
  useEffect(() => {
    fetchConversations();
  }, [user?.id]);

  async function fetchConversations() {
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select(`
        *,
        supplier:supplier_id(user_id, first_name, last_name, email, phone, address)
      `)
      .order("created_at", { ascending: false });

    const list = data ?? [];
    setConversations(list);

    if (list.length > 0) {
      const convIds = list.map(c => c.conversation_id);
      const { data: latestMsgs } = await supabase
        .from("messages")
        .select("conversation_id, message_text, sent_at")
        .in("conversation_id", convIds)
        .order("sent_at", { ascending: false });

      const map = {};
      (latestMsgs ?? []).forEach(m => {
        if (!map[m.conversation_id]) {
          map[m.conversation_id] = m;
        }
      });
      setLastMsgMap(map);
    }

    // If an ID was in URL or no selection yet, pick initial
    if (urlConvId && list.some(c => c.conversation_id === urlConvId)) {
      setSelectedConvId(urlConvId);
    } else if (list.length > 0 && !selectedConvId) {
      setSelectedConvId(list[0].conversation_id);
    }
    setLoading(false);
  }

  // 2. Sync selected conversation when selectedConvId changes
  useEffect(() => {
    if (!selectedConvId) return;

    loadActiveConversation(selectedConvId);

    // Realtime subscription for messages and proposals
    const channel = supabase
      .channel(`bo_chat:${selectedConvId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${selectedConvId}`,
      }, payload => {
        const newMsg = payload.new;
        setMessages(prev => {
          if (prev.some(m => m.message_id === newMsg.message_id)) return prev;
          return [...prev, newMsg];
        });
        setLastMsgMap(prev => ({
          ...prev,
          [selectedConvId]: { message_text: newMsg.message_text, sent_at: newMsg.sent_at }
        }));
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "proposal_forms",
        filter: `conversation_id=eq.${selectedConvId}`,
      }, () => loadProposals(selectedConvId))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConvId]);

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, proposals]);

  async function loadActiveConversation(convId) {
    const conv = conversations.find(c => c.conversation_id === convId);
    if (conv) setActiveConv(conv);

    const [{ data: convData }, { data: msgs }] = await Promise.all([
      supabase
        .from("conversations")
        .select(`*, supplier:supplier_id(user_id, first_name, last_name, email, phone, address)`)
        .eq("conversation_id", convId)
        .single(),
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("sent_at", { ascending: true }),
    ]);

    if (convData) setActiveConv(convData);
    setMessages(msgs ?? []);

    await Promise.all([
      loadProposals(convId),
      loadContracts(convData?.supplier_id),
      loadSupplierRating(convData?.supplier_id),
    ]);
  }

  async function loadProposals(convId) {
    const { data } = await supabase
      .from("proposal_forms")
      .select("*")
      .eq("conversation_id", convId)
      .order("submitted_at", { ascending: true });
    setProposals(data ?? []);
  }

  async function loadContracts(supplierId) {
    if (!supplierId) return;
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("signing_date", { ascending: false });
    setContracts(data ?? []);
  }

  async function loadSupplierRating(supplierId) {
    if (!supplierId) return;
    const { data } = await supabase
      .from("supplier_ratings")
      .select("overall_rating")
      .eq("supplier_id", supplierId)
      .maybeSingle();
    setSupplierRating(data?.overall_rating ? Number(data.overall_rating).toFixed(1) : "4.9");
  }

  function handleSelectConv(convId) {
    setSelectedConvId(convId);
    navigate(`/dashboard/owner/conversations/${convId}`, { replace: true });
  }

  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedConvId || sending) return;

    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    const { error } = await supabase.from("messages").insert({
      conversation_id: selectedConvId,
      sender_id: user.id,
      message_type: "Text",
      message_text: textToSend,
    });

    setSending(false);
    if (!error) {
      setLastMsgMap(prev => ({
        ...prev,
        [selectedConvId]: { message_text: textToSend, sent_at: new Date().toISOString() }
      }));
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedConvId)
        .order("sent_at", { ascending: true });
      setMessages(msgs ?? []);
    }
  }

  // Accept proposal -> update status & create contract
  async function handleAcceptProposal(proposal) {
    await supabase
      .from("proposal_forms")
      .update({ proposal_status: "Accepted", reviewed_by: user.id })
      .eq("proposal_id", proposal.proposal_id);

    await supabase.from("messages").insert({
      conversation_id: selectedConvId,
      sender_id: user.id,
      message_type: "Contract Form",
      message_text: `✅ Price proposal accepted: ₱${Number(proposal.proposed_price_per_kg).toFixed(2)}/kg for ${proposal.proposed_volume_tons} tons.`,
    });

    await handleCreateContract(proposal);
    loadProposals(selectedConvId);
  }

  // Reject proposal
  async function handleRejectProposal(proposal) {
    await supabase
      .from("proposal_forms")
      .update({ proposal_status: "Rejected", reviewed_by: user.id })
      .eq("proposal_id", proposal.proposal_id);

    await supabase.from("messages").insert({
      conversation_id: selectedConvId,
      sender_id: user.id,
      message_type: "Text",
      message_text: `❌ Proposal declined: ₱${Number(proposal.proposed_price_per_kg).toFixed(2)}/kg for ${proposal.proposed_volume_tons} tons.`,
    });

    loadProposals(selectedConvId);
  }

  // Create contract
  async function handleCreateContract(proposalOverride) {
    const targetProposal = proposalOverride || latestProposal;
    if (!targetProposal || !activeConv) return;

    let contractNumber;
    try {
      const { data: numData } = await supabase.rpc("generate_contract_number");
      contractNumber = numData;
    } catch {
      /* fallback */
    }
    if (!contractNumber) {
      contractNumber = `CTR-${Math.floor(10000 + Math.random() * 90000)}`;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const { data: newContract, error } = await supabase
      .from("contracts")
      .insert({
        contract_number: contractNumber,
        supplier_id: activeConv.supplier_id,
        business_owner_id: user.id,
        negotiated_price_per_kg: targetProposal.proposed_price_per_kg,
        contracted_tons: targetProposal.proposed_volume_tons,
        signing_date: new Date().toISOString().split("T")[0],
        due_date: dueDate.toISOString().split("T")[0],
        status: "Pending",
      })
      .select("contract_id")
      .single();

    if (!error && newContract) {
      await supabase
        .from("conversations")
        .update({ contract_id: newContract.contract_id })
        .eq("conversation_id", selectedConvId);

      await supabase.from("messages").insert({
        conversation_id: selectedConvId,
        sender_id: user.id,
        message_type: "Contract Form",
        message_text: `📄 Contract ${contractNumber} has been created and sent to supplier.`,
      });

      loadContracts(activeConv.supplier_id);
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Combine items for chat body
  const combinedItems = [];
  messages.forEach(m => combinedItems.push({ type: "message", date: new Date(m.sent_at), data: m }));
  proposals.forEach(p => combinedItems.push({ type: "proposal", date: new Date(p.submitted_at), data: p }));
  combinedItems.sort((a, b) => a.date - b.date);

  // Latest active proposal
  const latestProposal = proposals.length > 0 ? proposals[proposals.length - 1] : null;

  // Supplier Name & Address
  const supplierName = activeConv?.supplier
    ? `${activeConv.supplier.first_name} ${activeConv.supplier.last_name}`
    : "Supplier";
  const supplierInitials = activeConv?.supplier
    ? `${activeConv.supplier.first_name?.[0] || ""}${activeConv.supplier.last_name?.[0] || ""}`.toUpperCase()
    : "SP";
  const supplierAddress = activeConv?.supplier?.address || "Tagbilaran, Bohol";
  const supplierCode = `SUP-${activeConv?.supplier_id?.substring(0, 4)?.toUpperCase() || "2026-0192"}`;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-5 overflow-hidden">
      {/* ── LEFT COLUMN: Conversations List ── */}
      <div className="w-full lg:w-[320px] bg-white rounded-3xl shadow-card border border-beige-dark/20 flex flex-col overflow-hidden shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-beige-dark/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-brown-dark">Conversations</h2>
            <span className="w-6 h-6 rounded-full bg-[#A2D5AB] text-[#024023] font-extrabold text-xs flex items-center justify-center shadow-xs">
              {conversations.length}
            </span>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-beige-dark/10">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-brown-light text-xs">
              No conversations found.
            </div>
          ) : (
            conversations.map(c => {
              const isSelected = c.conversation_id === selectedConvId;
              const sName = c.supplier
                ? `${c.supplier.first_name} ${c.supplier.last_name}`
                : "Supplier";
              const sInitials = c.supplier
                ? `${c.supplier.first_name?.[0] || ""}${c.supplier.last_name?.[0] || ""}`.toUpperCase()
                : "SP";
              const loc = c.supplier?.address || "No Address Found";
              const lastMsg = lastMsgMap[c.conversation_id];
              const lastMsgText = lastMsg?.message_text || "No messages yet";
              const lastMsgTime = lastMsg?.sent_at
                ? formatLastMessageTime(lastMsg.sent_at)
                : (c.created_at ? formatLastMessageTime(c.created_at) : "");

              return (
                <button
                  key={c.conversation_id}
                  onClick={() => handleSelectConv(c.conversation_id)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors relative ${isSelected ? "bg-[#E8DFC8]" : "bg-white hover:bg-[#FDF7E7]/60"
                    }`}
                >
                  {/* Active Green Indicator Bar */}
                  {isSelected && (
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#024023] rounded-r" />
                  )}

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[#2E7D32] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    {sInitials}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="font-bold text-brown-dark text-xs truncate leading-tight">
                        {sName}
                      </p>
                      <span className="text-[10px] text-brown-light shrink-0">
                        {lastMsgTime}
                      </span>
                    </div>
                    <p className="text-[11px] text-brown-light truncate leading-tight mb-1">
                      {loc}
                    </p>
                    <p className="text-[11px] text-brown-mid/80 truncate">
                      {lastMsgText}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── MIDDLE COLUMN: Active Chat Window ── */}
      <div className="flex-1 bg-white rounded-3xl shadow-card border border-beige-dark/20 flex flex-col overflow-hidden">
        {/* Chat Header */}
        <div className="px-5 py-3.5 border-b border-beige-dark/20 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[#2E7D32] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {supplierInitials}
              </div>
              <span className="w-3 h-3 bg-emerald-400 border-2 border-white rounded-full absolute -bottom-0.5 -right-0.5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-brown-dark text-sm leading-tight truncate">
                {supplierName}
              </h3>
              <p className="text-[11px] text-brown-light mt-0.5 flex items-center gap-1.5">
                <span className="text-emerald-600 font-semibold">• Active Now</span>
                <span className="opacity-40">•</span>
                <span>{supplierCode}</span>
              </p>
            </div>
          </div>

          {/* Action Icons 
          <div className="flex items-center gap-2 text-brown-light">
            <button className="p-2 hover:bg-beige rounded-xl transition-colors text-brown-dark" title="Call">
              <LuPhone className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-beige rounded-xl transition-colors text-brown-dark" title="Video call">
              <LuVideo className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-beige rounded-xl transition-colors text-brown-dark" title="More options">
              <LuEllipsisVertical className="w-4 h-4" />
            </button>
          </div>
          */}
        </div>


        {/* Chat Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-white">
          {combinedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-brown-light text-xs">
              <p>No messages yet in this conversation.</p>
            </div>
          ) : (
            combinedItems.map((item, idx) => {
              if (item.type === "message") {
                const m = item.data;
                const isMe = m.sender_id === user?.id;
                const isSystem = m.message_type === "Contract Form";

                if (isSystem) {
                  return (
                    <div key={m.message_id || idx} className="flex justify-center my-2">
                      <div className="bg-[#EDF7EF] text-[#024023] border border-[#A2D5AB] text-xs font-semibold px-4 py-2 rounded-2xl max-w-sm text-center shadow-xs">
                        {m.message_text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={m.message_id || idx} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[80%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-xs ${isMe
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
                /* Render Proposal Card matching mockup */
                const p = item.data;
                const status = p.proposal_status || "Pending";
                const isReceived = p.supplier_id !== user?.id;

                return (
                  <div key={p.proposal_id || idx} className="my-3 max-w-md mx-auto">
                    <div className="bg-[#EDF7EF] border-2 border-[#A2D5AB] rounded-2xl p-4 shadow-sm">
                      {/* Card Header */}
                      <div className="flex items-center gap-2 text-[#024023] font-bold text-xs uppercase mb-3">
                        <LuFileText className="w-4.5 h-4.5 text-[#024023]" />
                        <span>{isReceived ? "PRICE PROPOSAL RECEIVED" : "PRICE PROPOSAL SUBMITTED"}</span>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 text-xs mb-3.5">
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

                      {/* Status & Time */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#A2D5AB]/40 mb-3">
                        <span
                          className={`text-[11px] font-bold px-3 py-0.5 rounded-full ${status === "Accepted"
                            ? "bg-emerald-100 text-emerald-800"
                            : status === "Rejected"
                              ? "bg-red-100 text-red-700"
                              : isReceived
                                ? "bg-[#FFEAD2] text-[#D97706]"
                                : "bg-[#DBEAFE] text-[#2563EB]"
                            }`}
                        >
                          {status === "Pending"
                            ? isReceived ? "Offer Received" : "Offer Sent"
                            : status}
                        </span>
                        <span className="text-[10px] text-brown-light font-medium">
                          {formatTime(p.submitted_at)}
                        </span>
                      </div>

                      {/* Action buttons if Pending */}
                      {status === "Pending" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setCounterModal(p)}
                            className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs py-2 rounded-xl transition-all shadow-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRejectProposal(p)}
                            className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-xs py-2 rounded-xl transition-all shadow-xs"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleAcceptProposal(p)}
                            className="flex-1 bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold text-xs py-2 rounded-xl transition-all shadow-xs"
                          >
                            Accept
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Subtext if counter */}
                    {p.supersedes_proposal_id && (
                      <p className="text-[11px] italic text-[#2E7D32] text-center mt-1.5 font-medium">
                        Edison Buenafe edited your proposal form.
                      </p>
                    )}
                  </div>
                );
              }
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controls / Footer */}
        <div className="p-3.5 bg-white border-t border-beige-dark/20 space-y-2.5 shrink-0">
          {/* Action Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setShowContractModal(true)}
              className="bg-[#8D6E63] hover:bg-[#6D4C41] text-white text-xs font-bold px-4 py-2 rounded-full transition-colors shrink-0 shadow-xs"
            >
              Send Contract
            </button>
            <button
              onClick={() => setShowProposeModal(true)}
              className="bg-[#FDF7E7] hover:bg-[#F5EFEB] text-brown-dark border border-[#E8DCC8] text-xs font-semibold px-4 py-2 rounded-full transition-colors shrink-0"
            >
              ₱ Propose price
            </button>
            <button
              onClick={() => {
                setInputText("Please upload or send a sample photo of your copra batch.");
              }}
              className="bg-[#FDF7E7] hover:bg-[#F5EFEB] text-brown-dark border border-[#E8DCC8] text-xs font-semibold px-4 py-2 rounded-full transition-colors shrink-0"
            >
              Request Sample Photo
            </button>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="bg-[#EFE8D8] border border-[#E0D5C1] rounded-full px-4 py-2 flex items-center gap-2.5"
          >
            <button type="button" className="text-[#5D4037] hover:text-[#3E2723] p-1 transition-colors">
              <LuPaperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Message ${supplierName.split(" ")[0]}…`}
              className="flex-1 bg-transparent text-xs text-brown-dark placeholder-[#8D6E63] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="w-9 h-9 rounded-full bg-[#024023] hover:bg-[#1b5e20] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
            >
              <LuSend className="w-4 h-4 ml-0.5" />
            </button>
          </form>
        </div>
      </div>

      {/* ── RIGHT COLUMN: Supplier Detail & Negotiation Summary ── */}
      <div className="w-full lg:w-[320px] bg-white rounded-3xl shadow-card border border-beige-dark/20 p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
        <div className="space-y-5">
          {/* Supplier Header Info */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-[#2E7D32] text-white font-extrabold text-xl flex items-center justify-center mx-auto mb-2.5 shadow-md">
              {supplierInitials}
            </div>
            <h3 className="font-extrabold text-brown-dark text-base leading-tight">
              {supplierName}
            </h3>
            <p className="text-xs text-brown-light mt-1">
              {supplierAddress}
            </p>
            <div className="mt-2.5 inline-flex items-center gap-1 bg-[#FDF7E7] border border-[#E8DCC8] text-brown-dark text-xs font-bold px-3 py-1 rounded-full shadow-2xs">
              <LuStar className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>{supplierRating}</span>
            </div>
          </div>

          {/* Primary CTA: Send Contract */}
          <button
            onClick={() => setShowContractModal(true)}
            className="w-full bg-[#1E5622] hover:bg-[#143B17] text-white font-extrabold py-3 px-4 rounded-2xl text-center text-sm shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <LuFileCheck className="w-4.5 h-4.5" />
            Send Contract
          </button>

          {/* Negotiation Summary Card */}
          <div>
            <h4 className="text-xs font-bold text-[#8D6E63] uppercase tracking-wider mb-2">
              NEGOTIATION SUMMARY
            </h4>
            <div className="bg-[#FDF7E7] border border-[#E8DCC8] rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-brown-light font-medium">Proposed volume</span>
                <span className="font-extrabold text-brown-dark">
                  {latestProposal ? `${latestProposal.proposed_volume_tons} tons` : "25 tons"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brown-light font-medium">Agreed Price</span>
                <span className="font-extrabold text-brown-dark">
                  {latestProposal ? `₱${Number(targetPrice(latestProposal)).toFixed(2)}` : "₱38.50"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brown-light font-medium">Contracts sent</span>
                <span className="font-extrabold text-brown-dark">
                  {contracts.length}
                </span>
              </div>
            </div>
          </div>

          {/* Signed Contracts Section */}
          <div>
            <h4 className="text-xs font-bold text-[#8D6E63] uppercase tracking-wider mb-2">
              SIGNED CONTRACTS
            </h4>
            {contracts.length === 0 ? (
              <div className="bg-[#FDF7E7] border border-[#E8DCC8] rounded-2xl p-4 text-xs text-brown-mid text-center leading-relaxed">
                No contracts yet. Agree on price and volume, then send one.
              </div>
            ) : (
              <div className="space-y-2">
                {contracts.map(ct => (
                  <div key={ct.contract_id} className="bg-[#FDF7E7] border border-[#E8DCC8] rounded-2xl p-3 text-xs">
                    <div className="flex items-center justify-between font-bold text-brown-dark mb-1">
                      <span>{ct.contract_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${ct.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                        {ct.status}
                      </span>
                    </div>
                    <p className="text-brown-light text-[11px]">
                      ₱{Number(ct.negotiated_price_per_kg).toFixed(2)}/kg · {ct.contracted_tons} tons
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showContractModal && activeConv && (
        <NewContractModal
          supplierName={supplierName}
          supplierId={activeConv.supplier_id}
          conversationId={selectedConvId}
          latestProposal={latestProposal}
          onClose={() => setShowContractModal(false)}
          onCreated={() => {
            setShowContractModal(false);
            loadContracts(activeConv.supplier_id);
            loadActiveConversation(selectedConvId);
          }}
        />
      )}

      {showProposeModal && selectedConvId && (
        <ProposePriceModal
          conversationId={selectedConvId}
          userId={user.id}
          supplierId={activeConv?.supplier_id}
          onClose={() => setShowProposeModal(false)}
          onSubmitted={async (msgText) => {
            setShowProposeModal(false);
            await supabase.from("messages").insert({
              conversation_id: selectedConvId,
              sender_id: user.id,
              message_type: "Contract Form",
              message_text: msgText,
            });
            loadProposals(selectedConvId);
          }}
        />
      )}

      {counterModal && selectedConvId && (
        <ProposePriceModal
          conversationId={selectedConvId}
          userId={user.id}
          supplierId={activeConv?.supplier_id}
          isCounter
          supersedesId={counterModal.proposal_id}
          onClose={() => setCounterModal(null)}
          onSubmitted={async (msgText) => {
            await supabase
              .from("proposal_forms")
              .update({ proposal_status: "Modified", reviewed_by: user.id })
              .eq("proposal_id", counterModal.proposal_id);

            await supabase.from("messages").insert({
              conversation_id: selectedConvId,
              sender_id: user.id,
              message_type: "Contract Form",
              message_text: msgText,
            });

            setCounterModal(null);
            loadProposals(selectedConvId);
          }}
        />
      )}
    </div>
  );
}

// ── New Contract Confirmation Modal ──
function NewContractModal({
  supplierName,
  supplierId,
  conversationId,
  latestProposal,
  onClose,
  onCreated,
}) {
  const { user } = useAuth();
  const [contractId, setContractId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const price = latestProposal?.proposed_price_per_kg ? Number(latestProposal.proposed_price_per_kg).toFixed(2) : "38.50";
  const volume = latestProposal?.proposed_volume_tons ? Number(latestProposal.proposed_volume_tons) : 25;

  // Due Date: today + 1 month + 1 day (per REQ business rule #3: activation_date + 1 month + 1 day)
  const dueDateObj = new Date();
  dueDateObj.setMonth(dueDateObj.getMonth() + 1);
  dueDateObj.setDate(dueDateObj.getDate() + 1);

  const formattedDueDate = dueDateObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dueDateIso = dueDateObj.toISOString().split("T")[0];

  useEffect(() => {
    async function initContractId() {
      try {
        const { data: numData } = await supabase.rpc("generate_contract_number");
        if (numData) {
          setContractId(numData);
          return;
        }
      } catch {
        /* fallback */
      }
      const randNum = Math.floor(1000 + Math.random() * 9000);
      setContractId(`CT-2026-${randNum}`);
    }
    initContractId();
  }, []);

  async function handleSendContract() {
    setSubmitting(true);
    setError("");

    const { data: newContract, error: err } = await supabase
      .from("contracts")
      .insert({
        contract_number: contractId,
        supplier_id: supplierId,
        business_owner_id: user.id,
        negotiated_price_per_kg: parseFloat(price),
        contracted_tons: parseFloat(volume),
        signing_date: new Date().toISOString().split("T")[0],
        due_date: dueDateIso,
        status: "Pending",
      })
      .select("contract_id")
      .single();

    if (err) {
      setError("Failed to create contract. Please try again.");
      setSubmitting(false);
      return;
    }

    if (newContract) {
      await supabase
        .from("conversations")
        .update({ contract_id: newContract.contract_id })
        .eq("conversation_id", conversationId);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        message_type: "Contract Form",
        message_text: `📄 Contract ${contractId} has been created and sent to ${supplierName}.`,
      });

      onCreated();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#FAF7F2] border border-[#EAE3D2] rounded-[32px] shadow-2xl w-full max-w-xl p-7 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#A2D5AB] text-[#024023] flex items-center justify-center shadow-xs">
            <LuFileText className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-extrabold text-[#3E2723]">New Contract</h3>
        </div>

        <div className="border-b border-[#E8DCC8] my-4" />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2.5 mb-4">
            {error}
          </div>
        )}

        {/* Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {/* Supplier */}
          <div>
            <label className="block text-xs font-bold text-[#3E2723] mb-1.5">Supplier</label>
            <input
              type="text"
              readOnly
              value={supplierName}
              className="w-full px-4 py-2.5 rounded-full border border-[#BCAAA4] bg-white text-[#8D6E63] text-xs font-semibold focus:outline-none cursor-not-allowed"
            />
          </div>

          {/* Contract ID */}
          <div>
            <label className="block text-xs font-bold text-[#3E2723] mb-1.5">Contract ID</label>
            <input
              type="text"
              readOnly
              value={contractId || "Loading…"}
              className="w-full px-4 py-2.5 rounded-full border border-[#BCAAA4] bg-white text-[#8D6E63] text-xs font-semibold focus:outline-none cursor-not-allowed"
            />
          </div>

          {/* Negotiated Price */}
          <div>
            <label className="block text-xs font-bold text-[#3E2723] mb-1.5">Negotiated Price (₱/kg)</label>
            <input
              type="text"
              readOnly
              value={`₱  ${price}`}
              className="w-full px-4 py-2.5 rounded-full border border-[#BCAAA4] bg-white text-[#3E2723] text-xs font-bold focus:outline-none cursor-not-allowed"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-[#3E2723] mb-1.5">Quantity (Tons)</label>
            <input
              type="text"
              readOnly
              value={volume}
              className="w-full px-4 py-2.5 rounded-full border border-[#BCAAA4] bg-white text-[#3E2723] text-xs font-bold focus:outline-none cursor-not-allowed"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-bold text-[#3E2723] mb-1.5">Due Date</label>
            <input
              type="text"
              readOnly
              value={formattedDueDate}
              className="w-full px-4 py-2.5 rounded-full border border-[#BCAAA4] bg-white text-[#8D6E63] text-xs font-semibold focus:outline-none cursor-not-allowed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-6 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-white border border-[#E8DCC8] text-brown-dark font-bold text-xs shadow-xs hover:bg-[#FDF7E7] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSendContract}
            disabled={submitting || !contractId}
            className="px-6 py-2.5 rounded-2xl bg-[#1E5622] hover:bg-[#143B17] text-white font-bold text-xs shadow-md transition-all disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send Contract"}
          </button>
        </div>
      </div>
    </div>
  );
}

function targetPrice(p) {
  if (!p) return 38.5;
  return p.proposed_price_per_kg;
}

function formatLastMessageTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
