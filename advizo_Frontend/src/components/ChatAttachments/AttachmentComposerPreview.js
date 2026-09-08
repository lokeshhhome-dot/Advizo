import React from "react";
import styles from "./chatAttachments.module.css";
import { formatFileSize } from "./chatAttachmentApi";

const PDF_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

/**
 * Shown above the composer while a file is staged/uploading — this is the
 * "professional upload state" the spec asks for, instead of an immediate
 * broken/blank message bubble. `pending` shape:
 *   { file, previewUrl, type: "image"|"pdf", status: "uploading"|"ready"|"error", progress, error }
 */
const AttachmentComposerPreview = ({ pending, onCancel, onRetry }) => {
  if (!pending) return null;
  const { file, previewUrl, status, progress, error, type } = pending;

  return (
    <div className={styles.composerPreview}>
      <div className={styles.composerPreviewThumb}>
        {type === "image" && previewUrl ? (
          <img src={previewUrl} alt="" className={styles.composerPreviewImg} />
        ) : (
          <span className={styles.composerPreviewIcon}>{PDF_ICON}</span>
        )}
        {status === "uploading" && (
          <div className={styles.composerPreviewSpinnerOverlay}>
            <span className={styles.spinner} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className={styles.composerPreviewInfo}>
        <span className={styles.composerPreviewName}>{file.name}</span>
        <span className={styles.composerPreviewMeta}>
          {formatFileSize(file.size)}
          {status === "uploading" && ` · Uploading ${progress}%`}
          {status === "error" && ` · ${error || "Upload failed"}`}
          {status === "ready" && " · Ready to send"}
        </span>
        {status === "uploading" && (
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className={styles.composerPreviewActions}>
        {status === "error" && (
          <button type="button" className={styles.composerPreviewRetry} onClick={onRetry}>
            Retry
          </button>
        )}
        <button
          type="button"
          className={styles.composerPreviewCancel}
          onClick={onCancel}
          aria-label="Remove attachment"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default AttachmentComposerPreview;
