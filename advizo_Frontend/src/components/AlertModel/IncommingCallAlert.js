// components/IncomingCallAlert.jsx
import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setIncomingCall } from "../Redux/slices/sokectSlice";
import { socket } from "../Sokect-io/SokectConfig";
import { checkMicPermission } from "../ConsultantCards/ConsultantCards";
import TestRingtone from "../../pages/TestRingtone";
import axios from "axios";
import VideoCallModal from "./VideoCallModal";
import styles from "./IncommingCallAlert.module.css";

// incoming-call's socket payload (server-io.js) never carries an avatar —
// only callerId/callerName/callType/channelName/shop — so this shows real
// initials instead of a fabricated/stock photo pretending to be the caller.
const AVATAR_COLORS = ["#4a6cf7", "#12b76a", "#f79009", "#0ea5e9", "#a855f7", "#ec4899", "#14b8a6"];
const avatarColor = (name = "") => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};
const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

export default function IncomingCallAlert() {
  const dispatch = useDispatch();
  const userId =
    localStorage.getItem("client_u_Identity") ||
    localStorage.getItem("consultant_u_Identity");
  const { incomingCall, callEnded } = useSelector((state) => state.socket);
  const { callAccepted } = useSelector((state) => state.socket);
  // Holds the accepted call's config (passed to VideoCallingPage as props,
  // no iframe/URL involved). Kept separate from `incomingCall` (which is
  // cleared the moment the call is accepted) so the call modal stays
  // mounted for the whole call instead of disappearing with the ring.
  const [activeCallConfig, setActiveCallConfig] = useState(null);
  const { callType, callerName } = incomingCall || {};

  useEffect(() => {
    if (callEnded?.callId && incomingCall) {
      handleReject();
    }
  }, [callEnded]);

  // Real-time ring window: the server auto-misses the call after 15s and
  // emits call-missed (handled above). This local timer is the fallback —
  // if that event is lost, the popup still dismisses itself just after the
  // server deadline instead of ringing forever.
  useEffect(() => {
    if (!incomingCall) return;
    const timer = setTimeout(() => {
      dispatch(setIncomingCall(null));
    }, 16000);
    return () => clearTimeout(timer);
  }, [incomingCall, dispatch]);

  const handleAccept = async () => {
    if (!incomingCall) return;
    const { callerId, channelName, shop } = incomingCall;
    localStorage.setItem("callAccepted", JSON.stringify(callAccepted));
    const shopId = localStorage.getItem("shop_o_Identity");
    const hasMicPermission = await checkMicPermission();
    if (!hasMicPermission) {
      alert("Please grant microphone permission to start the call");
      return;
    }
    const uid = Math.floor(Math.random() * 1000000);
    const url = `${process.env.REACT_APP_BACKEND_HOST}/call/generate-token`;
    const res = await axios.post(
      url,
      {
        channelName,
        uid,
        receiverId: userId,
        callType: incomingCall.callType || "voice",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      },
    );
    const data = res.data;
    if (data.token) {
      socket.emit("call-accepted", {
        callerId,
        receiverId: userId,
        channelName,
        callType: incomingCall.callType,
        shopId: shopId,
      });
      const callType = incomingCall.callType || "voice";

      // Same fields VideoCallingPage used to read from the URL — now passed
      // as props (VideoCallModal renders <VideoCallingPage config={...}>
      // directly, no iframe). Only include values that are actually set, to
      // match params.get() returning null for an absent key rather than the
      // literal string "undefined".
      const rawConfig = {
        callerId,
        receiverId: userId,
        callType,
        uid: String(uid),
        channelName,
        token: data.token,
        appId: data.appId,
        userId,
        shopId,
        shop,
        userType: "consultant",
        authToken: localStorage.getItem("token") || "",
      };
      const callConfig = {};
      Object.keys(rawConfig).forEach((key) => {
        const value = rawConfig[key];
        if (value !== undefined && value !== null && value !== "") {
          callConfig[key] = String(value);
        }
      });

      dispatch(setIncomingCall(null));
      setActiveCallConfig(callConfig);
    }
  };

  const handleReject = () => {
    if (!incomingCall) return;
    const { callerId, channelName } = incomingCall;
    socket.emit("reject-call", {
      callerId,
      receiverId: userId,
      channelName,
      callType: incomingCall.callType,
    });
    dispatch(setIncomingCall(null));
  };

  const isVideoCall = callType === "video";

  return (
    <>
      <VideoCallModal
        callConfig={activeCallConfig}
        onClose={() => setActiveCallConfig(null)}
      />
      {incomingCall && (
        <>
          <TestRingtone incomingCall={incomingCall} />
          <div className={styles.card} role="alertdialog" aria-label={`Incoming ${callType} call from ${callerName}`}>
            <p className={styles.kicker}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
              </svg>
              Incoming call
            </p>

            <div className={styles.body}>
              <div className={styles.avatarWrap}>
                <span className={styles.avatarRing} aria-hidden="true" />
                <span className={styles.avatar} style={{ background: avatarColor(callerName || "") }}>
                  {initials(callerName)}
                </span>
              </div>
              <div className={styles.info}>
                <p className={styles.callerName}>{callerName || "Unknown"}</p>
                <p className={styles.callTypeLabel}>
                  {isVideoCall ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 7l-7 5 7 5V7z" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
                    </svg>
                  )}
                  {isVideoCall ? "Incoming video call" : "Incoming voice call"}
                </p>
              </div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.declineBtn} onClick={handleReject}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" transform="rotate(135 12 12)" />
                </svg>
                Decline
              </button>
              <button type="button" className={styles.acceptBtn} onClick={handleAccept}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 15.5c0 .3-.1.5-.3.7l-2.9 2.9c-.2.2-.5.3-.8.3-2.1-.1-4.3-.7-6.4-1.9C8.5 16.3 6.5 14.3 5.2 12.2 4 10.1 3.4 7.9 3.3 5.8c0-.3.1-.6.3-.8l2.9-2.9c.4-.4 1-.5 1.5-.2.2.1.3.3.4.5l1.5 3.5c.2.4.1.9-.2 1.2L8.4 8.4c.9 2.2 2.5 3.8 4.7 4.7l1.3-1.3c.3-.3.8-.4 1.2-.2l3.5 1.5c.2.1.4.2.5.4.3.5.2 1.1-.2 1.5l-.4.5z" />
                </svg>
                Accept
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
