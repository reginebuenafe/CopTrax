import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LuArrowLeft, LuSend, LuCoins, LuCheck, LuX,
  LuPencil, LuCircleAlert, LuCheckCheck, LuClock,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import ProposePriceModal from "../../components/ProposePriceModal";

export default function ChatPage({ viewerRole = "Supplier" }) {
  const { conversationId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [counterModal, setCounterModal] = useState(null); // proposal to counter
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadData();

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new]);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "proposal_forms",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => loadProposals())
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "proposal_forms",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => loadProposals())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadData() {
    setLoading(true);
    const [{ data: conv }, { data: msgs }] = await Promise.all([
      supabase.from("conversations").select("*, supplier:supplier_id(first_name,last_name), business_owner:business_owner_id(first_name,last_name)").eq("conversation_id", conversationId).single(),
      supabase.from("messages").select("*").eq("conversation_id", conversationId).order("sent_at", { ascending: true }),
    ]);
    setConversation(conv);
    setMessages(msgs ?? []);
    await loadProposals();
    setLoading(false);
  }

  async function loadProposals() {
    const { data } = await supabase
      .from("proposal_forms")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("submitted_at", { ascending: true });
    setProposals(data ?? []);
  }

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

  // BO action: accept proposal
  async function acceptProposal(proposal) {
    await supabase.from("proposal_forms").update({
      proposal_status: "Accepted",
      reviewed_by: user.id,
    }).eq("proposal_id", proposal.proposal_id);

    // Notify via message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: "Contract Form",
      message_text: `✅ Proposal accepted: ₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons. A contract will be prepared.`,
    });

    // Auto-create contract
    await createContract(proposal);
    loadProposals();
  }

  // BO action: reject proposal
  async function rejectProposal(proposal) {
    await supabase.from("proposal_forms").update({
      proposal_status: "Rejected",
      reviewed_by: user.id,
    }).eq("proposal_id", proposal.proposal_id);

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: "Text",
      message_text: `❌ Proposal declined: ₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons.`,
    });
    loadProposals();
  }

  // Auto-create contract from accepted proposal
  async function createContract(proposal) {
    // Generate contract number: CTR-XXXXX
    const { data: numData } = await supabase.rpc("generate_contract_number");
    const contractNumber = numData;

    // Due date = 30 days from today as default
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const { data: contract, error } = await supabase.from("contracts").insert({
      contract_number: contractNumber,
      supplier_id: conversation.supplier_id,
      business_owner_id: conversation.business_owner_id,
      negotiated_price_per_kg: proposal.proposed_price_per_kg,
      contracted_tons: proposal.proposed_volume_tons,
      signing_date: new Date().toISOString().split("T")[0],
      due_date: dueDate.toISOString().split("T")[0],
      status: "Pending",
    }).select("contract_id").single();

    if (!error && contract) {
      // Link conversation to contract
      await supabase.from("conversations").update({ contract_id: contract.contract_id }).eq("conversation_id", conversationId);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        message_type: "Contract Form",
        message_text: `📄 Contract ${contractNumber} has been created. Both parties must sign to activate it.`,
      });
    }
  }

  // Supplier: accept counteroffer (flip it to Accepted)
  async function acceptCounter(proposal) {
    await supabase.from("proposal_forms").update({ proposal_status: "Accepted" }).eq("proposal_id", proposal.proposal_id);
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: "Contract Form",
      message_text: `✅ Counteroffer accepted: ₱${proposal.proposed_price_per_kg}/kg for ${proposal.proposed_volume_tons} tons.`,
    });
    await createContract(proposal);
    loadProposals();
  }

  const isSupplier = viewerRole === "Supplier";
  const isBO = viewerRole === "Business Owner";

  // Latest active (non-rejected) proposal.
  // proposals are ordered by submitted_at ascending — each negotiation turn
  // adds exactly one proposal, so its index parity tells us who submitted it:
  // even index (0,2,…) = Supplier's turn, odd index (1,3,…) = Business Owner's counter.
  const latestProposalIndex = [...proposals]
    .map((p, i) => ({ p, i }))
    .reverse()
    .find(({ p }) => p.proposal_status !== "Rejected")?.i ?? -1;
  const latestProposal = latestProposalIndex >= 0 ? proposals[latestProposalIndex] : null;
  const latestSubmitterRole = latestProposalIndex % 2 === 0 ? "Supplier" : "Business Owner";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-beige-dark/20 bg-white shrink-0">
        <button onClick={() => navigate(-1)} className="text-brown-light hover:text-brown-dark transition-colors">
          <LuArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-green-pale flex items-center justify-center">
          <span className="text-green-dark font-bold text-sm">N</span>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-brown-dark text-sm">
            {isSupplier ? "NERC Copra Trading" : `${conversation?.supplier?.first_name} ${conversation?.supplier?.last_name}`}
          </p>
          <p className="text-brown-light text-xs">
            {conversation?.status === "Open" ? "Active negotiation" : "Closed"}
          </p>
        </div>

        {/* Propose Price button — only Supplier, only in Open conversations */}
        {isSupplier && conversation?.status === "Open" && (
          <button
            onClick={() => setShowProposeModal(true)}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-green-dark to-green-mid
              text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:shadow-glow-green transition-all duration-200"
          >
            <LuCoins className="w-3.5 h-3.5" /> Propose Price
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-brown-light text-sm">
            <p>No messages yet.</p>
            <p className="text-xs mt-1">{isSupplier ? 'Say hello, then tap "Propose Price" when ready.' : "Waiting for the supplier to start."}</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === user.id;
          const isSystem = msg.message_type === "Contract Form";

          if (isSystem) {
            return (
              <div key={msg.message_id} className="flex justify-center">
                <div className="bg-green-pale text-green-dark text-xs font-medium px-4 py-2 rounded-xl max-w-xs text-center">
                  {msg.message_text}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.message_id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isMine
                  ? "bg-gradient-to-br from-green-dark to-green-mid text-white rounded-br-sm"
                  : "bg-beige text-brown-dark rounded-bl-sm"
              }`}>
                {msg.message_text}
                <p className={`text-[10px] mt-1 text-right ${isMine ? "text-white/60" : "text-brown-light"}`}>
                  {new Date(msg.sent_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}

        {/* Active proposal card */}
        {latestProposal && latestProposal.proposal_status === "Pending" && (
          <ProposalCard
            proposal={latestProposal}
            viewerRole={viewerRole}
            submitterRole={latestSubmitterRole}
            onAccept={() => isBO ? acceptProposal(latestProposal) : acceptCounter(latestProposal)}
            onReject={() => rejectProposal(latestProposal)}
            onCounter={() => setCounterModal(latestProposal)}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Message input */}
      {conversation?.status === "Open" && (
        <form onSubmit={sendMessage} className="flex items-center gap-3 px-4 py-3 border-t border-beige-dark/20 bg-white shrink-0">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 rounded-xl border border-beige-dark bg-beige/50 text-sm text-brown-dark
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-dark to-green-mid text-white flex items-center justify-center
              hover:shadow-glow-green transition-all duration-200 disabled:opacity-50"
          >
            <LuSend className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Propose Price Modal */}
      {showProposeModal && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={conversation?.supplier_id}
          onClose={() => setShowProposeModal(false)}
          onSubmitted={async (msg) => {
            setShowProposeModal(false);
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              sender_id: user.id,
              message_type: "Contract Form",
              message_text: msg,
            });
            loadProposals();
          }}
        />
      )}

      {/* Counteroffer Modal */}
      {counterModal && (
        <ProposePriceModal
          conversationId={conversationId}
          userId={user.id}
          supplierId={conversation?.supplier_id}
          isCounter
          supersedesId={counterModal.proposal_id}
          onClose={() => setCounterModal(null)}
          onSubmitted={async (msg) => {
            // Mark original as Modified
            await supabase.from("proposal_forms").update({
              proposal_status: "Modified",
              reviewed_by: user.id,
            }).eq("proposal_id", counterModal.proposal_id);

            await supabase.from("messages").insert({
              conversation_id: conversationId,
              sender_id: user.id,
              message_type: "Contract Form",
              message_text: msg,
            });
            setCounterModal(null);
            loadProposals();
          }}
        />
      )}
    </div>
  );
}

// Inline proposal card component
function ProposalCard({ proposal, viewerRole, submitterRole, onAccept, onReject, onCounter }) {
  const submittedByMe = viewerRole === submitterRole;
  const canAct = !submittedByMe;

  return (
    <div className="flex justify-center my-2">
      <div className="bg-white border-2 border-green-pale rounded-2xl p-4 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <LuCoins className="w-4 h-4 text-green-dark" />
          <p className="text-sm font-bold text-green-dark">
            {submittedByMe ? "Your Proposal" : "Incoming Proposal"}
          </p>
          <span className="ml-auto text-xs bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <LuClock className="w-3 h-3" /> Pending
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-beige rounded-xl px-3 py-2">
            <p className="text-xs text-brown-light">Price per kg</p>
            <p className="font-bold text-brown-dark">₱{Number(proposal.proposed_price_per_kg).toFixed(2)}</p>
          </div>
          <div className="bg-beige rounded-xl px-3 py-2">
            <p className="text-xs text-brown-light">Volume</p>
            <p className="font-bold text-brown-dark">{proposal.proposed_volume_tons} tons</p>
          </div>
        </div>

        {canAct && (
          <div className="flex gap-2">
            <button onClick={onAccept}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-pale text-green-dark font-semibold text-xs py-2 rounded-xl hover:bg-green-light/20 transition-all">
              <LuCheck className="w-3.5 h-3.5" /> Accept
            </button>
            <button onClick={onCounter}
              className="flex-1 flex items-center justify-center gap-1.5 bg-beige text-brown-dark font-semibold text-xs py-2 rounded-xl hover:bg-beige-dark/40 transition-all">
              <LuPencil className="w-3.5 h-3.5" /> Counter
            </button>
            <button onClick={onReject}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-red-600 font-semibold text-xs py-2 rounded-xl hover:bg-red-100 transition-all">
              <LuX className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        )}

        {!canAct && (
          <p className="text-center text-xs text-brown-light">Waiting for response…</p>
        )}
      </div>
    </div>
  );
}
