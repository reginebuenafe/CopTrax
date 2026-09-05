/**
 * Renders plain chat message text with **bold** markdown-style emphasis
 * converted to real bold text. This is mainly for the AI FAQ assistant
 * (Coco), whose replies use "**word**" to indicate emphasis, but it applies
 * safely to any plain-text chat message.
 *
 * Returns an array of plain strings and <strong> elements — safe to render
 * directly as JSX children (React escapes string content automatically, so
 * this never introduces raw HTML injection).
 */
export function formatMessageText(text) {
  if (!text) return text;

  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    return match ? <strong key={i}>{match[1]}</strong> : part;
  });
}
