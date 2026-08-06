import styles from "./AiAssistant.module.css";

/* ---------- Lightweight markdown rendering (no deps, XSS-safe) ----------
 * Supports: ```code blocks```, `inline code`, **bold**, *italic*,
 * unordered (-, *) and ordered (1.) lists, paragraphs.
 * Everything is built as React elements — no innerHTML. */

const renderInline = (text, keyPrefix) => {
  const parts = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(<code key={`${keyPrefix}-c${i}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b${i}`}>{token.slice(2, -2)}</strong>,
      );
    } else {
      parts.push(<em key={`${keyPrefix}-i${i}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
    i += 1;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
};

const renderBlock = (block, blockIndex) => {
  const lines = block.split("\n").filter((l) => l.trim().length);
  if (!lines.length) return null;

  const isUl = lines.every((l) => /^\s*[-*]\s+/.test(l));
  const isOl = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));

  if (isUl || isOl) {
    const List = isUl ? "ul" : "ol";
    return (
      <List key={`bl-${blockIndex}`}>
        {lines.map((line, li) => (
          <li key={li}>
            {renderInline(
              line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""),
              `${blockIndex}-${li}`,
            )}
          </li>
        ))}
      </List>
    );
  }

  return (
    <p key={`bl-${blockIndex}`}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {renderInline(line, `${blockIndex}-${li}`)}
        </span>
      ))}
    </p>
  );
};

const renderMarkdown = (text) => {
  const segments = String(text).split(/```(?:\w+)?\n?/);
  return segments.map((segment, index) => {
    // Odd segments are inside ``` fences.
    if (index % 2 === 1) {
      return (
        <pre key={`code-${index}`}>
          <code>{segment.replace(/\n$/, "")}</code>
        </pre>
      );
    }
    return segment
      .split(/\n{2,}/)
      .map((block, bi) => renderBlock(block, `${index}-${bi}`));
  });
};

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={isUser ? styles.rowUser : styles.rowAssistant}>
      <div
        className={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          message.isError ? styles.bubbleError : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isUser ? message.text : renderMarkdown(message.text)}
      </div>
    </div>
  );
}
