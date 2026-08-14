import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LuSearch, LuSend, LuCoins, LuCheck, LuX, LuPencil,
  LuClock, LuFileText, LuStar, LuCheckCheck, LuPaperclip, LuPlus,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";
import SupplierContractReviewModal from "../../components/SupplierContractReviewModal";

function fmtTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d;
  if (diff < 60_000)    return "Just now";
  if (diff < 86_400_000) return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
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

// ── Contract card shown in chat ───────────────────────────────────────────────
function ContractCard({ contractData, onReviewSign, signed }) {
  return (
    <div className="flex justify-start my-2 px-4">
      <div className={`text-white rounded-2xl rounded-bl-sm p-4 w-72 shadow-md ${signed ? "bg-[#1f4a1a]" : "bg-[#2d5a27]"}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <LuFileText className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-sm">{contractData.contract_number}</p>
            <p className="text-white/70 text-xs">
              {signed ? "Signed & Active" : "Awaiting your signature"}
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
        {!signed && (
          <button
            onClick={onReviewSign}
            className="mt-3 w-full py-2 rounded-xl bg-white text-[#2d5a27] font-bold text-xs hover:bg-white/90 transition-all"
          >
            Review & Sign Contract
          </button>
        )}
        {signed && (
          <div className="mt-3 w-full py-2 rounded-xl bg-white/10 text-white font-semibold text-xs text-center">
            ✓ Contract Active
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
  const { user, profile } = useAuth();

  // Left panel
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [convLoading, setConvLoading] = useState(true);
  const [starting, setStarting] = useState(false);

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
  const bottomRef = useRef(null);
  const isInitialLoad = useRef(false);

  // Right panel
  const [contracts, setContracts] = useState([]);

  // ── Load conversations ────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select(`conversation_id, status, created_at, messages(message_text, sent_at, sender_id)`)
      .eq("supplier_id", user.id)
      .order("created_at", { ascending: false });

    const enriched = (data ?? []).map(c => {
      const sorted = [...(c.messages ?? [])].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      return { ...c, lastMsg: sorted[0] ?? null };
    });
    setConversations(enriched);
    setConvLoading(false);
  }, [user.id]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

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
    if (conversationId) loadChat(conversationId);
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

  // Auto-scroll to bottom — instant on initial load, smooth for live messages
  useEffect(() => {
    if (!bottomRef.current) return;
    if (isInitialLoad.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
        isInitialLoad.current = false;
      }, 50);
    } else {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
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

  // ── First Pending contract in this supplier's list, for the "Review & Sign" shortcut ─
  const pendingContractRow = contracts.find(c => c.status === "Pending" && c.docuseal_submission_id);

  return (
    <div className="flex h-[calc(100vh-88px)] rounded-2xl overflow-hidden shadow-sm border border-[#e8e0d0]">

      {/* ── LEFT PANEL ────────────────────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 bg-white flex flex-col border-r border-[#e8e0d0]">
        <div className="px-4 pt-4 pb-3 border-b border-[#f0e8d8] flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b09a7a]" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full bg-[#f5f0e8] text-sm text-[#3d2b1f] placeholder-[#b09a7a] focus:outline-none border-0" />
          </div>
          <button onClick={startNewConversation} disabled={starting}
            className="w-8 h-8 rounded-full bg-[#2d5a27] text-white flex items-center justify-center hover:bg-[#234820] transition-all disabled:opacity-60 shrink-0">
            {starting ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LuPlus className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-[#8b7355] text-sm mb-3">No negotiations yet</p>
              <button onClick={startNewConversation} disabled={starting}
                className="text-xs bg-[#2d5a27] text-white px-4 py-2 rounded-xl hover:bg-[#234820] transition-all">
                Start Negotiation
              </button>
            </div>
          ) : (
            conversations.filter(c => {
              const last = c.lastMsg?.message_text ?? "";
              return last.toLowerCase().includes(search.toLowerCase()) || "nerc copra".includes(search.toLowerCase());
            }).map(c => {
              const isActive = c.conversation_id === conversationId;
              return (
                <button key={c.conversation_id}
                  onClick={() => navigate(`/dashboard/supplier/conversations/${c.conversation_id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors relative
                    ${isActive ? "bg-[#f0ebe0] border-l-4 border-[#2d5a27]" : "hover:bg-[#faf7f2] border-l-4 border-transparent"}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${isActive ? "bg-[#2d5a27]" : "bg-[#4a7c40]"}`}>
                    N
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-semibold text-[#3d2b1f] text-sm">NERC Copra Trading</p>
                      <span className="text-[10px] text-[#b09a7a] shrink-0">{fmtTime(c.lastMsg?.sent_at ?? c.created_at)}</span>
                    </div>
                    <p className="text-[#8b7355] text-xs truncate mt-0.5">
                      {c.lastMsg?.message_text?.replace(/^CONTRACT_CARD:.*/, "Contract sent") ?? "No messages yet"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── MIDDLE PANEL ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[#faf7f4] min-w-0">
        {!conversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 bg-[#e8f0e5] rounded-2xl flex items-center justify-center mb-4">
              <LuFileText className="w-8 h-8 text-[#2d5a27]" />
            </div>
            <p className="text-[#3d2b1f] font-bold text-lg mb-1">Select a conversation</p>
            <p className="text-[#8b7355] text-sm">Choose a negotiation from the list or start a new one.</p>
          </div>
        ) : chatLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#2d5a27] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-[#e8e0d0] shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#2d5a27] flex items-center justify-center text-white font-bold text-sm">N</div>
              <div className="flex-1">
                <p className="font-bold text-[#3d2b1f]">NERC Copra Trading</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  <p className="text-[#8b7355] text-xs">{currentConv?.status === "Open" ? "Active negotiation" : "Closed"}</p>
                </div>
              </div>
              {currentConv?.status === "Open" && (
                <button onClick={() => setShowProposeModal(true)}
                  className="flex items-center gap-1.5 bg-[#2d5a27] text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-[#234820] transition-all">
                  <LuCoins className="w-3.5 h-3.5" /> Propose Price
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-4 space-y-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center text-[#b09a7a] text-sm px-4">
                  <p>Say hello, then tap "Propose Price" to start negotiating.</p>
                </div>
              )}
              {messages.map(msg => {
                const isMine = msg.sender_id === user.id;

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
                        onReviewSign={() => setSignContract({
                          contract_id:     contractRow?.contract_id,
                          contract_number: cardData.contract_number,
                          price_per_kg:    cardData.price_per_kg,
                          contracted_tons: cardData.contracted_tons,
                          due_date:        cardData.due_date ?? contractRow?.due_date,
                          preview_url:     cardData.preview_url,
                        })}
                      />
                    );
                  } catch { /* fall through */ }
                }

                if (msg.message_type === "Contract Form") {
                  return (
                    <div key={msg.message_id} className="flex justify-center px-4">
                      <p className="text-[#2d5a27] text-xs italic text-center max-w-xs">{msg.message_text}</p>
                    </div>
                  );
                }

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
                  submittedByMe={latestSubmittedBySupplier}
                  onAccept={() => acceptCounter(latestProposal)}
                  onReject={() => rejectProposal(latestProposal)}
                  onCounter={() => setCounterModal(latestProposal)}
                />
              )}

              {/* DocuSeal sign prompt removed — Review & Sign is now on each contract card */}

              <div ref={bottomRef} />
            </div>

            {/* Action chips */}
            {currentConv?.status === "Open" && (
              <div className="flex gap-2 px-4 py-2 bg-white border-t border-[#f0e8d8] shrink-0">
                <button onClick={() => setShowProposeModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f5f0e8] text-[#5c4a32] font-semibold text-xs hover:bg-[#ebe5d5] transition-all">
                  <LuCoins className="w-3.5 h-3.5" /> Propose Price
                </button>
              </div>
            )}

            {/* Message input */}
            {currentConv?.status === "Open" && (
              <form onSubmit={sendMessage} className="flex items-center gap-3 px-4 py-3 bg-white border-t border-[#e8e0d0] shrink-0">
                <button type="button" className="text-[#b09a7a] hover:text-[#8b7355] transition-colors">
                  <LuPaperclip className="w-5 h-5" />
                </button>
                <input type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder="Message NERC Copra Trading…"
                  className="flex-1 px-4 py-2.5 rounded-full bg-[#f5f0e8] text-sm text-[#3d2b1f] placeholder-[#b09a7a] focus:outline-none border-0" />
                <button type="submit" disabled={!text.trim() || sending}
                  className="w-9 h-9 rounded-full bg-[#2d5a27] text-white flex items-center justify-center hover:bg-[#234820] transition-all disabled:opacity-50">
                  <LuSend className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className="w-[200px] shrink-0 bg-white border-l border-[#e8e0d0] flex flex-col overflow-y-auto">
        {!conversationId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c5b9a8] text-xs text-center px-4">Select a conversation to see details</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* NERC avatar + name */}
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-14 h-14 rounded-full bg-[#2d5a27] flex items-center justify-center text-white font-bold text-xl mb-2">N</div>
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
                className="block w-full py-2.5 rounded-xl bg-[#2d5a27] text-white font-bold text-sm text-center hover:bg-[#234820] transition-all"
              >
                Review & Sign Contract
              </button>
            )}

            {/* Negotiation summary */}
            <div>
              <p className="text-[10px] font-bold text-[#b09a7a] uppercase tracking-wider mb-2">Negotiation Summary</p>
              <div className="space-y-2">
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
            <div>
              <p className="text-[10px] font-bold text-[#b09a7a] uppercase tracking-wider mb-2">Signed Contracts</p>
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
  );
}
