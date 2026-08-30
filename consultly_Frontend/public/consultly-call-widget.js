(()=>{var C=`.consultly-call-widget-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 20, 18, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483000;
  padding: 24px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

.consultly-call-widget-backdrop[hidden] {
  display: none;
}

.consultly-call-widget-panel {
  position: relative;
  width: 420px;
  max-width: 100%;
  height: 680px;
  max-height: calc(100vh - 48px);
  background: linear-gradient(180deg, #161b23, #0e1116);
  color: #f4f6f8;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
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
}

.consultly-call-widget-close:hover {
  background: rgba(255, 255, 255, 0.16);
}

.consultly-call-widget-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 24px;
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

.consultly-call-widget-name {
  margin: 8px 0 0;
  font-size: 19px;
  font-weight: 600;
}

.consultly-call-widget-status {
  margin: 0;
  font-size: 14px;
  color: rgba(244, 246, 248, 0.64);
}

.consultly-call-widget-status--live {
  color: #4ade80;
  font-weight: 600;
}

.consultly-call-widget-calltype {
  margin: 0;
  font-size: 12px;
  color: rgba(244, 246, 248, 0.5);
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
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #f4f6f8;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.consultly-call-widget-control:hover {
  background: rgba(255, 255, 255, 0.18);
}

.consultly-call-widget-control--end {
  background: #ef4444;
  width: 60px;
  height: 60px;
}

.consultly-call-widget-control--end:hover {
  background: #dc2626;
}

@media (max-width: 599px) {
  .consultly-call-widget-backdrop {
    padding: 0;
  }

  .consultly-call-widget-panel {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
}
`;var k=!1;function _(){if(k)return;k=!0;let t=document.createElement("style");t.setAttribute("data-consultly-call-widget",""),t.textContent=C,document.head.appendChild(t)}var L={checking:"Connecting\u2026",ringing:"Ringing\u2026",connected:"Connected",ended:"Call ended",missed:"No answer",rejected:"Declined",declined:"Declined",failed:"Call failed",unauthenticated:"Please log in to call",unavailable:"Not available right now","no-balance":"Insufficient balance"};function j(t){return String(t==null?"":t).replace(/[&<>"']/g,l=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[l])}var u=null;function O(){if(u)return u;_();let t=document.createElement("div");t.className="consultly-call-widget-backdrop",t.setAttribute("hidden","hidden");let l=document.createElement("div");l.className="consultly-call-widget-panel",l.setAttribute("role","dialog"),l.setAttribute("aria-modal","true"),l.setAttribute("aria-label","Call");let a=document.createElement("button");a.type="button",a.className="consultly-call-widget-close",a.setAttribute("aria-label","Close"),a.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';let n=document.createElement("div");n.className="consultly-call-widget-stage";let d=document.createElement("div");d.setAttribute("data-remote-video",""),d.className="consultly-call-widget-remote-video";let o=document.createElement("div");o.className="consultly-call-widget-avatar-wrap";let e=document.createElement("img");e.className="consultly-call-widget-avatar",e.alt="";let c=document.createElement("div");c.className="consultly-call-widget-avatar-fallback",o.appendChild(e),o.appendChild(c);let h=document.createElement("p");h.className="consultly-call-widget-name";let x=document.createElement("p");x.className="consultly-call-widget-status";let v=document.createElement("p");v.className="consultly-call-widget-calltype";let w=document.createElement("div");w.setAttribute("data-local-video",""),w.className="consultly-call-widget-local-video",n.appendChild(d),n.appendChild(o),n.appendChild(h),n.appendChild(x),n.appendChild(v),n.appendChild(w);let p=document.createElement("div");p.className="consultly-call-widget-controls";let g=document.createElement("button");g.type="button",g.className="consultly-call-widget-control",g.setAttribute("aria-label","Mute"),g.textContent="\u{1F3A4}";let r=document.createElement("button");r.type="button",r.className="consultly-call-widget-control",r.setAttribute("aria-label","Camera"),r.textContent="\u{1F4F7}",r.hidden=!0;let m=document.createElement("button");return m.type="button",m.className="consultly-call-widget-control consultly-call-widget-control--end",m.setAttribute("aria-label","End call"),m.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" fill="currentColor"/></svg>',p.appendChild(g),p.appendChild(r),p.appendChild(m),l.appendChild(a),l.appendChild(n),l.appendChild(p),t.appendChild(l),document.body.appendChild(t),u={backdrop:t,panel:l,closeBtn:a,stage:n,remoteVideo:d,avatarWrap:o,avatarImg:e,avatarFallback:c,name:h,status:x,callTypeLabel:v,localVideo:w,controls:p,muteBtn:g,cameraBtn:r,endBtn:m},u}var f=null,b=!1;function A(t){var l;(t.key==="Escape"||t.key==="Esc")&&((l=u==null?void 0:u.endBtn)==null||l.click())}function E({consultantName:t,consultantAvatar:l,isVideo:a,onEnd:n,onToggleMute:d,onToggleCamera:o}){let e=O();return e.panel.classList.toggle("consultly-call-widget-panel--video",!!a),e.name.textContent=t||"Consultant",e.callTypeLabel.textContent=a?"Video Call":"Voice Call",e.status.textContent=L.checking,e.status.className="consultly-call-widget-status",e.cameraBtn.hidden=!a,e.muteBtn.dataset.state="unmuted",e.cameraBtn.dataset.state=a?"off":"on",l?(e.avatarImg.src=l,e.avatarImg.style.display="block",e.avatarFallback.style.display="none"):(e.avatarImg.style.display="none",e.avatarFallback.style.display="flex",e.avatarFallback.textContent=(t||"?").trim().charAt(0).toUpperCase()),e.avatarImg.alt=j(t||"Consultant"),e.remoteVideo.style.display="none",e.localVideo.style.display="none",e.muteBtn.onclick=()=>d==null?void 0:d(),e.cameraBtn.onclick=()=>o==null?void 0:o(),e.endBtn.onclick=()=>n==null?void 0:n("user_cut_call"),e.closeBtn.onclick=()=>n==null?void 0:n("user_cut_call"),e.backdrop.onclick=c=>{c.target===e.backdrop&&(n==null||n("user_cut_call"))},f=document.activeElement,e.backdrop.removeAttribute("hidden"),document.body.style.overflow="hidden",b||(document.addEventListener("keydown",A),b=!0),e.endBtn.focus(),{setStatus(c,h){e.status.textContent=h||L[c]||c,e.status.className="consultly-call-widget-status"+(c==="connected"?" consultly-call-widget-status--live":"")},showRemoteVideo(c){e.remoteVideo.style.display=c?"block":"none",e.avatarWrap.style.display=c?"none":"flex"},showLocalVideo(c){e.localVideo.style.display=c?"block":"none"},setMuted(c){e.muteBtn.dataset.state=c?"muted":"unmuted",e.muteBtn.textContent=c?"\u{1F507}":"\u{1F3A4}"},setCameraOn(c){e.cameraBtn.dataset.state=c?"on":"off",e.cameraBtn.textContent=c?"\u{1F4F7}":"\u{1F6AB}"},close(){!e.backdrop||e.backdrop.hasAttribute("hidden")||(e.backdrop.setAttribute("hidden","hidden"),document.body.style.overflow="",b&&(document.removeEventListener("keydown",A),b=!1),f&&typeof f.focus=="function"&&f.focus(),f=null)}}}var D=new Set(["ended","missed","rejected","declined","failed","unauthenticated","unavailable","no-balance"]),z=1800,i=null,s=null,B=!1,y=null;function I(t){B||(B=!0,window.addEventListener("local-video-ready",()=>t.showLocalVideo(!0)),window.addEventListener("remote-video-ready",()=>t.showRemoteVideo(!0)),window.addEventListener("remote-video-stopped",()=>t.showRemoteVideo(!1)),window.addEventListener("remote-user-left",()=>{i==null||i.hangUp("user_cut_call")}))}function V(){s==null||s.close(),s=null,i=null}function T(){var t;try{return new URL("consultly-call-engine.js",((t=document.currentScript)==null?void 0:t.src)||location.href).href}catch(l){return"consultly-call-engine.js"}}function M(){return window.ConsultlyCallEngine?Promise.resolve():y||(y=new Promise((t,l)=>{let a=document.createElement("script");a.src=T(),a.async=!0,a.onload=()=>t(),a.onerror=()=>{y=null,l(new Error("Failed to load call engine"))},document.head.appendChild(a)}),y)}function U(){M().catch(()=>{})}function F(t){let{shop:l,consultantId:a,callType:n}=t||{};if(!l||!a){console.error("[CALL MODAL] missing shop/consultantId \u2014 cannot open");return}if(console.log("[CALL MODAL] opened"),console.log("[CALL MODAL] call type =",n),i)return;let d=n==="video",o=E({consultantName:t.consultantName,consultantAvatar:t.consultantAvatar,isVideo:d,onEnd:e=>{console.log("[CALL MODAL] call ended (user)"),i==null||i.hangUp(e)},onToggleMute:()=>{let e=i==null?void 0:i.toggleMute();o.setMuted(!!e)},onToggleCamera:()=>{let e=i==null?void 0:i.toggleCamera();o.setCameraOn(!!e)}});s=o,I(o),console.log("[CALL MODAL] initialization started"),M().then(()=>{s===o&&(i=window.ConsultlyCallEngine.startCustomerCall({shop:l,consultantId:a,callType:d?"video":"voice",onState:e=>{s===o&&(e.status==="checking"&&console.log("[CALL MODAL] token request"),e.status==="ringing"&&console.log("[CALL MODAL] Agora initialization"),e.status==="connected"&&console.log("[CALL MODAL] connected"),o.setStatus(e.status,e.message),D.has(e.status)&&(console.log("[CALL MODAL] call ended"),window.setTimeout(()=>{s===o&&V()},z)))}}))}).catch(e=>{console.error("[CALL MODAL] failed to load call engine:",e),s===o&&o.setStatus("failed","Call failed. Please try again.")})}function R(){i==null||i.hangUp("user_cut_call")}window.ConsultlyCallWidget={open:F,close:R,prefetchEngine:U};})();
