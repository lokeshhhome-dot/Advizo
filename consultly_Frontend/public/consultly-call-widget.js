(()=>{var j=`.consultly-call-widget-backdrop {
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

.consultly-call-widget-backdrop[hidden] {
  display: none;
}

.consultly-call-widget-panel {
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

.consultly-call-widget-close {
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

.consultly-call-widget-close:hover {
  background: rgba(255, 255, 255, 0.16);
}

/* ---- header: name/call-type row, then status-dot/text/timer row ---- */

.consultly-call-widget-header {
  flex-shrink: 0;
  padding: 18px 56px 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.consultly-call-widget-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.consultly-call-widget-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.consultly-call-widget-calltype {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(244, 246, 248, 0.6);
  background: rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 999px;
}

.consultly-call-widget-statusline {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: rgba(244, 246, 248, 0.64);
}

.consultly-call-widget-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(244, 246, 248, 0.4);
  flex-shrink: 0;
}

.consultly-call-widget-dot--pending {
  background: #f5a623;
  animation: consultly-call-pulse 1.4s ease-in-out infinite;
}

.consultly-call-widget-dot--warn {
  background: #f5a623;
}

.consultly-call-widget-dot--live {
  background: #4ade80;
}

@keyframes consultly-call-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.consultly-call-widget-timer {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: rgba(244, 246, 248, 0.72);
}

/* ---- stage: remote video / avatar fallback + local PIP ---- */

.consultly-call-widget-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.consultly-call-widget-remote-video {
  position: absolute;
  inset: 0;
  background: #000;
}

.consultly-call-widget-avatar-wrap {
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

.consultly-call-widget-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.consultly-call-widget-avatar-fallback {
  width: 100%;
  height: 100%;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 600;
  color: #f4f6f8;
}

.consultly-call-widget-local-video {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 100px;
  height: 136px;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* ---- controls ---- */

.consultly-call-widget-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 18px 18px calc(18px + env(safe-area-inset-bottom, 0px));
}

.consultly-call-widget-control {
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

.consultly-call-widget-control:hover {
  background: rgba(255, 255, 255, 0.18);
}

.consultly-call-widget-control:active {
  transform: scale(0.94);
}

.consultly-call-widget-control:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.consultly-call-widget-control[data-state="muted"],
.consultly-call-widget-control[data-state="off"] {
  background: rgba(255, 255, 255, 0.2);
  color: #f5a623;
}

.consultly-call-widget-control--secondary {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.06);
}

.consultly-call-widget-control--end {
  background: #ef4444;
  width: 60px;
  height: 60px;
}

.consultly-call-widget-control--end:hover {
  background: #dc2626;
}

@media (max-width: 600px) {
  .consultly-call-widget-backdrop {
    padding: 0;
  }

  .consultly-call-widget-panel {
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
    .consultly-call-widget-panel {
      height: 100vh;
      max-height: 100vh;
    }
  }
}
`;var I=!1;function R(){if(I)return;I=!0;let t=document.createElement("style");t.setAttribute("data-consultly-call-widget",""),t.textContent=j,document.head.appendChild(t)}var S={checking:"Connecting\u2026",ringing:"Calling\u2026",connected:"Connected",reconnecting:"Reconnecting\u2026",ended:"Call ended",missed:"No answer",rejected:"Declined",declined:"Declined",failed:"Call failed",unauthenticated:"Please log in to call",unavailable:"Not available right now","no-balance":"Insufficient balance"},_={connected:"consultly-call-widget-dot--live",checking:"consultly-call-widget-dot--pending",ringing:"consultly-call-widget-dot--pending",reconnecting:"consultly-call-widget-dot--warn"};function W(t){return String(t==null?"":t).replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}function q(t){let o=Math.max(0,Math.floor(t)),r=Math.floor(o/3600),i=Math.floor(o%3600/60),s=o%60,n=l=>String(l).padStart(2,"0");return r>0?`${n(r)}:${n(i)}:${n(s)}`:`${n(i)}:${n(s)}`}var u={micOn:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',micOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',cameraOn:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',cameraOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',switchCamera:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a8 8 0 0 1 7.6 5.5"/><polyline points="20 3.5 20 9.5 14 9.5"/><path d="M12 20a8 8 0 0 1-7.6-5.5"/><polyline points="4 20.5 4 14.5 10 14.5"/><circle cx="12" cy="12" r="2.6"/></svg>',end:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" fill="currentColor"/></svg>',close:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'},h=null;function G(){if(h)return h;R();let t=document.createElement("div");t.className="consultly-call-widget-backdrop",t.setAttribute("hidden","hidden");let o=document.createElement("div");o.className="consultly-call-widget-panel",o.setAttribute("role","dialog"),o.setAttribute("aria-modal","true"),o.setAttribute("aria-label","Call");let r=document.createElement("button");r.type="button",r.className="consultly-call-widget-close",r.setAttribute("aria-label","Close"),r.innerHTML=u.close;let i=document.createElement("div");i.className="consultly-call-widget-header";let s=document.createElement("div");s.className="consultly-call-widget-header-row";let n=document.createElement("p");n.className="consultly-call-widget-name";let l=document.createElement("span");l.className="consultly-call-widget-calltype",s.appendChild(n),s.appendChild(l);let e=document.createElement("div");e.className="consultly-call-widget-header-row";let a=document.createElement("div");a.className="consultly-call-widget-statusline";let p=document.createElement("span");p.className="consultly-call-widget-dot";let O=document.createElement("span");O.className="consultly-call-widget-status-text",a.appendChild(p),a.appendChild(O);let L=document.createElement("span");L.className="consultly-call-widget-timer",L.hidden=!0,e.appendChild(a),e.appendChild(L),i.appendChild(s),i.appendChild(e);let w=document.createElement("div");w.className="consultly-call-widget-stage";let A=document.createElement("div");A.setAttribute("data-remote-video",""),A.className="consultly-call-widget-remote-video";let b=document.createElement("div");b.className="consultly-call-widget-avatar-wrap";let B=document.createElement("img");B.className="consultly-call-widget-avatar",B.alt="";let D=document.createElement("div");D.className="consultly-call-widget-avatar-fallback",b.appendChild(B),b.appendChild(D);let M=document.createElement("div");M.setAttribute("data-local-video",""),M.className="consultly-call-widget-local-video",w.appendChild(A),w.appendChild(b),w.appendChild(M);let m=document.createElement("div");m.className="consultly-call-widget-controls";let x=document.createElement("button");x.type="button",x.className="consultly-call-widget-control",x.setAttribute("aria-label","Mute microphone");let f=document.createElement("button");f.type="button",f.className="consultly-call-widget-control",f.setAttribute("aria-label","Turn camera off"),f.hidden=!0;let g=document.createElement("button");g.type="button",g.className="consultly-call-widget-control consultly-call-widget-control--secondary",g.setAttribute("aria-label","Switch camera"),g.innerHTML=u.switchCamera,g.hidden=!0;let y=document.createElement("button");return y.type="button",y.className="consultly-call-widget-control consultly-call-widget-control--end",y.setAttribute("aria-label","End call"),y.innerHTML=u.end,m.appendChild(x),m.appendChild(f),m.appendChild(g),m.appendChild(y),o.appendChild(r),o.appendChild(i),o.appendChild(w),o.appendChild(m),t.appendChild(o),document.body.appendChild(t),h={backdrop:t,panel:o,closeBtn:r,name:n,callTypeLabel:l,statusDot:p,statusText:O,timerEl:L,stage:w,remoteVideo:A,avatarWrap:b,avatarImg:B,avatarFallback:D,localVideo:M,controls:m,muteBtn:x,cameraBtn:f,switchCameraBtn:g,endBtn:y},h}var v=null,E=!1,C=!1,N=null;function z(t){var o;t.key!=="Escape"&&t.key!=="Esc"||C||(o=h==null?void 0:h.endBtn)==null||o.click()}function T(){N&&(window.clearInterval(N),N=null)}function V({consultantName:t,consultantAvatar:o,isVideo:r,onEnd:i,onToggleMute:s,onToggleCamera:n,onSwitchCamera:l}){let e=G();return T(),C=!0,e.panel.classList.toggle("consultly-call-widget-panel--video",!!r),e.name.textContent=t||"Consultant",e.callTypeLabel.textContent=r?"Video Call":"Voice Call",e.statusText.textContent=S.checking,e.statusDot.className=`consultly-call-widget-dot ${_.checking}`,e.timerEl.hidden=!0,e.timerEl.textContent="00:00",e.cameraBtn.hidden=!r,e.switchCameraBtn.hidden=!0,e.muteBtn.dataset.state="unmuted",e.muteBtn.innerHTML=u.micOn,e.muteBtn.setAttribute("aria-label","Mute microphone"),e.cameraBtn.dataset.state=r?"off":"on",e.cameraBtn.innerHTML=r?u.cameraOff:u.cameraOn,o?(e.avatarImg.src=o,e.avatarImg.style.display="block",e.avatarFallback.style.display="none"):(e.avatarImg.style.display="none",e.avatarFallback.style.display="flex",e.avatarFallback.textContent=(t||"?").trim().charAt(0).toUpperCase()),e.avatarImg.alt=W(t||"Consultant"),e.remoteVideo.style.display="none",e.avatarWrap.style.display="flex",e.localVideo.style.display="none",e.muteBtn.onclick=()=>s==null?void 0:s(),e.cameraBtn.onclick=()=>n==null?void 0:n(),e.switchCameraBtn.onclick=()=>l==null?void 0:l(),e.endBtn.onclick=()=>i==null?void 0:i("user_cut_call"),e.closeBtn.onclick=()=>i==null?void 0:i("user_cut_call"),e.backdrop.onclick=a=>{a.target===e.backdrop&&(C||i==null||i("user_cut_call"))},v=document.activeElement,e.backdrop.removeAttribute("hidden"),document.body.style.overflow="hidden",E||(document.addEventListener("keydown",z),E=!0),e.endBtn.focus(),{setStatus(a,p){e.statusText.textContent=p||S[a]||a,e.statusDot.className=`consultly-call-widget-dot ${_[a]||""}`},startTimer(a){T(),e.timerEl.hidden=!1;let p=()=>{e.timerEl.textContent=q((Date.now()-a)/1e3)};p(),N=window.setInterval(p,1e3)},stopTimer(){T()},setCallActive(a){C=!!a},showRemoteVideo(a){e.remoteVideo.style.display=a?"block":"none",e.avatarWrap.style.display=a?"none":"flex"},showLocalVideo(a){e.localVideo.style.display=a?"block":"none"},setMuted(a){e.muteBtn.dataset.state=a?"muted":"unmuted",e.muteBtn.innerHTML=a?u.micOff:u.micOn,e.muteBtn.setAttribute("aria-label",a?"Unmute microphone":"Mute microphone")},setCameraOn(a){e.cameraBtn.dataset.state=a?"on":"off",e.cameraBtn.innerHTML=a?u.cameraOn:u.cameraOff,e.cameraBtn.setAttribute("aria-label",a?"Turn camera off":"Turn camera on")},setCanSwitchCamera(a){e.switchCameraBtn.hidden=!a},setSwitchingCamera(a){e.switchCameraBtn.disabled=!!a,e.switchCameraBtn.setAttribute("aria-busy",a?"true":"false")},close(){T(),C=!1,!(!e.backdrop||e.backdrop.hasAttribute("hidden"))&&(e.backdrop.setAttribute("hidden","hidden"),document.body.style.overflow="",E&&(document.removeEventListener("keydown",z),E=!1),v&&typeof v.focus=="function"&&v.focus(),v=null)}}}var X=new Set(["ended","missed","rejected","declined","failed","unauthenticated","unavailable","no-balance"]),U=1800,c=null,d=null,H=!1,k=null;function Y(t){H||(H=!0,window.addEventListener("local-video-ready",()=>t.showLocalVideo(!0)),window.addEventListener("remote-video-ready",()=>t.showRemoteVideo(!0)),window.addEventListener("remote-video-stopped",()=>t.showRemoteVideo(!1)),window.addEventListener("remote-user-left",()=>{c==null||c.hangUp("user_cut_call")}))}function $(){d==null||d.close(),d=null,c=null}function J(t){return`https://${t}/apps/consultly/call-engine.js`}function F(t){return window.ConsultlyCallEngine?Promise.resolve():k||(k=new Promise((o,r)=>{let i=document.createElement("script");i.src=J(t),i.async=!0,i.onload=()=>o(),i.onerror=()=>{k=null,r(new Error("Failed to load call engine"))},document.head.appendChild(i)}),k)}function Q(t){t&&F(t).catch(()=>{})}function Z(t){let{shop:o,consultantId:r,callType:i}=t||{};if(!o||!r){console.error("[CALL MODAL] missing shop/consultantId \u2014 cannot open");return}if(console.log("[CALL MODAL] opened"),console.log("[CALL MODAL] call type =",i),console.log("[CALL DEBUG] customer modal opened"),c)return;let s=i==="video",n=V({consultantName:t.consultantName,consultantAvatar:t.consultantAvatar,isVideo:s,onEnd:l=>{console.log("[CALL MODAL] call ended (user)"),c==null||c.hangUp(l)},onToggleMute:()=>{let l=c==null?void 0:c.toggleMute();n.setMuted(!!l)},onToggleCamera:()=>{let l=c==null?void 0:c.toggleCamera();n.setCameraOn(!!l)},onSwitchCamera:async()=>{if(!c)return;n.setSwitchingCamera(!0);let l=await c.switchCamera();n.setSwitchingCamera(!1),l!=null&&l.ok||console.error("[CALL MODAL] camera switch failed:",l==null?void 0:l.message)}});d=n,Y(n),console.log("[CALL MODAL] initialization started"),F(o).then(()=>{d===n&&(c=window.ConsultlyCallEngine.startCustomerCall({shop:o,consultantId:r,callType:s?"video":"voice",onState:l=>{d===n&&(l.status==="checking"&&console.log("[CALL MODAL] token request"),l.status==="ringing"&&console.log("[CALL MODAL] Agora initialization"),l.status==="connected"&&console.log("[CALL MODAL] connected"),n.setStatus(l.status,l.message),l.status==="connected"&&l.startedAt&&n.startTimer(l.startedAt),X.has(l.status)&&(console.log("[CALL MODAL] call ended"),n.stopTimer(),n.setCallActive(!1),window.setTimeout(()=>{d===n&&$()},U)))}}),s&&c.canSwitchCamera().then(l=>{d===n&&n.setCanSwitchCamera(l)}))}).catch(l=>{console.error("[CALL MODAL] failed to load call engine:",l),d===n&&(n.setStatus("failed","Call failed. Please try again."),n.setCallActive(!1),window.setTimeout(()=>{d===n&&$()},U))})}function K(){c==null||c.hangUp("user_cut_call")}window.ConsultlyCallWidget={open:Z,close:K,prefetchEngine:Q};})();
