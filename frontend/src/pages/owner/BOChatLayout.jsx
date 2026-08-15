import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LuSend, LuCoins, LuCheck, LuX, LuPencil,
  LuClock, LuFileText, LuStar, LuLoader,
  LuArrowLeft, LuCheckCheck, LuCircleAlert,
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
  return (
    <div className="flex justify-end my-2 px-4">
      <div
        className={`w-72 max-w-full overflow-hidden rounded-2xl rounded-br-sm border border-[#A2D5AB] bg-[#EDF7EF] shadow-sm ${contractData.preview_url ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
        onClick={() => contractData.preview_url && onTapPreview?.(contractData.preview_url)}
      >
        <div className="flex items-center gap-2 bg-[#2E7D32] px-4 py-3 text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
            <LuFileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium leading-tight text-white/75">
              {signed ? "Contract active" : "Contract sent"}
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
          <div className="mt-2.5 flex items-center justify-between border-t border-[#A2D5AB]/60 pt-2 text-[10px]">
            <span className="text-[#8B7355]">
              Due {contractData.due_date ? fmtDate(contractData.due_date) : "after activation"}
            </span>
            {contractData.preview_url && (
              <span className="font-bold text-[#17682D] underline underline-offset-2">
                Review document
              </span>
            )}
          </div>
        </div>
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
            <button onClick={onAccept}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#e8f0e5] text-[#2d5a27] font-semibold text-xs py-2 rounded-xl hover:bg-[#d4e5cf] transition-all">
              <LuCheck className="w-3.5 h-3.5" /> Accept
            </button>
            <button onClick={onCounter}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#f5f0e8] text-[#5c4a32] font-semibold text-xs py-2 rounded-xl hover:bg-[#ebe5d5] transition-all">
              <LuPencil className="w-3.5 h-3.5" /> Counter
            </button>
            <button onClick={onReject}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-red-600 font-semibold text-xs py-2 rounded-xl hover:bg-red-100 transition-all">
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
  const [conversationFilter, setConversationFilter] = useState("all");
  const [convLoading, setConvLoading] = useState(true);

  // Middle panel
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [counterModal, setCounterModal] = useState(null);
  const messagesContainerRef = useRef(null);
  const isInitialLoad = useRef(false);

  // Right panel
  const [supplierData, setSupplierData] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [sendingContract, setSendingContract] = useState(false);
  const [contractError, setContractError] = useState(null);
  const [contractDraft, setContractDraft] = useState(null);
  const [contractDraftError, setContractDraftError] = useState("");
  const [toast, setToast] = useState(null);
  const [onlineSupplierIds, setOnlineSupplierIds] = useState(() => new Set());

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

  useEffect(() => {
    const timer = window.setTimeout(fetchConversations, 0);
    return () => window.clearTimeout(timer);
  }, [fetchConversations]);

  // Track which Suppliers currently have an authenticated dashboard session.
  useEffect(() => {
    const channel = supabase
      .channel("online-suppliers")
      .on("presence", { event: "sync" }, () => {
        const presences = Object.values(channel.presenceState()).flat();
        setOnlineSupplierIds(new Set(presences.map(presence => presence.user_id).filter(Boolean)));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Keep the open chat and every conversation preview current without refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`bo-live-messages:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        ({ new: incoming }) => {
          if (incoming.conversation_id === conversationId) {
            setMessages(previous => previous.some(message => message.message_id === incoming.message_id)
              ? previous
              : [...previous, incoming]);
          }

          setConversations(previous => previous
            .map(conversation => conversation.conversation_id === incoming.conversation_id
              ? {
                  ...conversation,
                  lastMsg: incoming,
                  unread: incoming.sender_id !== user.id && incoming.conversation_id !== conversationId,
                }
              : conversation)
            .sort((a, b) => new Date(b.lastMsg?.sent_at ?? b.created_at) - new Date(a.lastMsg?.sent_at ?? a.created_at)));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user.id]);

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
        .select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, docuseal_submission_id, docuseal_bo_slug, docuseal_supplier_slug")
        .eq("supplier_id", conv.supplier.user_id)
        .eq("business_owner_id", conv.business_owner_id ?? user.id)
        .order("created_at", { ascending: false });

      setContracts(contractData ?? []);
    }

    setChatLoading(false);
    isInitialLoad.current = true;
  }, [user.id]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = window.setTimeout(() => loadChat(conversationId), 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, loadChat]);

  // ── Realtime subscription for selected chat ───────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`bo-chat:${conversationId}`)
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
    const container = messagesContainerRef.current;
    if (!container) return undefined;

    if (isInitialLoad.current) {
      // Use a small timeout so the DOM finishes rendering before scrolling
      const timer = window.setTimeout(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        isInitialLoad.current = false;
      }, 50);
      return () => window.clearTimeout(timer);
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return undefined;
  }, [messages]);

  // ── Latest pending proposal logic ─────────────────────────────────────────
  const latestProposalIndex = [...proposals]
    .map((p, i) => ({ p, i })).reverse()
    .find(({ p }) => p.proposal_status !== "Rejected" && p.proposal_status !== "Modified")?.i ?? -1;
  const latestProposal = latestProposalIndex >= 0 ? proposals[latestProposalIndex] : null;
  // odd index = BO's counter (submitted by BO), even = supplier's proposal
  const latestSubmittedByBO = latestProposalIndex % 2 === 1;

  // ── Latest accepted proposal (for negotiation summary) ────────────────────
  const acceptedProposal = [...proposals].reverse().find(p => p.proposal_status === "Accepted") ?? null;

  // ── Pending contract (has contract but no DocuSeal yet) ────────────────────
  const pendingContract = contracts.find(c => c.status === "Pending" && !c.docuseal_submission_id) ?? null;
  const sentContract    = contracts.find(c => c.docuseal_submission_id) ?? null;

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
    await supabase.from("proposal_forms").update({ proposal_status: "Accepted", reviewed_by: user.id }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form",
      message_text: `You accepted ${currentConv?.supplier?.first_name}'s proposal form.\nPrice: ₱${proposal.proposed_price_per_kg}/kg  Volume: ${proposal.proposed_volume_tons} tons`,
    });
    // Notify supplier
    await supabase.from("notifications").insert({
      user_id: currentConv?.supplier?.user_id, notification_type: "Proposal Accepted",
      message: `Your proposal (₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons) was accepted. A contract is being prepared.`,
      related_entity_type: "proposal_forms", related_entity_id: proposal.proposal_id,
    });
    await createContractRecord(proposal);
    await loadChat(conversationId);
  }

  async function rejectProposal(proposal) {
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
  }

  async function createContractRecord(proposal) {
    const { data: numData } = await supabase.rpc("generate_contract_number");
    const { data: contract } = await supabase.from("contracts").insert({
      contract_number: numData,
      supplier_id: currentConv.supplier.user_id,
      business_owner_id: currentConv.business_owner_id ?? user.id,
      negotiated_price_per_kg: proposal.proposed_price_per_kg,
      contracted_tons: proposal.proposed_volume_tons,
      signing_date: new Date().toISOString().split("T")[0],
      status: "Pending",
    }).select("contract_id, contract_number, negotiated_price_per_kg, contracted_tons, due_date").single();

    if (contract) {
      await supabase.from("conversations").update({ contract_id: contract.contract_id }).eq("conversation_id", conversationId);
      setContracts(prev => [{ ...contract, status: "Pending", docuseal_submission_id: null, docuseal_bo_slug: null }, ...prev]);
    }
  }

  // ── Send Contract (DocuSeal generation) ───────────────────────────────────
  async function handleSendContract() {
    setSendingContract(true);
    setContractDraftError("");

    const supplierProposal = [...proposals].reverse().find(proposal =>
      proposal.proposed_price_per_kg && proposal.proposed_volume_tons,
    );
    let contractNumber = pendingContract?.contract_number;

    if (!contractNumber) {
      const { data, error } = await supabase.rpc("generate_contract_number");
      if (error || !data) {
        showToast(error?.message ?? "Could not generate a contract ID.", "error");
        setSendingContract(false);
        return;
      }
      contractNumber = data;
    }

    const projectedDue = new Date();
    projectedDue.setMonth(projectedDue.getMonth() + 1);
    projectedDue.setDate(projectedDue.getDate() + 1);

    setContractDraft({
      contractId: pendingContract?.contract_id ?? null,
      contractNumber,
      supplierName: `${supplierData?.first_name ?? ""} ${supplierData?.last_name ?? ""}`.trim(),
      price: String(pendingContract?.negotiated_price_per_kg ?? supplierProposal?.proposed_price_per_kg ?? ""),
      volume: String(pendingContract?.contracted_tons ?? supplierProposal?.proposed_volume_tons ?? ""),
      dueDate: pendingContract?.due_date ?? projectedDue.toISOString().slice(0, 10),
    });
    setSendingContract(false);
  }

  async function submitContractDraft(e) {
    e.preventDefault();
    const price = Number(contractDraft.price);
    const volume = Number(contractDraft.volume);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume <= 0) {
      setContractDraftError("Enter a valid price and quantity greater than zero.");
      return;
    }

    setSendingContract(true);
    setContractError(null);
    setContractDraftError("");

    const contractValues = {
      contract_number: contractDraft.contractNumber,
      supplier_id: currentConv.supplier.user_id,
      business_owner_id: currentConv.business_owner_id ?? user.id,
      negotiated_price_per_kg: price,
      contracted_tons: volume,
      signing_date: new Date().toISOString().split("T")[0],
      due_date: contractDraft.dueDate,
      status: "Pending",
    };

    const contractQuery = contractDraft.contractId
      ? supabase.from("contracts").update(contractValues).eq("contract_id", contractDraft.contractId)
      : supabase.from("contracts").insert(contractValues);
    const { data: contract, error: saveError } = await contractQuery
      .select("contract_id, contract_number, negotiated_price_per_kg, contracted_tons, due_date")
      .single();

    if (saveError || !contract) {
      setContractDraftError(saveError?.message ?? "Failed to save the contract.");
      setSendingContract(false);
      return;
    }

    await supabase.from("conversations")
      .update({ contract_id: contract.contract_id })
      .eq("conversation_id", conversationId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setContractDraftError("Session expired. Please log in again."); setSendingContract(false); return; }

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ contract_id: contract.contract_id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setContractDraftError(data.error ?? "Failed to generate contract.");
      setSendingContract(false);
      return;
    }

    // Insert contract card message into chat
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
        preview_url:     data.preview_url,
      })}`,
    });

    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text",
      message_text: "Here's the contract. Please review and sign when you're ready.",
    });

    showToast("Contract sent to supplier for review & signature.");
    setContractDraft(null);
    await loadChat(conversationId);
    setSendingContract(false);
  }

  function handlePriceAction() {
    if (!latestProposal) {
      showToast("The supplier must submit the initial price and volume before you can counteroffer.", "error");
      return;
    }
    if (latestProposal.proposal_status !== "Pending") {
      showToast("There is no pending proposal to counteroffer.", "error");
      return;
    }
    if (latestSubmittedByBO) {
      showToast("Your counteroffer is awaiting the supplier's response.", "error");
      return;
    }
    setCounterModal(latestProposal);
  }

  // ── Filtered conversations list ────────────────────────────────────────────
  const filtered = conversations.filter(c => conversationFilter === "all" || c.unread);
  const selectedSupplierOnline = onlineSupplierIds.has(currentConv?.supplier?.user_id);

  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-[#FAF7EF] p-2 xl:h-[calc(100vh-104px)] xl:min-h-[620px] xl:flex-row xl:overflow-hidden">

      {/* ── LEFT PANEL — Conversations list ──────────────────────────────── */}
      <div className={`${conversationId ? "hidden xl:flex" : "flex"} h-[320px] w-full shrink-0 flex-col overflow-hidden rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(93,64,55,0.04)] xl:h-auto xl:w-[280px]`}>
        {/* Header and filters */}
        <div className="px-5 pt-4 pb-3 border-b border-[#E7DCC9]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-extrabold text-[#5D4037]">Conversations</h2>
            <span className="w-6 h-6 rounded-full bg-[#BBD8B9] text-[#285D2E] font-extrabold text-xs flex items-center justify-center">
              {conversations.length}
            </span>
          </div>
          <div className="grid grid-cols-2 rounded-xl bg-[#E9DECA] p-1 text-[11px] text-[#6D5147]">
            <button type="button" onClick={() => setConversationFilter("all")} aria-pressed={conversationFilter === "all"}
              className={`rounded-lg py-1.5 font-semibold transition-colors ${conversationFilter === "all" ? "bg-white shadow-sm" : "hover:bg-white/40"}`}>
              All
            </button>
            <button type="button" onClick={() => setConversationFilter("unread")} aria-pressed={conversationFilter === "unread"}
              className={`rounded-lg py-1.5 font-semibold transition-colors ${conversationFilter === "unread" ? "bg-white shadow-sm" : "hover:bg-white/40"}`}>
              Unread
            </button>
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
                  className={`w-full min-h-[84px] flex items-center gap-3 px-4 py-4 text-left transition-colors duration-150 relative border-b border-[#EEE4D4]
                    ${isActive ? "bg-[#E9DDC7] border-l-[3px] border-l-[#17682D]" : "bg-[#FFFEFB] hover:bg-[#FAF5EA] border-l-[3px] border-l-transparent"}`}>
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-[#35AB50]">
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
      <div className={`${conversationId ? "flex" : "hidden xl:flex"} h-[70vh] min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(93,64,55,0.04)] xl:h-auto xl:min-h-0`}>
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
            <div className="flex items-center gap-3 border-b border-[#E7DCC9] bg-[#FFFEFB] px-4 py-4 sm:px-7 shrink-0">
              <button
                type="button"
                onClick={() => navigate("/dashboard/owner/conversations")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E4D5BD] text-[#5D4037] hover:bg-[#FAF5EA] xl:hidden"
                aria-label="Return to conversations"
              >
                <LuArrowLeft className="h-4 w-4" />
              </button>
              <div className="relative w-11 h-11 rounded-full bg-[#35AB50] flex items-center justify-center text-white font-bold text-xs">
                {initials(currentConv?.supplier?.first_name, currentConv?.supplier?.last_name)}
                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${selectedSupplierOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
              </div>
              <div className="flex-1">
                <p className="truncate text-base font-extrabold leading-tight text-[#5D4037] sm:text-[18px]">
                  {currentConv?.supplier?.first_name} {currentConv?.supplier?.last_name}
                </p>
                <div className="flex items-center">
                  <p className="text-[#8b7355] text-xs">
                    {selectedSupplierOnline ? "Online" : "Offline"}
                    {currentConv?.supplier?.email && <span className="ml-2 hidden sm:inline">· {currentConv.supplier.email}</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#FFFEFB]">
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
                        onTapPreview={url => url && window.open(url, "_blank")}
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
                  <div className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed sm:max-w-[65%] rounded-2xl ${
                      isMine
                        ? "bg-[#17682D] text-white rounded-br-sm"
                        : "bg-[#FBF3E2] text-[#3d2b1f] rounded-bl-sm shadow-sm border border-[#E8DCC8]"
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
                  onAccept={() => acceptProposal(latestProposal)}
                  onReject={() => rejectProposal(latestProposal)}
                  onCounter={() => setCounterModal(latestProposal)}
                />
              )}
            </div>

            {/* Quick action chips */}
            {currentConv?.status === "Open" && (
              <div className="grid grid-cols-2 gap-1.5 px-3 pt-2 bg-[#FFFEFB] border-t border-[#E7DCC9] shrink-0">
                <button onClick={handleSendContract} disabled={sendingContract}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#A78D80] text-white font-medium text-[10px] hover:bg-[#8D756A] transition-all disabled:opacity-60">
                  {sendingContract ? <LuLoader className="w-3.5 h-3.5 animate-spin" /> : <LuFileText className="w-3.5 h-3.5" />}
                  Send Contract
                </button>
                {sentContract?.docuseal_supplier_slug && sentContract.status === "Pending" && (
                  <a href={`https://docuseal.com/s/${sentContract.docuseal_supplier_slug}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#FBF3E2] text-[#5D4037] font-medium text-[10px] hover:bg-[#F5EBD7] transition-all">
                    <LuFileText className="w-3.5 h-3.5" /> View Contract Document
                  </a>
                )}
                <button onClick={handlePriceAction}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#FBF3E2] text-[#5D4037] font-medium text-[10px] hover:bg-[#F5EBD7] transition-all">
                  <LuCoins className="w-3.5 h-3.5" /> Counteroffer
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
              <form onSubmit={sendMessage} className="flex items-center gap-3 mx-3 mb-3 mt-2 px-4 py-2.5 bg-[#EDE3D1] rounded-full shrink-0">
                <input
                  type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder={`Message ${currentConv?.supplier?.first_name ?? ""}…`}
                  className="flex-1 min-w-0 bg-transparent text-sm text-[#3d2b1f] placeholder-[#A18D82] focus:outline-none border-0"
                />
                <button type="submit" disabled={!text.trim() || sending}
                  className="w-9 h-9 rounded-full bg-[#17682D] text-white flex items-center justify-center hover:bg-[#105523] transition-all disabled:opacity-50">
                  <LuSend className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT PANEL — Supplier info ───────────────────────────────────── */}
      <div className={`${conversationId ? "flex" : "hidden xl:flex"} w-full shrink-0 flex-col overflow-y-auto rounded-[18px] border border-[#E4D5BD] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(93,64,55,0.04)] xl:w-[250px]`}>
        {!conversationId || !supplierData ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c5b9a8] text-xs text-center px-4">Select a conversation to see supplier details</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Avatar + name + location */}
            <div className="flex flex-col items-center text-center px-5 pt-12 pb-7 border-b border-[#E7DCC9]">
              <div className="w-11 h-11 rounded-full bg-[#35AB50] flex items-center justify-center text-white font-bold text-xs mb-3">
                {initials(supplierData.first_name, supplierData.last_name)}
              </div>
              <p className="font-bold text-[#3d2b1f] text-sm">{supplierData.first_name} {supplierData.last_name}</p>
              {supplierData.address && (
                <p className="text-[#8b7355] text-[11px] mt-0.5 leading-tight">
                  {supplierData.address.split(",").slice(0, 2).join(",")}
                </p>
              )}
              {supplierData.rating !== null && (
                <div className="flex items-center gap-1 mt-2 bg-[#F2E8D3] text-[#796156] px-3 py-1 rounded-full">
                  <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-semibold text-[#3d2b1f]">{Number(supplierData.rating).toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Send Contract / Sign button */}
            {!sentContract?.docuseal_supplier_slug && (
              <button onClick={handleSendContract} disabled={sendingContract}
                className="w-[calc(100%-2.5rem)] mx-auto px-4 py-3 rounded-[9px] bg-[#17682D] text-white font-bold text-xs hover:bg-[#105523] transition-all disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap">
                {sendingContract ? <LuLoader className="w-4 h-4 animate-spin" /> : <LuFileText className="w-4 h-4" />}
                Send Contract
              </button>
            )}
            {sentContract?.docuseal_supplier_slug && sentContract.status === "Pending" && (
              <a href={`https://docuseal.com/s/${sentContract.docuseal_supplier_slug}`} target="_blank" rel="noopener noreferrer"
                className="block mx-5 py-2.5 rounded-[9px] bg-[#17682D] text-white font-bold text-xs text-center hover:bg-[#105523] transition-all">
                View Contract Document
              </a>
            )}
            {sentContract?.status === "Pending" && (
              <div className="mx-5 text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-center">
                Awaiting supplier signature…
              </div>
            )}

            {/* Negotiation summary */}
            <div className="px-5">
              <p className="text-xs font-semibold text-[#6B4A40] uppercase mb-3">Negotiation Summary</p>
              <div className="space-y-3.5 bg-[#FAF5EC] rounded-xl p-4">
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
            <div className="px-5 pb-5">
              <p className="text-xs font-semibold text-[#6B4A40] uppercase mb-3">Signed Contracts</p>
              {contracts.filter(c => c.status !== "Pending" || c.docuseal_submission_id).length === 0 ? (
                <div className="bg-[#FAF5EC] rounded-xl p-5 text-[11px] text-[#8b7355] text-center leading-relaxed">
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
                        {c.docuseal_supplier_slug && (
                          <a href={`https://docuseal.com/s/${c.docuseal_supplier_slug}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline">View</a>
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

      {/* Contract-making modal */}
      {contractDraft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={() => !sendingContract && setContractDraft(null)}>
          <div className="w-full max-w-3xl rounded-[28px] bg-[#FBF7EF] shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <form onSubmit={submitContractDraft} className="p-7 sm:p-9">
              <div className="flex items-center justify-between border-b border-[#DFCDB2] pb-5">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-[#B8DCB5] text-[#17682D] flex items-center justify-center">
                    <LuFileText className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#8b7355]">Contract Making</p>
                    <h2 className="text-xl font-extrabold text-[#402413]">New Contract</h2>
                  </div>
                </div>
                <button type="button" onClick={() => setContractDraft(null)} disabled={sendingContract}
                  className="p-2 rounded-full text-[#8b7355] hover:bg-[#EFE5D5] disabled:opacity-50">
                  <LuX className="w-5 h-5" />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5 py-6">
                <label className="block">
                  <span className="block mb-2 text-sm font-bold text-[#4B2814]">Supplier</span>
                  <input value={contractDraft.supplierName} readOnly
                    className="w-full rounded-full border border-[#B98661] bg-white/60 px-5 py-2.5 text-sm text-[#8b7355] outline-none" />
                </label>
                <label className="block">
                  <span className="block mb-2 text-sm font-bold text-[#4B2814]">Contract ID</span>
                  <input value={contractDraft.contractNumber} readOnly
                    className="w-full rounded-full border border-[#B98661] bg-white/60 px-5 py-2.5 text-sm text-[#8b7355] outline-none" />
                </label>
                <label className="block">
                  <span className="block mb-2 text-sm font-bold text-[#4B2814]">Negotiated Price (₱/kg)</span>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#4B2814]">₱</span>
                    <input type="number" min="0.01" step="0.01" required value={contractDraft.price}
                      onChange={e => setContractDraft(draft => ({ ...draft, price: e.target.value }))}
                      placeholder="Enter price per kilogram"
                      className="w-full rounded-full border border-[#B98661] bg-white px-10 py-2.5 text-sm text-[#4B2814] outline-none focus:ring-2 focus:ring-[#17682D]/20" />
                  </div>
                </label>
                <label className="block">
                  <span className="block mb-2 text-sm font-bold text-[#4B2814]">Quantity (Tons)</span>
                  <input type="number" min="0.01" step="0.01" required value={contractDraft.volume}
                    onChange={e => setContractDraft(draft => ({ ...draft, volume: e.target.value }))}
                    placeholder="Enter quantity in tons"
                    className="w-full rounded-full border border-[#B98661] bg-white px-5 py-2.5 text-sm text-[#4B2814] outline-none focus:ring-2 focus:ring-[#17682D]/20" />
                </label>
                <label className="block">
                  <span className="block mb-2 text-sm font-bold text-[#4B2814]">Due Date</span>
                  <input value={fmtDate(contractDraft.dueDate)} readOnly
                    className="w-full rounded-full border border-[#B98661] bg-white/60 px-5 py-2.5 text-sm text-[#8b7355] outline-none" />
                  <span className="block mt-1.5 text-[10px] text-[#8b7355]">Automatically calculated as one month and one day from contract creation.</span>
                </label>
              </div>

              {contractDraftError && (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                  <LuCircleAlert className="w-4 h-4 shrink-0" /> {contractDraftError}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-2">
                <button type="button" onClick={() => setContractDraft(null)} disabled={sendingContract}
                  className="rounded-lg border border-[#D8C5A8] bg-[#FFFDF8] px-7 py-2.5 text-xs font-bold text-[#402413] shadow-sm hover:bg-white disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={sendingContract}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#17682D] px-7 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#105523] disabled:opacity-60">
                  {sendingContract && <LuLoader className="w-4 h-4 animate-spin" />}
                  {sendingContract ? "Sending…" : "Send Contract"}
                </button>
              </div>
            </form>
          </div>
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
              user_id: currentConv.supplier?.user_id, notification_type: "Counteroffer Received",
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
