import React from "react";
import styles from "./MessageNotificationAlert.module.css";
import { getProfileImageUrl, handleProfileImageError } from "../../utils/getProfileImageUrl";

export default function PopupNotification({ message, onClose, onOpen }) {
  if (!message) return null;
  const openChatPartnerId = localStorage.getItem("___U-B");
  if (
    String(openChatPartnerId || "") === String(message.senderId) ||
    String(message.receiverId) === String(openChatPartnerId || "")
  ) {
    return null;
  }

  return (
    <div
      className={styles.card}
      role="status"
      aria-label={`New message from ${message.senderName || "User"}`}
      onClick={() => onOpen?.(message)}
    >
      <div className={styles.avatarWrap}>
        <img
          className={styles.avatar}
          src={getProfileImageUrl(message.avatar)}
          onError={handleProfileImageError}
          alt=""
        />
        <span className={styles.unreadDot} aria-hidden="true" />
      </div>

      <div className={styles.content}>
        <div className={styles.top}>
          <p className={styles.senderName}>{message.senderName || "User"}</p>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </div>
        <p className={styles.label}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" />
          </svg>
          New message
        </p>
        <p className={styles.preview}>{message.text || "New message received"}</p>
      </div>
    </div>
  );
}
