import { useState, useRef, useCallback } from "react";
import { Icon, Spinner } from "@shopify/polaris";
import { SendIcon } from "@shopify/polaris-icons";
import styles from "./AiAssistant.module.css";

export default function ChatInput({ onSend, loading }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  }, []);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || loading) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      autoGrow();
      textareaRef.current?.focus();
    });
  }, [value, loading, onSend, autoGrow]);

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.footer}>
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          rows={1}
          placeholder="Ask about advizo…"
          value={value}
          maxLength={2000}
          disabled={loading}
          onChange={(e) => {
            setValue(e.target.value);
            autoGrow();
          }}
          onKeyDown={handleKeyDown}
          aria-label="Message advizo AI"
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={submit}
          disabled={!value.trim() || loading}
          aria-label="Send message"
        >
          {loading ? (
            <Spinner size="small" accessibilityLabel="Sending" />
          ) : (
            <Icon source={SendIcon} />
          )}
        </button>
      </div>
      <p className={styles.footerHint}>
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
