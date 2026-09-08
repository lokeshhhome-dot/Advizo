import React from "react";
import styles from "./chatAttachments.module.css";

const PDF_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

/**
 * Bubble content for the optimistic (not-yet-acknowledged-by-the-server)
 * attachment message — its "_id" is a local "temp-..." placeholder, so there
 * is no real messageId yet to mint a signed view URL from. Shows the local
 * file preview (the same blob URL the composer preview used) with a sending
 * spinner instead of hitting the network. Once the server's "receiveMessage"
 * echo replaces this temp entry (matched by tempId), the real
 * ChatImageMessage/ChatPdfMessage takes over.
 */
const OptimisticAttachmentMessage = ({ attachment, localPreviewUrl }) => {
  if (!attachment) return null;

  if (attachment.type === "image") {
    return (
      <div
        className={styles.imageBubble}
        style={
          attachment.width && attachment.height
            ? { aspectRatio: String(attachment.width / attachment.height) }
            : undefined
        }
      >
        {localPreviewUrl && (
          <img src={localPreviewUrl} alt="" className={styles.imageBubbleImg} />
        )}
        <div className={styles.composerPreviewSpinnerOverlay}>
          <span className={styles.spinner} aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pdfCard}>
      <span className={styles.pdfIcon}>{PDF_ICON}</span>
      <div className={styles.pdfInfo}>
        <span className={styles.pdfName}>{attachment.originalName}</span>
        <span className={styles.pdfMeta}>Sending…</span>
      </div>
    </div>
  );
};

export default OptimisticAttachmentMessage;
