import "./TypingIndicator.css";

// The caller supplies the sender's side and existing message-bubble classes.
// Keep the slot mounted when inactive so the message list does not jump.
export default function TypingIndicator({
  side = "left", label, variant = "human", active = true, bubbleClassName = "bg-white text-brown-dark border border-beige-dark", className = "",
}) {
  const accessibleLabel = label || (variant === "ai" ? "Assistant is thinking…" : "Someone is typing…");
  return (
    <div className={`chat-typing-slot ${className}`} data-side={side} data-active={active}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {active ? accessibleLabel : ""}
      </div>
      <div className="chat-typing-content" aria-hidden="true">
        <div className={`chat-typing-bubble rounded-2xl px-4 py-2.5 ${bubbleClassName}`}>
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
          <span className="chat-typing-tail" />
          <span className="chat-typing-tail-small" />
        </div>
        <span className="chat-typing-label text-brown-light" title={accessibleLabel}>{accessibleLabel}</span>
      </div>
    </div>
  );
}
