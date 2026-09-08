import React from "react";
import VideoCallingPage from "../ConsultantDashboard/VideoCallingPage";
import styles from "./VideoCallModal.module.css";

// Mounts the EXISTING VideoCallingPage (same Agora client, same Socket.IO
// connection/listeners, same billing/timer/reconnect logic) directly as a
// React child — no iframe. Since the Consultant Dashboard and this call UI
// are the SAME app, there was never a real origin boundary requiring an
// iframe here; VideoCallingPage's socket calls already use the shared
// getSocket() singleton, so this reuses the dashboard's own connection
// instead of opening a second one. VideoCallingPage still supports its old
// standalone-route/URL-param mode unchanged (config/onCallEnded are both
// optional) — this is strictly an additional way to use it.
export default function VideoCallModal({ callConfig, onClose }) {
  if (!callConfig) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Active call">
      <div className={styles.modal}>
        <VideoCallingPage config={callConfig} onCallEnded={onClose} />
      </div>
    </div>
  );
}
