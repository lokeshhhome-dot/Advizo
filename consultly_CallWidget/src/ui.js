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

const STATUS_TEXT = {
  checking: "Connecting…",
  ringing: "Ringing…",
  connected: "Connected",
  ended: "Call ended",
  missed: "No answer",
  rejected: "Declined",
  declined: "Declined",
  failed: "Call failed",
  unauthenticated: "Please log in to call",
  unavailable: "Not available right now",
  "no-balance": "Insufficient balance",
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

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
  closeBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

  const name = document.createElement("p");
  name.className = "consultly-call-widget-name";

  const status = document.createElement("p");
  status.className = "consultly-call-widget-status";

  const callTypeLabel = document.createElement("p");
  callTypeLabel.className = "consultly-call-widget-calltype";

  const localVideo = document.createElement("div");
  localVideo.setAttribute("data-local-video", "");
  localVideo.className = "consultly-call-widget-local-video";

  stage.appendChild(remoteVideo);
  stage.appendChild(avatarWrap);
  stage.appendChild(name);
  stage.appendChild(status);
  stage.appendChild(callTypeLabel);
  stage.appendChild(localVideo);

  const controls = document.createElement("div");
  controls.className = "consultly-call-widget-controls";

  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "consultly-call-widget-control";
  muteBtn.setAttribute("aria-label", "Mute");
  muteBtn.textContent = "🎤";

  const cameraBtn = document.createElement("button");
  cameraBtn.type = "button";
  cameraBtn.className = "consultly-call-widget-control";
  cameraBtn.setAttribute("aria-label", "Camera");
  cameraBtn.textContent = "📷";
  cameraBtn.hidden = true;

  const endBtn = document.createElement("button");
  endBtn.type = "button";
  endBtn.className = "consultly-call-widget-control consultly-call-widget-control--end";
  endBtn.setAttribute("aria-label", "End call");
  endBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" fill="currentColor"/></svg>';

  controls.appendChild(muteBtn);
  controls.appendChild(cameraBtn);
  controls.appendChild(endBtn);

  panel.appendChild(closeBtn);
  panel.appendChild(stage);
  panel.appendChild(controls);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  els = {
    backdrop,
    panel,
    closeBtn,
    stage,
    remoteVideo,
    avatarWrap,
    avatarImg,
    avatarFallback,
    name,
    status,
    callTypeLabel,
    localVideo,
    controls,
    muteBtn,
    cameraBtn,
    endBtn,
  };
  return els;
}

let previouslyFocused = null;
let keydownBound = false;
function handleKeydown(evt) {
  if (evt.key === "Escape" || evt.key === "Esc") {
    els?.endBtn?.click();
  }
}

export function openCallModal({ consultantName, consultantAvatar, isVideo, onEnd, onToggleMute, onToggleCamera }) {
  const e = ensureModal();
  e.panel.classList.toggle("consultly-call-widget-panel--video", Boolean(isVideo));
  e.name.textContent = consultantName || "Consultant";
  e.callTypeLabel.textContent = isVideo ? "Video Call" : "Voice Call";
  e.status.textContent = STATUS_TEXT.checking;
  e.status.className = "consultly-call-widget-status";
  e.cameraBtn.hidden = !isVideo;
  e.muteBtn.dataset.state = "unmuted";
  e.cameraBtn.dataset.state = isVideo ? "off" : "on";

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
  e.localVideo.style.display = "none";

  e.muteBtn.onclick = () => onToggleMute?.();
  e.cameraBtn.onclick = () => onToggleCamera?.();
  e.endBtn.onclick = () => onEnd?.("user_cut_call");
  e.closeBtn.onclick = () => onEnd?.("user_cut_call");
  e.backdrop.onclick = (evt) => {
    if (evt.target === e.backdrop) onEnd?.("user_cut_call");
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
      e.status.textContent = message || STATUS_TEXT[statusKey] || statusKey;
      e.status.className =
        "consultly-call-widget-status" +
        (statusKey === "connected" ? " consultly-call-widget-status--live" : "");
      // Video only actually shows once a remote track publishes — see
      // showRemoteVideo/showLocalVideo, called from index.js's Agora event
      // bridge. Connected (voice) just needs the status text updated above.
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
      e.muteBtn.textContent = muted ? "🔇" : "🎤";
    },
    setCameraOn(on) {
      e.cameraBtn.dataset.state = on ? "on" : "off";
      e.cameraBtn.textContent = on ? "📷" : "🚫";
    },
    close() {
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
