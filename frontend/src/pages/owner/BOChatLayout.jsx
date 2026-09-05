import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  LuSearch, LuSend, LuCoins, LuCheck, LuX, LuPencil,
  LuClock, LuFileText, LuStar, LuLoader,
  LuCheckCheck, LuCircleAlert,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";
import ContractDocumentModal from "../../components/ContractDocumentModal";
import { usePersistentProposalModal } from "../../hooks/usePersistentProposalModal";
import { formatMessageText } from "../../utils/formatMessageText";

const BO_QUICK_ACTIONS = [
  ["Ask Proposal", "I would like to buy some copras. Have you harvested some?"],
  ["Ask Availability", "How many tons of copra are currently available?"],
  ["Confirm Delivery", "When would you be available to deliver the agreed volume?"],
];

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

// Dynamic chat date/time separator label (Messenger-style)
function fmtMsgDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((todayStart - msgDayStart) / 86_400_000);
  const time = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return time;                                                         // "11:12 PM"
  if (diffDays < 7)  return `${d.toLocaleDateString("en-PH", { weekday: "short" })} ${time}`; // "Fri 11:12 PM"
  return `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}, ${time}`; // "Aug 10, 2026, 9:18 PM"
}

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// ── Contract card (shown inside the chat message stream) ──────────────────────
function ContractCard({ contractData, onTapPreview, signed }) {
  const hasDoc = !!contractData.document_path;
  return (
    <div className="flex justify-center my-3 px-3 sm:justify-end sm:px-5">
      <div
        className={`w-full max-w-[320px] rounded-[18px] rounded-br-sm p-4 text-white shadow-md ${signed ? "bg-[#1f4a1a]" : "bg-[#2d5a27]"} ${hasDoc ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
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
    <div className="flex justify-center my-4 px-3 sm:px-5">
      <div className="w-full max-w-sm rounded-[18px] border border-[#AFCDB2] bg-[#FFFEFB] p-4 shadow-[0_2px_6px_rgba(76,58,42,0.10)]">
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
  const {
    modalState: proposalModalState,
    openCounter,
    clearModal: clearProposalModal,
  } = usePersistentProposalModal({
    storageKey: `coptrax:proposal-modal:bo-chat:${user?.id ?? "anonymous"}`,
    conversationId,
  });
  const counterModal = proposalModalState?.type === "counter"
    ? proposalModalState.proposal
    : null;
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const currentConvRef = useRef(null); // stable ref so realtime callbacks don't go stale

  function isNearBottom() {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  function scrollToBottom(behavior = "smooth") {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }

  // Right panel
  const [supplierData, setSupplierData] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [viewContract, setViewContract] = useState(null);
  const [contractError, setContractError] = useState(null);
  const [proposalActing, setProposalActing] = useState(false);
  const [toast, setToast] = useState(null);
  const [onlineSupplierIds, setOnlineSupplierIds] = useState(() => new Set());
  const [profileOpen, setProfileOpen] = useState(false);

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

    const conversationIds = (data ?? []).map(c => c.conversation_id);
    const { data: proposalActivity } = conversationIds.length
      ? await supabase
          .from("proposal_forms")
          .select("conversation_id, submitted_at")
          .in("conversation_id", conversationIds)
          .order("submitted_at", { ascending: false })
      : { data: [] };
    const latestProposalByConversation = new Map();
    (proposalActivity ?? []).forEach((proposal) => {
      if (!latestProposalByConversation.has(proposal.conversation_id)) {
        latestProposalByConversation.set(proposal.conversation_id, proposal);
      }
    });

    const enriched = (data ?? []).filter(c =>
      (c.messages?.length ?? 0) > 0 || latestProposalByConversation.has(c.conversation_id)
    ).map(c => {
      const sorted = [...(c.messages ?? [])].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      const proposal = latestProposalByConversation.get(c.conversation_id);
      const latestMessage = sorted[0] ?? null;
      const lastMsg = proposal && (!latestMessage || new Date(proposal.submitted_at) > new Date(latestMessage.sent_at))
        ? { message_text: "Price proposal received", sent_at: proposal.submitted_at, sender_id: c.supplier?.user_id }
        : latestMessage;
      const unread = sorted.filter(m => m.sender_id !== user.id).length > 0 &&
        lastMsg?.sender_id !== user.id;
      return { ...c, lastMsg, unread };
    });
    setConversations(enriched);
    setConvLoading(false);
  }, [user.id]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    const listChannel = supabase
      .channel(`bo-conversation-list:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, fetchConversations)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "proposal_forms" }, (payload) => {
        fetchConversations();
        // If a Supplier submitted a new proposal, call ai-negotiate. The Edge Function
        // checks the global ai_auto_negotiate_global flag server-side and skips if off.
        const newProp = payload.new;
        if (newProp?.proposal_id && newProp?.submitted_by && newProp.submitted_by !== user.id) {
          supabase.functions.invoke("ai-negotiate", { body: { proposal_id: newProp.proposal_id } });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(listChannel);
  }, [fetchConversations, user.id]);

  useEffect(() => {
    const channel = supabase.channel("online-suppliers");
    const syncPresence = () => {
      setOnlineSupplierIds(new Set(Object.keys(channel.presenceState())));
    };
    channel.on("presence", { event: "sync" }, syncPresence).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

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
        .from("supplier_performance_snapshot")
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
  }, [user.id]);

  useEffect(() => {
    if (conversationId) loadChat(conversationId);
  }, [conversationId, loadChat]);

  // Keep a stable ref to currentConv so realtime callbacks can read it without stale closure
  useEffect(() => { currentConvRef.current = currentConv; }, [currentConv]);

  // ── Realtime subscription for selected chat ───────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`bo-chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        payload => {
          const m = payload.new;
          if (!m || m.conversation_id !== conversationId) return; // belt-and-suspenders guard
          setMessages(prev =>
            prev.some(x => x.message_id === m.message_id) ? prev : [...prev, m]);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" },
        async () => {
          // Refetch contracts only — do NOT call loadChat (it clears all messages)
          const conv = currentConvRef.current;
          if (!conv?.supplier?.user_id) return;
          const { data } = await supabase
            .from("contracts")
            .select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, contract_hash, contract_document_url")
            .eq("supplier_id", conv.supplier.user_id)
            .eq("business_owner_id", conv.business_owner_id ?? user.id)
            .order("created_at", { ascending: false });
          setContracts(data ?? []);
        })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [conversationId, user.id]);

  // Scroll to bottom when initial load completes (covers conversation open & switch)
  useEffect(() => {
    if (chatLoading) return;
    // Double-rAF: gives the chat panel time to finish rendering before scrolling
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
    // Fallback: on mobile the panel may still be transitioning — scroll again after a short delay
    const tid = setTimeout(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 150);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(tid);
    };
  }, [chatLoading]);

  // Follow new realtime messages only if user is already near the bottom
  useEffect(() => {
    if (chatLoading) return; // initial load handled above
    if (!isNearBottom()) return; // user intentionally scrolled up — don't interrupt
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Latest pending proposal logic ─────────────────────────────────────────
  const latestProposalIndex = [...proposals]
    .map((p, i) => ({ p, i })).reverse()
    .find(({ p }) => p.proposal_status !== "Rejected" && p.proposal_status !== "Modified" && p.proposal_status !== "Accepted")?.i ?? -1;
  const latestProposal = latestProposalIndex >= 0 ? proposals[latestProposalIndex] : null;
  // Use submitted_by if available (migration 025+); fall back to index parity for legacy rows.
  const latestSubmittedByBO = latestProposal
    ? (latestProposal.submitted_by != null
        ? latestProposal.submitted_by === user.id
        : latestProposalIndex % 2 === 1)
    : false;

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
    const { data: newMsg } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: "Text",
      message_text: text.trim(),
    }).select().single();
    if (newMsg) {
      setMessages(prev => prev.some(m => m.message_id === newMsg.message_id) ? prev : [...prev, newMsg]);
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
    setText("");
    setSending(false);
  }

  async function acceptProposal(proposal) {
    if (proposalActing) return;
    setProposalActing(true);
    // Immediately hide the proposal card so the BO isn't left with a stale open card
    setProposals(prev => prev.map(p =>
      p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Accepted" } : p));

    // Persist Accepted status — check for errors so a DB failure is visible
    const { error: acceptErr } = await supabase.from("proposal_forms")
      .update({ proposal_status: "Accepted", reviewed_by: user.id })
      .eq("proposal_id", proposal.proposal_id);
    if (acceptErr) {
      console.error("acceptProposal: failed to update proposal status:", acceptErr);
      setProposals(prev => prev.map(p =>
        p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Pending" } : p));
      setContractError(`Failed to accept proposal: ${acceptErr.message}`);
      setProposalActing(false);
      return;
    }

    // Mark every other Pending proposal in this conversation as Modified immediately,
    // so no stale action card can appear on either side while contract is being generated.
    await supabase.from("proposal_forms")
      .update({ proposal_status: "Modified" })
      .eq("conversation_id", conversationId)
      .eq("proposal_status", "Pending")
      .neq("proposal_id", proposal.proposal_id);

    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form",
      message_text: `You accepted ${currentConv?.supplier?.first_name}'s proposal form.\nPrice: ₱${proposal.proposed_price_per_kg}/kg  Volume: ${proposal.proposed_volume_tons} tons`,
    });
    await supabase.from("notifications").insert({
      user_id: currentConv?.supplier?.user_id, notification_type: "Proposal Accepted",
      message: `Your proposal (₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons) was accepted. Your contract is being generated. Check the chat to review and sign.`,
      related_entity_type: "proposal_forms", related_entity_id: proposal.proposal_id,
    });
    await createAndSendContract(proposal);
    await loadChat(conversationId);
    setProposalActing(false);
  }

  async function rejectProposal(proposal) {
    if (proposalActing) return;
    setProposalActing(true);
    // Immediately hide the proposal card
    setProposals(prev => prev.map(p =>
      p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Rejected" } : p));
    await supabase.from("proposal_forms").update({ proposal_status: "Rejected", reviewed_by: user.id }).eq("proposal_id", proposal.proposal_id);
    // Rejection ends the negotiation — mark conversation Terminated
    await supabase.from("conversations").update({ status: "Terminated" }).eq("conversation_id", conversationId);
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
  const isSupplierOnline = Boolean(
    currentConv?.supplier?.user_id && onlineSupplierIds.has(currentConv.supplier.user_id),
  );

  return (
    <div className="-mx-3 -mb-5 sm:-mx-6 sm:-mb-6 flex flex-col gap-4 rounded-[22px] bg-[#FAF7EF] p-2 h-[calc(100dvh-76px)] overflow-hidden xl:mx-0 xl:mb-0 xl:h-[calc(100vh-104px)] xl:min-h-[620px] xl:flex-row">

      {/* ── LEFT PANEL — Conversations list ──────────────────────────────── */}
      <div className={`${conversationId ? "hidden xl:flex" : "flex"} h-[320px] w-full shrink-0 flex-col overflow-hidden rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-sm xl:h-full xl:w-[280px]`}>
        {/* Search */}
        <div className="border-b border-[#E7DCC9] px-4 pb-3 pt-4">
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b09a7a]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#E4D5BD] bg-[#F7F0E5] py-2 pl-9 pr-4 text-sm text-[#4E342E] placeholder-[#A18D82] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20"
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
                  className={`relative flex min-h-[84px] w-full items-center gap-3 border-b border-[#EEE4D4] px-4 py-3.5 text-left transition-colors duration-150
                    ${isActive ? "border-l-[3px] border-l-[#17682D] bg-[#E9DDC7]" : "border-l-[3px] border-l-transparent hover:bg-[#FAF5EA]"}`}>
                  {/* Avatar */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#35AB50] text-sm font-bold text-white">
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
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
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
      <div className={`${conversationId ? "flex" : "hidden xl:flex"} relative min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-sm`}>
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
            {/* Chat header — click to view supplier profile */}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex shrink-0 items-center gap-3 border-b border-[#E7DCC9] bg-[#FFFEFB] px-4 py-4 pr-24 sm:px-7 sm:pr-28 w-full text-left hover:bg-[#FAF7EF] transition-colors">
              <div className="relative shrink-0">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white ${isSupplierOnline ? "bg-[#35AB50]" : "bg-[#9CA3AF]"}`}>
                  {initials(currentConv?.supplier?.first_name, currentConv?.supplier?.last_name)}
                </div>
                <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#FFFEFB] ${isSupplierOnline ? "bg-[#22C55E]" : "bg-[#9CA3AF]"}`} />
              </div>
              <div className="flex-1">
                <p className="text-[17px] font-bold leading-tight text-[#5D4037]">
                  {currentConv?.supplier?.first_name} {currentConv?.supplier?.last_name}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-[#8b7355] text-xs">
                    {isSupplierOnline ? "Online" : "Offline"}
                    {currentConv?.supplier?.email && <span className="ml-2">· {currentConv.supplier.email}</span>}
                  </p>
                </div>
              </div>
            </button>

            {/* Messages */}
            <div ref={scrollContainerRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto bg-[#FFFEFB] px-0 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center text-[#b09a7a] text-sm px-4">
                  <p>No messages yet. Waiting for the supplier to start.</p>
                </div>
              )}
              {messages.map((msg, index) => {
                const isMine = msg.sender_id === user.id;
                const prevMsg = messages[index - 1];
                const showDateSep = !prevMsg ||
                  new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();

                // Determine message element (no key — Fragment carries it)
                let messageEl;

                if (msg.message_type === "Contract Form" && msg.message_text?.startsWith("CONTRACT_CARD:")) {
                  try {
                    const cardData = JSON.parse(msg.message_text.replace("CONTRACT_CARD:", ""));
                    const contractRow = contracts.find(c => c.contract_number === cardData.contract_number);
                    const isSigned = contractRow?.status === "Active" || contractRow?.status === "Completed" || contractRow?.status === "Breached";
                    messageEl = (
                      <ContractCard
                        contractData={cardData}
                        signed={isSigned}
                        onTapPreview={(docPath) => setViewContract({
                          contractId: contractRow?.contract_id ?? cardData.contract_id,
                          contractNumber: cardData.contract_number,
                          documentPath: contractRow?.contract_document_url ?? docPath,
                        })}
                      />
                    );
                  } catch { /* fall through */ }
                }

                if (!messageEl && msg.message_type === "Contract Form") {
                  messageEl = (
                    <div className="flex justify-center px-4">
                      <p className="text-[#2d5a27] text-xs italic text-center max-w-xs">{msg.message_text}</p>
                    </div>
                  );
                }

                if (!messageEl) {
                  messageEl = (
                    <div className={`flex px-3 sm:px-5 ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[65%] ${
                        isMine
                          ? "bg-[#2d5a27] text-white rounded-br-sm"
                          : "bg-white text-[#3d2b1f] rounded-bl-sm shadow-sm border border-[#e8e0d0]"
                      }`}>
                        {formatMessageText(msg.message_text)}
                        <p className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isMine ? "text-white/60" : "text-[#b09a7a]"}`}>
                          {new Date(msg.sent_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                          {isMine && <LuCheckCheck className="w-3 h-3" />}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <Fragment key={msg.message_id}>
                    {showDateSep && (
                      <div className="flex justify-center my-3 px-4">
                        <span className="text-[10px] text-[#b09a7a] bg-[#f5f0e8] px-3 py-1 rounded-full font-medium">
                          {fmtMsgDate(msg.sent_at)}
                        </span>
                      </div>
                    )}
                    {messageEl}
                  </Fragment>
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
                  onCounter={proposalActing ? null : () => openCounter(latestProposal)}
                />
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick action chips */}
            {currentConv?.status === "Open" && (
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-[#E7DCC9] bg-[#FFFEFB] px-4 py-2">
                {sentContract?.contract_document_url && sentContract.status === "Pending" && (
                  <button onClick={() => setViewContract({
                    contractId: sentContract.contract_id,
                    contractNumber: sentContract.contract_number,
                    documentPath: sentContract.contract_document_url,
                  })}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-all">
                    <LuFileText className="w-3.5 h-3.5" /> View Contract Document
                  </button>
                )}
                <button onClick={() => openCounter(latestProposal)}
                  disabled={!latestProposal || latestProposal.proposal_status !== "Pending" || latestSubmittedByBO || contracts.some(c => c.status === "Active" || c.status === "Completed")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f5f0e8] text-[#5c4a32] font-semibold text-xs hover:bg-[#ebe5d5] transition-all disabled:opacity-40">
                  <LuCoins className="w-3.5 h-3.5" /> Counteroffer
                </button>
                {BO_QUICK_ACTIONS.map(([label, message]) => (
                  <button key={label} type="button" onClick={() => setText(message)}
                    className="shrink-0 whitespace-nowrap rounded-full border border-[#E8DCC8] bg-[#FDF7E7] px-3 py-2 text-[10px] font-medium text-[#5D4037] transition-colors hover:bg-[#F5EFEB]">
                    {label}
                  </button>
                ))}
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

            {/* Message input — always available when a conversation exists */}
            {currentConv && (
              <form onSubmit={sendMessage} className="mx-3 mb-3 mt-2 flex shrink-0 items-center gap-3 rounded-full border border-[#E0D5C1] bg-[#EDE3D1] px-4 py-2.5">
                <input
                  type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder={`Message ${currentConv?.supplier?.first_name ?? ""}…`}
                  className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-[#4E342E] placeholder-[#A18D82] focus:outline-none"
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

      {/* ── RIGHT PANEL — Supplier info (desktop only) ───────────────────── */}
      <div className="hidden xl:flex w-full shrink-0 flex-col overflow-y-auto rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-sm xl:w-[280px]">
        {!conversationId || !supplierData ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c5b9a8] text-xs text-center px-4">Select a conversation to see supplier details</p>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {/* Avatar + name + location */}
            <div className="flex flex-col items-center border-b border-[#E7DCC9] pb-6 pt-5 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#35AB50] text-sm font-bold text-white">
                {initials(supplierData.first_name, supplierData.last_name)}
              </div>
              <p className="font-bold text-[#3d2b1f] text-sm">{supplierData.first_name} {supplierData.last_name}</p>
              {supplierData.address && (
                <p className="text-[#8b7355] text-[11px] mt-0.5 leading-tight">
                  {supplierData.address.split(",").slice(0, 2).join(",")}
                </p>
              )}
              {supplierData.rating !== null ? (
                <div className="flex items-center gap-1 mt-1.5">
                  <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-semibold text-[#3d2b1f]">{Number(supplierData.rating).toFixed(1)} / 5</span>
                </div>
              ) : (
                <p className="text-[11px] text-[#b09a7a] mt-1.5">No rating yet</p>
              )}
            </div>

            {sentContract?.contract_document_url && sentContract.status === "Pending" && (
              <button onClick={() => setViewContract({
                contractId: sentContract.contract_id,
                contractNumber: sentContract.contract_number,
                documentPath: sentContract.contract_document_url,
              })}
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
              <div className="space-y-3 rounded-xl bg-[#FAF5EC] p-4">
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
                <div className="rounded-xl bg-[#FAF5EC] p-4 text-[11px] leading-relaxed text-[#8b7355]">
                  No contracts yet. Agree on price and volume, then send one.
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.map(c => (
                    <div key={c.contract_id} className="rounded-xl border border-[#EEE4D4] bg-[#FAF5EC] p-3">
                      <p className="font-semibold text-[#3d2b1f] text-[11px]">{c.contract_number}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          c.status === "Active" ? "bg-[#e8f0e5] text-[#2d5a27]" :
                          c.status === "Completed" ? "bg-emerald-50 text-emerald-700" :
                          c.status === "Breached" ? "bg-red-50 text-red-600" :
                          "bg-amber-50 text-amber-700"
                        }`}>{c.status}</span>
                        {c.contract_document_url && (
                          <button onClick={() => setViewContract({
                            contractId: c.contract_id,
                            contractNumber: c.contract_number,
                            documentPath: c.contract_document_url,
                          })}
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
          initialPrice={counterModal?.proposed_price_per_kg}
          initialVolume={counterModal?.proposed_volume_tons}
          onClose={clearProposalModal}
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
            clearProposalModal();
            await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
          }}
        />
      )}

      {viewContract && (
        <ContractDocumentModal
          contractId={viewContract.contractId}
          contractNumber={viewContract.contractNumber}
          documentPath={viewContract.documentPath}
          onClose={() => setViewContract(null)}
        />
      )}

      {/* Supplier profile sheet — slides up from bottom on mobile */}
      {profileOpen && supplierData && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setProfileOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[28px] bg-[#FAF6EE] max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-[#d4c9b8]" />
            </div>

            {/* Close */}
            <div className="flex justify-end px-5 pt-1">
              <button onClick={() => setProfileOpen(false)} className="text-[#8b7355] hover:text-[#3d2b1f]">
                <LuX className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar + name + address + rating */}
            <div className="flex flex-col items-center px-6 pb-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#35AB50] text-lg font-bold text-white mb-4">
                {initials(supplierData.first_name, supplierData.last_name)}
              </div>
              <p className="text-xl font-extrabold text-[#3d2b1f] leading-snug">
                {supplierData.first_name} {supplierData.last_name}
              </p>
              {supplierData.address && (
                <p className="text-sm text-[#8b7355] mt-1">{supplierData.address}</p>
              )}
              <p className="text-sm text-[#b09a7a] mt-1.5">
                {supplierData.rating != null
                  ? `${Number(supplierData.rating).toFixed(1)} / 5.0 ★`
                  : "No rating yet"}
              </p>
            </div>

            <div className="border-t border-[#e4d5bd] mx-5" />

            {/* Negotiation Summary */}
            <div className="px-5 py-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b7355] mb-3">Negotiation Summary</p>
              <div className="rounded-2xl bg-white border border-[#e4d5bd] divide-y divide-[#e4d5bd] overflow-hidden">
                {(() => {
                  const firstProp = proposals.find(p => p.proposal_status !== "Rejected");
                  const activeContract = contracts.find(c => c.status === "Active" || c.status === "Completed");
                  const agreedPrice = activeContract?.negotiated_price_per_kg
                    ?? proposals.find(p => p.proposal_status === "Accepted")?.proposed_price_per_kg;
                  return (
                    <>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-[#5c4a32]">Proposed volume</span>
                        <span className="text-sm font-bold text-[#3d2b1f]">
                          {firstProp ? `${firstProp.proposed_volume_tons} tons` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-[#5c4a32]">Agreed price</span>
                        <span className="text-sm font-bold text-[#3d2b1f]">
                          {agreedPrice != null ? `₱${Number(agreedPrice).toFixed(2)}` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-[#5c4a32]">Contracts sent</span>
                        <span className="text-sm font-bold text-[#3d2b1f]">{contracts.length}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Signed Contracts */}
            {contracts.filter(c => c.status !== "Pending" || c.contract_hash).length > 0 && (
              <div className="px-5 pb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b7355] mb-3">Signed Contracts</p>
                <div className="space-y-2">
                  {contracts.filter(c => c.status !== "Pending" || c.contract_hash).map(c => (
                    <div key={c.contract_id} className="flex items-center justify-between rounded-2xl bg-white border border-[#e4d5bd] px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-[#3d2b1f]">{c.contract_number}</p>
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
                          c.status === "Active" ? "bg-[#e8f5e9] text-[#2d5a27]"
                          : c.status === "Completed" ? "bg-blue-50 text-blue-700"
                          : c.status === "Breached" ? "bg-red-50 text-red-600"
                          : "bg-[#f5f0e8] text-[#8b7355]"
                        }`}>{c.status}</span>
                      </div>
                      {c.contract_document_url && (
                        <button
                          onClick={() => {
                            setViewContract({ contractId: c.contract_id, contractNumber: c.contract_number, documentPath: c.contract_document_url });
                            setProfileOpen(false);
                          }}
                          className="text-[11px] font-semibold text-[#2d5a27] hover:underline">
                          View
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
