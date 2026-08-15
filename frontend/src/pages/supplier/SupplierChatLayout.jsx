import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  LuSend, LuCoins, LuCheck, LuX, LuPencil,
  LuClock, LuFileText, LuStar, LuCheckCheck, LuPaperclip, LuArrowLeft,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";
import SupplierContractReviewModal from "../../components/SupplierContractReviewModal";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function formatSupplierSystemMessage(message = "") {
  return message.replace(
    /^You accepted .+['’]s proposal form\./i,
    "NERC accepted your proposal form.",
  );
}

// ── Contract card shown in chat ───────────────────────────────────────────────
function ContractCard({ contractData, onReviewSign, signed }) {
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
          {!signed ? (
            <button
              onClick={onReviewSign}
              className="mt-3 w-full rounded-xl bg-white py-2 text-xs font-bold text-[#17682D] shadow-sm ring-1 ring-[#A2D5AB]/50 transition-colors hover:bg-[#F7FCF8]"
            >
              Review &amp; Sign Contract
            </button>
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

// ── Proposal card ─────────────────────────────────────────────────────────────
function ProposalCard({ proposal, submittedByMe, onAccept, onReject, onCounter }) {
  return (
    <div className="flex justify-center my-3 px-4">
      <div className="bg-white border-2 border-[#2d5a27]/20 rounded-2xl p-4 w-full max-w-xs shadow-sm">
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
      const { data } = await supabase.from("conversations")
        .select("conversation_id")
        .eq("supplier_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.conversation_id) {
        navigate(`/dashboard/supplier/conversations/${data.conversation_id}`, { replace: true });
      } else {
        setResolvingConversation(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, navigate, user.id]);

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
        .select("contract_id, contract_number, status, negotiated_price_per_kg, contracted_tons, due_date, docuseal_submission_id, docuseal_supplier_slug, docuseal_bo_slug")
        .eq("supplier_id", user.id)
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

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`sup-chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        payload => setMessages(prev => [...prev, payload.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "proposal_forms", filter: `conversation_id=eq.${conversationId}` },
        () => supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? [])))
      .subscribe();
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
  const latestSubmittedBySupplier = latestProposalIndex % 2 === 0;

  const acceptedProposal = [...proposals].reverse().find(p => p.proposal_status === "Accepted") ?? null;

  // ── Supplier accepts BO's counteroffer ────────────────────────────────────
  async function acceptCounter(proposal) {
    await supabase.from("proposal_forms").update({ proposal_status: "Accepted" }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Contract Form",
      message_text: `✅ Counteroffer accepted: ₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons.`,
    });
    // Notify BO
    await supabase.from("notifications").insert({
      user_id: currentConv?.business_owner_id, notification_type: "Contract Signed",
      message: `${profile?.first_name ?? "Supplier"} accepted your counteroffer. A contract is ready.`,
      related_entity_type: "conversations", related_entity_id: conversationId,
    });
    // Create contract record
    const { data: numData } = await supabase.rpc("generate_contract_number");
    const { data: contract } = await supabase.from("contracts").insert({
      contract_number: numData,
      supplier_id: user.id,
      business_owner_id: currentConv?.business_owner_id,
      negotiated_price_per_kg: proposal.proposed_price_per_kg,
      contracted_tons: proposal.proposed_volume_tons,
      signing_date: new Date().toISOString().split("T")[0],
      status: "Pending",
    }).select("contract_id").single();
    if (contract) await supabase.from("conversations").update({ contract_id: contract.contract_id }).eq("conversation_id", conversationId);
    await loadChat(conversationId);
  }

  async function rejectProposal(proposal) {
    await supabase.from("proposal_forms").update({ proposal_status: "Rejected" }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text",
      message_text: `❌ Counteroffer declined.`,
    });
    await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, message_type: "Text", message_text: text.trim(),
    });
    setText("");
    setSending(false);
  }

  async function startNewConversation() {
    setStarting(true);
    const { data: boRows } = await supabase.from("users").select("user_id, roles!inner(role_name)").eq("roles.role_name", "Business Owner").eq("account_status", "Active");
    const boId = boRows?.[0]?.user_id;
    if (!boId) { setStarting(false); return; }
    const { data: conv } = await supabase.from("conversations").insert({ supplier_id: user.id, business_owner_id: boId, status: "Open" }).select("conversation_id").single();
    setStarting(false);
    if (conv) navigate(`/dashboard/supplier/conversations/${conv.conversation_id}`);
  }

  function returnToPreviousModule() {
    const returnTo = location.state?.returnTo;
    const isSafeSupplierRoute = typeof returnTo === "string"
      && returnTo.startsWith("/dashboard/supplier")
      && !returnTo.startsWith("/dashboard/supplier/conversations");

    navigate(isSafeSupplierRoute ? returnTo : "/dashboard/supplier");
  }

  // ── First Pending contract in this supplier's list, for the "Review & Sign" shortcut ─
  const pendingContractRow = contracts.find(c => c.status === "Pending" && c.docuseal_submission_id);

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
        ) : !conversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 bg-[#e8f0e5] rounded-2xl flex items-center justify-center mb-4">
              <LuFileText className="w-8 h-8 text-[#2d5a27]" />
            </div>
            <p className="text-[#3d2b1f] font-bold text-lg mb-1">Start a negotiation</p>
            <p className="text-[#8b7355] text-sm mb-4">Connect with NERC Copra Trading to discuss price and volume.</p>
            <button onClick={startNewConversation} disabled={starting}
              className="rounded-xl bg-[#17682D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#105523] disabled:opacity-60">
              {starting ? "Starting…" : "Start Negotiation"}
            </button>
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
                  <p className="text-[#8b7355] text-xs">{currentConv?.status === "Open" ? "Active negotiation" : "Closed"}</p>
                </div>
              </div>
              {currentConv?.status === "Open" && (
                <button onClick={() => setShowProposeModal(true)}
                  className="flex items-center gap-1.5 bg-[#2d5a27] text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-[#234820] transition-all">
                  <LuCoins className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Propose Price</span>
                </button>
              )}
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#FFFEFB]">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center text-[#b09a7a] text-sm px-4">
                  <p>Say hello, then tap "Propose Price" to start negotiating.</p>
                </div>
              )}
              {messages.map(msg => {
                const isMine = msg.sender_id === user.id;

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

                if (msg.message_type === "Contract Form") {
                  return (
                    <div key={msg.message_id} className="flex justify-center px-4">
                      <p className="max-w-xs whitespace-pre-line text-center text-xs italic leading-relaxed text-[#17682D]">
                        {formatSupplierSystemMessage(msg.message_text)}
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

              {/* Pending proposal card */}
              {latestProposal && latestProposal.proposal_status === "Pending" && (
                <ProposalCard
                  proposal={latestProposal}
                  submittedByMe={latestSubmittedBySupplier}
                  onAccept={() => acceptCounter(latestProposal)}
                  onReject={() => rejectProposal(latestProposal)}
                  onCounter={() => setCounterModal(latestProposal)}
                />
              )}

              {/* DocuSeal sign prompt removed — Review & Sign is now on each contract card */}

            </div>

            {/* Action chips */}
            {currentConv?.status === "Open" && (
              <div className="grid grid-cols-1 gap-1.5 px-3 pt-2 bg-[#FFFEFB] border-t border-[#E7DCC9] shrink-0">
                <button onClick={() => setShowProposeModal(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#FBF3E2] text-[#5D4037] font-medium text-[10px] hover:bg-[#F5EBD7] transition-all">
                  <LuCoins className="w-3.5 h-3.5" /> Propose Price
                </button>
              </div>
            )}

            {/* Message input */}
            {currentConv?.status === "Open" && (
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
        {!conversationId ? (
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
                  preview_url:     pendingContractRow.docuseal_supplier_slug
                    ? `https://docuseal.com/s/${pendingContractRow.docuseal_supplier_slug}`
                    : null,
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
                        {c.status === "Pending" && (
                          <button
                            onClick={() => setSignContract({
                              contract_id:     c.contract_id,
                              contract_number: c.contract_number,
                              price_per_kg:    c.negotiated_price_per_kg,
                              contracted_tons: c.contracted_tons,
                              due_date:        c.due_date,
                              preview_url:     c.docuseal_supplier_slug
                                ? `https://docuseal.com/s/${c.docuseal_supplier_slug}`
                                : null,
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
      {showProposeModal && currentConv && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={user.id}
          onClose={() => setShowProposeModal(false)}
          onSubmitted={async (msg) => {
            setShowProposeModal(false);
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
          onClose={() => setCounterModal(null)}
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
            setCounterModal(null);
            await supabase.from("proposal_forms").select("*").eq("conversation_id", conversationId).order("submitted_at", { ascending: true }).then(({ data }) => setProposals(data ?? []));
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
