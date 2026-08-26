import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LuSend, LuCoins, LuCheck, LuX, LuPencil,
  LuClock, LuFileText, LuStar, LuCheckCheck, LuMessageSquare, LuArrowLeft,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";
import SupplierContractReviewModal from "../../components/SupplierContractReviewModal";
import ContractDocumentModal from "../../components/ContractDocumentModal";
import { usePersistentProposalModal } from "../../hooks/usePersistentProposalModal";

const SUPPLIER_QUICK_SUGGESTIONS = [
  "I'll review the contract shortly.",
  "Can I receive payment earlier?",
  "What moisture content is acceptable?",
];

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
  if (diffDays === 0) return time;
  if (diffDays < 7)  return `${d.toLocaleDateString("en-PH", { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// ── Contract card shown in chat ───────────────────────────────────────────────
function ContractCard({ contractData, onReviewSign, onView, signed }) {
  return (
    <div className="my-3 flex justify-start px-1 sm:px-4">
      <div className="w-72 max-w-full rounded-2xl rounded-bl-sm border border-[#A2D5AB] bg-[#EDF7EF] p-4 text-[#3D2B1F] shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2E7D32] text-white">
            <LuFileText className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-sm">{contractData.contract_number}</p>
            <p className="text-xs text-[#5F7D63]">
              {signed ? "Signed & Active" : "Awaiting your signature"}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[#8B7355]">Price/kg</span>
            <span className="font-semibold">{peso(contractData.price_per_kg)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8B7355]">Volume</span>
            <span className="font-bold">{contractData.contracted_tons} tons</span>
          </div>
          {contractData.due_date && (
            <div className="flex justify-between">
              <span className="text-[#8B7355]">Due Date</span>
              <span className="font-semibold">{fmtDate(contractData.due_date)}</span>
            </div>
          )}
        </div>
        {!signed && onReviewSign && (
          <button
            onClick={onReviewSign}
            className="mt-3 w-full rounded-xl bg-white py-2 text-xs font-bold text-[#17682D] shadow-sm ring-1 ring-[#A2D5AB]/50 transition-all hover:bg-[#F7FCF8]"
          >
            Review & Sign Contract
          </button>
        )}
        {!signed && !onReviewSign && (
          <div className="mt-3 w-full rounded-xl bg-white py-2 text-center text-xs text-[#8B7355] ring-1 ring-[#A2D5AB]/40">
            Loading contract details…
          </div>
        )}
        {signed && (
          <div className="mt-3 space-y-1.5">
            <div className="w-full rounded-xl bg-[#D9EFDE] py-1.5 text-center text-xs font-semibold text-[#17682D]">
              ✓ Contract Active
            </div>
            {onView && (
              <button
                onClick={onView}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-xs font-bold text-[#17682D] ring-1 ring-[#A2D5AB]/50 transition-all hover:bg-[#F7FCF8]"
              >
                <LuFileText className="w-3.5 h-3.5" /> View Contract Document
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Proposal card ─────────────────────────────────────────────────────────────
function ProposalCard({ proposal, submittedByMe, onAccept, onReject, onCounter }) {
  return (
    <div className="flex justify-center my-3 px-4">
      <div className="w-full max-w-xs rounded-2xl border border-[#AFCDB2] bg-[#FFFEFB] p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <LuCoins className="w-4 h-4 text-[#2d5a27]" />
          <p className="text-sm font-bold text-[#2d5a27]">
            {submittedByMe ? "Your Proposal" : "Incoming Counteroffer"}
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
            Awaiting NERC's response…
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

export default function SupplierChatLayout() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Middle panel
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [proposalActing, setProposalActing] = useState(false);
  const {
    modalState: proposalModalState,
    openPropose,
    openCounter,
    clearModal: clearProposalModal,
  } = usePersistentProposalModal({
    storageKey: `coptrax:proposal-modal:supplier-chat:${user?.id ?? "anonymous"}`,
    conversationId,
  });
  const showProposeModal = proposalModalState?.type === "propose";
  const counterModal = proposalModalState?.type === "counter" ? proposalModalState.proposal : null;
  const [signContract, setSignContract] = useState(null);
  const [viewContract, setViewContract] = useState(null);
  const [resolvingConversation, setResolvingConversation] = useState(!conversationId);
  const [onlineBusinessOwnerIds, setOnlineBusinessOwnerIds] = useState(() => new Set());
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);

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
  const [contracts, setContracts] = useState([]);

  useEffect(() => {
    if (!user?.id) return undefined;
    if (conversationId) {
      const timer = window.setTimeout(() => setResolvingConversation(false), 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const resolveConversation = async () => {
      setResolvingConversation(true);
      const { data: existing } = await supabase
        .from("conversations")
        .select("conversation_id, status")
        .eq("supplier_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let targetId = existing?.conversation_id ?? null;
      if (targetId && existing.status !== "Open") {
        const [{ count: messageCount }, { count: proposalCount }] = await Promise.all([
          supabase.from("messages").select("message_id", { count: "exact", head: true }).eq("conversation_id", targetId),
          supabase.from("proposal_forms").select("proposal_id", { count: "exact", head: true }).eq("conversation_id", targetId),
        ]);
        if ((messageCount ?? 0) === 0 && (proposalCount ?? 0) === 0) {
          await supabase.from("conversations").update({ status: "Open" }).eq("conversation_id", targetId);
        }
      }

      if (!targetId) {
        const { data: owners } = await supabase
          .from("users")
          .select("user_id, roles!inner(role_name)")
          .eq("roles.role_name", "Business Owner")
          .eq("account_status", "Active")
          .limit(1);
        const ownerId = owners?.[0]?.user_id;
        if (ownerId) {
          const { data: created } = await supabase
            .from("conversations")
            .upsert(
              { supplier_id: user.id, business_owner_id: ownerId, status: "Open" },
              { onConflict: "supplier_id,business_owner_id" },
            )
            .select("conversation_id")
            .single();
          targetId = created?.conversation_id ?? null;
        }
      }

      if (!cancelled && targetId) {
        navigate(`/dashboard/supplier/conversations/${targetId}`, { replace: true });
      }
      if (!cancelled) setResolvingConversation(false);
    };
    resolveConversation();
    return () => { cancelled = true; };
  }, [conversationId, navigate, user?.id]);

  useEffect(() => {
    const channel = supabase.channel("online-business-owners");
    const syncPresence = () => {
      setOnlineBusinessOwnerIds(new Set(Object.keys(channel.presenceState())));
    };
    channel.on("presence", { event: "sync" }, syncPresence).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Load conversations ────────────────────────────────────────────────────
  // ── Load chat ─────────────────────────────────────────────────────────────
  const loadChat = useCallback(async (convId) => {
    setChatLoading(true);
    setMessages([]); setProposals([]); setCurrentConv(null); setContracts([]);

    const [{ data: conv }, { data: msgs }, { data: props }] = await Promise.all([
      supabase.from("conversations")
        .select("*, business_owner:business_owner_id(user_id, first_name, last_name, email)")
        .eq("conversation_id", convId).single(),
      supabase.from("messages").select("*").eq("conversation_id", convId).order("sent_at", { ascending: true }),
      supabase.from("proposal_forms").select("*").eq("conversation_id", convId).order("submitted_at", { ascending: true }),
    ]);

    setCurrentConv(conv);
    setMessages(msgs ?? []);
    setProposals(props ?? []);

    if (conv) {
      const { data: contractData } = await supabase
        .from("contracts")
        .select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, contract_hash, contract_document_url")
        .eq("supplier_id", user.id)
        .order("created_at", { ascending: false });
      setContracts(contractData ?? []);
    }

    setChatLoading(false);
  }, [user.id]);

  useEffect(() => {
    if (conversationId) loadChat(conversationId);
  }, [conversationId, loadChat]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`sup-chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        payload => {
          const m = payload.new;
          if (!m || m.conversation_id !== conversationId) return; // belt-and-suspenders guard
          setMessages(prev =>
            prev.some(x => x.message_id === m.message_id) ? prev : [...prev, m]);
          // Belt-and-suspenders: when the BO inserts a Contract Form message (acceptance,
          // contract card, etc.) also refresh proposals. This covers the case where the
          // proposal_forms UPDATE realtime event is delayed or not delivered — ensuring the
          // Accepted status is reflected without waiting for an unreliable UPDATE event.
          if (m.message_type === "Contract Form" && m.sender_id !== user.id) {
            supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" },
        () => supabase.from("contracts").select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, contract_hash, contract_document_url").eq("supplier_id", user.id).order("created_at", { ascending: false }).then(({ data }) => setContracts(data ?? [])))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contracts" },
        () => supabase.from("contracts").select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, contract_hash, contract_document_url").eq("supplier_id", user.id).order("created_at", { ascending: false }).then(({ data }) => setContracts(data ?? [])))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `conversation_id=eq.${conversationId}` },
        ({ new: updated }) => setCurrentConv(prev => prev ? { ...prev, ...updated } : updated))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [conversationId, user.id]);

  // Scroll to bottom when initial load completes (covers conversation open & switch)
  useEffect(() => {
    if (chatLoading) return;
    const raf = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [chatLoading]);

  // Follow new realtime messages only if user is already near the bottom
  useEffect(() => {
    if (chatLoading) return; // initial load handled above
    if (!isNearBottom()) return; // user intentionally scrolled up — don't interrupt
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proposal logic ────────────────────────────────────────────────────────
  const latestProposalIndex = [...proposals]
    .map((p, i) => ({ p, i })).reverse()
    .find(({ p }) => p.proposal_status !== "Rejected" && p.proposal_status !== "Modified" && p.proposal_status !== "Accepted")?.i ?? -1;
  const latestProposal = latestProposalIndex >= 0 ? proposals[latestProposalIndex] : null;
  // Use submitted_by if available (migration 025+); fall back to index parity for legacy rows.
  const latestSubmittedBySupplier = latestProposal
    ? (latestProposal.submitted_by != null
        ? latestProposal.submitted_by === user.id
        : latestProposalIndex % 2 === 0)
    : false;

  const acceptedProposal = [...proposals].reverse().find(p => p.proposal_status === "Accepted") ?? null;

  // ── Supplier accepts BO's counteroffer → auto-generates contract ─────────────
  // All DB writes (proposal status, contract row, PDF) are handled server-side
  // by generate-contract using the service role, because the Supplier's JWT
  // cannot INSERT into contracts (contracts_insert_bo RLS blocks it).
  async function acceptCounter(proposal) {
    if (proposalActing) return;
    setProposalActing(true);

    // Optimistically hide the card immediately
    setProposals(prev => prev.map(p =>
      p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Accepted" } : p));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Please log in again.");

      const genRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ proposal_id: proposal.proposal_id }),
      });

      const genData = await genRes.json();
      if (!genRes.ok) {
        // Revert optimistic update so the card re-appears and the error is visible
        setProposals(prev => prev.map(p =>
          p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Pending" } : p));
        console.error("acceptCounter: generate-contract failed:", genData);
        alert(`Failed to accept counteroffer: ${genData.error ?? "Unknown error. Check console."}`);
        setProposalActing(false);
        return;
      }

      await supabase.from("notifications").insert({
        user_id: currentConv?.business_owner_id, notification_type: "Contract Signed",
        message: `${profile?.first_name ?? "Supplier"} accepted your counteroffer. The contract is being generated.`,
        related_entity_type: "conversations", related_entity_id: conversationId,
      });
    } catch (err) {
      setProposals(prev => prev.map(p =>
        p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Pending" } : p));
      console.error("acceptCounter error:", err);
      alert(`Failed to accept counteroffer: ${err.message ?? String(err)}`);
      setProposalActing(false);
      return;
    }

    await loadChat(conversationId);
    setProposalActing(false);
  }

  async function rejectProposal(proposal) {
    if (proposalActing) return;
    setProposalActing(true);
    // Immediately hide the proposal card
    setProposals(prev => prev.map(p =>
      p.proposal_id === proposal.proposal_id ? { ...p, proposal_status: "Rejected" } : p));
    await supabase.from("proposal_forms").update({ proposal_status: "Rejected" }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text",
      message_text: `❌ Counteroffer declined.`,
    });
    await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
    setProposalActing(false); // was missing — buttons stayed permanently disabled after rejection
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const { data: newMsg } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text", message_text: text.trim(),
    }).select().single();
    if (newMsg) {
      // Show immediately for the sender; realtime will echo it but dedup prevents duplicate
      setMessages(prev => prev.some(m => m.message_id === newMsg.message_id) ? prev : [...prev, newMsg]);
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
    setText("");
    setSending(false);
    // Fire-and-forget: let AI FAQ respond if enabled globally
    if (newMsg?.message_text) {
      supabase.functions.invoke("ai-faq", { body: { conversation_id: conversationId, message_text: newMsg.message_text } });
    }
  }

    // ── UPSERT: reuse existing conversation, never create a duplicate ──────
      // Already have one — just navigate to it

    // No existing conversation — create one

  // ── First Pending contract in this supplier's list, for the "Review & Sign" shortcut ─
  const pendingContractRow = contracts.find(c => c.status === "Pending" && c.contract_hash);

  // ── Can the Supplier propose? ────────────────────────────────────────────
  // Rule: allowed unless the supplier already has 3 or more Active contracts.
  // Contract status of the current conversation does NOT block proposing.
  const activeContractCount = contracts.filter(c => c.status === "Active").length;
  const canPropose = activeContractCount < 3;
  const businessOwnerId = currentConv?.business_owner_id ?? currentConv?.business_owner?.user_id;
  const isBusinessOwnerOnline = Boolean(
    businessOwnerId && onlineBusinessOwnerIds.has(businessOwnerId),
  );

  return (
    <div className="flex flex-col gap-2 xl:h-[calc(100vh-104px)] xl:min-h-[620px]">
      <button type="button" onClick={() => navigate("/dashboard/supplier")}
        className="group flex w-fit shrink-0 items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-[#5D4037] transition-colors hover:text-[#17682D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17682D]/40">
        <LuArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Return to Home</span>
      </button>

      <div className="flex flex-col gap-4 overflow-visible rounded-[22px] bg-[#FAF7EF] p-2 xl:min-h-0 xl:flex-1 xl:flex-row xl:overflow-hidden">

      {/* ── MIDDLE PANEL ──────────────────────────────────────────────────── */}
      <div className="flex h-[70vh] min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(93,64,55,0.04)] xl:h-full">
        {resolvingConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-3 border-[#2d5a27] border-t-transparent" />
          </div>
        ) : !conversationId ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F5E9]">
              <LuMessageSquare className="h-6 w-6 text-[#2E7D32]" />
            </div>
            <p className="mb-1 text-lg font-bold text-[#3d2b1f]">No conversations yet</p>
            <p className="text-sm text-[#8b7355]">Your negotiation will be ready after the first message or proposal.</p>
          </div>
        ) : chatLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-[#E7DCC9] bg-[#FFFEFB] px-4 py-4 sm:px-7">
              <div className="relative shrink-0">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white ${isBusinessOwnerOnline ? "bg-[#35AB50]" : "bg-[#9CA3AF]"}`}>N</div>
                <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#FFFEFB] ${isBusinessOwnerOnline ? "bg-[#22C55E]" : "bg-[#9CA3AF]"}`} />
              </div>
              <div className="flex-1">
                <p className="text-base font-extrabold leading-tight text-[#5D4037] sm:text-[18px]">NERC Copra Trading</p>
                <div className="flex items-center gap-2">
                  <p className="text-[#8b7355] text-xs">{isBusinessOwnerOnline ? "Online" : "Offline"}</p>
                </div>
              </div>
              {currentConv?.status === "Open" && (
                <button
                  onClick={() => { if (canPropose) openPropose(); }}
                  disabled={!canPropose}
                  title={!canPropose ? "You already have 3 Active contracts — complete or wait for one to finish before proposing again." : "Submit a price proposal to NERC Copra Trading"}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all
                    ${canPropose
                      ? "bg-[#2d5a27] text-white hover:bg-[#234820] cursor-pointer"
                      : "bg-[#e8e0d0] text-[#b09a7a] cursor-not-allowed"
                    }`}>
                  <LuCoins className="w-3.5 h-3.5" /> Propose Price
                </button>
              )}
            </div>

            {/* Messages */}
            <div ref={scrollContainerRef} className="flex-1 space-y-1 overflow-y-auto bg-[#FFFEFB] px-3 py-3">
              {messages.length === 0 && (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-4 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F5E9]">
                    <LuMessageSquare className="h-6 w-6 text-[#2E7D32]" />
                  </div>
                  <h4 className="mb-2 text-sm font-bold text-[#3D2B1F]">Start Your First Message</h4>
                  <p className="max-w-sm text-xs leading-relaxed text-[#8B7355]">
                    Send a message or submit a price proposal to begin negotiating with NERC Copra Trading.
                  </p>
                  <div className="mt-4 w-full max-w-sm space-y-2">
                    <p className="text-[11px] font-medium uppercase text-[#3D2B1F]/70">Quick Actions:</p>
                    <button type="button" onClick={() => setText("I'd like to propose a price.")}
                      className="w-full rounded-lg bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100">
                      Send First Message
                    </button>
                    <button type="button" onClick={openPropose}
                      className="w-full rounded-lg bg-green-50 px-3 py-2 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100">
                      Submit Price Proposal
                    </button>
                  </div>
                </div>
              )}
              {messages.map((msg, index) => {
                const isMine = msg.sender_id === user.id;
                const prevMsg = messages[index - 1];
                const showDateSep = !prevMsg ||
                  new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();

                let messageEl;

                if (msg.message_type === "Contract Form" && msg.message_text?.startsWith("CONTRACT_CARD:")) {
                  try {
                    const cardData = JSON.parse(msg.message_text.replace("CONTRACT_CARD:", ""));
                    const contractRow = cardData.contract_id
                      ? contracts.find(c => c.contract_id === cardData.contract_id)
                      : contracts.find(c => c.contract_number === cardData.contract_number);
                    const isSigned = contractRow?.status === "Active" || contractRow?.status === "Completed" || contractRow?.status === "Breached";
                    const resolvedId = cardData.contract_id ?? contractRow?.contract_id;
                    const viewPath = contractRow?.contract_document_url ?? cardData.document_path;
                    messageEl = (
                      <ContractCard
                        contractData={cardData}
                        signed={isSigned}
                        onReviewSign={!isSigned && resolvedId ? () => setSignContract({
                          contract_id:     resolvedId,
                          contract_number: cardData.contract_number,
                          price_per_kg:    cardData.price_per_kg,
                          contracted_tons: cardData.contracted_tons,
                          due_date:        cardData.due_date ?? contractRow?.due_date,
                          document_path:   cardData.document_path ?? contractRow?.contract_document_url,
                          contract_hash:   contractRow?.contract_hash,
                        }) : null}
                        onView={isSigned && viewPath ? () => setViewContract({
                          contractId: resolvedId,
                          contractNumber: cardData.contract_number,
                          documentPath: viewPath,
                        }) : null}
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
                    <div className={`flex px-1 sm:px-4 ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed sm:max-w-[65%] ${
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
                  submittedByMe={latestSubmittedBySupplier}
                  onAccept={proposalActing ? null : () => acceptCounter(latestProposal)}
                  onReject={proposalActing ? null : () => rejectProposal(latestProposal)}
                  onCounter={proposalActing ? null : () => openCounter(latestProposal)}
                />
              )}



              <div ref={bottomRef} />
            </div>

            {/* Action chips */}
            {currentConv?.status === "Open" && (
              <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-[#E7DCC9] bg-[#FFFEFB] px-3 pb-0.5 pt-2 no-scrollbar">
                {canPropose && (
                  <button onClick={openPropose}
                    className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-[#17682D] px-4 py-1.5 text-[10px] font-semibold text-white transition-all hover:bg-[#105523]">
                    <LuCoins className="w-3.5 h-3.5" /> Propose Price
                  </button>
                )}
                {SUPPLIER_QUICK_SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setText(suggestion)}
                    className="shrink-0 whitespace-nowrap rounded-full border border-[#E8DCC8] bg-[#FDF7E7] px-3 py-1.5 text-[10px] font-medium text-[#5D4037] transition-colors hover:bg-[#F5EFEB]">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Message input */}
            {currentConv?.status === "Open" && (
              <form onSubmit={sendMessage} className="mx-3 mb-3 mt-2 flex shrink-0 items-center gap-3 rounded-full bg-[#EDE3D1] px-4 py-2.5">
                <input type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder="Message NERC Copra Trading…"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#3d2b1f] placeholder-[#A18D82] focus:outline-none" />
                <button type="submit" disabled={!text.trim() || sending}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17682D] text-white transition-all hover:bg-[#105523] disabled:opacity-50">
                  <LuSend className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className={`${conversationId ? "flex" : "hidden xl:flex"} w-full shrink-0 flex-col overflow-y-auto rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(93,64,55,0.04)] xl:w-[300px]`}>
        {!conversationId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c5b9a8] text-xs text-center px-4">Select a conversation to see details</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* NERC avatar + name */}
            <div className="flex flex-col items-center border-b border-[#E7DCC9] px-5 pb-7 pt-12 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#35AB50] text-sm font-bold text-white">N</div>
              <p className="font-bold text-[#3d2b1f] text-sm">NERC Copra Trading</p>
              <p className="text-[#8b7355] text-[11px] mt-0.5">Kumalarang, Zamboanga del Sur</p>
            </div>

            {/* Pending contract review shortcut */}
            {pendingContractRow && (
              <button
                onClick={() => setSignContract({
                  contract_id:     pendingContractRow.contract_id,
                  contract_number: pendingContractRow.contract_number,
                  price_per_kg:    pendingContractRow.negotiated_price_per_kg,
                  contracted_tons: pendingContractRow.contracted_tons,
                  due_date:        pendingContractRow.due_date,
                  document_path:   pendingContractRow.contract_document_url,
                  contract_hash:   pendingContractRow.contract_hash,
                })}
                className="mx-auto block w-[calc(100%-2.5rem)] rounded-[9px] bg-[#17682D] py-2.5 text-center text-xs font-bold text-white transition-all hover:bg-[#105523]"
              >
                Review & Sign Contract
              </button>
            )}

            {/* Negotiation summary */}
            <div className="px-5">
              <p className="mb-3 text-xs font-semibold uppercase text-[#6B4A40]">Negotiation Summary</p>
              <div className="space-y-3.5 rounded-xl bg-[#FAF5EC] p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b7355]">Proposed volume</span>
                  <span className="font-semibold text-[#3d2b1f]">{acceptedProposal ? `${acceptedProposal.proposed_volume_tons} tons` : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b7355]">Agreed price</span>
                  <span className="font-semibold text-[#3d2b1f]">{acceptedProposal ? `₱${Number(acceptedProposal.proposed_price_per_kg).toFixed(2)}` : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b7355]">Contracts sent</span>
                  <span className="font-semibold text-[#3d2b1f]">{contracts.length}</span>
                </div>
              </div>
            </div>

            {/* Contracts */}
            <div className="px-5 pb-5">
              <p className="mb-3 text-xs font-semibold uppercase text-[#6B4A40]">Signed Contracts</p>
              {contracts.length === 0 ? (
                <div className="rounded-xl bg-[#FAF5EC] p-3 text-[11px] leading-relaxed text-[#8b7355]">
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
                        {c.status === "Pending" && c.contract_hash && (
                          <button
                            onClick={() => setSignContract({
                              contract_id:     c.contract_id,
                              contract_number: c.contract_number,
                              price_per_kg:    c.negotiated_price_per_kg,
                              contracted_tons: c.contracted_tons,
                              due_date:        c.due_date,
                              document_path:   c.contract_document_url,
                              contract_hash:   c.contract_hash,
                            })}
                            className="text-[10px] text-[#2d5a27] font-semibold hover:underline"
                          >
                            Review & Sign
                          </button>
                        )}
                        {c.contract_document_url && c.status !== "Pending" && (
                          <button
                            type="button"
                            onClick={() => setViewContract({
                              contractId: c.contract_id,
                              contractNumber: c.contract_number,
                              documentPath: c.contract_document_url,
                            })}
                            className="text-[10px] font-semibold text-[#2d5a27] hover:underline"
                          >
                            View
                          </button>
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

      </div>

      {/* Propose Price Modal */}
      {showProposeModal && currentConv && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={user.id}
          onClose={clearProposalModal}
          onSubmitted={async (msg) => {
            clearProposalModal();
            await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form", message_text: msg });
            // Notify BO
            await supabase.from("notifications").insert({
              user_id: currentConv.business_owner_id, notification_type: "New Proposal",
              message: `${profile?.first_name ?? "Supplier"} submitted a new price proposal.`,
              related_entity_type: "conversations", related_entity_id: conversationId,
            });
            await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
          }}
        />
      )}

      {/* Counteroffer Modal */}
      {counterModal !== null && counterModal !== undefined && currentConv && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={user.id}
          isCounter
          supersedesId={counterModal?.proposal_id}
          initialPrice={counterModal?.proposed_price_per_kg}
          initialVolume={counterModal?.proposed_volume_tons}
          onClose={clearProposalModal}
          onSubmitted={async (msg) => {
            if (counterModal) {
              await supabase.from("proposal_forms").update({ proposal_status: "Modified" }).eq("proposal_id", counterModal.proposal_id);
            }
            await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form", message_text: msg });
            await supabase.from("notifications").insert({
              user_id: currentConv.business_owner_id, notification_type: "Counteroffer",
              message: `${profile?.first_name ?? "Supplier"} sent a counteroffer.`,
              related_entity_type: "conversations", related_entity_id: conversationId,
            });
            clearProposalModal();
            await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
          }}
        />
      )}

      {/* Sign Contract Modal */}
      {signContract && (
        <SupplierContractReviewModal
          contract={signContract}
          onClose={() => setSignContract(null)}
          onSigned={async (result) => {
            const signedContract = signContract;
            setSignContract(null);
            setViewContract({
              contractId: signedContract.contract_id,
              contractNumber: signedContract.contract_number,
              documentPath: result?.contract_document_path ?? signedContract.document_path,
            });
            await loadChat(conversationId);
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
    </div>
  );
}
