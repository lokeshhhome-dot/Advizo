import React, { useRef } from "react";
import styles from "./chatAttachments.module.css";

const ACCEPTED_TYPES = "image/jpeg,image/jpg,image/png,image/webp,application/pdf";

const PAPERCLIP_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

/** Attach button + hidden file input, shared by UserChat.js and ChatsPage.js.
 * `onFileSelected(file)` fires with the raw File — validation/upload is the
 * caller's job (each chat owns its own pendingAttachment state). */
const AttachButton = ({ onFileSelected, disabled, className }) => {
  const inputRef = useRef(null);

  const handleChange = (event) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    event.target.value = "";
    if (file) onFileSelected(file);
  };

  return (
    <>
      <button
        type="button"
        className={className || styles.attachButton}
        title="Attach image or PDF"
        aria-label="Attach image or PDF"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {PAPERCLIP_ICON}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleChange}
        style={{ display: "none" }}
      />
    </>
  );
};

export default AttachButton;
