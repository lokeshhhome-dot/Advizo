// Entry point — bundled to dist/consultly-call-widget.js and loaded by the
// Theme Extension (consultant-card.js) as a plain <script>. Exposes
// window.ConsultlyCallWidget.open({...}); everything else here is wiring
// between engine.js (Agora/Socket.IO orchestration, reusing callSlice.js/
// SokectConfig.js verbatim) and ui.js (the modal DOM).
import { startCustomerCall } from "./engine";
import { openCallModal } from "./ui";

const TERMINAL_STATES = new Set([
  "ended",
  "missed",
  "rejected",
  "declined",
  "failed",
  "unauthenticated",
  "unavailable",
  "no-balance",
]);

// How long a terminal status stays on screen before the modal auto-closes —
// long enough to read ("No answer", "Declined", ...), short enough to not
// feel stuck.
const AUTO_CLOSE_DELAY_MS = 1800;

let activeSession = null;
let activeModal = null;
let mediaListenersBound = false;

function bindMediaListeners(modal) {
  if (mediaListenersBound) return;
  mediaListenersBound = true;
  window.addEventListener("local-video-ready", () => modal.showLocalVideo(true));
  window.addEventListener("remote-video-ready", () => modal.showRemoteVideo(true));
  window.addEventListener("remote-video-stopped", () => modal.showRemoteVideo(false));
  window.addEventListener("remote-user-left", () => {
    activeSession?.hangUp("user_cut_call");
  });
}

function closeActive() {
  activeModal?.close();
  activeModal = null;
  activeSession = null;
}

/**
 * @param {{shop:string, consultantId:string, callType:"voice"|"video", consultantName?:string, consultantAvatar?:string}} config
 */
function open(config) {
  const { shop, consultantId, callType } = config || {};
  if (!shop || !consultantId) {
    console.error("[CALL MODAL] missing shop/consultantId — cannot open");
    return;
  }
  console.log("[CALL MODAL] opened");
  console.log("[CALL MODAL] call type =", callType);

  // Re-entrancy guard: a stray double-click shouldn't start a second engine
  // session against an already-open modal.
  if (activeSession) return;

  const isVideo = callType === "video";
  const modal = openCallModal({
    consultantName: config.consultantName,
    consultantAvatar: config.consultantAvatar,
    isVideo,
    onEnd: (reason) => {
      console.log("[CALL MODAL] call ended (user)");
      activeSession?.hangUp(reason);
    },
    onToggleMute: () => {
      const muted = activeSession?.toggleMute();
      modal.setMuted(Boolean(muted));
    },
    onToggleCamera: () => {
      const videoEnabled = activeSession?.toggleCamera();
      modal.setCameraOn(Boolean(videoEnabled));
    },
  });
  activeModal = modal;
  bindMediaListeners(modal);

  console.log("[CALL MODAL] initialization started");

  activeSession = startCustomerCall({
    shop,
    consultantId,
    callType: isVideo ? "video" : "voice",
    onState: (state) => {
      if (state.status === "checking") console.log("[CALL MODAL] token request");
      if (state.status === "ringing") console.log("[CALL MODAL] Agora initialization");
      if (state.status === "connected") console.log("[CALL MODAL] connected");
      modal.setStatus(state.status, state.message);
      if (TERMINAL_STATES.has(state.status)) {
        console.log("[CALL MODAL] call ended");
        window.setTimeout(() => {
          if (activeModal === modal) closeActive();
        }, AUTO_CLOSE_DELAY_MS);
      }
    },
  });
}

function close() {
  activeSession?.hangUp("user_cut_call");
}

window.ConsultlyCallWidget = { open, close };
