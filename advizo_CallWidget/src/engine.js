// Call orchestration — balance/status checks, token generation, Agora
// join/publish (via the SAME callSlice.js the dashboard uses), and the
// exact ring/accept/reject/end Socket.IO protocol VideoCallingPage.js and
// IncommingCallAlert.js already use server-side. This file does not
// reimplement Agora or invent new socket events; it drives the existing
// ones from the caller/"client" role, matching:
//   - IncommingCallAlert.js (the receiver's accept flow this mirrors)
//   - VideoCallingPage.js's ring effect (line ~843) and accept/end handling
//   - sokectProvider.js (the authoritative list of call-related event names)
import { store } from "./store";
import {
  startCall as startCallThunk,
  endCall as endCallThunk,
  toggleMute as toggleMuteAction,
  toggleVideo as toggleVideoAction,
  getLocalVideoTrack,
  getRemoteVideoTrack,
  switchCamera as switchCameraTrack,
  getLocalCameraDeviceId,
  getRemoteAudioTrack,
} from "../../advizo_Frontend/src/components/Redux/slices/callSlice";
import {
  getSocket,
  connectAndRegisterSocket,
} from "../../advizo_Frontend/src/components/Sokect-io/SokectConfig";
import {
  initRingtone,
  playRingtone,
  stopRingtone,
} from "../../advizo_Frontend/src/components/ringTone/ringingTune";

const BACKEND_HOST = (process.env.REACT_APP_BACKEND_HOST || "").replace(/\/+$/, "");

function authHeaders(authToken) {
  return { Authorization: `Bearer ${authToken || ""}` };
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

// Same identity resolution every other App Proxy route in this project uses
// (resolveStorefrontCustomer), returned as JSON instead of a redirect/page —
// see proxyShopifyCallIdentity in shopifyController.js.
async function fetchIdentity(shop) {
  const { data } = await fetchJson(
    `https://${shop}/apps/advizo/call/identity?shop=${encodeURIComponent(shop)}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  return data || { success: false };
}

// Same endpoint/params OpenCallingPage.js's checkUserBalance uses.
async function checkBalance({ userId, consultantId, callType, authToken }) {
  try {
    const { data } = await fetchJson(
      `${BACKEND_HOST}/users/shopify/users/checked-balance/${userId}/${consultantId}?callType=${encodeURIComponent(callType)}`,
      { headers: authHeaders(authToken) },
    );
    return data?.data ?? false;
  } catch (_) {
    return false;
  }
}

// Same endpoint/params CheckUserStatus.js's checkUserStatus uses.
async function checkStatus({ consultantId, shop }) {
  try {
    const { data } = await fetchJson(
      `${BACKEND_HOST}/users/check/user/available/${consultantId}?shop=${encodeURIComponent(shop)}`,
      { headers: { Accept: "application/json" } },
    );
    return data || { success: false };
  } catch (_) {
    return { success: false, message: "Unable to check user status" };
  }
}

// Same endpoint/body OpenCallingPage.js's openCallPage posts to.
async function generateToken({ channelName, uid, receiverId, callType, authToken }) {
  const { ok, data } = await fetchJson(`${BACKEND_HOST}/call/generate-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(authToken) },
    body: JSON.stringify({ channelName, uid, receiverId, callType }),
  });
  if (!ok || !data?.token) throw new Error("Token missing from API");
  return data;
}

