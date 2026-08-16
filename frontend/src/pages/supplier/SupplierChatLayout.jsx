import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  LuSend, LuCoins, LuFileText, LuStar, LuCheckCheck, LuPaperclip, LuArrowLeft,
  LuMessageSquare, LuCheck, LuX, LuPencil, LuClock,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";
import SupplierContractReviewModal from "../../components/SupplierContractReviewModal";
import { getNegotiationSystemMessage, isProposalSubmissionMessage, negotiationToneClass } from "../../utils/negotiationMessages";

const SUPPLIER_QUICK_SUGGESTIONS = [
  "I'll review the contract shortly.",
  "Can I receive payment earlier?",
  "What moisture content is acceptable?",
];

function SupplierChatWelcome({ onFirstMessage, onProposePrice, busy = false, compact = false }) {
  return (
    <div className={`flex h-full flex-col items-center justify-center px-3 text-center ${compact ? "py-8" : "py-10"}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F5E9]">
        <LuMessageSquare className="h-6 w-6 text-[#2E7D32]" />
      </div>
      <h4 className="mb-2 text-sm font-bold text-[#3D2B1F]">Start Your First Message</h4>
      <p className="mb-4 max-w-sm text-xs leading-relaxed text-[#8B7355]">
        Send a message or submit a price proposal to begin negotiating with NERC Copra Trading.
      </p>
      <div className="w-full max-w-sm space-y-2">
        <p className="text-[11px] font-medium uppercase text-[#3D2B1F]/70">Quick Actions:</p>
        <button
          type="button"
          onClick={onFirstMessage}
          disabled={busy}
          className="w-full rounded-lg bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-60"
        >
          Send First Message
        </button>
        <button
          type="button"
          onClick={onProposePrice}
          disabled={busy}
          className="w-full rounded-lg bg-green-50 px-3 py-2 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-60"
        >
          {busy ? "Starting..." : "Submit Price Proposal"}
        </button>
      </div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// ── Contract card shown in chat ───────────────────────────────────────────────
function ContractCard({ contractData, onReviewSign, signed, supplierSigned }) {
  return (
    <div className="flex justify-start my-2 px-4">
      <div className="w-72 max-w-full overflow-hidden rounded-2xl rounded-bl-sm border border-[#A2D5AB] bg-[#EDF7EF] shadow-sm">
        <div className="flex items-center gap-2 bg-[#2E7D32] px-4 py-3 text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
            <LuFileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium leading-tight text-white/75">
              {signed ? "Contract active" : "Contract received"}
            </p>
            <p className="truncate text-sm font-bold leading-tight">{contractData.contract_number}</p>
          </div>
        </div>
        <div className="px-4 py-3 text-[#3D2B1F]">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] text-[#8B7355]">Price</p>
              <p className="font-bold">{peso(contractData.price_per_kg)}/kg</p>
            </div>
            <div>
              <p className="text-[10px] text-[#8B7355]">Quantity</p>
              <p className="font-bold">{contractData.contracted_tons} tons</p>
            </div>
          </div>
          <div className="mt-2.5 border-t border-[#A2D5AB]/60 pt-2">
            <p className="text-[10px] text-[#8B7355]">
              Due {contractData.due_date ? fmtDate(contractData.due_date) : "after activation"}
            </p>
          </div>
          {!signed && !supplierSigned ? (
            <button
              onClick={onReviewSign}
              className="mt-3 w-full rounded-xl bg-white py-2 text-xs font-bold text-[#17682D] shadow-sm ring-1 ring-[#A2D5AB]/50 transition-colors hover:bg-[#F7FCF8]"
            >
              Review &amp; Sign Contract
            </button>
          ) : supplierSigned && !signed ? (
            <div className="mt-3 w-full rounded-xl bg-amber-50 py-2 text-center text-xs font-semibold text-amber-700">
              Awaiting NERC signature
            </div>
          ) : (
            <div className="mt-3 w-full rounded-xl bg-[#D9EFDE] py-2 text-center text-xs font-semibold text-[#17682D]">
              ✓ Contract Active
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SupplierProposalReceipt({ proposal }) {
  const submittedTime = proposal.submitted_at
    ? new Date(proposal.submitted_at).toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex justify-center my-3 px-4">
      <div className="w-56 max-w-full overflow-hidden rounded-2xl border border-[#2E7D32] bg-[#FFFEFB] shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#B7DDBD] bg-[#EAF6EC] px-3 py-2.5 text-[#17682D]">
          <LuFileText className="h-4 w-4 shrink-0" />
          <p className="text-[9px] font-extrabold uppercase tracking-wide">
            Price Proposal Submitted
          </p>
        </div>
        <div className="px-3 py-3 text-[11px] text-[#8B7355]">
          <div className="flex items-center justify-between gap-4">
            <span>Proposed Price</span>
            <strong className="text-[#3D2B1F]">
              {peso(proposal.proposed_price_per_kg)}/kg
            </strong>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span>Proposed Volume</span>
            <strong className="text-[#3D2B1F]">
              {proposal.proposed_volume_tons} tons
            </strong>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[#B7DDBD] pt-2">
            <span className="rounded-full bg-[#DCE8FF] px-3 py-0.5 text-[9px] font-semibold text-[#3F6FC2]">
              Offer Received
            </span>
            <time className="text-[9px] text-[#A58E72]">{submittedTime}</time>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupplierCounterofferCard({ proposal, onAccept, onReject, onCounter }) {
  return (
    <div className="my-3 flex justify-center px-4">
      <div className="w-72 max-w-full overflow-hidden rounded-2xl border border-[#2E7D32] bg-[#FFFEFB] shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#B7DDBD] bg-[#EAF6EC] px-3.5 py-3">
          <LuCoins className="h-4 w-4 text-[#17682D]" />
          <p className="text-[10px] font-extrabold uppercase text-[#17682D]">Counteroffer Received</p>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            <LuClock className="h-3 w-3" /> Pending
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 px-3.5 py-3 text-xs">
          <div>
            <p className="text-[#8B7355]">Price per kg</p>
            <p className="font-bold text-[#3D2B1F]">{peso(proposal.proposed_price_per_kg)}/kg</p>
          </div>
          <div className="text-right">
            <p className="text-[#8B7355]">Volume</p>
            <p className="font-bold text-[#3D2B1F]">{proposal.proposed_volume_tons} tons</p>
          </div>
        </div>
        <div className="mx-3.5 flex gap-2 border-t border-[#B7DDBD] py-3">
          <button type="button" onClick={onAccept}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#E8F0E5] py-2 text-[11px] font-semibold text-[#2D5A27] hover:bg-[#D4E5CF]">
            <LuCheck className="h-3.5 w-3.5" /> Accept
          </button>
          <button type="button" onClick={onCounter}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#F5F0E8] py-2 text-[11px] font-semibold text-[#5C4A32] hover:bg-[#EBE5D5]">
            <LuPencil className="h-3.5 w-3.5" /> Counter
          </button>
          <button type="button" onClick={onReject}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-50 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-100">
            <LuX className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierChatLayout() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const [starting, setStarting] = useState(false);
  const [resolvingConversation, setResolvingConversation] = useState(!conversationId);

  // Middle panel
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [counterModal, setCounterModal] = useState(null);
  const [signContract, setSignContract] = useState(null);
  const messagesContainerRef = useRef(null);
  const isInitialLoad = useRef(false);
  const conversationCreationRef = useRef(null);
  const chatLoadRequestRef = useRef(0);
  const proposalActionInFlight = useRef(new Set());

  // Right panel
  const [contracts, setContracts] = useState([]);

  // A Supplier communicates only with the BO, so open their latest conversation.
  useEffect(() => {
    if (conversationId) {
      const timer = window.setTimeout(() => setResolvingConversation(false), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(async () => {
      setResolvingConversation(true);
      const [{ data }, { data: boRows }] = await Promise.all([
        supabase.from("conversations")
          .select("conversation_id")
          .eq("supplier_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("users")
          .select("user_id, first_name, last_name, email, roles!inner(role_name)")
          .eq("roles.role_name", "Business Owner")
          .eq("account_status", "Active")
          .limit(1),
      ]);
      if (data?.conversation_id) {
        navigate(`/dashboard/supplier/conversations/${data.conversation_id}`, { replace: true });
      } else {
        const businessOwner = boRows?.[0] ?? null;
        // Display the complete chat layout without persisting a conversation.
        // The draft becomes an Open conversation only after an actual send.
        setCurrentConv({
          conversation_id: null,
          supplier_id: user.id,
          business_owner_id: businessOwner?.user_id ?? null,
          business_owner: businessOwner,
          status: "Draft",
        });
        setResolvingConversation(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, navigate, user.id]);

  // ── Load chat ─────────────────────────────────────────────────────────────
  const loadChat = useCallback(async (convId) => {
    const requestId = ++chatLoadRequestRef.current;
    setChatLoading(true);
    setMessages([]); setProposals([]); setCurrentConv(null); setContracts([]);

    const [{ data: conv }, { data: msgs }, { data: props }] = await Promise.all([
      supabase.from("conversations")
        .select("*, business_owner:business_owner_id(user_id, first_name, last_name, email)")
        .eq("conversation_id", convId).single(),
      supabase.from("messages").select("*").eq("conversation_id", convId).order("sent_at", { ascending: true }),
      supabase.from("proposal_forms").select("*").eq("conversation_id", convId).order("submitted_at", { ascending: true }),
    ]);

    if (requestId !== chatLoadRequestRef.current) return;

    setCurrentConv(conv);
    setMessages(msgs ?? []);
    setProposals(props ?? []);

    if (conv) {
      const { data: contractData } = await supabase
        .from("contracts")
        .select("contract_id, conversation_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, docuseal_submission_id, supplier_authorized_at, bo_signed_at, contract_document_url")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false });
      setContracts(contractData ?? []);
    }

    setChatLoading(false);
    isInitialLoad.current = true;
  }, []);

  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = window.setTimeout(() => loadChat(conversationId), 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, loadChat]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const refreshProposals = async () => {
      const { data } = await supabase.from("proposal_forms").select("*")
        .eq("conversation_id", conversationId)
        .order("submitted_at", { ascending: true });
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
    const channel = supabase.channel(`sup-chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        payload => setMessages(previous => {
          const incoming = payload.new;
          if (previous.some(message => message.message_id === incoming.message_id)) {
            return previous;
          }
          return [...previous, incoming].sort(
            (a, b) => new Date(a.sent_at) - new Date(b.sent_at),
          );
        }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        applyProposalChange)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        applyProposalChange)
      .subscribe(status => {
        if (status === "SUBSCRIBED") refreshProposals();
      });
    return () => supabase.removeChannel(channel);
  }, [conversationId]);

  // Scroll only the message panel so live messages never move the whole page.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (isInitialLoad.current) {
      setTimeout(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
        isInitialLoad.current = false;
      }, 50);
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // ── Proposal logic ────────────────────────────────────────────────────────
  const latestProposalIndex = [...proposals]
    .map((p, i) => ({ p, i })).reverse()
    .find(({ p }) => p.proposal_status !== "Rejected" && p.proposal_status !== "Modified")?.i ?? -1;
  const latestProposal = latestProposalIndex >= 0 ? proposals[latestProposalIndex] : null;
  const latestSubmittedBySupplier = latestProposal?.submitted_by
    ? latestProposal.submitted_by === user.id
    : latestProposalIndex % 2 === 0;

  const acceptedProposal = [...proposals].reverse().find(p => p.proposal_status === "Accepted") ?? null;

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

      const actionLabel = decision === "accepted" ? "accepted" : "rejected";
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        message_type: "Contract Form",
        message_text: `Counteroffer ${actionLabel}: ${peso(proposal.proposed_price_per_kg)}/kg for ${proposal.proposed_volume_tons} tons.`,
      });
      await supabase.from("notifications").insert({
        user_id: currentConv?.business_owner_id,
        notification_type: decision === "accepted" ? "Proposal Accepted" : "Proposal Rejected",
        message: `The Supplier ${actionLabel} your counteroffer of ${peso(proposal.proposed_price_per_kg)}/kg for ${proposal.proposed_volume_tons} tons.`,
        related_entity_type: "proposal_forms",
        related_entity_id: proposal.proposal_id,
      });
      if (finalized) {
        setCurrentConv(previous => ({
          ...previous,
          accepted_proposal_id: finalized.final_proposal_id,
          agreed_price_per_kg: finalized.final_price_per_kg,
          agreed_volume_tons: finalized.final_volume_tons,
          negotiation_finalized_at: finalized.finalized_at,
        }));
      }
      await loadChat(conversationId);
    } finally {
      proposalActionInFlight.current.delete(proposal.proposal_id);
    }
  }

  async function ensureOpenConversation() {
    if (conversationId) return conversationId;
    if (conversationCreationRef.current) return conversationCreationRef.current;

    conversationCreationRef.current = (async () => {
      setStarting(true);
      try {
        // Recheck before inserting in case the BO started the conversation
        // while this draft screen was open.
        const { data: existing } = await supabase.from("conversations")
          .select("conversation_id")
          .eq("supplier_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let targetConversationId = existing?.conversation_id ?? null;
        if (!targetConversationId) {
          let businessOwnerId = currentConv?.business_owner_id;
          if (!businessOwnerId) {
            const { data: boRows } = await supabase.from("users")
              .select("user_id, roles!inner(role_name)")
              .eq("roles.role_name", "Business Owner")
              .eq("account_status", "Active")
              .limit(1);
            businessOwnerId = boRows?.[0]?.user_id;
          }
          if (!businessOwnerId) return null;

          const { data: created, error } = await supabase.from("conversations")
            .insert({
              supplier_id: user.id,
              business_owner_id: businessOwnerId,
              status: "Open",
            })
            .select("conversation_id")
            .single();
          if (error) return null;
          targetConversationId = created?.conversation_id ?? null;
        }

        if (targetConversationId) {
          setCurrentConv(previous => ({
            ...previous,
            conversation_id: targetConversationId,
            status: "Open",
          }));
          navigate(`/dashboard/supplier/conversations/${targetConversationId}`, { replace: true });
        }
        return targetConversationId;
      } finally {
        setStarting(false);
        conversationCreationRef.current = null;
      }
    })();

    return conversationCreationRef.current;
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const targetConversationId = await ensureOpenConversation();
    if (targetConversationId) {
      await supabase.from("messages").insert({
        conversation_id: targetConversationId,
        sender_id: user.id,
        message_type: "Text",
        message_text: text.trim(),
      });
      setText("");
    }
    setSending(false);
  }

  function returnToPreviousModule() {
    const returnTo = location.state?.returnTo;
    const isSafeSupplierRoute = typeof returnTo === "string"
      && returnTo.startsWith("/dashboard/supplier")
      && !returnTo.startsWith("/dashboard/supplier/conversations");

    navigate(isSafeSupplierRoute ? returnTo : "/dashboard/supplier");
  }

  // ── First Pending contract in this supplier's list, for the "Review & Sign" shortcut ─
  const pendingContractRow = contracts.find(c => c.status === "Pending" && c.docuseal_submission_id && !c.supplier_authorized_at);
  const negotiationFinalized = Boolean(currentConv?.negotiation_finalized_at || acceptedProposal);
  const canChat = !conversationId || currentConv?.status === "Open";
  const canNegotiate = canChat && !negotiationFinalized;

  return (
    <div className="flex flex-col gap-2 xl:h-[calc(100vh-104px)] xl:min-h-[620px]">
      <button
        type="button"
        onClick={returnToPreviousModule}
        aria-label="Return to previous module"
        className="group flex w-fit shrink-0 items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-[#5D4037] transition-colors hover:text-[#17682D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17682D]/40"
      >
        <LuArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Return</span>
      </button>

      <div className="flex flex-col gap-4 overflow-visible rounded-[22px] bg-[#FAF7EF] p-2 xl:min-h-0 xl:flex-1 xl:flex-row xl:overflow-hidden">

      {/* ── MIDDLE PANEL ──────────────────────────────────────────────────── */}
      <div className="flex h-[70vh] min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(93,64,55,0.04)] xl:h-auto xl:min-h-0">
        {resolvingConversation ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chatLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[#E7DCC9] bg-[#FFFEFB] px-4 py-4 sm:px-7 shrink-0">
              <div className="w-11 h-11 rounded-full bg-[#35AB50] flex items-center justify-center text-white font-bold text-sm">N</div>
              <div className="flex-1">
                <p className="text-base font-extrabold leading-tight text-[#5D4037] sm:text-[18px]">NERC Copra Trading</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  <p className="text-[#8b7355] text-xs">
                    {conversationId
                      ? negotiationFinalized ? "Negotiation finalized" : currentConv?.status === "Open" ? "Active negotiation" : "Closed"
                      : "Ready to start negotiation"}
                  </p>
                </div>
              </div>
              {canNegotiate && (
                <button onClick={() => setShowProposeModal(true)}
                  className="flex items-center gap-1.5 bg-[#2d5a27] text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-[#234820] transition-all">
                  <LuCoins className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Propose Price</span>
                </button>
              )}
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#FFFEFB]">
              {messages.length === 0 && (
                <SupplierChatWelcome
                  compact
                  busy={starting}
                  onFirstMessage={() => setText("I'd like to propose a price.")}
                  onProposePrice={() => setShowProposeModal(true)}
                />
              )}
              {messages.map(msg => {
                const isMine = msg.sender_id === user.id;
                if (isProposalSubmissionMessage(msg.message_text)) return null;
                const negotiationEvent = getNegotiationSystemMessage({
                  message: msg.message_text,
                  viewer: "supplier",
                  isMine,
                  supplierName: profile?.first_name ?? "Supplier",
                });

                if (msg.message_text?.trimStart().startsWith("CONTRACT_CARD:")) {
                  try {
                    const cardData = JSON.parse(msg.message_text.trimStart().replace(/^CONTRACT_CARD:\s*/, ""));
                    const contractRow = contracts.find(c => c.contract_number === cardData.contract_number);
                    const isSigned = contractRow?.status === "Active" || contractRow?.status === "Completed" || contractRow?.status === "Breached";
                    return (
                      <ContractCard
                        key={msg.message_id}
                        contractData={cardData}
                        signed={isSigned}
                        supplierSigned={Boolean(contractRow?.supplier_authorized_at)}
                        onReviewSign={() => setSignContract({
                          contract_id:     cardData.contract_id ?? contractRow?.contract_id,
                          contract_number: cardData.contract_number,
                          price_per_kg:    cardData.price_per_kg,
                          contracted_tons: cardData.contracted_tons,
                          due_date:        cardData.due_date ?? contractRow?.due_date,
                          preview_url:     cardData.preview_url,
                        })}
                      />
                    );
                  } catch {
                    return (
                      <div key={msg.message_id} className="flex justify-start px-4 my-2">
                        <div className="max-w-xs rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                          This contract card could not be displayed. Please ask the Business Owner to resend it.
                        </div>
                      </div>
                    );
                  }
                }

                if (negotiationEvent) {
                  return (
                    <div key={msg.message_id} className="flex justify-center px-4 py-1.5">
                      <p className={`max-w-sm whitespace-pre-line text-center text-xs italic leading-relaxed ${negotiationToneClass(negotiationEvent.tone)}`}>
                        {negotiationEvent.text}
                      </p>
                    </div>
                  );
                }

                if (msg.message_type === "Contract Form") {
                  return (
                    <div key={msg.message_id} className="flex justify-center px-4">
                      <p className="max-w-xs whitespace-pre-line text-center text-xs italic leading-relaxed text-[#8B7355]">
                        {msg.message_text}
                      </p>
                    </div>
                  );
                }

                return (
                  <div key={msg.message_id} className={`flex px-4 ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed sm:max-w-[65%] rounded-2xl ${
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

              {!negotiationFinalized && latestProposal && latestProposal.proposal_status === "Pending" && (
                latestSubmittedBySupplier ? (
                  <SupplierProposalReceipt proposal={latestProposal} />
                ) : (
                  <SupplierCounterofferCard
                    proposal={latestProposal}
                    onAccept={() => respondToCounteroffer(latestProposal, "accepted")}
                    onReject={() => respondToCounteroffer(latestProposal, "rejected")}
                    onCounter={() => setCounterModal(latestProposal)}
                  />
                )
              )}

              {/* DocuSeal sign prompt removed — Review & Sign is now on each contract card */}

            </div>

            {/* Proposal action and quick message suggestions */}
            {canNegotiate && (
              <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-[#E7DCC9] bg-[#FFFEFB] px-3 pt-2 pb-0.5 no-scrollbar">
                <button type="button" onClick={() => setShowProposeModal(true)}
                  className="flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#17682D] px-4 py-1.5 text-[10px] font-semibold text-white transition-all hover:bg-[#105523]">
                  <LuCoins className="w-3.5 h-3.5" /> Propose Price
                </button>
                {SUPPLIER_QUICK_SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setText(suggestion)}
                    className="shrink-0 whitespace-nowrap rounded-full border border-[#E8DCC8] bg-[#FDF7E7] px-3 py-1.5 text-[10px] font-medium text-[#5D4037] transition-colors hover:bg-[#F5EFEB]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Message input */}
            {canChat && (
              <form onSubmit={sendMessage} className="flex items-center gap-3 mx-3 mb-3 mt-2 px-4 py-2.5 bg-[#EDE3D1] rounded-full shrink-0">
                <button type="button" className="text-[#b09a7a] hover:text-[#8b7355] transition-colors">
                  <LuPaperclip className="w-5 h-5" />
                </button>
                <input type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder="Message NERC Copra Trading…"
                  className="flex-1 min-w-0 bg-transparent text-sm text-[#3d2b1f] placeholder-[#A18D82] focus:outline-none border-0" />
                <button type="submit" disabled={!text.trim() || sending}
                  className="w-9 h-9 rounded-full bg-[#17682D] text-white flex items-center justify-center hover:bg-[#105523] transition-all disabled:opacity-50">
                  <LuSend className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className="w-full xl:w-[250px] shrink-0 bg-[#FFFEFB] rounded-[18px] border border-[#E4D5BD] flex flex-col overflow-y-auto shadow-[0_1px_2px_rgba(93,64,55,0.04)]">
        {!currentConv ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c5b9a8] text-xs text-center px-4">Select a conversation to see details</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* NERC avatar + name */}
            <div className="flex flex-col items-center text-center px-5 pt-12 pb-7 border-b border-[#E7DCC9]">
              <div className="w-11 h-11 rounded-full bg-[#35AB50] flex items-center justify-center text-white font-bold text-sm mb-3">N</div>
              <p className="font-bold text-[#3d2b1f] text-sm">NERC Copra Trading</p>
              <p className="text-[#8b7355] text-[11px] mt-0.5">General Santos City</p>
              <div className="flex items-center gap-1 mt-1.5">
                <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-xs font-semibold text-[#3d2b1f]">Verified Buyer</span>
              </div>
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
                  preview_url:     pendingContractRow.contract_document_url,
                })}
                className="block w-[calc(100%-2.5rem)] mx-auto py-2.5 rounded-[9px] bg-[#17682D] text-white font-bold text-xs text-center hover:bg-[#105523] transition-all"
              >
                Review & Sign Contract
              </button>
            )}

            {/* Negotiation summary */}
            <div className="px-5">
              <p className="text-xs font-semibold text-[#6B4A40] uppercase mb-3">Negotiation Summary</p>
              <div className="space-y-3.5 bg-[#FAF5EC] rounded-xl p-4">
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
              <p className="text-xs font-semibold text-[#6B4A40] uppercase mb-3">Signed Contracts</p>
              {contracts.length === 0 ? (
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
                        {c.status === "Pending" && !c.supplier_authorized_at && (
                          <button
                            onClick={() => setSignContract({
                              contract_id:     c.contract_id,
                              contract_number: c.contract_number,
                              price_per_kg:    c.negotiated_price_per_kg,
                              contracted_tons: c.contracted_tons,
                              due_date:        c.due_date,
                              preview_url:     c.contract_document_url,
                            })}
                            className="text-[10px] text-[#2d5a27] font-semibold hover:underline"
                          >
                            Review & Sign
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

      {/* Propose Price Modal */}
      {showProposeModal && currentConv && canNegotiate && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={user.id}
          ensureConversation={ensureOpenConversation}
          onClose={() => setShowProposeModal(false)}
          onSubmitted={async (...submission) => {
            const targetConversationId = submission[1];
            setShowProposeModal(false);
            // Notify BO
            await supabase.from("notifications").insert({
              user_id: currentConv.business_owner_id, notification_type: "New Proposal",
              message: `${profile?.first_name ?? "Supplier"} submitted a new price proposal.`,
              related_entity_type: "conversations", related_entity_id: targetConversationId,
            });
            await loadChat(targetConversationId);
          }}
        />
      )}

      {counterModal && currentConv && canNegotiate && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={user.id}
          isCounter
          supersedesId={counterModal.proposal_id}
          onClose={() => setCounterModal(null)}
          onSubmitted={async (...submission) => {
            const targetConversationId = submission[1];
            await supabase.from("proposal_forms")
              .update({ proposal_status: "Modified", reviewed_by: user.id })
              .eq("proposal_id", counterModal.proposal_id)
              .eq("proposal_status", "Pending");
            await supabase.from("notifications").insert({
              user_id: currentConv.business_owner_id,
              notification_type: "New Proposal",
              message: `${profile?.first_name ?? "Supplier"} sent a counteroffer.`,
              related_entity_type: "conversations",
              related_entity_id: targetConversationId,
            });
            setCounterModal(null);
            await loadChat(targetConversationId);
          }}
        />
      )}

      {/* Sign Contract Modal */}
      {signContract && (
        <SupplierContractReviewModal
          contract={signContract}
          onClose={() => setSignContract(null)}
          onSigned={async () => {
            setSignContract(null);
            await loadChat(conversationId);
          }}
        />
      )}
      </div>
    </div>
  );
}
