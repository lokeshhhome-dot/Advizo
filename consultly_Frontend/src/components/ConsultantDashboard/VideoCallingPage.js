import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./VideoCallingPage.module.css";
import { useDispatch, useSelector } from "react-redux";
import {
  endCall,
  startCall,
  toggleMute,
  toggleVideo,
} from "../Redux/slices/callSlice";
import {
  initRingtone,
  playRingtone,
  stopRingtone,
} from "../ringTone/ringingTune";
import { getSocket, socket, connectAndRegisterSocket, emitCallLeaving } from "../Sokect-io/SokectConfig";
import { closeCallWindow } from "../../utils/callWindow";
import useCallNetworkQuality from "../../hooks/useCallNetworkQuality";
import NetworkIndicator from "./NetworkIndicator";
import useCameraSwitch from "../../hooks/useCameraSwitch";
import axios from "axios";
import profileImageDefault from "../../../src/assets/avatar-or-person-sign-profile-picture-portrait-icon-user-profile-symbol.webp";

// Session statuses from which the call can never resume. The DB is the source
// of truth: if the poll sees one of these, the other side already rejected /
// missed / ended the call and any realtime event we were waiting for is gone.
const TERMINAL_CALL_STATUSES = [
  "cancelled",
  "rejected",
  "missed",
  "ended",
  "completed",
  "failed",
];
const isTerminalCallSession = (session) =>
  TERMINAL_CALL_STATUSES.includes(String(session?.status || "").toLowerCase());
function VideoCallingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [callerDetails, setCallerDetails] = useState(null);
  const [callerId, setCallerId] = useState(null);
  const [callSession, setCallSession] = useState(null);
  const [callSessionEnded, setCallSessionEnded] = useState(false);
  const { callEnded } = useSelector((state) => state.socket);
  const params = new URLSearchParams(window.location.search);
  const receiverId = params.get("receiverId");
  const callType = params.get("callType") || "video";
  const token = params.get("token")
    ? decodeURIComponent(params.get("token"))
    : null;
  const channelNameParam = params.get("channelName");
  const callerIdParam = params.get("callerId");
  const uidParam = params.get("uid");
  const appIdParam = params.get("appId");
  const userId = params.get("userId");
  const shopId = params.get("shopId");
  const userType = params.get("userType");
  // App JWT handed over via URL — the call window must be able to
  // authenticate even when localStorage was wiped by a role switch.
  const authTokenParam = (params.get("authToken") || "").trim();
  if (authTokenParam) {
    try {
      localStorage.setItem("token", authTokenParam);
    } catch (_) {}
  }
  const getAppJwt = () => authTokenParam || localStorage.getItem("token") || "";
  console.log("userType", userType);
  const [callAccepted, setCallAccepted] = useState(null);
  const callStartedRef = useRef(false);
  const { inCall, channel, type, muted, videoEnabled } = useSelector(
    (state) => state.call,
  );
  const isVideoCall = callType === "video";
  const { callRejected } = useSelector((state) => state.socket);
  const [bothUserJoined, setBothUserJoined] = useState(false);
  const [time, setTime] = useState({ minutes: 0, seconds: 0 });
  const intervalRef = useRef(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [transactionId, setTransactionId] = useState(null);
  const [firstTime, setFirstTime] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [bothUserConnected, setBothUserConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);

  const [callActive, setCallActive] = useState(true);
  const callEndedRef = useRef(false);
  const timerSyncedRef = useRef(false);
  const billingStorageKey = channelNameParam
    ? `call_billing_active_${channelNameParam}`
    : null;
  const [endingOnRefresh, setEndingOnRefresh] = useState(false);
  // Store theme accent (posted in by the parent app-proxy page) → CSS variables.
  const [themeVars, setThemeVars] = useState(null);
  // UI-only: enlarge/restore the local (self) video preview tile.
  const [selfExpanded, setSelfExpanded] = useState(false);
  // Safari autoplay: remote audio was blocked until a user gesture.
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Passive network watch for BOTH sides. Observer only: recovery is still
  // socket.io's/Agora's own reconnect, and a participant who stays gone is still
  // ended by the server's existing grace period. This only drives the indicator.
  const networkStatus = useCallNetworkQuality({ enabled: inCall });

  // Front/back (or multi-webcam) switching. Only enumerates while a video call
  // is live with the camera on, so voice calls do no device work at all.
  const {
    canSwitch: canSwitchCamera,
    switching: switchingCamera,
    switchCamera,
    nextCamera,
  } = useCameraSwitch({ enabled: isVideoCall && inCall && videoEnabled });
  const [cameraSwitchError, setCameraSwitchError] = useState("");

  const handleCameraSwitch = async () => {
    if (switchingCamera) return;
    setCameraSwitchError("");
    const switched = await switchCamera();
    // A failed switch leaves the previous camera published — the call is never
    // interrupted, the user just gets told it did not work.
    if (!switched) setCameraSwitchError("Unable to switch camera.");
  };

  useEffect(() => {
    if (!cameraSwitchError) return undefined;
    const timer = setTimeout(() => setCameraSwitchError(""), 2600);
    return () => clearTimeout(timer);
  }, [cameraSwitchError]);

  useEffect(() => {
    const onAudioBlocked = () => setAudioBlocked(true);
    window.addEventListener("remote-audio-blocked", onAudioBlocked);
    return () =>
      window.removeEventListener("remote-audio-blocked", onAudioBlocked);
  }, []);

  const enableRemoteAudio = () => {
    import("../Redux/slices/callSlice").then((module) => {
      module.playRemoteAudio();
    });
    setAudioBlocked(false);
  };

  // Receive the store's theme color from the parent window and expose it as
  // CSS variables so the call UI matches whichever storefront it runs inside.
  useEffect(() => {
    const hexToRgb = (hex) => {
      if (typeof hex !== "string") return null;
      let h = hex.trim().replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
      const n = parseInt(h, 16);
      return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    };

    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== "CALL_THEME" || !data.accent) return;
      const rgb = hexToRgb(data.accent);
      if (!rgb) return;
      setThemeVars({ "--call-accent": data.accent, "--call-accent-rgb": rgb });
    };

    window.addEventListener("message", onMessage);
    // In case the parent posted the color before we mounted, ask it to resend.
    try {
      window.parent?.postMessage({ type: "CALL_THEME_REQUEST" }, "*");
    } catch (_) {}
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const markBillingActive = () => {
    if (billingStorageKey) {
      sessionStorage.setItem(billingStorageKey, "1");
    }
  };

  const parseStoredId = (value) => {
    if (value == null || value === "") return null;
    return String(value).replace(/^"+|"+$/g, "").trim();
  };

  const getStoredCallSession = () => {
    try {
      const fromLocal = localStorage.getItem("callSession");
      if (fromLocal) return JSON.parse(fromLocal);
      const fromSession = sessionStorage.getItem(
        `active_call_${channelNameParam}`,
      );
      if (fromSession) return JSON.parse(fromSession);
    } catch (e) {
      console.warn("Could not parse stored call session", e);
    }
    return null;
  };
  const activeCallContext = {
    callerId: callerIdParam,
    receiverId,
    channelName: channelNameParam,
  };

  // This page is now also loaded inside a call MODAL (an iframe rendered on
  // top of the Consultant Dashboard or the Shopify theme card) instead of
  // always being a standalone tab/popup. Navigating window.top from inside
  // that iframe would break out of the modal and drag the whole dashboard/
  // storefront tab away with it — the exact "consultant gets redirected to
  // the theme" bug this was built to fix. When framed, tell whichever parent
  // opened the modal that the call ended instead of navigating anywhere;
  // the modal owns closing itself. Standalone (window.top === window, the
  // pre-existing popup/full-tab paths) keeps navigating exactly as before.
  const exitCallView = (url) => {
    if (window.self !== window.top) {
      try {
        window.parent.postMessage({ type: "CONSULTLY_CALL_ENDED" }, "*");
      } catch (_) {}
      try {
        window.top.postMessage({ type: "CONSULTLY_CALL_ENDED" }, "*");
      } catch (_) {}
      return;
    }
    window.top.location.href = url;
  };

  const cleanupCallUI = (redirect = true) => {
    setCallActive(false);
    stopTimer();
    dispatch(endCall());
    setCallSessionEnded(true);
    localStorage.removeItem("callStartTime");
    localStorage.removeItem("endFromClient");
    localStorage.removeItem("callAccepted");
    localStorage.removeItem("shopId");

    if (redirect) {
      const returnUrl = params.get("returnUrl");
      if (returnUrl) {
        exitCallView(decodeURIComponent(returnUrl));
      }
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (callEndedRef.current) return;

      if (
        billingStorageKey &&
        sessionStorage.getItem(billingStorageKey) === "1"
      ) {
        const stored = getStoredCallSession();
        const payload = {
          callerId:
            parseStoredId(callerIdParam) ||
            parseStoredId(stored?.callerId) ||
            parseStoredId(callerId),
          receiverId:
            parseStoredId(receiverId) || parseStoredId(stored?.receiverId),
          channelName: channelNameParam,
          callType: callType || stored?.callType,
          transactionId:
            parseStoredId(transactionId) ||
            parseStoredId(localStorage.getItem("endFromClient")) ||
            parseStoredId(stored?.transactionId) ||
            parseStoredId(stored?.transtionId),
          shopId:
            parseStoredId(shopId) ||
            parseStoredId(localStorage.getItem("shopId")) ||
            parseStoredId(stored?.shopId),
          clientDurationSeconds: getElapsedCallSeconds(),
          endby:
            userType === "consultant"
              ? "consultant_page_refresh"
              : "user_page_refresh",
        };

        if (payload.channelName) {
          navigator.sendBeacon(
            `${process.env.REACT_APP_BACKEND_HOST}/call/end-session`,
            new Blob([JSON.stringify(payload)], { type: "application/json" }),
          );
        }
        callEndedRef.current = true;
        return;
      }

      if (callActive) {
        emitCallLeaving(activeCallContext);
        e.preventDefault();
        e.returnValue = "";
      }
    };

    const handlePageHide = () => {
      if (callEndedRef.current) return;
      if (
        billingStorageKey &&
        sessionStorage.getItem(billingStorageKey) === "1"
      ) {
        return;
      }
      if (callActive) {
        emitCallLeaving(activeCallContext);
      }
    };

    const handleVisibilityChange = () => {
      if (callEndedRef.current) return;
      if (
        document.visibilityState === "hidden" &&
        billingStorageKey &&
        sessionStorage.getItem(billingStorageKey) === "1"
      ) {
        return;
      }
      if (
        document.visibilityState === "hidden" &&
        callActive
      ) {
        emitCallLeaving(activeCallContext);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    callActive,
    callerIdParam,
    receiverId,
    channelNameParam,
    billingStorageKey,
    userType,
    callType,
    shopId,
    transactionId,
    callerId,
  ]);

  useEffect(() => {
    localStorage.setItem("userId", userId);
    const callAcceptedFromStorage = JSON.parse(
      localStorage.getItem("callAccepted") || null,
    );
    setCallAccepted(callAcceptedFromStorage);
  }, [userId]);
  useEffect(() => {
    const callerIdFromStorage = localStorage.getItem("client_u_Identity");
    const finalCallerId = callerIdParam || callerIdFromStorage;
    setCallerId(finalCallerId);
  }, [callerIdParam]);

  // get call session from server

  const getCallSession = async () => {
    try {
      const jwt = getAppJwt();
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/users/find-call-session`,
        {
          params: {
            userId,
            channelName: channelNameParam,
          },
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        },
      );
      if (response.status === 200 && response.data?.data) {
        const sessionData = response.data.data;
        setCallSession(sessionData);
        localStorage.setItem("callSession", JSON.stringify(sessionData));
        if (sessionData?.transtionId) {
          localStorage.setItem(
            "endFromClient",
            JSON.stringify(sessionData.transtionId),
          );
          setTransactionId(sessionData.transtionId);
        }
        if (sessionData?.shopId) {
          localStorage.setItem("shopId", JSON.stringify(sessionData.shopId));
        }
        if (channelNameParam) {
          sessionStorage.setItem(
            `active_call_${channelNameParam}`,
            JSON.stringify({
              ...sessionData,
              transactionId: sessionData?.transtionId,
              callerId: sessionData?.callerId,
              receiverId: sessionData?.receiverId,
            }),
          );
        }
        return sessionData;
      }
    } catch (error) {
      console.error("Error fetching call session:", error);
    }
    return null;
  };
  useEffect(() => {
    if (!channelNameParam) return;

    // The DB call session is authoritative. If it reached a terminal state
    // (receiver rejected/missed while this page was still loading and the
    // realtime socket event was lost), stop waiting and tear down.
    const handleFetchedSession = (sessionData) => {
      if (!sessionData || callEndedRef.current) return false;
      if (isTerminalCallSession(sessionData)) {
        console.log(
          "📴 Call session already terminal — ending:",
          sessionData.status,
        );
        handleEndCall(true);
        return true;
      }

      // AT-ANY-COST timer fallback: the DB is authoritative. If the session
      // is ACTIVE (receiver accepted) and the socket's call-timer-sync never
      // arrived, start the timer from the DB startTime — both sides read the
      // same DB row, so both screens stay in sync without any socket event.
      const status = String(sessionData.status || "").toLowerCase();
      if (
        (status === "active" || status === "ongoing") &&
        !timerSyncedRef.current
      ) {
        const startedAtMs = Date.parse(sessionData.startTime) || Date.now();
        timerSyncedRef.current = true;
        markBillingActive();
        startTimer(startedAtMs);
        setBothUserConnected(true);
        setIsCallActive(true);
        setIsRinging(false);
        stopRingtone();
        return true;
      }
      return false;
    };

    getCallSession().then(handleFetchedSession);

    const pollId = setInterval(async () => {
      if (callEndedRef.current || timerSyncedRef.current) {
        clearInterval(pollId);
        return;
      }
      const sessionData = await getCallSession();
      if (handleFetchedSession(sessionData)) {
        clearInterval(pollId);
      }
    }, 2000);

    return () => clearInterval(pollId);
  }, [callType, channelNameParam]);

  // ACTIVE-phase watchdog: after the timer starts the fast poll above stops,
  // but the DB stays the source of truth for the call's END too. If the other
  // side ended the call and our socket missed callEnded, this slow poll sees
  // the terminal status and tears down — no endless "in call" screen, and the
  // UI can never keep running after MongoDB says the session ended.
  useEffect(() => {
    if (!channelNameParam) return;
    const watchdogId = setInterval(async () => {
      if (callEndedRef.current) {
        clearInterval(watchdogId);
        return;
      }
      if (!timerSyncedRef.current) return; // pre-active phase handled above
      try {
        const jwt = getAppJwt();
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/users/find-call-session`,
          {
            params: { userId, channelName: channelNameParam },
            headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
          },
        );
        const sessionData = response.data?.data;
        if (
          sessionData &&
          isTerminalCallSession(sessionData) &&
          !callEndedRef.current
        ) {
          console.log(
            "📴 Session ended in DB — cleaning up:",
            sessionData.status,
          );
          clearInterval(watchdogId);
          handleEndCall(true);
        }
      } catch (_) {
        // Network blip — keep watching; never end a call on a failed check.
      }
    }, 5000);
    return () => clearInterval(watchdogId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelNameParam]);

  // register user

  // The call window must NEVER depend on localStorage/active-session for its
  // socket identity — a role switch may have just wiped those keys, and then
  // connectAndRegisterSocket silently skips connecting ("missing userId"),
  // which kills registration, media-ready and the synced timer. The URL is
  // authoritative: userId param, else derived from the role + call ids.
  const socketUserId =
    userId ||
    (userType === "consultant" ? receiverId : callerIdParam) ||
    null;

  useEffect(() => {
    if (!socketUserId) return;
    connectAndRegisterSocket(activeCallContext, socketUserId);
  }, [socketUserId, callerIdParam, receiverId, channelNameParam]);

  useEffect(() => {
    connectAndRegisterSocket(activeCallContext, socketUserId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleServerCallEnded = (data) => {
      if (callEndedRef.current) return;
      callEndedRef.current = true;
      cleanupCallUI(false);
      leaveCallPage();
    };

    socket.on("callEnded", handleServerCallEnded);

    return () => {
      socket.off("callEnded", handleServerCallEnded);
    };
  }, []);

  useEffect(() => {
    if (callRejected) {
      handleEndCall();
    }
  }, [callRejected]);

  // Real-time ring timeout (caller side): the server auto-misses an
  // unanswered call after 15s, which normally ends this page via the
  // call-missed event or the session poll. This local timer is the last
  // resort — if the call was never answered and no state ever arrived
  // (server unreachable), cut the call instead of ringing forever.
  useEffect(() => {
    if (userType !== "client") return;
    const timer = setTimeout(() => {
      if (callEndedRef.current) return;
      if (timerSyncedRef.current) return;
      const stored = getStoredCallSession();
      const answered =
        parseStoredId(localStorage.getItem("endFromClient")) ||
        parseStoredId(stored?.transtionId) ||
        parseStoredId(stored?.transactionId);
      if (answered) return;
      console.log("⏰ Ring timeout — no answer, ending call");
      handleEndCall(true);
    }, 20000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitUserIsOn = () => {
    if (!callerIdParam || !receiverId || !channelNameParam) return;
    getSocket().emit("user-is-on", {
      callerId: callerIdParam,
      receiverId,
      channelName: channelNameParam,
      callType,
    });
  };

  const emitMediaConnected = () => {
    // NOTE: no userId requirement — the server identifies the sender from the
    // socket's authenticated token, not from this payload. Requiring the
    // userId URL param here silently blocked the media-ready signal whenever
    // the param was missing, and then the timer never started for EITHER side.
    if (!callerIdParam || !receiverId || !channelNameParam) return;
    getSocket().emit("call-media-connected", {
      callerId: callerIdParam,
      receiverId,
      channelName: channelNameParam,
      userId,
    });
  };

  useEffect(() => {
    emitUserIsOn();
  }, [userType, callerIdParam, receiverId, channelNameParam, callType]);

  // Reliability: the synced timer starts only when the server has seen the
  // media-ready signal from BOTH parties. A single lost emit (socket not yet
  // registered, reconnect race) used to mean the timer/billing never started
  // for either side. Keep re-announcing every 2s after the call is accepted
  // (endFromClient is written on accept) until the server confirms the sync.
  useEffect(() => {
    const retryId = setInterval(() => {
      if (timerSyncedRef.current || callEndedRef.current) {
        clearInterval(retryId);
        return;
      }
      const accepted =
        localStorage.getItem("endFromClient") ||
        sessionStorage.getItem(`active_call_${channelNameParam}`);
      if (!accepted) return;
      emitMediaConnected();
    }, 2000);
    return () => clearInterval(retryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelNameParam]);

  useEffect(() => {
    const socket = getSocket();
    const handleBothUserJoin = () => {
      setBothUserJoined(true);
      setCallAccepted(true);
      setIsRinging(false);
    };
    socket.on("both-user-join", handleBothUserJoin);
    return () => {
      socket.off("both-user-join", handleBothUserJoin);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleTimerSync = (data) => {
      if (timerSyncedRef.current) return;
      if (data?.channelName && data.channelName !== channelNameParam) return;

      console.log("⏱️ call-timer-sync received:", data);
      timerSyncedRef.current = true;
      markBillingActive();
      startTimer(data.startedAt);
      setBothUserConnected(true);
      setIsCallActive(true);
      setIsRinging(false);
      stopRingtone();
    };

    socket.on("call-timer-sync", handleTimerSync);
    return () => {
      socket.off("call-timer-sync", handleTimerSync);
    };
  }, [channelNameParam]);

  useEffect(() => {
    const socket = getSocket();

    const handleAutoCallEnd = (data) => {
      console.log("🔥 autoCallEnded-no-balance received:", data);
      if (callEndedRef.current) return;
      handleEndCall(true);
    };

    socket.on("autoCallEnded-no-balance", handleAutoCallEnd);

    return () => {
      socket.off("autoCallEnded-no-balance", handleAutoCallEnd);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();

    // Shop communication minutes exhausted mid-call — server already
    // finalized billing/history; show the role-specific dialog and tear down.
    const handleMinutesExhaustedEnd = (data) => {
      console.log("🔥 CALL_ENDED_LOW_BALANCE received:", data);
      if (callEndedRef.current) return;
      alert(data?.message || "Communication ended.");
      handleEndCall(true);
    };

    socket.on("CALL_ENDED_LOW_BALANCE", handleMinutesExhaustedEnd);

    return () => {
      socket.off("CALL_ENDED_LOW_BALANCE", handleMinutesExhaustedEnd);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleBothUpdateTime = (data) => {
      console.log("🔥 call-accepted-started received:", data);
      const callMeta = {
        transactionId: data?.transactionId,
        shopId: data?.shopId,
        callerId: data?.callerId || callerIdParam,
        receiverId: data?.receiverId || receiverId,
        channelName: data?.channelName || channelNameParam,
        callType: data?.callType || callType,
      };
      localStorage.setItem(
        "endFromClient",
        JSON.stringify(callMeta.transactionId),
      );
      localStorage.setItem("shopId", JSON.stringify(callMeta.shopId));
      if (channelNameParam) {
        sessionStorage.setItem(
          `active_call_${channelNameParam}`,
          JSON.stringify(callMeta),
        );
      }
      setTransactionId(data?.transactionId);
      emitMediaConnected();
      setTimeout(emitMediaConnected, 800);
      socket.emit("user-connected-time-updated", {
        callerId: callerIdParam,
        receiverId: receiverId,
        channelName: channelNameParam,
        callType: callType,
        startedAt: Date.now(),
        transactionId: data?.transactionId,
      });
    };
    socket.on("call-accepted-started", handleBothUpdateTime);

    return () => {
      socket.off("call-accepted-started", handleBothUpdateTime);
    };
  }, []);

  useEffect(() => {
    //     if (firstTime && userType === "client") {
    const handleFirstTime = () => {
      console.log("firstTime", firstTime);

      const callSession = JSON.parse(localStorage.getItem("callSession"));
      const transactionId_ = callSession?.transtionId;
      console.log("callSession", callSession);
      const socket = getSocket();

      socket.emit("user-connected-time-updated", {
        callerId: callerIdParam,
        receiverId: receiverId,
        channelName: channelNameParam,
        callType: callType,
        startedAt: Date.now(),
        transactionId:
          localStorage.getItem("endFromClient") ||
          transactionId ||
          transactionId_,
      });

      console.log(
        "transactionId_____handleFirstTime",
        localStorage.getItem("endFromClient") ||
          transactionId ||
          transactionId_,
      );
    };
    if (firstTime && userType === "client") {
      handleFirstTime();
    }
  }, [firstTime]);

  useEffect(() => {
    const socket = getSocket();
    const handleBothUpdateTime = (data) => {
      console.log("🔥 user-available received:", data);
      // Never override the server-synced start; prefer a server timestamp so
      // both parties stay in sync (avoid a local Date.now()).
      if (timerSyncedRef.current) return;
      startTimer(data?.startedAt);
    };

    socket.on("user-available-start-timer", handleBothUpdateTime);

    return () => {
      socket.off("user-available-start-timer", handleBothUpdateTime);
    };
  }, []);

  // RING AFTER READY: the receiver is notified only once the caller's call
  // window is fully up and its socket is connected. Before this change the
  // ring was emitted from the cards page BEFORE this window even opened, so
  // an instant accept raced a half-loaded caller (lost events, timers never
  // starting). sessionStorage guard: a refresh of this window never re-rings.
  useEffect(() => {
    if (userType !== "client") return;
    if (!callerIdParam || !receiverId || !channelNameParam || !callType) return;
    // Per-ATTEMPT guard, not per-channel: the channel name is identical for
    // every call between the same pair, and this named window + its
    // sessionStorage survive across calls — a channel-only key silently
    // suppressed the ring for every call after the first. The Agora uid is
    // random per attempt: same uid = refresh (don't re-ring), new uid = new
    // call (ring).
    const callKey = `call_started_${channelNameParam}_${uidParam || ""}`;
    if (sessionStorage.getItem(callKey)) return;
    sessionStorage.setItem(callKey, "true");

    const activeSocket = getSocket();
    const ringPayload = {
      callerId: callerIdParam,
      receiverId,
      channelName: channelNameParam,
      callType,
      shop: params.get("shop") || localStorage.getItem("shop") || "",
    };

    // ACK + RETRY: a single emit can die with its socket mid-handshake and
    // the receiver never rings. Re-send every 3s until the server confirms
    // receipt (server side is idempotent — a duplicate ring only re-delivers
    // the notification, never a second timeout/record).
    let ringAcked = false;
    let attempts = 0;
    const sendRing = () => {
      if (ringAcked || callEndedRef.current || attempts >= 6) return;
      attempts++;
      console.log(`📞 Ringing receiver (attempt ${attempts})`);
      activeSocket.emit("call-user", ringPayload, (res) => {
        ringAcked = true;
        console.log("📞 Ring acknowledged by server:", res);
      });
    };

    if (activeSocket.connected) {
      sendRing();
    } else {
      activeSocket.once("connect", sendRing);
    }
    const retryId = setInterval(() => {
      if (ringAcked || callEndedRef.current || attempts >= 6) {
        clearInterval(retryId);
        return;
      }
      if (activeSocket.connected) sendRing();
    }, 3000);

    return () => {
      activeSocket.off("connect", sendRing);
      clearInterval(retryId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType, callerIdParam, receiverId, channelNameParam, callType]);

  useEffect(() => {
    if (callStartedRef.current || endingOnRefresh) return;
    if (token && channelNameParam && uidParam) {
      const appId = appIdParam;
      callStartedRef.current = true;
      dispatch(
        startCall({
          token: token,
          channel: channelNameParam,
          uid: uidParam,
          appId: appId,
          callType: callType,
        }),
      )
        .unwrap()
        .then((result) => {
          console.log(`${callType} call started successfully:`, result);
        })
        .catch((error) => {
          console.error(`${callType} call failed:`, error);
        });
      if (userType === "client") {
        initRingtone();
        playRingtone();
      }
    }
  }, [dispatch, token, channelNameParam, uidParam, appIdParam, callType, endingOnRefresh]);

  useEffect(() => {
    if (isVideoCall) {
      let isPlaying = false;
      let attempts = 0;
      const maxAttempts = 40;
      const checkAndPlayLocalVideo = () => {
        if (isPlaying) return;

        import("../Redux/slices/callSlice").then((module) => {
          const track = module.getLocalVideoTrack();
          if (track && localVideoRef.current) {
            try {
              track
                .play(localVideoRef.current)
                .then(() => {
                  console.log("Local video playing successfully");
                  isPlaying = true;
                  attempts = maxAttempts;
                })
                .catch((err) => {
                  console.error("Error playing local video:", err);
                });
            } catch (error) {
              console.error("Error playing local video:", error);
            }
          } else {
            if (attempts < 10) {
              console.log("Waiting for local video track...", {
                hasTrack: !!track,
                hasElement: !!localVideoRef.current,
                inCall: inCall,
                type: type,
              });
            }
          }
        });
      };

      checkAndPlayLocalVideo();
      const interval = setInterval(() => {
        if (!isPlaying) {
          checkAndPlayLocalVideo();
        }
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 500);

      return () => {
        clearInterval(interval);
        isPlaying = false;
      };
    }
  }, [isVideoCall, inCall, type]);

  useEffect(() => {
    if (isVideoCall && inCall) {
      let attempts = 0;
      const maxAttempts = 20;

      const checkAndPlayRemoteVideo = () => {
        if (!remoteVideoRef.current) {
          attempts++;
          if (attempts < maxAttempts) {
            return;
          }
        }

        import("../Redux/slices/callSlice").then((module) => {
          const track = module.getRemoteVideoTrack();
          if (track && remoteVideoRef.current) {
            try {
              track.play(remoteVideoRef.current);
              console.log("Remote video playing on element");
              attempts = maxAttempts;
            } catch (error) {
              console.error("Error playing remote video:", error);
            }
          }
        });
      };

      checkAndPlayRemoteVideo();
      const interval = setInterval(() => {
        checkAndPlayRemoteVideo();
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isVideoCall, inCall]);

  useEffect(() => {
    const handleRemoteVideoReady = () => {
      setHasRemoteVideo(true);
      if (remoteVideoRef.current) {
        import("../Redux/slices/callSlice").then((module) => {
          const track = module.getRemoteVideoTrack();
          if (track) {
            track
              .play(remoteVideoRef.current)
              .then(() => {
                console.log("Remote video played via event");
              })
              .catch((err) => {
                console.error("Error playing remote video via event:", err);
              });
          }
        });
      }
    };

    const handleRemoteVideoStopped = () => {
      setHasRemoteVideo(false);
    };

    const handleLocalVideoReady = () => {
      console.log("Local video ready event received");
      const tryPlayLocalVideo = () => {
        if (localVideoRef.current) {
          import("../Redux/slices/callSlice").then((module) => {
            const track = module.getLocalVideoTrack();
            if (track) {
              track
                .play(localVideoRef.current)
                .then(() => {
                  console.log("Local video played via event successfully");
                })
                .catch((err) => {
                  console.error("Error playing local video via event:", err);
                  setTimeout(tryPlayLocalVideo, 500);
                });
            } else {
              console.log("Local video track not available, retrying...");
              setTimeout(tryPlayLocalVideo, 500);
            }
          });
        } else {
          console.log("Local video element not ready, retrying...");
          setTimeout(tryPlayLocalVideo, 500);
        }
      };
      tryPlayLocalVideo();
    };

    window.addEventListener("remote-video-ready", handleRemoteVideoReady);
    window.addEventListener("remote-video-stopped", handleRemoteVideoStopped);
    window.addEventListener("local-video-ready", handleLocalVideoReady);

    return () => {
      window.removeEventListener("remote-video-ready", handleRemoteVideoReady);
      window.removeEventListener(
        "remote-video-stopped",
        handleRemoteVideoStopped,
      );
      window.removeEventListener("local-video-ready", handleLocalVideoReady);
    };
  }, []);

  useEffect(() => {
    if (isVideoCall && videoEnabled && localVideoRef.current) {
      import("../Redux/slices/callSlice").then((module) => {
        const track = module.getLocalVideoTrack();
        if (track) {
          track
            .play(localVideoRef.current)
            .then(() => {
              console.log("Local video playing after camera turned on");
            })
            .catch((err) =>
              console.error("Error playing local video after enable:", err),
            );
        }
      });
    }
  }, [isVideoCall, videoEnabled]);

  useEffect(() => {
    if (!inCall) setHasRemoteVideo(false);
  }, [inCall]);

  const getCallingUser = async () => {
    const finalCallerId = callerIdParam || callerId;
    if (!finalCallerId || !receiverId) return;
    try {
      const url = `${process.env.REACT_APP_BACKEND_HOST}/call/get-caller-receiver-details/${finalCallerId}/${receiverId}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (data?.success) {
        setCallerDetails(data?.payload);
      }
    } catch (error) {
      console.error("Failed to fetch caller details:", error);
    }
  };

  useEffect(() => {
    getCallingUser();
  }, [callerIdParam, callerId, receiverId]);

  const getProfileImageUrl = () => {
    const imagePath =
      userType === "client"
        ? callerDetails?.receiver?.profileImage
        : callerDetails?.caller?.profileImage;

    if (imagePath) {
      return `${process.env.REACT_APP_BACKEND_HOST}/${imagePath.replace("\\", "/")}`;
    }
    return profileImageDefault;
  };

  const stopTimer = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    localStorage.removeItem("callStartTime");
    setTime({ minutes: 0, seconds: 0 });
  };

  // Exact seconds currently shown on screen — same formula as the timer tick
  // (floor((now - syncedStart)/1000)). This is what the backend bills.
  const getElapsedCallSeconds = () => {
    const startKey = channelNameParam
      ? `call_start_${channelNameParam}`
      : "callStartTime";
    const startTime = parseInt(localStorage.getItem(startKey), 10);
    if (!startTime || isNaN(startTime)) return null;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  };

  const buildCallEndPayload = (clientDurationSeconds = null) => {
    const stored = getStoredCallSession();
    const effectiveCallerId =
      parseStoredId(callerIdParam) ||
      parseStoredId(stored?.callerId) ||
      parseStoredId(callerId);
    const effectiveReceiverId =
      parseStoredId(receiverId) || parseStoredId(stored?.receiverId);
    const txnId =
      parseStoredId(transactionId) ||
      parseStoredId(localStorage.getItem("endFromClient")) ||
      parseStoredId(stored?.transactionId) ||
      parseStoredId(stored?.transtionId);
    const effectiveShopId =
      parseStoredId(shopId) ||
      parseStoredId(localStorage.getItem("shopId")) ||
      parseStoredId(stored?.shopId);

    return {
      callerId: effectiveCallerId,
      receiverId: effectiveReceiverId,
      channelName: channelNameParam,
      callType: callType || stored?.callType,
      transactionId: txnId,
      shopId: effectiveShopId,
      clientDurationSeconds,
      endby:
        userType === "consultant" ? "consultant_cut_call" : "user_cut_call",
    };
  };

  const leaveCallPage = () => {
    localStorage.removeItem("callStartTime");
    localStorage.removeItem("endFromClient");
    localStorage.removeItem("callAccepted");
    localStorage.removeItem("shopId");
    localStorage.removeItem("callSession");
    if (channelNameParam) {
      sessionStorage.removeItem(`active_call_${channelNameParam}`);
      sessionStorage.removeItem(`call_started_${channelNameParam}`);
      localStorage.removeItem(`call_start_${channelNameParam}`);
      if (billingStorageKey) {
        sessionStorage.removeItem(billingStorageKey);
      }
    }

    const returnUrl = params.get("returnUrl");
    closeCallWindow(() => {
      if (returnUrl) {
        exitCallView(decodeURIComponent(returnUrl));
      } else if (window.self !== window.top) {
        try {
          window.parent.postMessage({ type: "CONSULTLY_CALL_ENDED" }, "*");
        } catch (_) {}
        try {
          window.top.postMessage({ type: "CONSULTLY_CALL_ENDED" }, "*");
        } catch (_) {}
      } else {
        navigate(-1);
      }
    });
  };

  const emitCallEndedToServer = (payload) => {
    const activeSocket = getSocket();

    const endViaRest = async () => {
      try {
        const response = await axios.post(
          `${process.env.REACT_APP_BACKEND_HOST}/call/end-session`,
          payload,
        );
        return response.data;
      } catch (error) {
        console.error("REST end-session failed:", error);
        return { success: false, reason: "rest_failed" };
      }
    };

    return new Promise((resolve) => {
      if (!payload?.channelName) {
        console.warn("call-ended skipped — missing channelName", payload);
        resolve({ success: false, reason: "missing_channel" });
        return;
      }

      const timeout = setTimeout(async () => {
        console.warn("call-ended ack timeout — trying REST fallback");
        const restResult = await endViaRest();
        resolve(restResult);
      }, 2500);

      const finish = async (response) => {
        clearTimeout(timeout);
        if (response?.success) {
          resolve(response);
          return;
        }
        const restResult = await endViaRest();
        resolve(restResult?.success ? restResult : response || restResult);
      };

      if (!activeSocket.connected) {
        activeSocket.connect();
        activeSocket.once("connect", () => {
          activeSocket.emit("call-ended", payload, finish);
        });
        return;
      }

      activeSocket.emit("call-ended", payload, finish);
    });
  };

  const handleEndCall = async (serverInitiated = false) => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;

    // Freeze the on-screen duration FIRST — before any cleanup — so exactly
    // what the user saw is what gets billed and stored.
    const clientDurationSeconds = getElapsedCallSeconds();

    setCallActive(false);

    stopTimer();
    dispatch(endCall());
    setCallSessionEnded(true);

    if (serverInitiated) {
      cleanupCallUI(false);
      leaveCallPage();
      return;
    }

    const payload = buildCallEndPayload(clientDurationSeconds);

    const result = await emitCallEndedToServer(payload);
    leaveCallPage();
  };

  useEffect(() => {
    if (!channelNameParam || !billingStorageKey || endingOnRefresh) return;

    const navEntry = performance.getEntriesByType("navigation")[0];
    const isReload = navEntry?.type === "reload";
    const wasBilling = sessionStorage.getItem(billingStorageKey) === "1";

    if (!isReload || !wasBilling) return;

    const endAfterRefresh = async () => {
      setEndingOnRefresh(true);
      if (callEndedRef.current) return;
      callEndedRef.current = true;

      // Capture the on-screen elapsed BEFORE cleanup (survives the refresh
      // because the synced start lives in localStorage under the channel key).
      const clientDurationSeconds = getElapsedCallSeconds();

      setCallActive(false);
      stopTimer();
      dispatch(endCall());

      const payload = buildCallEndPayload(clientDurationSeconds);
      payload.endby =
        userType === "consultant"
          ? "consultant_page_refresh"
          : "user_page_refresh";

      await emitCallEndedToServer(payload);
      sessionStorage.removeItem(billingStorageKey);
      leaveCallPage();
    };

    endAfterRefresh();
  }, [channelNameParam, billingStorageKey, endingOnRefresh, userType]);

  const handleMuteToggle = () => {
    dispatch(toggleMute());
  };

  const handleVideoToggle = () => {
    if (isVideoCall) {
      dispatch(toggleVideo());
    }
  };
  useEffect(() => {
    if (callEnded?.callId) {
      handleEndCall();
      setCallActive(false);
    }
  }, [callEnded]);



  useEffect(() => {
    const onRemoteLeft = (e) => {
      if (callEndedRef.current) return;
      handleEndCall();
    };

    window.addEventListener("remote-user-left", onRemoteLeft);
    return () => {
      window.removeEventListener("remote-user-left", onRemoteLeft);
    };
  }, []);

  const startTimer = (optionalStartTimestamp) => {
    // Per-call key so a previous call's start time can never leak into a new
    // call (unique start), while the server-synced timestamp (same value sent
    // to both parties via call-timer-sync) stays the single source of truth.
    const startKey = channelNameParam
      ? `call_start_${channelNameParam}`
      : "callStartTime";
    let startTime =
      optionalStartTimestamp != null
        ? Number(optionalStartTimestamp)
        : parseInt(localStorage.getItem(startKey), 10);
    if (!startTime || isNaN(startTime)) {
      startTime = Date.now();
    }
    localStorage.setItem(startKey, String(startTime));
    localStorage.setItem("callStartTime", String(startTime)); // back-compat

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const tick = () => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      setTime({
        minutes: Math.floor(diff / 60),
        seconds: diff % 60,
      });
    };
    tick(); // update immediately
    intervalRef.current = setInterval(tick, 1000);
  };
  // Consultant/receiver timer starts only when we get synced startedAt via socket (call-accepted-started or both-user-join)

  useEffect(() => {
    const timerHandler = () => {
      emitMediaConnected();
      setFirstTime(true);
    };

    const connectedHandler = () => {
      emitMediaConnected();
      setIsRinging(false);
    };

    window.addEventListener("call-timer-start", timerHandler);
    window.addEventListener("call-connected", connectedHandler);

    return () => {
      window.removeEventListener("call-timer-start", timerHandler);
      window.removeEventListener("call-connected", connectedHandler);
    };
  }, [userType, callerIdParam, receiverId, channelNameParam, callType, userId]);

  useEffect(() => {
    if (userType === "client" && !bothUserConnected) {
      initRingtone();
      playRingtone();
      setIsRinging(true);
    }
  }, [userType, bothUserConnected]);

  useEffect(() => {
    if (userType === "client" && bothUserConnected) {
      stopRingtone();
    }
  }, [userType, bothUserConnected]);

  if (endingOnRefresh) {
    return (
      <div className={styles.videoCallContainer} style={themeVars || undefined}>
        <div className={styles.callCard}>
          <div className={styles.callHeader}>
            <p>Ending call after page refresh…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.videoCallContainer} style={themeVars || undefined}>
      <div className={styles.callCard}>
      <div className={styles.callHeader}>
        <div className={styles.callHeaderLeft}>
          <button
            className={styles.backButton}
            onClick={handleEndCall}
            aria-label="End call"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={styles.callInfo}>
            <div className={styles.callAvatar}>
              <img
                className={styles.callAvatar}
                src={getProfileImageUrl()}
                alt="profile"
              />
            </div>
            <div>
              <div className={styles.callName}>
                {userType === "client"
                  ? callerDetails?.receiver?.fullname
                  : callerDetails?.caller?.fullname}
              </div>
              <div className={styles.callStatus}>
              </div>
            </div>
          </div>
        </div>

        {bothUserConnected && (
          <div className={styles.callHeaderRight}>
            <div className={styles.callTimer}>
              {String(time.minutes).padStart(2, "0")}:
              {String(time.seconds).padStart(2, "0")}
            </div>
          </div>
        )}
      </div>

      <div className={styles.videoArea}>
        <NetworkIndicator
          status={networkStatus.status}
          message={networkStatus.message}
          scope={networkStatus.scope}
        />
        {audioBlocked && (
          <button
            type="button"
            onClick={enableRemoteAudio}
            aria-label="Enable call audio"
            style={{
              position: "absolute",
              top: "14px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 8,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "999px",
              border: "none",
              background: "#ef4444",
              color: "#fff",
              fontWeight: 650,
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 6px 20px rgba(239,68,68,0.45)",
            }}
          >
            🔊 Tap to enable audio
          </button>
        )}
        {cameraSwitchError && (
          <div className={styles.cameraToast} role="status">
            {cameraSwitchError}
          </div>
        )}
        <div className={styles.remoteVideo}>
          {isVideoCall ? (
            <>
              <div
                ref={remoteVideoRef}
                data-remote-video
                className={styles.videoElement}
                style={{ display: hasRemoteVideo ? "block" : "none" }}
              />
              {(!inCall || (inCall && !hasRemoteVideo)) && (
                <div className={styles.videoPlaceholder}>
                  <div
                className={`${styles.avatarLarge} ${
                  isRinging ? styles.avatarPulse : ""
                }`}
              >
                    <img
                      className={styles.avatarLarge}
                      src={getProfileImageUrl()}
                      alt="profile"
                    />
                  </div>
                  <p className={styles.videoPlaceholderText}>
                    {!inCall
                      ? userType === "client"
                        ? callerDetails?.receiver?.fullname
                        : callerDetails?.caller?.fullname ||
                          "Waiting for video..."
                      : `${
                          (userType === "client"
                            ? callerDetails?.receiver?.fullname
                            : callerDetails?.caller?.fullname) ||
                          (userType === "client" ? "Consultant" : "Caller")
                        } (Camera off)`}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className={styles.videoPlaceholder}>
              <div
                className={`${styles.avatarLarge} ${
                  isRinging ? styles.avatarPulse : ""
                }`}
              >
                <img
                  className={styles.avatarLarge}
                  src={getProfileImageUrl()}
                  alt="profile"
                />
              </div>
              <p className={styles.videoPlaceholderText}>
                {userType === "client"
                  ? callerDetails?.receiver?.fullname
                  : callerDetails?.caller?.fullname || "Calling..."}
              </p>

              {callRejected || callSessionEnded ? (
                <p
                  className={styles.videoPlaceholderText}
                  style={{ color: "red" }}
                >
                  {callSessionEnded ? "Call Ended" : "Call Rejected"}
                </p>
              ) : (
                <>
                  <p
                    style={{ color: isRinging ? "white" : "green" }}
                    className={styles.videoPlaceholderText}
                  >
                    {isRinging ? "Ringing..." : "Connected..."}
                  </p>
                  <p style={{ fontSize: "12px", color: "white" }}>
                    {callType === "voice" ? "Voice Call" : "Video Call"}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {isVideoCall && (
          <div
            className={`${styles.localVideo} ${
              selfExpanded ? styles.localVideoExpanded : ""
            }`}
          >
            <button
              type="button"
              className={styles.selfExpandButton}
              aria-label={
                selfExpanded ? "Shrink your video" : "Enlarge your video"
              }
              title={selfExpanded ? "Shrink your video" : "Enlarge your video"}
              onClick={() => setSelfExpanded((v) => !v)}
            >
              {selfExpanded ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
            <div
              ref={localVideoRef}
              data-local-video
              className={styles.videoElement}
              style={{
                display: videoEnabled ? "block" : "none",
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              className={styles.videoPlaceholderSmall}
              style={{ display: !videoEnabled ? "flex" : "none" }}
            >
              <div className={styles.avatarSmall}>You</div>
              <p className={styles.videoPlaceholderTextSmall}>Camera Off</p>
            </div>
          </div>
        )}
      </div>

      <div className={styles.callControls}>
        <button
          className={`${styles.controlButton} ${muted ? styles.controlButtonActive : ""}`}
          title={muted ? "Unmute" : "Mute"}
          onClick={handleMuteToggle}
        >
          {muted ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          )}
        </button>
        {isVideoCall && (
          <button
            className={`${styles.controlButton} ${!videoEnabled ? styles.controlButtonActive : ""}`}
            title={videoEnabled ? "Turn Off Camera" : "Turn On Camera"}
            onClick={handleVideoToggle}
          >
            {!videoEnabled ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
          </button>
        )}
        {isVideoCall && videoEnabled && canSwitchCamera && (
          <button
            type="button"
            className={`${styles.controlButton} ${switchingCamera ? styles.controlButtonBusy : ""}`}
            onClick={handleCameraSwitch}
            disabled={switchingCamera}
            aria-label="Switch camera"
            aria-busy={switchingCamera}
            title={
              switchingCamera
                ? "Switching camera…"
                : nextCamera?.label
                  ? `Switch to ${nextCamera.label}`
                  : "Switch camera"
            }
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 4a8 8 0 0 1 7.6 5.5" />
              <polyline points="20 3.5 20 9.5 14 9.5" />
              <path d="M12 20a8 8 0 0 1-7.6-5.5" />
              <polyline points="4 20.5 4 14.5 10 14.5" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
          </button>
        )}
        <button
          className={`${styles.controlButton} ${styles.endCallButton}`}
          onClick={handleEndCall}
          title="End Call"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </button>
      </div>
      </div>
    </div>
  );
}

export default VideoCallingPage;
