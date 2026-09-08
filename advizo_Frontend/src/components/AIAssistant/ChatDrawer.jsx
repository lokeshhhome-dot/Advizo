import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@shopify/polaris";
import { ChatIcon, XIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useAiAssistant } from "../../context/AiAssistantContext";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import styles from "./AiAssistant.module.css";

const SUGGESTIONS = [
  "How do I add a consultant?",
  "How can consultants log in?",
  "How do I set up the storefront?",
];

export default function ChatDrawer() {
  const { isOpen, close, messages, loading, sendMessage, clearChat } =
    useAiAssistant();
  const bodyEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      bodyEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.drawer}
          role="dialog"
          aria-label="advizo AI Assistant"
          initial={{ opacity: 0, x: 60, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 60, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.headerIcon}>
                <Icon source={ChatIcon} />
              </div>
              <div>
                <h3 className={styles.headerTitle}>advizo AI</h3>
                <div className={styles.headerStatus}>
                  <span className={styles.onlineDot} />
                  Online
                </div>
              </div>
            </div>
            <div className={styles.headerActions}>
              {messages.length > 0 && (
                <button
                  type="button"
                  className={styles.headerBtn}
                  onClick={clearChat}
                  disabled={loading}
                  aria-label="Clear conversation"
                  title="Clear conversation"
                >
                  <Icon source={DeleteIcon} />
                </button>
              )}
              <button
                type="button"
                className={styles.headerBtn}
                onClick={close}
                aria-label="Close assistant"
                title="Close"
              >
                <Icon source={XIcon} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className={styles.body}>
            {!messages.length && !loading && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Icon source={ChatIcon} />
                </div>
                <h4 className={styles.emptyTitle}>Hi! I'm advizo AI</h4>
                <p className={styles.emptyText}>
                  Ask me anything about managing consultants, vouchers,
                  wallets, or setting up your storefront.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {loading && <TypingIndicator />}
            <div ref={bodyEndRef} />
          </div>

          {/* Footer */}
          <ChatInput onSend={sendMessage} loading={loading} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