// Best-effort end-of-call notification: socket ack with a REST fallback,
// exactly matching VideoCallingPage.js's emitCallEndedToServer.
// authToken: /call/end-session requires it — authorizeCallParticipant on
// the backend 401s an unauthenticated request (confirmed by reading
// Auth/auth.js), so the REST fallback below needs the same Bearer header
// every other authenticated call in this file already sends.
function emitCallEndedToServer(payload, authToken) {
  const socket = getSocket();
  const endViaRest = async () => {
    try {
      const { data } = await fetchJson(`${BACKEND_HOST}/call/end-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(authToken) },
        body: JSON.stringify(payload),
      });
      return data || { success: false, reason: "rest_failed" };
    } catch (_) {
      return { success: false, reason: "rest_failed" };
    }
  };
  return new Promise((resolve) => {
    if (!payload?.channelName) {
      resolve({ success: false, reason: "missing_channel" });
      return;
    }
    const timeout = setTimeout(async () => resolve(await endViaRest()), 2500);
    const finish = async (response) => {
      clearTimeout(timeout);
      if (response?.success) {
        resolve(response);
        return;
      }
      resolve(await endViaRest());
    };
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => socket.emit("call-ended", payload, finish));
      return;
    }
    socket.emit("call-ended", payload, finish);
  });
}

/**
 * Starts a customer-initiated call and drives it end to end.
 *
 * @param {{shop:string, consultantId:string, callType:"voice"|"video", onState:(s:object)=>void}} args
 * onState is called with {status, message?} where status is one of:
 * "checking" | "ringing" | "connected" | "ended" | "missed" | "rejected" |
 * "declined" | "failed" | "unauthenticated" | "unavailable" | "no-balance".
 * @returns {{toggleMute:()=>boolean, toggleCamera:()=>boolean, hangUp:(reason?:string)=>void, isVideo:boolean}}
 */
export function startCustomerCall({ shop, consultantId, callType, onState }) {
  const isVideo = callType === "video";
  let ended = false;
  let channelName = "";
  let callerId = "";
  let authToken = "";
  let shopId = "";
  let transactionId = "";
  let startedAt = 0;
  let ringAcked = false;
  let ringAttempts = 0;
  let ringRetryId = null;
  const socket = getSocket();

  // call-connected is a CustomEvent callSlice.js itself dispatches once
  // Agora's connectionState is CONNECTED and a remote user has joined — not
  // a new event, just listened to here for diagnostics.
  function onAgoraConnected() {
    console.log("[CALL DEBUG] remote user joined = true");
  }

  const cleanupListeners = () => {
    socket.off("call-accepted-started", onAcceptedStarted);
    socket.off("call-missed", onMissed);
    socket.off("call-ended-rejected", onRejected);
    socket.off("callEnded", onServerEnded);
    window.removeEventListener("call-connected", onAgoraConnected);
    if (ringRetryId) clearInterval(ringRetryId);
  };

  const hangUp = (reason = "user_cut_call") => {
    if (ended) return;
    ended = true;
    cleanupListeners();
    stopRingtone();
    store.dispatch(endCallThunk());
    if (channelName) {
      emitCallEndedToServer(
        {
          callerId,
          receiverId: consultantId,
          channelName,
          callType,
          transactionId: transactionId || undefined,
          shopId: shopId || undefined,
          clientDurationSeconds: startedAt
            ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
            : 0,
          endby: reason,
        },
        authToken,
      );
    }
    onState({ status: "ended" });
  };

  function onAcceptedStarted(data) {
    console.log("[CALL DEBUG] consultant accepted = true");
    console.log("[CALL DEBUG] call-accepted-started received = true");
    transactionId = data?.transactionId || "";
    shopId = data?.shopId || "";
    startedAt = Date.now();
    stopRingtone();
    console.log("[CALL DEBUG] call connected");
    // startedAt is the SAME timestamp clientDurationSeconds is computed from
    // on hangUp — the display-only UI timer uses this exact value too, so it
    // can never drift from the authoritative session-start moment.
    onState({ status: "connected", startedAt });
  }

  function onMissed() {
    console.log("[CALL DEBUG] consultant accepted = false (missed)");
    if (ended) return;
    ended = true;
    cleanupListeners();
    stopRingtone();
    store.dispatch(endCallThunk());
    onState({ status: "missed" });
  }

  function onRejected() {
    console.log("[CALL DEBUG] consultant accepted = false (rejected)");
    if (ended) return;
    ended = true;
    cleanupListeners();
    stopRingtone();
    store.dispatch(endCallThunk());
    onState({ status: "declined" });
  }

  function onServerEnded() {
    if (ended) return;
    ended = true;
    cleanupListeners();
    stopRingtone();
    store.dispatch(endCallThunk());
    onState({ status: "ended" });
  }

  (async () => {
    console.log("[CALL DEBUG] startCustomerCall started, callType =", callType);
    onState({ status: "checking" });

    const identity = await fetchIdentity(shop);
    console.log("[CALL DEBUG] identity resolved, authenticated =", Boolean(identity?.authenticated));
    if (!identity?.authenticated) {
      onState({ status: "unauthenticated" });
      return;
    }
    const userId = identity.customerId;
    authToken = identity.authToken;
    callerId = userId;

    // SokectConfig.js's getSocketAuthPayload() (used by both getSocket()'s
    // initial auth and connectAndRegisterSocket's refresh right before
    // connect()) reads this exact key — the same thing VideoCallingPage.js
    // does with its own URL-provided authToken. Without this, the socket
    // connects with no auth at all on this page (a fresh origin with its
    // own empty localStorage), which can silently break registration/ring/
    // accept, not just the end-session REST fallback below.
    try {
      localStorage.setItem("token", authToken || "");
    } catch (_) {}

    const balance = await checkBalance({ userId, consultantId, callType, authToken });
    console.log("[CALL DEBUG] balance check result =", Boolean(balance));
    if (!balance) {
      onState({ status: "no-balance" });
      return;
    }

    const status = await checkStatus({ consultantId, shop });
    console.log("[CALL DEBUG] user availability result =", Boolean(status?.success));
    if (!status?.success) {
      onState({
        status: "unavailable",
        message: status?.message || "This user is not available to talk with you",
      });
      return;
    }

    let tokenData;
    try {
      channelName = `channel-${userId.slice(-6)}-${consultantId.slice(-6)}`;
      const uid = Math.floor(Math.random() * 1000000);
      console.log("[CALL DEBUG] token request started");
      tokenData = await generateToken({
        channelName,
        uid,
        receiverId: consultantId,
        callType,
        authToken,
      });
      console.log("[CALL DEBUG] token request success =", Boolean(tokenData?.token));

      connectAndRegisterSocket(
        { callerId, receiverId: consultantId, channelName },
        callerId,
      );
      console.log("[CALL DEBUG] socket connected =", socket.connected);

      socket.on("call-accepted-started", onAcceptedStarted);
      socket.on("call-missed", onMissed);
      socket.on("call-ended-rejected", onRejected);
      socket.on("callEnded", onServerEnded);
      window.addEventListener("call-connected", onAgoraConnected);

      const ringPayload = { callerId, receiverId: consultantId, channelName, callType, shop };
      const sendRing = () => {
        if (ringAcked || ended || ringAttempts >= 6) return;
        ringAttempts += 1;
        console.log("[CALL DEBUG] call-user emitted, attempt =", ringAttempts);
        socket.emit("call-user", ringPayload, () => {
          ringAcked = true;
          console.log("[CALL DEBUG] call-user acknowledged by server");
        });
      };
      if (socket.connected) sendRing();
      else socket.once("connect", sendRing);
      ringRetryId = setInterval(() => {
        if (ringAcked || ended || ringAttempts >= 6) {
          clearInterval(ringRetryId);
          return;
        }
        if (socket.connected) sendRing();
      }, 3000);

      console.log("[CALL DEBUG] Agora join started");
      await store
        .dispatch(
          startCallThunk({
            token: tokenData.token,
            channel: channelName,
            uid,
            appId: tokenData.appId,
            callType,
          }),
        )
        .unwrap();
      console.log("[CALL DEBUG] Agora join success = true");

      // frontendOrigin comes from the identity response fetched above — the
      // React app's real origin, authoritative server-side, and needed here
      // since the ringtone mp3 only exists there, not on the shop's domain
      // this widget's page is actually running on.
      initRingtone(`${identity.frontendOrigin || ""}/sounds/ringing_tone.mp3`);
      playRingtone();
      onState({ status: "ringing" });
    } catch (err) {
      console.log("[CALL DEBUG] Agora join success = false, error =", err?.message);
      cleanupListeners();
      onState({ status: "failed", message: err?.message || "Call failed. Please try again." });
    }
  })();

  const listCameraDevices = async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput");
    } catch (_) {
      return [];
    }
  };

  const canSwitchCamera = async () => {
    if (!isVideo) return false;
    const cameras = await listCameraDevices();
    return cameras.length > 1;
  };

  const switchCamera = async () => {
    const cameras = await listCameraDevices();
    if (cameras.length < 2) return { ok: false };
    const currentId = getLocalCameraDeviceId();
    const currentIndex = cameras.findIndex((d) => d.deviceId === currentId);
    const next = cameras[(currentIndex + 1) % cameras.length];
    try {
      await switchCameraTrack({ deviceId: next.deviceId });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message };
    }
  };

  // Speaker/output-device control. callSlice.js did not previously expose
  // the remote audio track at all — getRemoteAudioTrack (one line, added
  // alongside the existing getLocalVideoTrack/getRemoteVideoTrack getters)
  // is the only callSlice.js change this required. setPlaybackDevice is
  // Agora's own IRemoteAudioTrack API (real output-device selection on
  // browsers that support it, e.g. desktop Chrome/Edge) — not a second
  // audio system. There is no cross-browser way to force loudspeaker vs
  // earpiece on mobile web, and no fake toggle is implemented for that:
  // canSwitchSpeaker() reports false and the UI disables the button rather
  // than pretending to do something.
  let currentSpeakerIndex = 0;
  const listAudioOutputs = async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audiooutput");
    } catch (_) {
      return [];
    }
  };

  const canSwitchSpeaker = async () => {
    const remoteTrack = getRemoteAudioTrack();
    if (!remoteTrack || typeof remoteTrack.setPlaybackDevice !== "function") return false;
    const outputs = await listAudioOutputs();
    return outputs.length > 1;
  };

  const switchSpeaker = async () => {
    const remoteTrack = getRemoteAudioTrack();
    if (!remoteTrack || typeof remoteTrack.setPlaybackDevice !== "function") {
      return { ok: false, message: "Not supported on this device" };
    }
    const outputs = await listAudioOutputs();
    if (outputs.length < 2) return { ok: false, message: "Only one audio output available" };
    currentSpeakerIndex = (currentSpeakerIndex + 1) % outputs.length;
    const next = outputs[currentSpeakerIndex];
    try {
      await remoteTrack.setPlaybackDevice(next.deviceId);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message };
    }
  };

  return {
    isVideo,
    toggleMute: () => {
      store.dispatch(toggleMuteAction());
      return store.getState().call.muted;
    },
    toggleCamera: () => {
      store.dispatch(toggleVideoAction());
      return store.getState().call.videoEnabled;
    },
    // Reuses callSlice.js's own switchCamera/getLocalCameraDeviceId (the
    // exact functions the Consultant Dashboard's useCameraSwitch hook wraps)
    // — this only replicates that hook's device-selection logic (which
    // camera is "next"), not the actual switch mechanism. Best-effort: no
    // cameras or a failed switch just means the button stays hidden/the
    // current camera keeps publishing, never interrupting the call, exactly
    // like the dashboard's own behavior.
    canSwitchCamera,
    switchCamera,
    canSwitchSpeaker,
    switchSpeaker,
    hangUp,
    getLocalVideoTrack,
    getRemoteVideoTrack,
  };
}
