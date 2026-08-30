// Vanilla-DOM modal — the actual calling surface, styled to match the
// existing dark VideoCallingPage .callCard look (same palette/shape as the
// Consultant Dashboard's native call modal) rather than the light
// Consultant Profile modal. No page wrapper, no iframe: this is the only
// visual container.
//
// data-local-video / data-remote-video: callSlice.js's Agora track.play()
// targets these via document.querySelector — plain attributes, no wiring
// needed beyond having exactly one of each in the document while a call is
// active.
import cssText from "./ui.css";

let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-consultly-call-widget", "");
  style.textContent = cssText;
  document.head.appendChild(style);
}

// "Calling…" (not "Ringing…") — from the customer's own point of view they
// are the one calling out, not the one being rung.
const STATUS_TEXT = {
  checking: "Connecting…",
  ringing: "Calling…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  ended: "Call ended",
  missed: "No answer",
  rejected: "Declined",
  declined: "Declined",
  failed: "Call failed",
  unauthenticated: "Please log in to call",
  unavailable: "Not available right now",
  "no-balance": "Insufficient balance",
};

const STATUS_DOT_CLASS = {
  connected: "consultly-call-widget-dot--live",
  checking: "consultly-call-widget-dot--pending",
  ringing: "consultly-call-widget-dot--pending",
  reconnecting: "consultly-call-widget-dot--warn",
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// mm:ss, or hh:mm:ss once a call passes an hour.
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

// Same path data as VideoCallingPage.js's own mic/camera/switch-camera
// icons (Consultant Dashboard) — hand-copied since there's no shared
// component boundary between the React app and this vanilla widget, kept
// visually identical on purpose so both sides of a call look consistent.
const ICONS = {
  micOn:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',
  micOff:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  cameraOn:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
  cameraOff:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  switchCamera:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a8 8 0 0 1 7.6 5.5"/><polyline points="20 3.5 20 9.5 14 9.5"/><path d="M12 20a8 8 0 0 1-7.6-5.5"/><polyline points="4 20.5 4 14.5 10 14.5"/><circle cx="12" cy="12" r="2.6"/></svg>',
  speaker:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  end:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" fill="currentColor"/></svg>',
  close:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

let els = null;

function ensureModal() {
  if (els) return els;
  injectStyles();

  const backdrop = document.createElement("div");
  backdrop.className = "consultly-call-widget-backdrop";
  backdrop.setAttribute("hidden", "hidden");

  const panel = document.createElement("div");
  panel.className = "consultly-call-widget-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Call");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "consultly-call-widget-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = ICONS.close;

  // ---- header: name + call type, status dot + text + live timer ----
  const header = document.createElement("div");
  header.className = "consultly-call-widget-header";

  const headerTop = document.createElement("div");
  headerTop.className = "consultly-call-widget-header-row";
  const name = document.createElement("p");
  name.className = "consultly-call-widget-name";
  const callTypeLabel = document.createElement("span");
  callTypeLabel.className = "consultly-call-widget-calltype";
  headerTop.appendChild(name);
  headerTop.appendChild(callTypeLabel);

  const headerBottom = document.createElement("div");
  headerBottom.className = "consultly-call-widget-header-row";
  const statusLine = document.createElement("div");
  statusLine.className = "consultly-call-widget-statusline";
  const statusDot = document.createElement("span");
  statusDot.className = "consultly-call-widget-dot";
  const statusText = document.createElement("span");
  statusText.className = "consultly-call-widget-status-text";
  statusLine.appendChild(statusDot);
  statusLine.appendChild(statusText);
  const timerEl = document.createElement("span");
  timerEl.className = "consultly-call-widget-timer";
  timerEl.hidden = true;
  headerBottom.appendChild(statusLine);
  headerBottom.appendChild(timerEl);

  header.appendChild(headerTop);
  header.appendChild(headerBottom);

  // ---- stage: remote video / avatar fallback + local PIP ----
  const stage = document.createElement("div");
  stage.className = "consultly-call-widget-stage";

  const remoteVideo = document.createElement("div");
  remoteVideo.setAttribute("data-remote-video", "");
  remoteVideo.className = "consultly-call-widget-remote-video";

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "consultly-call-widget-avatar-wrap";

  const avatarImg = document.createElement("img");
  avatarImg.className = "consultly-call-widget-avatar";
  avatarImg.alt = "";

  const avatarFallback = document.createElement("div");
  avatarFallback.className = "consultly-call-widget-avatar-fallback";

  avatarWrap.appendChild(avatarImg);
  avatarWrap.appendChild(avatarFallback);

  const localVideo = document.createElement("div");
  localVideo.setAttribute("data-local-video", "");
  localVideo.className = "consultly-call-widget-local-video";

  stage.appendChild(remoteVideo);
  stage.appendChild(avatarWrap);
  stage.appendChild(localVideo);

  // ---- controls ----
  const controls = document.createElement("div");
  controls.className = "consultly-call-widget-controls";

  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "consultly-call-widget-control";
  muteBtn.setAttribute("aria-label", "Mute microphone");

  const cameraBtn = document.createElement("button");
  cameraBtn.type = "button";
  cameraBtn.className = "consultly-call-widget-control";
  cameraBtn.setAttribute("aria-label", "Turn camera off");
  cameraBtn.hidden = true;

  const switchCameraBtn = document.createElement("button");
  switchCameraBtn.type = "button";
  switchCameraBtn.className = "consultly-call-widget-control consultly-call-widget-control--secondary";
  switchCameraBtn.setAttribute("aria-label", "Switch camera");
  switchCameraBtn.innerHTML = ICONS.switchCamera;
  switchCameraBtn.hidden = true;

  // Shown for BOTH call types (voice and video), unlike camera/switch-camera
  // which only ever apply to video. Disabled rather than hidden when the
  // browser/device has no real output-device selection to offer (most
  // mobile browsers) — see engine.js's canSwitchSpeaker for why this can't
  // be faked as a true speakerphone/earpiece toggle.
  const speakerBtn = document.createElement("button");
  speakerBtn.type = "button";
  speakerBtn.className = "consultly-call-widget-control";
  speakerBtn.setAttribute("aria-label", "Switch audio output");
  speakerBtn.innerHTML = ICONS.speaker;

  const endBtn = document.createElement("button");
  endBtn.type = "button";
  endBtn.className = "consultly-call-widget-control consultly-call-widget-control--end";
  endBtn.setAttribute("aria-label", "End call");
  endBtn.innerHTML = ICONS.end;

  controls.appendChild(muteBtn);
  controls.appendChild(cameraBtn);
  controls.appendChild(switchCameraBtn);
  controls.appendChild(speakerBtn);
  controls.appendChild(endBtn);

  panel.appendChild(closeBtn);
  panel.appendChild(header);
  panel.appendChild(stage);
  panel.appendChild(controls);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  els = {
    backdrop,
    panel,
    closeBtn,
    name,
    callTypeLabel,
    statusDot,
    statusText,
    timerEl,
    stage,
    remoteVideo,
    avatarWrap,
    avatarImg,
    avatarFallback,
    localVideo,
    controls,
    muteBtn,
    cameraBtn,
    switchCameraBtn,
    speakerBtn,
    endBtn,
  };
  return els;
}

let previouslyFocused = null;
let keydownBound = false;
// True for the whole "checking" -> "connected" span — guards against an
// accidental backdrop click / Escape silently dropping a live or in-progress
// call. Cleared once a terminal status is reached, so the (already-ending)
// modal can still be dismissed normally in its closing window.
let callActive = false;
let timerIntervalId = null;

function handleKeydown(evt) {
  if (evt.key !== "Escape" && evt.key !== "Esc") return;
  if (callActive) return;
  els?.endBtn?.click();
}

function stopTimerInterval() {
  if (timerIntervalId) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

export function openCallModal({ consultantName, consultantAvatar, isVideo, onEnd, onToggleMute, onToggleCamera, onSwitchCamera, onToggleSpeaker }) {
  const e = ensureModal();
  stopTimerInterval();
  callActive = true;

  // callType (isVideo) comes from the same config the customer's Call/Video
  // click already carried through openNativeCallModal -> engine.js's own
  // callType — never re-derived or guessed from UI state, and never changes
  // for the life of this call: cameraBtn/switchCameraBtn are only ever
  // touched here at open() and via setCanSwitchCamera, so a voice call can
  // never grow a camera control mid-session.
  e.panel.classList.toggle("consultly-call-widget-panel--video", Boolean(isVideo));
  e.name.textContent = consultantName || "Consultant";
  e.callTypeLabel.textContent = isVideo ? "Video Call" : "Voice Call";
  e.statusText.textContent = STATUS_TEXT.checking;
  e.statusDot.className = `consultly-call-widget-dot ${STATUS_DOT_CLASS.checking}`;
  e.timerEl.hidden = true;
  e.timerEl.textContent = "00:00";
  e.cameraBtn.hidden = !isVideo;
  e.switchCameraBtn.hidden = true;
  e.muteBtn.dataset.state = "unmuted";
  e.muteBtn.innerHTML = ICONS.micOn;
  e.muteBtn.setAttribute("aria-label", "Mute microphone");
  e.cameraBtn.dataset.state = isVideo ? "off" : "on";
  e.cameraBtn.innerHTML = isVideo ? ICONS.cameraOff : ICONS.cameraOn;
  e.speakerBtn.innerHTML = ICONS.speaker;
  e.speakerBtn.disabled = true;
  e.speakerBtn.setAttribute("aria-disabled", "true");

  if (consultantAvatar) {
    e.avatarImg.src = consultantAvatar;
    e.avatarImg.style.display = "block";
    e.avatarFallback.style.display = "none";
  } else {
    e.avatarImg.style.display = "none";
    e.avatarFallback.style.display = "flex";
    e.avatarFallback.textContent = (consultantName || "?").trim().charAt(0).toUpperCase();
  }
  e.avatarImg.alt = escapeHtml(consultantName || "Consultant");

  e.remoteVideo.style.display = "none";
  e.avatarWrap.style.display = "flex";
  e.localVideo.style.display = "none";

  e.muteBtn.onclick = () => onToggleMute?.();
  e.cameraBtn.onclick = () => onToggleCamera?.();
  e.switchCameraBtn.onclick = () => onSwitchCamera?.();
  e.speakerBtn.onclick = () => onToggleSpeaker?.();
  e.endBtn.onclick = () => onEnd?.("user_cut_call");
  e.closeBtn.onclick = () => onEnd?.("user_cut_call");
  e.backdrop.onclick = (evt) => {
    if (evt.target !== e.backdrop) return;
    if (callActive) return; // accidental-close guard while a call is live/in progress
    onEnd?.("user_cut_call");
  };

  previouslyFocused = document.activeElement;
  e.backdrop.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
  if (!keydownBound) {
    document.addEventListener("keydown", handleKeydown);
    keydownBound = true;
  }
  e.endBtn.focus();

  return {
    setStatus(statusKey, message) {
      e.statusText.textContent = message || STATUS_TEXT[statusKey] || statusKey;
      e.statusDot.className = `consultly-call-widget-dot ${STATUS_DOT_CLASS[statusKey] || ""}`;
    },
    startTimer(startedAt) {
      stopTimerInterval();
      e.timerEl.hidden = false;
      const tick = () => {
        e.timerEl.textContent = formatDuration((Date.now() - startedAt) / 1000);
      };
      tick();
      timerIntervalId = window.setInterval(tick, 1000);
    },
    stopTimer() {
      stopTimerInterval();
    },
    setCallActive(active) {
      callActive = Boolean(active);
    },
    showRemoteVideo(show) {
      e.remoteVideo.style.display = show ? "block" : "none";
      e.avatarWrap.style.display = show ? "none" : "flex";
    },
    showLocalVideo(show) {
      e.localVideo.style.display = show ? "block" : "none";
    },
    setMuted(muted) {
      e.muteBtn.dataset.state = muted ? "muted" : "unmuted";
      e.muteBtn.innerHTML = muted ? ICONS.micOff : ICONS.micOn;
      e.muteBtn.setAttribute("aria-label", muted ? "Unmute microphone" : "Mute microphone");
    },
    setCameraOn(on) {
      e.cameraBtn.dataset.state = on ? "on" : "off";
      e.cameraBtn.innerHTML = on ? ICONS.cameraOn : ICONS.cameraOff;
      e.cameraBtn.setAttribute("aria-label", on ? "Turn camera off" : "Turn camera on");
    },
    setCanSwitchCamera(can) {
      e.switchCameraBtn.hidden = !can;
    },
    setSwitchingCamera(busy) {
      e.switchCameraBtn.disabled = Boolean(busy);
      e.switchCameraBtn.setAttribute("aria-busy", busy ? "true" : "false");
    },
    // Speaker stays VISIBLE (unlike camera/switch-camera) even when
    // unsupported — disabled instead, per the explicit "degrade gracefully"
    // requirement, since it belongs in both the voice and video control set.
    setSpeakerAvailable(can) {
      e.speakerBtn.disabled = !can;
      e.speakerBtn.setAttribute("aria-disabled", can ? "false" : "true");
      e.speakerBtn.title = can ? "" : "Not supported on this device";
    },
    setSwitchingSpeaker(busy) {
      e.speakerBtn.setAttribute("aria-busy", busy ? "true" : "false");
    },
    close() {
      stopTimerInterval();
      callActive = false;
      if (!e.backdrop || e.backdrop.hasAttribute("hidden")) return;
      e.backdrop.setAttribute("hidden", "hidden");
      document.body.style.overflow = "";
      if (keydownBound) {
        document.removeEventListener("keydown", handleKeydown);
        keydownBound = false;
      }
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
      previouslyFocused = null;
    },
  };
}
