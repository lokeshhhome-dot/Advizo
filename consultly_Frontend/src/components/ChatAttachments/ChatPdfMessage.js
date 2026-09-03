import React, { useState } from "react";
import styles from "./chatAttachments.module.css";
import { formatFileSize, fetchAttachmentViewUrl } from "./chatAttachmentApi";

const PDF_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

/**
 * PDF attachment card: filename, size, Open (new tab — the browser's native
 * PDF viewer, no pdf.js dependency needed) and Download actions.
 */
const ChatPdfMessage = ({ message, token }) => {
  const attachment = message.attachment || {};
  const [busy, setBusy] = useState(null); // "open" | "download" | null
  const [errorState, setErrorState] = useState(null); // "expired" | "error" | null

  const openOrDownload = async (download) => {
    setBusy(download ? "download" : "open");
    setErrorState(null);
    try {
      const { url } = await fetchAttachmentViewUrl({ messageId: message._id, token, download });
      if (!url) throw new Error("No attachment URL");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorState(error?.response?.status === 410 ? "expired" : "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.pdfCard}>
      <span className={styles.pdfIcon}>{PDF_ICON}</span>
      <div className={styles.pdfInfo}>
        <span className={styles.pdfName}>{attachment.originalName || "Document.pdf"}</span>
        <span className={styles.pdfMeta}>
          {errorState === "expired" ? "PDF expired" : formatFileSize(attachment.size)}
        </span>
        {errorState === "error" && <span className={styles.pdfError}>Couldn't open file</span>}
      </div>
      {errorState !== "expired" && (
        <div className={styles.pdfActions}>
          <button
            type="button"
            className={styles.pdfActionBtn}
            onClick={() => openOrDownload(false)}
            disabled={Boolean(busy)}
          >
            {busy === "open" ? "Opening…" : "Open"}
          </button>
          <button
            type="button"
            className={styles.pdfActionBtn}
            onClick={() => openOrDownload(true)}
            disabled={Boolean(busy)}
          >
            {busy === "download" ? "…" : "Download"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatPdfMessage;
