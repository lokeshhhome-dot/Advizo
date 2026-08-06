import styles from "./AiAssistant.module.css";

export default function TypingIndicator() {
  return (
    <div className={styles.rowAssistant}>
      <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
        <span className={styles.typing} aria-label="Consultly AI is typing">
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </span>
      </div>
    </div>
  );
}
