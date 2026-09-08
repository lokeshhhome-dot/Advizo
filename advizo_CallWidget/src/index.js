// Bootstrap entry — bundled to advizo-call-widget.js, the file the
// Theme Extension loads as a plain <script> on every consultant-card page
// view. Deliberately does NOT import engine.js: that would pull in Agora
// (~1.3MB) + Socket.IO + Redux + callSlice.js, none of which are needed
// just to render the modal shell. This file only knows how to open/close
// the modal (ui.js — pure DOM/CSS, a few KB) and how to fetch the engine
// chunk (advizo-call-engine.js, engine-entry.js's output) on demand.
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

// Goes through the SAME App-Proxy redirect pattern consultant-card.js
// already uses to load this bootstrap itself (GET /apps/advizo/
// call-widget.js -> 302 -> the real React app origin) rather than trying to
// derive that origin from this script's own document.currentScript.src.
// That property reflects the ORIGINAL <script src> attribute (this same
// kind of App-Proxy URL) — redirects happen at the network layer and never
// rewrite it — so by the time engine loading actually runs (a click or an
// idle callback, always well after this bootstrap's own synchronous
// top-level execution, when document.currentScript has already reverted to
// null anyway) there is no reliable script-tag-based way to find the real
// origin. Asking the shop's own App Proxy again, the same way, sidesteps
// the whole problem.
function engineChunkUrl(shop) {
  return `https://${shop}/apps/advizo/call-engine.js`;
}

function ensureEngineLoaded(shop) {
  if (window.advizoCallEngine) return Promise.resolve();
  if (engineLoadPromise) return engineLoadPromise;
  engineLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = engineChunkUrl(shop);
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
function prefetchEngine(shop) {
  if (!shop) return;
  ensureEngineLoaded(shop).catch(() => {
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
  console.log("[CALL DEBUG] customer modal opened");

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
    onSwitchCamera: async () => {
      if (!activeSession) return;
      modal.setSwitchingCamera(true);
      const result = await activeSession.switchCamera();
      // A failed switch leaves the previous camera published and the call
      // uninterrupted — same behavior as the Consultant Dashboard's own
      // camera-switch button — so there's nothing else to reconcile here
      // beyond clearing the busy state.
      modal.setSwitchingCamera(false);
      if (!result?.ok) console.error("[CALL MODAL] camera switch failed:", result?.message);
    },
    onToggleSpeaker: async () => {
      if (!activeSession) return;
      modal.setSwitchingSpeaker(true);
      const result = await activeSession.switchSpeaker();
      modal.setSwitchingSpeaker(false);
      if (!result?.ok) console.error("[CALL MODAL] speaker switch failed:", result?.message);
    },
  });
  activeModal = modal;
  bindMediaListeners(modal);

  console.log("[CALL MODAL] initialization started");

  ensureEngineLoaded(shop)
    .then(() => {
      // The modal may have been closed (or a newer call started) while the
      // engine chunk was still downloading — don't start a stale session.
      if (activeModal !== modal) return;
      activeSession = window.advizoCallEngine.startCustomerCall({
        shop,
        consultantId,
        callType: isVideo ? "video" : "voice",
        onState: (state) => {
          if (activeModal !== modal) return;
          if (state.status === "checking") console.log("[CALL MODAL] token request");
          if (state.status === "ringing") console.log("[CALL MODAL] Agora initialization");
          if (state.status === "connected") console.log("[CALL MODAL] connected");
          modal.setStatus(state.status, state.message);
          // startedAt is the same authoritative timestamp the engine bills
          // duration from (see engine.js's onAcceptedStarted) — this display
          // timer is read-only and never drives billing/session state.
          if (state.status === "connected" && state.startedAt) {
            modal.startTimer(state.startedAt);
            // Only meaningful once the remote audio track actually exists
            // (it doesn't before the call connects) — see engine.js's
            // canSwitchSpeaker for why this can report false on most mobile
            // browsers regardless of call type.
            activeSession?.canSwitchSpeaker().then((can) => {
              if (activeModal === modal) modal.setSpeakerAvailable(can);
            });
          }
          if (TERMINAL_STATES.has(state.status)) {
            console.log("[CALL MODAL] call ended");
            modal.stopTimer();
            modal.setCallActive(false);
            window.setTimeout(() => {
              if (activeModal === modal) closeActive();
            }, AUTO_CLOSE_DELAY_MS);
          }
        },
      });
      if (isVideo) {
        activeSession.canSwitchCamera().then((can) => {
          if (activeModal === modal) modal.setCanSwitchCamera(can);
        });
      }
    })
    .catch((err) => {
      console.error("[CALL MODAL] failed to load call engine:", err);
      if (activeModal === modal) {
        modal.setStatus("failed", "Call failed. Please try again.");
        modal.setCallActive(false);
        window.setTimeout(() => {
          if (activeModal === modal) closeActive();
        }, AUTO_CLOSE_DELAY_MS);
      }
    });
}

function close() {
  activeSession?.hangUp("user_cut_call");
}

window.advizoCallWidget = { open, close, prefetchEngine };
