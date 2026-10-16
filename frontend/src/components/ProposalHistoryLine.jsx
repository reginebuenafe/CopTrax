/** The widget's existing offer/decision typography, shared by negotiation chats. */
export default function ProposalHistoryLine({ text, tone = "neutral" }) {
  const isOffer = tone === "neutral" || tone === "counteroffer";
  return (
    <div data-proposal-history={tone} className={`flex min-w-0 justify-center ${isOffer ? "" : "px-3 py-2"}`}>
      <p className={`min-w-0 break-words [overflow-wrap:anywhere] text-center italic ${isOffer
        ? `text-[11px] mb-1.5 font-medium ${tone === "counteroffer" ? "!text-orange-600" : "text-[#2E7D32]"}`
        : `max-w-[90%] whitespace-pre-line text-xs leading-relaxed ${tone === "negative" ? "text-[#C62828]" : "text-[#17682D]"}`}`}>
        {text}
      </p>
    </div>
  );
}
