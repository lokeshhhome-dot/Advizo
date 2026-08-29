import React, { useEffect } from "react";
import styles from "./VideoCallModal.module.css";

// Renders the EXISTING VideoCallingPage (Agora + Socket.IO call UI) inside an
// iframe overlay instead of a popup window / full-tab navigation. The iframe
// points at the app's own /video/calling/page route (built with `direct:
// true` by the caller) — same call implementation, same Agora client, same
// socket connection VideoCallingPage.js already sets up for itself; this
// component only supplies the modal chrome around it. VideoCallingPage.js
// posts a CONSULTLY_CALL_ENDED message (to window.parent/window.top) when the
// call ends instead of navigating away — this listens for that to close.
export default function VideoCallModal({ callUrl, onClose }) {
  useEffect(() => {
    if (!callUrl) return undefined;
    const handleMessage = (event) => {
      if (event?.data?.type === "CONSULTLY_CALL_ENDED") {
        onClose();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [callUrl, onClose]);

  if (!callUrl) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Active call">
      <div className={styles.modal}>
        <iframe
          key={callUrl}
          src={callUrl}
          title="Consultly Call"
          allow="camera; microphone; autoplay"
          className={styles.iframe}
        />
      </div>
    </div>
  );
}
