import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LuSearch, LuSend, LuCoins, LuCheck, LuX, LuPencil,
  LuClock, LuFileText, LuStar, LuLoader, LuPaperclip,
  LuCheckCheck, LuCircleAlert,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";

function initials(first, last) {
  return [(first ?? "")[0], (last ?? "")[0]].filter(Boolean).join("").toUpperCase() || "?";
}

function fmtTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d;
  if (diff < 60_000)   return "Just now";
  if (diff < 3_600_000) return new Date(dateStr).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  if (diff < 86_400_000) return new Date(dateStr).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  if (diff < 7 * 86_400_000) return days[d.getDay()];
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// ── Contract card (shown inside the chat message stream) ──────────────────────
function ContractCard({ contractData, onTapPreview, signed }) {
  const hasDoc = !!contractData.document_path;
  return (
    <div className="flex justify-end my-2 px-4">
      <div
        className={`text-white rounded-2xl rounded-br-sm p-4 w-72 shadow-md ${signed ? "bg-[#1f4a1a]" : "bg-[#2d5a27]"} ${hasDoc ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
        onClick={() => hasDoc && onTapPreview?.(contractData.document_path)}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <LuFileText className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-sm">{contractData.contract_number}</p>
            <p className="text-white/70 text-xs">
              {signed ? "Signed & Active" : "Awaiting supplier signature"}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-white/70">Price/kg</span>
            <span className="font-semibold">{peso(contractData.price_per_kg)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/70">Volume</span>
            <span className="font-bold">{contractData.contracted_tons} tons</span>
          </div>
          {contractData.due_date && (
            <div className="flex justify-between">
              <span className="text-white/70">Due Date</span>
              <span className="font-semibold">{fmtDate(contractData.due_date)}</span>
            </div>
          )}
        </div>
        {hasDoc && (
          <p className="text-white/70 text-[10px] text-center mt-3 underline">
            Tap to review document
          </p>
        )}
      </div>
    </div>
  );
}

// ── Proposal card (inline in chat) ───────────────────────────────────────────
function ProposalCard({ proposal, submittedByMe, onAccept, onReject, onCounter }) {
  return (
    <div className="flex justify-center my-3 px-4">
      <div className="bg-white border-2 border-[#2d5a27]/20 rounded-2xl p-4 w-full max-w-xs shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <LuCoins className="w-4 h-4 text-[#2d5a27]" />
          <p className="text-sm font-bold text-[#2d5a27]">
            {submittedByMe ? "Your Counteroffer" : "Incoming Proposal"}
          </p>
          <span className="ml-auto text-xs bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <LuClock className="w-3 h-3" /> Pending
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-[#f5f0e8] rounded-xl px-3 py-2">
            <p className="text-xs text-[#8b7355]">Price per kg</p>
            <p className="font-bold text-[#3d2b1f]">₱{Number(proposal.proposed_price_per_kg).toFixed(2)}</p>
          </div>
          <div className="bg-[#f5f0e8] rounded-xl px-3 py-2">
            <p className="text-xs text-[#8b7355]">Volume</p>
            <p className="font-bold text-[#3d2b1f]">{proposal.proposed_volume_tons} tons</p>
          </div>
        </div>
        {submittedByMe ? (
          <div className="text-center py-2 text-xs text-[#b09a7a] italic">
            Awaiting supplier's response…
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onAccept} disabled={!onAccept}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#e8f0e5] text-[#2d5a27] font-semibold text-xs py-2 rounded-xl hover:bg-[#d4e5cf] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <LuCheck className="w-3.5 h-3.5" /> Accept
            </button>
            <button onClick={onCounter} disabled={!onCounter}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#f5f0e8] text-[#5c4a32] font-semibold text-xs py-2 rounded-xl hover:bg-[#ebe5d5] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <LuPencil className="w-3.5 h-3.5" /> Counter
            </button>
            <button onClick={onReject} disabled={!onReject}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-red-600 font-semibold text-xs py-2 rounded-xl hover:bg-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <LuX className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BOChatLayout() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Left panel
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [convLoading, setConvLoading] = useState(true);

  // Middle panel
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [counterModal, setCounterModal] = useState(null);
  const bottomRef = useRef(null);
  const isInitialLoad = useRef(false);

  // Right panel
  const [supplierData, setSupplierData] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [contractError, setContractError] = useState(null);
  const [proposalActing, setProposalActing] = useState(false); // prevent double-click
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Left panel: load conversations ────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select(`
        conversation_id, status, created_at,
        supplier:supplier_id(user_id, first_name, last_name, address),
        messages(message_text, sent_at, sender_id)
      `)
      .order("created_at", { ascending: false });

    const enriched = (data ?? []).map(c => {
      const sorted = [...(c.messages ?? [])].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      const lastMsg = sorted[0] ?? null;
      const unread = sorted.filter(m => m.sender_id !== user.id).length > 0 &&
        lastMsg?.sender_id !== user.id;
      return { ...c, lastMsg, unread };
    });
    setConversations(enriched);
    setConvLoading(false);
  }, [user.id]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Middle panel: load chat on conversationId change ──────────────────────
  const loadChat = useCallback(async (convId) => {
    setChatLoading(true);
    setMessages([]);
    setProposals([]);
    setCurrentConv(null);
    setSupplierData(null);
    setContracts([]);

    const [{ data: conv }, { data: msgs }, { data: props }] = await Promise.all([
      supabase.from("conversations")
        .select("*, supplier:supplier_id(user_id, first_name, last_name, address, email, account_status), business_owner:business_owner_id(user_id, first_name, last_name)")
        .eq("conversation_id", convId).single(),
      supabase.from("messages").select("*").eq("conversation_id", convId).order("sent_at", { ascending: true }),
      supabase.from("proposal_forms").select("*").eq("conversation_id", convId).order("submitted_at", { ascending: true }),
    ]);

    setCurrentConv(conv);
    setMessages(msgs ?? []);
    setProposals(props ?? []);

    if (conv?.supplier) {
      // Load supplier rating
      const { data: ratingData } = await supabase
        .from("supplier_performance_snapshots")
        .select("overall_supplier_rating")
        .eq("supplier_id", conv.supplier.user_id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      setSupplierData({ ...conv.supplier, rating: ratingData?.overall_supplier_rating ?? null });

      // Load contracts for this conversation
      const { data: contractData } = await supabase
        .from("contracts")
        .select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, contract_hash, contract_document_url")
        .eq("supplier_id", conv.supplier.user_id)
        .eq("business_owner_id", conv.business_owner_id ?? user.id)
        .order("created_at", { ascending: false });

      setContracts(contractData ?? []);
    }

    setChatLoading(false);
    isInitialLoad.current = true;
  }, [user.id]);

  useEffect(() => {
    if (conversationId) loadChat(conversationId);
  }, [conversationId, loadChat]);

  // ── Realtime subscription for selected chat ───────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`bo-chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        payload => setMessages(prev => [...prev, payload.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" },
        () => loadChat(conversationId))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [conversationId, loadChat]);

  // Auto-scroll to bottom — instant on initial load, smooth for live messages
  useEffect(() => {
    if (!bottomRef.current) return;
    if (isInitialLoad.current) {
      // Use a small timeout so the DOM finishes rendering before scrolling
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
        isInitialLoad.current = false;
      }, 50);
    } else {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ── Latest pending proposal logic ─────────────────────────────────────────
  const latestProposalIndex = [...proposals]
    .map((p, i) => ({ p, i })).reverse()
    .find(({ p }) => p.proposal_status !== "Rejected" && p.proposal_status !== "Modified" && p.proposal_status !== "Accepted")?.i ?? -1;
  const latestProposal = latestProposalIndex >= 0 ? proposals[latestProposalIndex] : null;
  // odd index = BO's counter (submitted by BO), even = supplier's proposal
  const latestSubmittedByBO = latestProposalIndex % 2 === 1;

  // ── Latest accepted proposal (for negotiation summary) ────────────────────
  const acceptedProposal = [...proposals].reverse().find(p => p.proposal_status === "Accepted") ?? null;

  // ── Pending contract (no PDF generated yet) vs. Sent (PDF generated, awaiting supplier) ─
  const pendingContract = contracts.find(c => c.status === "Pending" && !c.contract_hash) ?? null;
  const sentContract    = contracts.find(c => c.status === "Pending" && c.contract_hash) ?? null;

  // ── Chat actions ──────────────────────────────────────────────────────────
  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: "Text",
      message_text: text.trim(),
    });
    setText("");
    setSending(false);
  }

  async function acceptProposal(proposal) {
    if (proposalActing) return;
    setProposalActing(true);
    await supabase.from("proposal_forms").update({ proposal_status: "Accepted", reviewed_by: user.id }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form",
      message_text: `You accepted ${currentConv?.supplier?.first_name}'s proposal form.\nPrice: ₱${proposal.proposed_price_per_kg}/kg  Volume: ${proposal.proposed_volume_tons} tons`,
    });
    await supabase.from("notifications").insert({
      user_id: currentConv?.supplier?.user_id, notification_type: "Contract Signed",
      message: `Your proposal (₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons) was accepted. Your contract is being generated — check the chat to review and sign.`,
      related_entity_type: "proposal_forms", related_entity_id: proposal.proposal_id,
    });
    await createAndSendContract(proposal);
    await loadChat(conversationId);
    setProposalActing(false);
  }

  async function rejectProposal(proposal) {
    if (proposalActing) return;
    setProposalActing(true);
    await supabase.from("proposal_forms").update({ proposal_status: "Rejected", reviewed_by: user.id }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text",
      message_text: `❌ Proposal declined: ₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons.`,
    });
    await supabase.from("notifications").insert({
      user_id: currentConv?.supplier?.user_id, notification_type: "Proposal Rejected",
      message: `Your proposal (₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons) was declined.`,
      related_entity_type: "proposal_forms", related_entity_id: proposal.proposal_id,
    });
    await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
    setProposalActing(false);
  }

  // Creates the contract row then immediately generates + sends the contract PDF in chat.
  async function createAndSendContract(proposal) {
    setContractError(null);

    // 1. Create contract row
    const { data: numData } = await supabase.rpc("generate_contract_number");
    const { data: contract, error: insertErr } = await supabase.from("contracts").insert({
      contract_number: numData,
      supplier_id: currentConv.supplier.user_id,
      business_owner_id: currentConv.business_owner_id ?? user.id,
      negotiated_price_per_kg: proposal.proposed_price_per_kg,
      contracted_tons: proposal.proposed_volume_tons,
      signing_date: new Date().toISOString().split("T")[0],
      status: "Pending",
    }).select("contract_id, contract_number, negotiated_price_per_kg, contracted_tons, due_date").single();

    if (insertErr || !contract) {
      setContractError("Contract record creation failed. Please refresh and try again.");
      return;
    }

    await supabase.from("conversations").update({ contract_id: contract.contract_id }).eq("conversation_id", conversationId);

    // 2. Call generate-contract to hash + render the PDF
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setContractError("Session expired. Please log in again."); return; }

    const tokenVal = session.access_token;
    const genRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenVal },
      body: JSON.stringify({ contract_id: contract.contract_id }),
    });

    const genData = await genRes.json();

    if (!genRes.ok) {
      setContractError(`Contract created but PDF generation failed: ${genData.error ?? "unknown error"}`);
      return;
    }

    // 3. Post contract card into chat so the supplier can see and sign
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: "Contract Form",
      message_text: `CONTRACT_CARD:${JSON.stringify({
        contract_id:     contract.contract_id,
        contract_number: contract.contract_number,
        price_per_kg:    contract.negotiated_price_per_kg,
        contracted_tons: contract.contracted_tons,
        due_date:        contract.due_date,
        document_path:   genData.contract_document_path,
      })}`,
    });

    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text",
      message_text: "The contract has been generated. Please review and sign when you're ready.",
    });

    showToast("Contract generated and sent to supplier for signing.");
  }


  // ── Filtered conversations list ────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    const name = `${c.supplier?.first_name ?? ""} ${c.supplier?.last_name ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-88px)] rounded-2xl overflow-hidden shadow-sm border border-[#e8e0d0]">

      {/* ── LEFT PANEL — Conversations list ──────────────────────────────── */}
      <div className="w-[280px] shrink-0 bg-white flex flex-col border-r border-[#e8e0d0]">
        {/* Search */}
        <div className="px-4 pt-4 pb-3 border-b border-[#f0e8d8]">
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b09a7a]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full bg-[#f5f0e8] border-0 text-sm text-[#3d2b1f] placeholder-[#b09a7a] focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/20"
            />
          </div>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-[#b09a7a] text-sm">No conversations yet</p>
            </div>
          ) : (
            filtered.map(c => {
              const isActive = c.conversation_id === conversationId;
              const ini = initials(c.supplier?.first_name, c.supplier?.last_name);
              return (
                <button key={c.conversation_id}
                  onClick={() => navigate(`/dashboard/owner/conversations/${c.conversation_id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 relative
                    ${isActive ? "bg-[#f0ebe0] border-l-4 border-[#2d5a27]" : "hover:bg-[#faf7f2] border-l-4 border-transparent"}`}>
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${isActive ? "bg-[#2d5a27]" : "bg-[#4a7c40]"}`}>
                    {ini}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-semibold text-[#3d2b1f] text-sm truncate">
                        {c.supplier?.first_name} {c.supplier?.last_name}
                      </p>
                      <span className="text-[10px] text-[#b09a7a] shrink-0">{fmtTime(c.lastMsg?.sent_at ?? c.created_at)}</span>
                    </div>
                    {c.supplier?.address && (
                      <p className="text-[#b09a7a] text-[11px] truncate">{c.supplier.address.split(",")[0]}</p>
                    )}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className="text-[#8b7355] text-xs truncate">{c.lastMsg?.message_text?.replace(/^CONTRACT_CARD:.*/, "Contract sent") ?? "No messages yet"}</p>
                      {c.unread && (
                        <span className="w-4 h-4 rounded-full bg-[#2d5a27] text-white text-[9px] font-bold flex items-center justify-center shrink-0">!</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── MIDDLE PANEL — Chat ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[#faf7f4] min-w-0">
        {!conversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 bg-[#e8f0e5] rounded-2xl flex items-center justify-center mb-4">
              <LuFileText className="w-8 h-8 text-[#2d5a27]" />
            </div>
            <p className="text-[#3d2b1f] font-bold text-lg mb-1">Select a conversation</p>
            <p className="text-[#8b7355] text-sm">Choose a supplier from the list to start reviewing their proposals.</p>
          </div>
        ) : chatLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-[#e8e0d0] shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#2d5a27] flex items-center justify-center text-white font-bold text-sm">
                {initials(currentConv?.supplier?.first_name, currentConv?.supplier?.last_name)}
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#3d2b1f]">
                  {currentConv?.supplier?.first_name} {currentConv?.supplier?.last_name}
                </p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  <p className="text-[#8b7355] text-xs">
                    {currentConv?.status === "Open" ? "Active negotiation" : "Closed"}
                    {currentConv?.supplier?.email && <span className="ml-2">· {currentConv.supplier.email}</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-4 space-y-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center text-[#b09a7a] text-sm px-4">
                  <p>No messages yet. Waiting for the supplier to start.</p>
                </div>
              )}
              {messages.map(msg => {
                const isMine = msg.sender_id === user.id;

                // Contract card message
                if (msg.message_type === "Contract Form" && msg.message_text?.startsWith("CONTRACT_CARD:")) {
                  try {
                    const cardData = JSON.parse(msg.message_text.replace("CONTRACT_CARD:", ""));
                    const contractRow = contracts.find(c => c.contract_number === cardData.contract_number);
                    const isSigned = contractRow?.status === "Active" || contractRow?.status === "Completed" || contractRow?.status === "Breached";
                    return (
                      <ContractCard
                        key={msg.message_id}
                        contractData={cardData}
                        signed={isSigned}
                        onTapPreview={async (docPath) => {
                          if (!docPath) return;
                          const { data } = await supabase.storage.from("contracts").createSignedUrl(docPath, 60 * 15);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                        }}
                      />
                    );
                  } catch { /* fall through to system message */ }
                }

                // System / proposal-accepted message
                if (msg.message_type === "Contract Form") {
                  return (
                    <div key={msg.message_id} className="flex justify-center px-4">
                      <p className="text-[#2d5a27] text-xs italic text-center max-w-xs">{msg.message_text}</p>
                    </div>
                  );
                }

                // Regular chat bubble
                return (
                  <div key={msg.message_id} className={`flex px-4 ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[65%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMine
                        ? "bg-[#2d5a27] text-white rounded-br-sm"
                        : "bg-white text-[#3d2b1f] rounded-bl-sm shadow-sm border border-[#e8e0d0]"
                    }`}>
                      {msg.message_text}
                      <p className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isMine ? "text-white/60" : "text-[#b09a7a]"}`}>
                        {new Date(msg.sent_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                        {isMine && <LuCheckCheck className="w-3 h-3" />}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Pending proposal card */}
              {latestProposal && latestProposal.proposal_status === "Pending" && (
                <ProposalCard
                  proposal={latestProposal}
                  submittedByBO={latestSubmittedByBO}
                  submittedByMe={latestSubmittedByBO}
                  onAccept={proposalActing ? null : () => acceptProposal(latestProposal)}
                  onReject={proposalActing ? null : () => rejectProposal(latestProposal)}
                  onCounter={proposalActing ? null : () => setCounterModal(latestProposal)}
                />
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick action chips */}
            {currentConv?.status === "Open" && (
              <div className="flex gap-2 px-4 py-2 bg-white border-t border-[#f0e8d8] shrink-0">
                {sentContract?.contract_document_url && sentContract.status === "Pending" && (
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from("contracts").createSignedUrl(sentContract.contract_document_url, 60 * 15);
                    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                  }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-all">
                    <LuFileText className="w-3.5 h-3.5" /> View Contract Document
                  </button>
                )}
                <button onClick={() => setCounterModal(latestProposal ?? null)}
                  disabled={!latestProposal || latestProposal.proposal_status !== "Pending" || latestSubmittedByBO}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f5f0e8] text-[#5c4a32] font-semibold text-xs hover:bg-[#ebe5d5] transition-all disabled:opacity-40">
                  <LuCoins className="w-3.5 h-3.5" /> Propose Price
                </button>
              </div>
            )}

            {/* Error banner */}
            {contractError && (
              <div className="mx-4 mb-2 flex items-center gap-2 bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-xl">
                <LuCircleAlert className="w-4 h-4 shrink-0" />
                {contractError}
                <button onClick={() => setContractError(null)} className="ml-auto"><LuX className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Message input */}
            {currentConv?.status === "Open" && (
              <form onSubmit={sendMessage} className="flex items-center gap-3 px-4 py-3 bg-white border-t border-[#e8e0d0] shrink-0">
                <button type="button" className="text-[#b09a7a] hover:text-[#8b7355] transition-colors">
                  <LuPaperclip className="w-5 h-5" />
                </button>
                <input
                  type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder={`Message ${currentConv?.supplier?.first_name ?? ""}…`}
                  className="flex-1 px-4 py-2.5 rounded-full bg-[#f5f0e8] text-sm text-[#3d2b1f] placeholder-[#b09a7a] focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/20 border-0"
                />
                <button type="submit" disabled={!text.trim() || sending}
                  className="w-9 h-9 rounded-full bg-[#2d5a27] text-white flex items-center justify-center hover:bg-[#234820] transition-all disabled:opacity-50">
                  <LuSend className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT PANEL — Supplier info ───────────────────────────────────── */}
      <div className="w-[200px] shrink-0 bg-white border-l border-[#e8e0d0] flex flex-col overflow-y-auto">
        {!conversationId || !supplierData ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c5b9a8] text-xs text-center px-4">Select a conversation to see supplier details</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Avatar + name + location */}
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-14 h-14 rounded-full bg-[#2d5a27] flex items-center justify-center text-white font-bold text-lg mb-2">
                {initials(supplierData.first_name, supplierData.last_name)}
              </div>
              <p className="font-bold text-[#3d2b1f] text-sm">{supplierData.first_name} {supplierData.last_name}</p>
              {supplierData.address && (
                <p className="text-[#8b7355] text-[11px] mt-0.5 leading-tight">
                  {supplierData.address.split(",").slice(0, 2).join(",")}
                </p>
              )}
              {supplierData.rating !== null && (
                <div className="flex items-center gap-1 mt-1.5">
                  <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-semibold text-[#3d2b1f]">{Number(supplierData.rating).toFixed(1)}</span>
                </div>
              )}
            </div>

            {sentContract?.contract_document_url && sentContract.status === "Pending" && (
              <button onClick={async () => {
                const { data } = await supabase.storage.from("contracts").createSignedUrl(sentContract.contract_document_url, 60 * 15);
                if (data?.signedUrl) window.open(data.signedUrl, "_blank");
              }}
                className="block w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm text-center hover:bg-blue-700 transition-all">
                View Contract Document
              </button>
            )}
            {sentContract?.status === "Pending" && (
              <div className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-center">
                Awaiting supplier signature…
              </div>
            )}

            {/* Negotiation summary */}
            <div>
              <p className="text-[10px] font-bold text-[#b09a7a] uppercase tracking-wider mb-2">Negotiation Summary</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b7355]">Proposed volume</span>
                  <span className="font-semibold text-[#3d2b1f]">
                    {acceptedProposal ? `${acceptedProposal.proposed_volume_tons} tons` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b7355]">Agreed price</span>
                  <span className="font-semibold text-[#3d2b1f]">
                    {acceptedProposal ? `₱${Number(acceptedProposal.proposed_price_per_kg).toFixed(2)}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b7355]">Contracts sent</span>
                  <span className="font-semibold text-[#3d2b1f]">{contracts.length}</span>
                </div>
              </div>
            </div>

            {/* Signed contracts */}
            <div>
              <p className="text-[10px] font-bold text-[#b09a7a] uppercase tracking-wider mb-2">Signed Contracts</p>
              {contracts.filter(c => c.status !== "Pending" || c.contract_hash).length === 0 ? (
                <div className="bg-[#f5f0e8] rounded-xl p-3 text-[11px] text-[#8b7355] leading-relaxed">
                  No contracts yet. Agree on price and volume, then send one.
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.map(c => (
                    <div key={c.contract_id} className="bg-[#f5f0e8] rounded-xl p-2.5">
                      <p className="font-semibold text-[#3d2b1f] text-[11px]">{c.contract_number}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          c.status === "Active" ? "bg-[#e8f0e5] text-[#2d5a27]" :
                          c.status === "Completed" ? "bg-emerald-50 text-emerald-700" :
                          c.status === "Breached" ? "bg-red-50 text-red-600" :
                          "bg-amber-50 text-amber-700"
                        }`}>{c.status}</span>
                        {c.contract_document_url && (
                          <button onClick={async () => {
                            const { data } = await supabase.storage.from("contracts").createSignedUrl(c.contract_document_url, 60 * 15);
                            if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                          }}
                            className="text-[10px] text-blue-600 hover:underline">View</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-semibold
          ${toast.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-[#e8f0e5] border border-[#2d5a27]/30 text-[#2d5a27]"}`}>
          {toast.type !== "error" && <LuCheck className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Counteroffer modal */}
      {counterModal !== undefined && counterModal !== null && currentConv && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={currentConv.supplier?.user_id}
          isCounter
          supersedesId={counterModal?.proposal_id}
          onClose={() => setCounterModal(null)}
          onSubmitted={async (msg) => {
            if (counterModal) {
              await supabase.from("proposal_forms").update({ proposal_status: "Modified", reviewed_by: user.id }).eq("proposal_id", counterModal.proposal_id);
            }
            await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form", message_text: msg });
            // Notify supplier
            await supabase.from("notifications").insert({
              user_id: currentConv.supplier?.user_id, notification_type: "Counteroffer",
              message: "NERC Copra Trading sent a counteroffer. Review it in the chat.",
              related_entity_type: "conversations", related_entity_id: conversationId,
            });
            setCounterModal(null);
            await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
          }}
        />
      )}
    </div>
  );
}
