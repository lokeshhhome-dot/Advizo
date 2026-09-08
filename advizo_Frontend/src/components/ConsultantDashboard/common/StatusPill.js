import React from "react";
import styles from "./StatusPill.module.css";

const TONE_CLASS = {
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  info: styles.info,
  neutral: styles.neutral,
};

/** Small tone-based status label — replaces Polaris <Badge> on consultant pages. */
export default function StatusPill({ tone = "neutral", children }) {
  return <span className={`${styles.pill} ${TONE_CLASS[tone] || styles.neutral}`}>{children}</span>;
}
