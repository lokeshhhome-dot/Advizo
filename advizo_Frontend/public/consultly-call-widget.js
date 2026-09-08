(()=>{var j=`.advizo-call-widget-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 20, 18, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483000;
  padding: 16px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

.advizo-call-widget-backdrop[hidden] {
  display: none;
}

.advizo-call-widget-panel {
  position: relative;
  width: 500px;
  max-width: calc(100vw - 32px);
  height: 640px;
  max-height: calc(100vh - 32px);
  background: linear-gradient(180deg, #161b23, #0e1116);
  color: #f4f6f8;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  transition: opacity 0.18s ease;
}

.advizo-call-widget-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #f4f6f8;
  cursor: pointer;
  transition: background 0.15s ease;
}

.advizo-call-widget-close:hover {
  background: rgba(255, 255, 255, 0.16);
}

/* ---- header: name/call-type row, then status-dot/text/timer row ---- */

.advizo-call-widget-header {
  flex-shrink: 0;
  padding: 18px 56px 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.advizo-call-widget-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.advizo-call-widget-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.advizo-call-widget-calltype {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(244, 246, 248, 0.6);
  background: rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 999px;
}

.advizo-call-widget-statusline {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: rgba(244, 246, 248, 0.64);
}

.advizo-call-widget-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(244, 246, 248, 0.4);
  flex-shrink: 0;
}

.advizo-call-widget-dot--pending {
  background: #f5a623;
  animation: advizo-call-pulse 1.4s ease-in-out infinite;
}

.advizo-call-widget-dot--warn {
  background: #f5a623;
}

.advizo-call-widget-dot--live {
  background: #4ade80;
}

@keyframes advizo-call-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.advizo-call-widget-timer {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: rgba(244, 246, 248, 0.72);
}

/* ---- stage: remote video / avatar fallback + local PIP ---- */

.advizo-call-widget-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.advizo-call-widget-remote-video {
  position: absolute;
  inset: 0;
  background: #000;
}

.advizo-call-widget-avatar-wrap {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 3px solid rgba(255, 255, 255, 0.16);
}

.advizo-call-widget-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.advizo-call-widget-avatar-fallback {
  width: 100%;
  height: 100%;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 600;
  color: #f4f6f8;
}

/* Sized to visually match the Consultant Dashboard's own local-preview
   tile (VideoCallingPage.module.css's .localVideo \u2014 a ~3:4 portrait tile,
   not 16:9: its real desktop size is 150x200, scaling to 176x234 on wide
   screens and down to 92x120/108x148 on small ones \u2014 clamp() here tracks
   that same range responsively instead of hardcoding one of those steps).
   Positioned within .stage (not the panel), so its bottom offset already
   clears the controls bar below without any extra math. */
.advizo-call-widget-local-video {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: clamp(96px, 30vw, 168px);
  aspect-ratio: 3 / 4;
  height: auto;
  border-radius: 14px;
  overflow: hidden;
  background: #000;
  border: 2px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

/* ---- controls ---- */

.advizo-call-widget-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 18px 18px calc(18px + env(safe-area-inset-bottom, 0px));
}

.advizo-call-widget-control {
  width: 52px;
  height: 52px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #f4f6f8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.advizo-call-widget-control:hover {
  background: rgba(255, 255, 255, 0.18);
}

.advizo-call-widget-control:active {
  transform: scale(0.94);
}

.advizo-call-widget-control:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.advizo-call-widget-control[data-state="muted"],
.advizo-call-widget-control[data-state="off"] {
  background: rgba(255, 255, 255, 0.2);
  color: #f5a623;
}

.advizo-call-widget-control--secondary {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.06);
}

.advizo-call-widget-control--end {
  background: #ef4444;
  width: 60px;
  height: 60px;
}

.advizo-call-widget-control--end:hover {
  background: #dc2626;
}

@media (max-width: 600px) {
  .advizo-call-widget-backdrop {
    padding: 0;
  }

  .advizo-call-widget-panel {
    position: fixed;
    inset: 0;
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    margin: 0;
  }

  /* Browsers without dvh support (fallback \u2014 100vh can be taller than the
     visible area behind mobile browser chrome, but this only affects very
     old browsers; 100dvh above wins wherever it's supported). */
  @supports not (height: 100dvh) {
    .advizo-call-widget-panel {
      height: 100vh;
      max-height: 100vh;
    }
  }
}
`;var z=!1;function W(){if(z)return;z=!0;let n=document.createElement("style");n.setAttribute("data-advizo-call-widget",""),n.textContent=j,document.head.appendChild(n)}var I={checking:"Connecting\u2026",ringing:"Calling\u2026",connected:"Connected",reconnecting:"Reconnecting\u2026",ended:"Call ended",missed:"No answer",rejected:"Declined",declined:"Declined",failed:"Call failed",unauthenticated:"Please log in to call",unavailable:"Not available right now","no-balance":"Insufficient balance"},_={connected:"advizo-call-widget-dot--live",checking:"advizo-call-widget-dot--pending",ringing:"advizo-call-widget-dot--pending",reconnecting:"advizo-call-widget-dot--warn"};function q(n){return String(n==null?"":n).replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}function G(n){let o=Math.max(0,Math.floor(n)),r=Math.floor(o/3600),i=Math.floor(o%3600/60),s=o%60,l=t=>String(t).padStart(2,"0");return r>0?`${l(r)}:${l(i)}:${l(s)}`:`${l(i)}:${l(s)}`}var d={micOn:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',micOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',cameraOn:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',cameraOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',switchCamera:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a8 8 0 0 1 7.6 5.5"/><polyline points="20 3.5 20 9.5 14 9.5"/><path d="M12 20a8 8 0 0 1-7.6-5.5"/><polyline points="4 20.5 4 14.5 10 14.5"/><circle cx="12" cy="12" r="2.6"/></svg>',speaker:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',end:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" fill="currentColor"/></svg>',close:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'},w=null;function X(){if(w)return w;W();let n=document.createElement("div");n.className="advizo-call-widget-backdrop",n.setAttribute("hidden","hidden");let o=document.createElement("div");o.className="advizo-call-widget-panel",o.setAttribute("role","dialog"),o.setAttribute("aria-modal","true"),o.setAttribute("aria-label","Call");let r=document.createElement("button");r.type="button",r.className="advizo-call-widget-close",r.setAttribute("aria-label","Close"),r.innerHTML=d.close;let i=document.createElement("div");i.className="advizo-call-widget-header";let s=document.createElement("div");s.className="advizo-call-widget-header-row";let l=document.createElement("p");l.className="advizo-call-widget-name";let t=document.createElement("span");t.className="advizo-call-widget-calltype",s.appendChild(l),s.appendChild(t);let p=document.createElement("div");p.className="advizo-call-widget-header-row";let e=document.createElement("div");e.className="advizo-call-widget-statusline";let a=document.createElement("span");a.className="advizo-call-widget-dot";let h=document.createElement("span");h.className="advizo-call-widget-status-text",e.appendChild(a),e.appendChild(h);let B=document.createElement("span");B.className="advizo-call-widget-timer",B.hidden=!0,p.appendChild(e),p.appendChild(B),i.appendChild(s),i.appendChild(p);let f=document.createElement("div");f.className="advizo-call-widget-stage";let M=document.createElement("div");M.setAttribute("data-remote-video",""),M.className="advizo-call-widget-remote-video";let v=document.createElement("div");v.className="advizo-call-widget-avatar-wrap";let E=document.createElement("img");E.className="advizo-call-widget-avatar",E.alt="";let D=document.createElement("div");D.className="advizo-call-widget-avatar-fallback",v.appendChild(E),v.appendChild(D);let N=document.createElement("div");N.setAttribute("data-local-video",""),N.className="advizo-call-widget-local-video",f.appendChild(M),f.appendChild(v),f.appendChild(N);let m=document.createElement("div");m.className="advizo-call-widget-controls";let k=document.createElement("button");k.type="button",k.className="advizo-call-widget-control",k.setAttribute("aria-label","Mute microphone");let y=document.createElement("button");y.type="button",y.className="advizo-call-widget-control",y.setAttribute("aria-label","Turn camera off"),y.hidden=!0;let g=document.createElement("button");g.type="button",g.className="advizo-call-widget-control advizo-call-widget-control--secondary",g.setAttribute("aria-label","Switch camera"),g.innerHTML=d.switchCamera,g.hidden=!0;let b=document.createElement("button");b.type="button",b.className="advizo-call-widget-control",b.setAttribute("aria-label","Switch audio output"),b.innerHTML=d.speaker;let x=document.createElement("button");return x.type="button",x.className="advizo-call-widget-control advizo-call-widget-control--end",x.setAttribute("aria-label","End call"),x.innerHTML=d.end,m.appendChild(k),m.appendChild(y),m.appendChild(g),m.appendChild(b),m.appendChild(x),o.appendChild(r),o.appendChild(i),o.appendChild(f),o.appendChild(m),n.appendChild(o),document.body.appendChild(n),w={backdrop:n,panel:o,closeBtn:r,name:l,callTypeLabel:t,statusDot:a,statusText:h,timerEl:B,stage:f,remoteVideo:M,avatarWrap:v,avatarImg:E,avatarFallback:D,localVideo:N,controls:m,muteBtn:k,cameraBtn:y,switchCameraBtn:g,speakerBtn:b,endBtn:x},w}var C=null,T=!1,L=!1,S=null;function V(n){var o;n.key!=="Escape"&&n.key!=="Esc"||L||(o=w==null?void 0:w.endBtn)==null||o.click()}function O(){S&&(window.clearInterval(S),S=null)}function H({consultantName:n,consultantAvatar:o,isVideo:r,onEnd:i,onToggleMute:s,onToggleCamera:l,onSwitchCamera:t,onToggleSpeaker:p}){let e=X();return O(),L=!0,e.panel.classList.toggle("advizo-call-widget-panel--video",!!r),e.name.textContent=n||"Consultant",e.callTypeLabel.textContent=r?"Video Call":"Voice Call",e.statusText.textContent=I.checking,e.statusDot.className=`advizo-call-widget-dot ${_.checking}`,e.timerEl.hidden=!0,e.timerEl.textContent="00:00",e.cameraBtn.hidden=!r,e.switchCameraBtn.hidden=!0,e.muteBtn.dataset.state="unmuted",e.muteBtn.innerHTML=d.micOn,e.muteBtn.setAttribute("aria-label","Mute microphone"),e.cameraBtn.dataset.state=r?"off":"on",e.cameraBtn.innerHTML=r?d.cameraOff:d.cameraOn,e.speakerBtn.innerHTML=d.speaker,e.speakerBtn.disabled=!0,e.speakerBtn.setAttribute("aria-disabled","true"),o?(e.avatarImg.src=o,e.avatarImg.style.display="block",e.avatarFallback.style.display="none"):(e.avatarImg.style.display="none",e.avatarFallback.style.display="flex",e.avatarFallback.textContent=(n||"?").trim().charAt(0).toUpperCase()),e.avatarImg.alt=q(n||"Consultant"),e.remoteVideo.style.display="none",e.avatarWrap.style.display="flex",e.localVideo.style.display="none",e.muteBtn.onclick=()=>s==null?void 0:s(),e.cameraBtn.onclick=()=>l==null?void 0:l(),e.switchCameraBtn.onclick=()=>t==null?void 0:t(),e.speakerBtn.onclick=()=>p==null?void 0:p(),e.endBtn.onclick=()=>i==null?void 0:i("user_cut_call"),e.closeBtn.onclick=()=>i==null?void 0:i("user_cut_call"),e.backdrop.onclick=a=>{a.target===e.backdrop&&(L||i==null||i("user_cut_call"))},C=document.activeElement,e.backdrop.removeAttribute("hidden"),document.body.style.overflow="hidden",T||(document.addEventListener("keydown",V),T=!0),e.endBtn.focus(),{setStatus(a,h){e.statusText.textContent=h||I[a]||a,e.statusDot.className=`advizo-call-widget-dot ${_[a]||""}`},startTimer(a){O(),e.timerEl.hidden=!1;let h=()=>{e.timerEl.textContent=G((Date.now()-a)/1e3)};h(),S=window.setInterval(h,1e3)},stopTimer(){O()},setCallActive(a){L=!!a},showRemoteVideo(a){e.remoteVideo.style.display=a?"block":"none",e.avatarWrap.style.display=a?"none":"flex"},showLocalVideo(a){e.localVideo.style.display=a?"block":"none"},setMuted(a){e.muteBtn.dataset.state=a?"muted":"unmuted",e.muteBtn.innerHTML=a?d.micOff:d.micOn,e.muteBtn.setAttribute("aria-label",a?"Unmute microphone":"Mute microphone")},setCameraOn(a){e.cameraBtn.dataset.state=a?"on":"off",e.cameraBtn.innerHTML=a?d.cameraOn:d.cameraOff,e.cameraBtn.setAttribute("aria-label",a?"Turn camera off":"Turn camera on")},setCanSwitchCamera(a){e.switchCameraBtn.hidden=!a},setSwitchingCamera(a){e.switchCameraBtn.disabled=!!a,e.switchCameraBtn.setAttribute("aria-busy",a?"true":"false")},setSpeakerAvailable(a){e.speakerBtn.disabled=!a,e.speakerBtn.setAttribute("aria-disabled",a?"false":"true"),e.speakerBtn.title=a?"":"Not supported on this device"},setSwitchingSpeaker(a){e.speakerBtn.setAttribute("aria-busy",a?"true":"false")},close(){O(),L=!1,!(!e.backdrop||e.backdrop.hasAttribute("hidden"))&&(e.backdrop.setAttribute("hidden","hidden"),document.body.style.overflow="",T&&(document.removeEventListener("keydown",V),T=!1),C&&typeof C.focus=="function"&&C.focus(),C=null)}}}var Y=new Set(["ended","missed","rejected","declined","failed","unauthenticated","unavailable","no-balance"]),U=1800,c=null,u=null,P=!1,A=null;function J(n){P||(P=!0,window.addEventListener("local-video-ready",()=>n.showLocalVideo(!0)),window.addEventListener("remote-video-ready",()=>n.showRemoteVideo(!0)),window.addEventListener("remote-video-stopped",()=>n.showRemoteVideo(!1)),window.addEventListener("remote-user-left",()=>{c==null||c.hangUp("user_cut_call")}))}function $(){u==null||u.close(),u=null,c=null}function Q(n){return`https://${n}/apps/advizo/call-engine.js`}function F(n){return window.advizoCallEngine?Promise.resolve():A||(A=new Promise((o,r)=>{let i=document.createElement("script");i.src=Q(n),i.async=!0,i.onload=()=>o(),i.onerror=()=>{A=null,r(new Error("Failed to load call engine"))},document.head.appendChild(i)}),A)}function Z(n){n&&F(n).catch(()=>{})}function K(n){let{shop:o,consultantId:r,callType:i}=n||{};if(!o||!r){console.error("[CALL MODAL] missing shop/consultantId \u2014 cannot open");return}if(console.log("[CALL MODAL] opened"),console.log("[CALL MODAL] call type =",i),console.log("[CALL DEBUG] customer modal opened"),c)return;let s=i==="video",l=H({consultantName:n.consultantName,consultantAvatar:n.consultantAvatar,isVideo:s,onEnd:t=>{console.log("[CALL MODAL] call ended (user)"),c==null||c.hangUp(t)},onToggleMute:()=>{let t=c==null?void 0:c.toggleMute();l.setMuted(!!t)},onToggleCamera:()=>{let t=c==null?void 0:c.toggleCamera();l.setCameraOn(!!t)},onSwitchCamera:async()=>{if(!c)return;l.setSwitchingCamera(!0);let t=await c.switchCamera();l.setSwitchingCamera(!1),t!=null&&t.ok||console.error("[CALL MODAL] camera switch failed:",t==null?void 0:t.message)},onToggleSpeaker:async()=>{if(!c)return;l.setSwitchingSpeaker(!0);let t=await c.switchSpeaker();l.setSwitchingSpeaker(!1),t!=null&&t.ok||console.error("[CALL MODAL] speaker switch failed:",t==null?void 0:t.message)}});u=l,J(l),console.log("[CALL MODAL] initialization started"),F(o).then(()=>{u===l&&(c=window.advizoCallEngine.startCustomerCall({shop:o,consultantId:r,callType:s?"video":"voice",onState:t=>{u===l&&(t.status==="checking"&&console.log("[CALL MODAL] token request"),t.status==="ringing"&&console.log("[CALL MODAL] Agora initialization"),t.status==="connected"&&console.log("[CALL MODAL] connected"),l.setStatus(t.status,t.message),t.status==="connected"&&t.startedAt&&(l.startTimer(t.startedAt),c==null||c.canSwitchSpeaker().then(p=>{u===l&&l.setSpeakerAvailable(p)})),Y.has(t.status)&&(console.log("[CALL MODAL] call ended"),l.stopTimer(),l.setCallActive(!1),window.setTimeout(()=>{u===l&&$()},U)))}}),s&&c.canSwitchCamera().then(t=>{u===l&&l.setCanSwitchCamera(t)}))}).catch(t=>{console.error("[CALL MODAL] failed to load call engine:",t),u===l&&(l.setStatus("failed","Call failed. Please try again."),l.setCallActive(!1),window.setTimeout(()=>{u===l&&$()},U))})}function ee(){c==null||c.hangUp("user_cut_call")}window.advizoCallWidget={open:K,close:ee,prefetchEngine:Z};})();
