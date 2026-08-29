// components/IncomingCallAlert.jsx
import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setIncomingCall } from "../Redux/slices/sokectSlice";
import { socket } from "../Sokect-io/SokectConfig";
import { checkMicPermission } from "../ConsultantCards/ConsultantCards";
import TestRingtone from "../../pages/TestRingtone";
import axios from "axios";
import { buildCallPageUrl } from "../../utils/buildCallPageUrl";
import VideoCallModal from "./VideoCallModal";
import userDefultProfile from "../../assets/avatar-or-person-sign-profile-picture-portrait-icon-user-profile-symbol.webp"

export default function IncomingCallAlert() {
  const dispatch = useDispatch();
  const userId =
    localStorage.getItem("client_u_Identity") ||
    localStorage.getItem("consultant_u_Identity");
  const { incomingCall, callEnded } = useSelector((state) => state.socket);
  const { callAccepted } = useSelector((state) => state.socket);
  // Holds the accepted call's iframe URL. Kept separate from `incomingCall`
  // (which is cleared the moment the call is accepted) so the call modal
  // stays mounted for the whole call instead of disappearing with the ring.
  const [activeCallUrl, setActiveCallUrl] = useState(null);
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
      const returnUrl = `https://${shop}/apps/consultly/consultant-dashboard`;

      const callUrl = buildCallPageUrl({
        shop,
        shopId,
        callerId,
        receiverId: userId,
        callType,
        uid,
        channelName,
        agoraToken: data.token,
        appId: data.appId,
        userId,
        userType: "consultant",
        returnUrl,
        authToken: localStorage.getItem("token") || "",
        // Renders inside VideoCallModal below (an iframe in the Consultant
        // Dashboard) — must be the app's own URL, not the shop's App Proxy,
        // or the call UI would come back wrapped in the storefront theme.
        direct: true,
      });

      dispatch(setIncomingCall(null));
      setActiveCallUrl(callUrl);
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

  return (
    <>
      <VideoCallModal
        callUrl={activeCallUrl}
        onClose={() => setActiveCallUrl(null)}
      />
      {incomingCall && (
        <>
      <TestRingtone incomingCall={incomingCall} />
      <div
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          width: "320px",
          backgroundColor: "#ffffff",
          boxShadow: "0px 4px 14px rgba(0, 0, 0, 0.15)",
          borderRadius: "12px",
          zIndex: 1000,
          padding: "10px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <img
            src={userDefultProfile}
            alt="Caller Avatar"
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              marginRight: "12px",
              objectFit: "cover",
            }}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: "600",
                color: "#222",
              }}
            >
              {callType} call
            </p>
            <p style={{ margin: 0, fontSize: "14px", color: "#555" }}>
              {callerName} is calling you
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={handleAccept}
            style={{
              flex: 1,
              backgroundColor: "#28a745",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "5px",
              fontSize: "14px",
              cursor: "pointer",
              marginRight: "8px",
              transition: "background 0.2s ease",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#218838")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#28a745")}
          >
            Accept
          </button>

          <button
            onClick={handleReject}
            style={{
              flex: 1,
              backgroundColor: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "5px",
              fontSize: "14px",
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#c82333")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#dc3545")}
          >
            Reject
          </button>
        </div>
      </div>
        </>
      )}
    </>
  );
}
