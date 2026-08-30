// Bootstrap entry — bundled to consultly-call-widget.js, the file the
// Theme Extension loads as a plain <script> on every consultant-card page
// view. Deliberately does NOT import engine.js: that would pull in Agora
// (~1.3MB) + Socket.IO + Redux + callSlice.js, none of which are needed
// just to render the modal shell. This file only knows how to open/close
// the modal (ui.js — pure DOM/CSS, a few KB) and how to fetch the engine
// chunk (consultly-call-engine.js, engine-entry.js's output) on demand.
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
let engineLoadPromise = null;

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

// Sibling file next to this bootstrap script (same origin, same directory —
// consultly_Frontend/public/) — no extra backend route needed to locate it,
// unlike the bootstrap's own App-Proxy redirect (that one exists because
// the THEME needs to reach this file without hardcoding its real origin;
// once we're already executing on that origin, a relative sibling path is
// simplest and never goes stale independently of this file).
function engineChunkUrl() {
  try {
    return new URL("consultly-call-engine.js", document.currentScript?.src || location.href).href;
  } catch (_) {
    return "consultly-call-engine.js";
  }
}

function ensureEngineLoaded() {
  if (window.ConsultlyCallEngine) return Promise.resolve();
  if (engineLoadPromise) return engineLoadPromise;
  engineLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = engineChunkUrl();
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      engineLoadPromise = null;
      reject(new Error("Failed to load call engine"));
    };
    document.head.appendChild(script);
  });
  return engineLoadPromise;
}

// Idle-time warm-up only — never called from the click path itself, so a
// slow/failed prefetch can never delay opening the modal. See
// prefetchEngine() below and consultant-card.js's own idle-time call to it.
function prefetchEngine() {
  ensureEngineLoaded().catch(() => {
    // Silent: this is a best-effort cache warm, not a real load attempt.
    // ensureEngineLoaded() will simply retry for real when the customer
    // actually clicks Call/Video.
  });
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
  // Modal renders immediately, with its normal "Connecting…" skeleton state
  // — engine loading/initialization happens after, never blocking this.
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

  ensureEngineLoaded()
    .then(() => {
      // The modal may have been closed (or a newer call started) while the
      // engine chunk was still downloading — don't start a stale session.
      if (activeModal !== modal) return;
      activeSession = window.ConsultlyCallEngine.startCustomerCall({
        shop,
        consultantId,
        callType: isVideo ? "video" : "voice",
        onState: (state) => {
          if (activeModal !== modal) return;
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
    })
    .catch((err) => {
      console.error("[CALL MODAL] failed to load call engine:", err);
      if (activeModal === modal) modal.setStatus("failed", "Call failed. Please try again.");
    });
}

function close() {
  activeSession?.hangUp("user_cut_call");
}

window.ConsultlyCallWidget = { open, close, prefetchEngine };
