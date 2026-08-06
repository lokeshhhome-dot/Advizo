import React from "react";
import styles from "./TypingIndicator.module.css";

const TypingIndicator = ({ label = "Typing", visible = false }) => {
  if (!visible) return null;

  return (
    <div className={styles.typingIndicator} aria-live="polite">
      <span className={styles.typingLabel}>{label}</span>
      <span className={styles.typingDots} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
    </div>
  );
};

export default TypingIndicator;
