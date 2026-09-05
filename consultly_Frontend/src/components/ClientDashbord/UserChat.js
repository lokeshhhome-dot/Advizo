import React, { Fragment, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import styles from "./UserChat.module.css";
import {
  socket,
  ensureSocketConnected,
  notifySocketUserReady,
} from "../Sokect-io/SokectConfig";
import { useTypingIndicator } from "../Sokect-io/useTypingIndicator";
import TypingIndicator from "../Sokect-io/TypingIndicator";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchChatHistory,
  fetchConsultantById,
  updateUserRequestById,
} from "../Redux/slices/ConsultantSlices";
import InsufficientBalanceModal from "../AlertModel/InsuffientBalance";
import ReactToast from "../AlertModel/ReactToast";
import { fetchUserDetailsByIds } from "../Redux/slices/UserSlices";
import {
  getProfileImageUrl,
  handleProfileImageError,
} from "../../utils/getProfileImageUrl";
import { prepareSessionLogin, SESSION_TYPES } from "../../utils/browserSession";
import RatingModal from "./RatingModal";
import AttachButton from "../ChatAttachments/AttachButton";
import AttachmentComposerPreview from "../ChatAttachments/AttachmentComposerPreview";
import ChatImageMessage from "../ChatAttachments/ChatImageMessage";
import ChatPdfMessage from "../ChatAttachments/ChatPdfMessage";
import OptimisticAttachmentMessage from "../ChatAttachments/OptimisticAttachmentMessage";
import {
  validateAttachmentFile,
  uploadChatAttachment,
} from "../ChatAttachments/chatAttachmentApi";

function formatSessionDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameCalendarDay(date, today)) return "Today";
  if (isSameCalendarDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

// Groups the flat message list into per-day buckets so a day separator only
// renders when the history actually spans more than one calendar day.
function groupMessagesByDay(list) {
  const groups = [];
  (list || []).forEach((message) => {
    const ts = message?.timestamp ? new Date(message.timestamp) : new Date();
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && isSameCalendarDay(lastGroup.date, ts)) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ date: ts, messages: [message] });
    }
  });
  return groups;
}

const ICON_WAITING = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const ICON_HANDSHAKE = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12l2 2 4-4" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const ICON_MESSAGE_START = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

/**
 * Props are ALL optional and only override the URL-param reads below when
 * given — the existing routed `/chats` page (App Proxy iframe, no props
 * passed) behaves exactly as before. `onClose`, when provided, means this
 * instance is embedded as a modal (ConsultantChatModal) rather than a
 * standalone routed/iframed page — see backToViewProfile/closeOrGoBack.
 */
const UserChat = ({
  consultantId: consultantIdProp,
  shop: shopProp,
  customerId: customerIdProp,
  shopId: shopIdProp,
  authToken: authTokenProp,
  onClose,
} = {}) => {
  // TEMPORARY debug — remove once the redirect-on-click report is resolved.
  console.log("[CHAT TEST] USERCHAT MOUNTED");
  console.log("[CHAT TEST] USER CHAT RENDERED");

  const [text, setText] = useState();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [clientId, setClientId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [show, setShow] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const parms = new URLSearchParams(window.location.search);
  const consultantId = consultantIdProp || parms.get("consultantId");
  const shop = shopProp || parms.get("shop");
  const authTokenFromUrl = (
    authTokenProp ||
    parms.get("authToken") ||
    ""
  ).trim();
  const customerIdFromUrl =
    customerIdProp || parms.get("customerId") || parms.get("userId");
  const shopIdFromUrl =
    shopIdProp || parms.get("shopid") || parms.get("shopId");
  // TEMP (Chat modal identity-sync): the Theme Extension overlay's only
  // safe way to hand this page a real session — see proxyShopifyStorefrontChat
  // / exchangeChatSession in shopifyController.js. Never used when a prop or
  // an authToken/customerId URL param is already present (those already
  // establish identity directly; this is strictly a fallback for the
  // App-Proxy-launched overlay, which deliberately gets neither in its URL).
  const exchangeCode = parms.get("exchange");
  const chatUiReadyFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Capture token BEFORE session switch — prepareSessionLogin(USER)
      // clears consultant keys and used to wipe `token` before we could
      // restore it.
      const priorToken = (localStorage.getItem("token") || "").trim();
      const urlToken = authTokenFromUrl;

      prepareSessionLogin(SESSION_TYPES.USER);

      let resolvedClientId =
        customerIdFromUrl || localStorage.getItem("client_u_Identity");
      let resolvedShopId =
        shopIdFromUrl || localStorage.getItem("shop_o_Identity");
      let resolvedToken = urlToken || priorToken;

      // Only redeem the exchange code when nothing stronger already
      // resolved identity — same "props/URL first" precedence the rest of
      // this bootstrap already follows.
      if (exchangeCode && !resolvedClientId && !resolvedToken) {
        try {
          const { data } = await axios.post(
            `${process.env.REACT_APP_BACKEND_HOST}/app/consultly/chat-session/exchange`,
            { exchange: exchangeCode, shop, consultantId },
          );
          if (data?.success && data?.userId && data?.token) {
            resolvedClientId = data.userId;
            resolvedShopId = resolvedShopId || data.shopId;
            resolvedToken = data.token;
          } else {
            console.warn("UserChat chat-session exchange failed:", data?.message);
          }
          // TEMPORARY debug — booleans only, never the token/id values.
          console.log(
            "[THEME AUTH DEBUG] Chat session established =",
            Boolean(data?.success && data?.userId && data?.token),
          );
        } catch (error) {
          console.error(
            "UserChat chat-session exchange request failed:",
            error?.response?.data?.message || error?.message,
          );
          console.log("[THEME AUTH DEBUG] Chat session established =", false);
        }
      }

      if (cancelled) return;

      if (resolvedClientId) {
        localStorage.setItem("client_u_Identity", resolvedClientId);
      }
      if (resolvedShopId) {
        localStorage.setItem("shop_o_Identity", resolvedShopId);
      }
      if (resolvedToken) {
        localStorage.setItem("token", resolvedToken);
      }
      if (shop) {
        localStorage.setItem("shop", shop);
      }

      setClientId(resolvedClientId || null);
      setShopId(resolvedShopId || null);

      // TODO(auth): the modal flow (ConsultantChatModal, opened from
      // ConsultantCards/ViewProfile) intentionally opens for an anonymous
      // visitor for now — no login/balance gate before this component mounts.
      // This branch already degrades gracefully (warns, doesn't crash/redirect)
      // when resolvedClientId/resolvedToken are missing, which is what makes
      // that possible; restore a real auth/balance check before the Chat
      // button opens this modal once testing is done.
      // TEMPORARY debug — boolean only, never the id/token values.
      console.log(
        "[THEME AUTH DEBUG] Socket identity available =",
        Boolean(resolvedClientId && resolvedToken),
      );

      if (resolvedClientId && resolvedToken) {
        notifySocketUserReady();
        ensureSocketConnected(resolvedClientId, null, 8000, resolvedToken).catch(
          (error) => {
            console.error(
              "UserChat socket connect failed:",
              error?.message || error,
            );
          },
        );
      } else {
        console.warn("UserChat bootstrap missing auth fields:", {
          hasClientId: Boolean(resolvedClientId),
          hasToken: Boolean(resolvedToken),
          hasUrlToken: Boolean(urlToken),
          shopId: resolvedShopId,
        });
      }

      // Tells the theme overlay's spinner (openChatOverlay in
      // consultant-card.js) to hide — fired once bootstrap has resolved
      // identity either way, success or degraded, since both outcomes reach
      // a real, renderable chat state (an active chat or the Start Chat
      // request state) rather than a loading placeholder. No-ops harmlessly
      // when this instance isn't inside that overlay (ConsultantChatModal,
      // the routed /chats page).
      if (!cancelled && !chatUiReadyFiredRef.current) {
        chatUiReadyFiredRef.current = true;
        window.parent.postMessage({ type: "CONSULTLY_CHAT_UI_READY" }, "*");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authTokenFromUrl, customerIdFromUrl, shopIdFromUrl, shop, exchangeCode, consultantId]);

  const token = localStorage.getItem("token") || authTokenFromUrl;

  const { consultantOverview } = useSelector((state) => state.consultants);
  const { chatHistory } = useSelector((state) => state.consultants);
  const { messages: socketMessages } = useSelector((state) => state.socket);
  const imageUrl = getProfileImageUrl(
    consultantOverview?.consultant?.profileImage,
  );
  const [chatMessagesData, setChatMessagesData] = useState([]);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const pendingAbortRef = useRef(null);
  const lastProcessedMessageId = useRef(null);
  const messagesAreaRef = useRef(null);
  const lastNotificationMessageId = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const { insufficientBalance } = useSelector((state) => state.socket);
  const [showChatEndToast, setShowChatEndToast] = useState(false);
  const [showChatLock, setShowChatLock] = useState(false);
  const [waitingForAccept, setWaitingForAccept] = useState(false);
  // Seconds left while waiting for the consultant to accept; drives the
  // "Wait Ns" label and auto-reverts the button to "start chat" at zero.
  const WAIT_FOR_ACCEPT_SECONDS = 30;
  const [waitCountdown, setWaitCountdown] = useState(WAIT_FOR_ACCEPT_SECONDS);
  const prevIsRunningRef = useRef(null);
  const { userDetails } = useSelector((state) => state.users);
  const { confirmChat } = useSelector((state) => state.socket);
  const { chatTimer } = useSelector((state) => state.socket);
  const [isLock, seIsLock] = useState(false);
  const { isPartnerTyping, handleInputChange, stopTyping, partnerLabel } =
    useTypingIndicator({
      senderId: clientId,
      receiverId: consultantId,
      shopId,
      partnerName: consultantOverview?.consultant?.fullname || "Consultant",
    });

  // ROOT CAUSE of the silent send failure: startCHatHandler() below fires
  // "acceptUserChat" (async server write of chatLock=false) and immediately
  // (same tick, no ack) dispatches fetchUserDetailsByIds — a fire-and-forget
  // REST poll racing an independent socket round trip, same pattern already
  // fixed for the rating race. If that REST fetch resolves with the STALE
  // pre-accept chatLock="true" AFTER the "chatTimer.isRunning" effect below
  // has already (correctly) unlocked the composer, this effect re-locked it
  // — composer silently disabled (canMessage/canSend both derive from
  // showChatLock) for the rest of an actively-running, visibly-ticking chat,
  // with no error anywhere: Send and Enter share the same disabled gate, so
  // both looked identically "broken". chatTimer.isRunning is the
  // authoritative real-time signal for whether a chat is live; a possibly-
  // stale poll must never be allowed to override it while it says otherwise.
  useEffect(() => {
    if (chatTimer.isRunning) return;
    if (userDetails?.data?.chatLock === "true") {
      setShowChatLock(true);
    } else {
      setShowChatLock(false);
    }
  }, [userDetails, showChatLock, chatTimer.isRunning]);

  useEffect(() => {
    if (confirmChat) {
      seIsLock(true);
      // Consultant accepted — stop the wait countdown so the green
      // "Accept chat" button shows immediately.
      setWaitingForAccept(false);
    }
  }, [confirmChat]);

  useEffect(() => {
    if (!waitingForAccept) {
      setWaitCountdown(WAIT_FOR_ACCEPT_SECONDS);
      return;
    }
    const interval = setInterval(() => {
      setWaitCountdown((prev) => {
        if (prev <= 1) {
          // Consultant didn't accept in time — let the user try again.
          setWaitingForAccept(false);
          return WAIT_FOR_ACCEPT_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [waitingForAccept]);

  useEffect(() => {
    if (consultantId) {
      localStorage.setItem("___U-B", consultantId);
    } else {
      localStorage.removeItem("___U-B");
    }
    // Leaving the chat page closes the chat — new messages should ring again.
    return () => {
      localStorage.removeItem("___U-B");
    };
  }, [consultantId]);

  useEffect(() => {
    if (insufficientBalance) {
      setShow(true);
    }
  }, [insufficientBalance]);
  useEffect(() => {
    dispatch(fetchUserDetailsByIds(clientId));
  }, [clientId, refreshed, showChatEndToast]);

  useEffect(() => {
    dispatch(
      fetchConsultantById({
        shop_id: shopId,
        consultant_id: consultantId,
        token: token,
        shop: shop,
      }),
    );
  }, [shopId, consultantId]);

  const isNearBottom = () => {
    if (!messagesAreaRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesAreaRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  const scrollToBottom = (force = false) => {
    if (!force && !shouldAutoScrollRef.current) return;

    setTimeout(() => {
      if (messagesAreaRef.current) {
        messagesAreaRef.current.scrollTop =
          messagesAreaRef.current.scrollHeight;
      }
    }, 100);
  };

  useEffect(() => {
    if (chatHistory?.chatHistory) {
      setChatMessagesData(chatHistory.chatHistory);
      lastProcessedMessageId.current = null;
      shouldAutoScrollRef.current = true;
      setTimeout(() => {
        scrollToBottom(true);
      }, 400);
    }
  }, [chatHistory, show]);


  useEffect(() => {
    if (!clientId || !consultantId || !shopId) {
      console.log("UserChat - Missing IDs:", {
        clientId,
        consultantId,
        shopId,
      });
      return;
    }
    if (!socketMessages || socketMessages.length === 0) {
      return;
    }

    socketMessages.forEach((message) => {
      if (!message || !message._id) {
        return;
      }
      if (message._id === lastProcessedMessageId.current) {
        return;
      }

      const messageShopId = String(message.shop_id || message.shopId || "");
      const currentShopId = String(shopId || "");
      const messageSenderId = String(message.senderId || "");
      const messageReceiverId = String(message.receiverId || "");
      const currentClientId = String(clientId || "");
      const currentConsultantId = String(consultantId || "");

      const isCurrentChatMessage =
        messageShopId === currentShopId &&
        ((messageSenderId === currentClientId &&
          messageReceiverId === currentConsultantId) ||
          (messageSenderId === currentConsultantId &&
            messageReceiverId === currentClientId));

      if (isCurrentChatMessage) {
        lastProcessedMessageId.current = message._id;

        setChatMessagesData((prev) => {
          const messageExists = prev.some((msg) => msg._id === message._id);
          if (messageExists) {
            return prev;
          }

          const tempMessageIndex = prev.findIndex((msg) => {
            if (!msg._id?.startsWith("temp-")) return false;
            if (msg.tempId && message.tempId) return msg.tempId === message.tempId;
            return msg.text === message.text && String(msg.senderId) === messageSenderId;
          });

          if (tempMessageIndex !== -1) {
            const newMessages = [...prev];
            newMessages[tempMessageIndex] = message;
            return newMessages;
          }

          return [...prev, message];
        });
      } else {
        return;
      }
    });
  }, [socketMessages, clientId, consultantId, shopId]);

  useEffect(() => {
    if (!clientId || !consultantId || !shopId) return;
    if (!socketMessages || socketMessages.length === 0) return;

    const latestMessage = socketMessages[socketMessages.length - 1];
    if (!latestMessage) return;

    if (
      latestMessage._id &&
      latestMessage._id === lastNotificationMessageId.current
    ) {
      return;
    }

    const isIncoming =
      String(latestMessage.senderId) === String(consultantId) &&
      String(latestMessage.receiverId) === String(clientId) &&
      String(latestMessage.shop_id) === String(shopId);

    if (!isIncoming) return;

    const payload = {
      senderName: consultantOverview?.consultant?.fullname || "Consultant",
      text: latestMessage.text || "",
      avatar: consultantOverview?.consultant?.profileImage
        ? getProfileImageUrl(consultantOverview.consultant.profileImage)
        : null,
    };

    if (latestMessage._id) {
      lastNotificationMessageId.current = latestMessage._id;
    }
  }, [socketMessages, clientId, consultantId, shopId, consultantOverview]);

  // ROOT CAUSE of "text never sends" (image/PDF unaffected — they go through
  // sendAttachmentMessage, not this function): this used to be called
  // directly as the button's onClick, which React invokes with the click
  // SyntheticEvent as the first arg — an object, not a string, so the
  // typeof check below correctly fell through to the `text` state.
  // handleComposerSend() (added for attachments) instead calls sendChat()
  // with NO arguments, so the "" default parameter satisfies
  // `typeof input === "string"` and is used as-is — meaning finalMessage was
  // ALWAYS "" on every normal Send/Enter, unconditionally short-circuiting
  // below regardless of what the user typed. Defaulting to null instead
  // fixes both call sites: sendChat() -> null -> falls through to `text`;
  // sendChat("explicit string") from the pre-chat Start-chat button is
  // unaffected either way.
  const sendChat = async (input = null) => {
    const finalMessage = typeof input === "string" ? input : text;
    console.log("[CHAT DEBUG] sendChat called:", {
      finalMessage,
      clientId,
      consultantId,
      shopId,
    });

    if (!finalMessage?.trim() || !clientId || !consultantId || !shopId) {
      console.log("UserChat - Missing IDs:", {
        clientId,
        consultantId,
        shopId,
      });
      return;
    }

    try {
      const liveToken =
        (localStorage.getItem("token") || authTokenFromUrl || "").trim();
      console.log("[CHAT DEBUG] ensureSocketConnected: connecting...", {
        hasToken: Boolean(liveToken),
      });
      await ensureSocketConnected(clientId, null, 8000, liveToken || null);
      console.log("[CHAT DEBUG] ensureSocketConnected: connected, socket.connected =", socket.connected);
    } catch (error) {
      console.error("[CHAT DEBUG] ensureSocketConnected failed:", error?.message || error);
      alert(
        error?.message ||
          "Unable to connect chat. Please refresh the page and try again.",
      );
      return;
    }

    const messageText =
      (typeof input === "string" && input.trim() ? input : text) ||
      "👋 Hi! I'd like to start a consultation.";

    const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const messageData = {
      senderId: clientId,
      receiverId: consultantId,
      shop_id: shopId,
      text: messageText,
      timestamp: new Date().toISOString(),
      tempId,
    };

    const optimisticMessage = {
      _id: `temp-${Date.now()}`,
      ...messageData,
    };
    setChatMessagesData((prev) => [...prev, optimisticMessage]);

    console.log("[CHAT DEBUG] emitting sendMessage:", messageData);
    socket.emit("sendMessage", messageData);
    setText("");
    stopTyping();

    shouldAutoScrollRef.current = true;
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);
  };

  const handleFileSelected = (file) => {
    const validation = validateAttachmentFile(file);
    if (!validation.valid) {
      alert(validation.reason);
      return;
    }

    const previewUrl = validation.type === "image" ? URL.createObjectURL(file) : null;
    const controller = new AbortController();
    pendingAbortRef.current = controller;
    setPendingAttachment({
      file,
      previewUrl,
      type: validation.type,
      status: "uploading",
      progress: 0,
      error: null,
      uploadedMeta: null,
    });
    runAttachmentUpload(file, controller);
  };

  const runAttachmentUpload = async (file, controller) => {
    try {
      const liveToken = (localStorage.getItem("token") || authTokenFromUrl || "").trim();
      const uploadedMeta = await uploadChatAttachment({
        shopId,
        userId: clientId,
        consultantId,
        file,
        token: liveToken,
        signal: controller.signal,
        onProgress: (progress) =>
          setPendingAttachment((prev) => (prev ? { ...prev, progress } : prev)),
      });
      setPendingAttachment((prev) =>
        prev ? { ...prev, status: "ready", progress: 100, uploadedMeta } : prev,
      );
    } catch (error) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") return;
      setPendingAttachment((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              error: error?.response?.data?.message || "Upload failed",
            }
          : prev,
      );
    }
  };

  const handleCancelAttachment = () => {
    pendingAbortRef.current?.abort();
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
  };

  const handleRetryAttachment = () => {
    if (!pendingAttachment) return;
    const controller = new AbortController();
    pendingAbortRef.current = controller;
    setPendingAttachment((prev) =>
      prev ? { ...prev, status: "uploading", progress: 0, error: null } : prev,
    );
    runAttachmentUpload(pendingAttachment.file, controller);
  };

  const sendAttachmentMessage = async () => {
    if (
      !pendingAttachment ||
      pendingAttachment.status !== "ready" ||
      !clientId ||
      !consultantId ||
      !shopId
    ) {
      return;
    }

    try {
      const liveToken = (localStorage.getItem("token") || authTokenFromUrl || "").trim();
      await ensureSocketConnected(clientId, null, 8000, liveToken || null);
    } catch (error) {
      alert(
        error?.message ||
          "Unable to connect chat. Please refresh the page and try again.",
      );
      return;
    }

    const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const messageData = {
      senderId: clientId,
      receiverId: consultantId,
      shop_id: shopId,
      text: text?.trim() || "",
      timestamp: new Date().toISOString(),
      attachment: pendingAttachment.uploadedMeta,
      tempId,
    };

    const optimisticMessage = {
      _id: `temp-${Date.now()}`,
      ...messageData,
      messageType: "attachment",
      localPreviewUrl: pendingAttachment.previewUrl,
    };
    setChatMessagesData((prev) => [...prev, optimisticMessage]);

    socket.emit("sendMessage", messageData);
    setText("");
    stopTyping();
    setPendingAttachment(null);

    shouldAutoScrollRef.current = true;
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);
  };

  const handleComposerSend = () => {
    console.log("[CHAT DEBUG] send clicked:", { text, pendingAttachment, canSend });
    if (pendingAttachment) {
      sendAttachmentMessage();
    } else {
      sendChat();
    }
  };

  useEffect(() => {
    if (shopId && clientId && consultantId) {
      dispatch(
        fetchChatHistory({
          shopId: shopId,
          userId: clientId,
          consultantId: consultantId,
        }),
      );
      setChatMessagesData([]);
      lastProcessedMessageId.current = null;
    }
  }, [dispatch, shopId, clientId, consultantId]);

  useEffect(() => {
    if (chatMessagesData.length > 0 && messagesAreaRef.current) {
      if (isNearBottom() || shouldAutoScrollRef.current) {
        const timer = setTimeout(() => {
          scrollToBottom();
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, [chatMessagesData.length]);

  // Instagram-style keyboard handling on phones: when the on-screen keyboard
  // opens, shrink the chat to the visible viewport so the input stays above
  // the keyboard and the latest messages remain in view.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const applyHeight = () => {
      // Clamp to this document's own viewport. The chat runs inside an iframe on
      // the storefront, where visualViewport can report the TOP window's visible
      // height — larger than the iframe itself — which pushed the bottom of the
      // chat below the fold on desktop. window.innerHeight is the iframe's own
      // height, so min() keeps the card inside its box while still shrinking for
      // the on-screen keyboard (where vv.height is the smaller of the two).
      const usableHeight = Math.min(
        vv.height || window.innerHeight,
        window.innerHeight || vv.height,
      );
      document.documentElement.style.setProperty(
        "--chat-vh",
        `${usableHeight}px`,
      );
      scrollToBottom(true);
    };

    applyHeight();
    vv.addEventListener("resize", applyHeight);
    return () => {
      vv.removeEventListener("resize", applyHeight);
      document.documentElement.style.removeProperty("--chat-vh");
    };
  }, []);

  useEffect(() => {
    const messagesArea = messagesAreaRef.current;
    if (!messagesArea) return;

    const handleScroll = () => {
      if (!isNearBottom()) {
        shouldAutoScrollRef.current = false;
      } else {
        shouldAutoScrollRef.current = true;
      }
    };

    messagesArea.addEventListener("scroll", handleScroll);
    return () => {
      messagesArea.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // TEMPORARY (debugging silent send failures): the backend rejects a
  // sendMessage attempt by emitting "socket-error" — which nothing on this
  // page previously listened for, so a rejection (bad shop/participant IDs,
  // stale auth, etc.) looked EXACTLY like the Send button doing nothing.
  // Surfacing it as a toast turns that silent failure into a visible,
  // diagnosable one.
  const [socketErrorMessage, setSocketErrorMessage] = useState(null);
  useEffect(() => {
    const handleSocketError = (payload) => {
      console.log("[CHAT DEBUG] socket-error received:", payload);
      if (payload?.event !== "sendMessage") return;
      const reasonText = {
        invalid_ids: "Something went wrong identifying this chat. Please refresh and try again.",
        invalid_payload: "Your message could not be sent. Please try again.",
        forbidden: "You're not allowed to send a message in this chat. Please refresh and try again.",
        unauthenticated: "Your session expired. Please refresh and try again.",
      }[payload?.reason] || "Your message could not be sent. Please try again.";
      setSocketErrorMessage(reasonText);
    };
    socket.on("socket-error", handleSocketError);
    return () => socket.off("socket-error", handleSocketError);
  }, []);

  useEffect(() => {
    if (!clientId || !consultantId || !shopId) return;

    const handleDirectMessage = (message) => {
      console.log("[CHAT DEBUG] receiveMessage received:", message);
      const messageShopId = String(message.shop_id || message.shopId || "");
      const currentShopId = String(shopId || "");
      const messageSenderId = String(message.senderId || "");
      const messageReceiverId = String(message.receiverId || "");
      const currentClientId = String(clientId || "");
      const currentConsultantId = String(consultantId || "");

      const isCurrentChatMessage =
        messageShopId === currentShopId &&
        ((messageSenderId === currentClientId &&
          messageReceiverId === currentConsultantId) ||
          (messageSenderId === currentConsultantId &&
            messageReceiverId === currentClientId));

      if (isCurrentChatMessage && message._id) {
        if (message._id === lastProcessedMessageId.current) return;
        lastProcessedMessageId.current = message._id;

        setChatMessagesData((prev) => {
          const messageExists = prev.some((msg) => msg._id === message._id);
          if (messageExists) return prev;

          // Check for temp message
          const tempMessageIndex = prev.findIndex((msg) => {
            if (!msg._id?.startsWith("temp-")) return false;
            if (msg.tempId && message.tempId) return msg.tempId === message.tempId;
            return msg.text === message.text && String(msg.senderId) === messageSenderId;
          });

          if (tempMessageIndex !== -1) {
            const newMessages = [...prev];
            newMessages[tempMessageIndex] = message;
            return newMessages;
          }

          return [...prev, message];
        });
      }
    };

    socket.on("receiveMessage", handleDirectMessage);

    return () => {
      socket.off("receiveMessage", handleDirectMessage);
    };
  }, [clientId, consultantId, shopId]);

  /**
   * Mark messages as seen
   */

  useEffect(() => {
    if (!clientId || !consultantId) return;
    if (chatMessagesData.length === 0) return;
    socket.emit("markSeen", {
      senderId: consultantId,
      receiverId: clientId,
    });
  }, [clientId, consultantId]);
  // Embedded-modal instances (onClose passed) close in place — leaving the
  // host page's own URL/history untouched. Routed/iframed instances (no
  // onClose) keep their exact prior navigation behavior, UNLESS ?embedded=1
  // is set — that marks this as the Theme Extension's dynamically-injected
  // fullscreen iframe (no ConsultantChatModal wrapper, so no onClose prop is
  // possible), which instead posts CONSULTLY_CHAT_CLOSE so the Theme JS that
  // created the iframe can remove it, mirroring what ConsultantChatModal
  // itself does for the ConsultantCards/ViewProfile embedding.
  const isEmbeddedIframe = parms.get("embedded") === "1";
  const closeOrGoBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (isEmbeddedIframe) {
      window.parent.postMessage({ type: "CONSULTLY_CHAT_CLOSE" }, "*");
      return;
    }
    navigate(-1);
  };

  const backToViewProfile = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (isEmbeddedIframe) {
      window.parent.postMessage({ type: "CONSULTLY_CHAT_CLOSE" }, "*");
      return;
    }
    const targetShop = shop;
    const hostQuery = "";
    // window.top.location.href = `https://${targetShop}/apps/consultly/view-profile?consultantId=${consultantId}&shopId=${shopId}${hostQuery}`;
    window.top.location.href = `https://${targetShop}/apps/consultly`;
  };

  const { autoChatEnded } = useSelector((state) => state.socket);
  const [seconds, setSeconds] = useState(0);
  // Snapshot of `seconds` taken the instant a chat ends, before it's reset to
  // 0 — lets the end-of-chat toast show the real session length even though
  // closeOrGoBack() below navigates/closes this component right after.
  const [lastSessionSeconds, setLastSessionSeconds] = useState(0);

  // chatTimer.transactionId is wiped back to null by the SAME Redux update
  // that flips chatTimer.isRunning to false (setChatTimerStopped), so the
  // prevIsRunningRef effect below can't read it directly once a chat has
  // ended — this ref keeps the last real value around long enough to open
  // the rating prompt for it.
  const lastTransactionIdRef = useRef(null);
  useEffect(() => {
    if (chatTimer.transactionId) {
      lastTransactionIdRef.current = chatTimer.transactionId;
    }
  }, [chatTimer.transactionId]);

  // Rating prompt: keyed by transactionId so the SAME ended chat can never
  // open the popup twice even though stopChatTimer/autoChatEnded/the
  // isRunning-transition effect below can each independently detect the
  // same end.
  const [ratingPromptTxId, setRatingPromptTxId] = useState(null);
  const ratingShownForRef = useRef(null);
  const beginRatingPrompt = () => {
    const txId = lastTransactionIdRef.current;
    if (!txId || ratingShownForRef.current === txId) return false;
    ratingShownForRef.current = txId;
    setRatingPromptTxId(txId);
    return true; // caller must NOT closeOrGoBack() yet — the modal does it on skip/submit
  };

  useEffect(() => {
    if (!chatTimer.isRunning || !chatTimer.startTime) return;

    const interval = setInterval(() => {
      const diff = Math.floor(
        (Date.now() - new Date(chatTimer.startTime)) / 1000,
      );
      setSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [chatTimer.isRunning, chatTimer.startTime]);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const stopChatTimer = () => {
    setLastSessionSeconds(seconds);
    socket.emit("endChat", {
      transactionId: chatTimer.transactionId,
      startTime: chatTimer.startTime,
      isRunning: chatTimer.isRunning,
      shopId: chatTimer.shopId,
      userId: clientId,
      consultantId: consultantId,
    });
    seIsLock(false);
    setSeconds(0);
    setRefreshed((prev) => !prev);
    setShowChatEndToast(false);
    setShowChatLock((prev) => !prev);
    localStorage.removeItem("chatTimer");
    if (!beginRatingPrompt()) closeOrGoBack();
  };

  useEffect(() => {
    if (autoChatEnded) {
      setLastSessionSeconds(seconds);
      socket.emit("endChat", {
        transactionId: chatTimer.transactionId,
        startTime: chatTimer.startTime,
        isRunning: chatTimer.isRunning,
        shopId: chatTimer.shopId,
        userId: clientId,
        consultantId: consultantId,
      });
      seIsLock(false);
      setSeconds(0);
      setRefreshed((prev) => !prev);
      setShowChatEndToast(true);
      setShowChatLock((prev) => !prev);
      if (!beginRatingPrompt()) closeOrGoBack();
    }
  }, [autoChatEnded, seconds]);

  useEffect(() => {
    if (prevIsRunningRef.current === true && chatTimer.isRunning === false) {
      setLastSessionSeconds(seconds);
      setShowChatEndToast(true);
      seIsLock(false);
      setWaitingForAccept(false);
      if (!beginRatingPrompt()) closeOrGoBack();
    }
    prevIsRunningRef.current = chatTimer.isRunning;
  }, [chatTimer.isRunning, seconds]);

  useEffect(() => {
    if (chatTimer.isRunning) {
      setShowChatLock(false);
      seIsLock(false);
      setWaitingForAccept(false);
    }
  }, [chatTimer.isRunning]);

  const startCHatHandler = () => {
    if (!clientId || !shopId || !consultantId) return;

    socket.emit("acceptUserChat", {
      userId: clientId,
      shopId,
      consultantId,
    });
    dispatch(fetchUserDetailsByIds(clientId));
    setRefreshed((prev) => !prev);
  };

  // ---------------------------------------------------------------------
  // Chat reliability: refresh / tab-close / browser-close must end an
  // ACTIVE consultation's billing, mirroring VideoCallingPage.js's existing
  // sendBeacon-on-unload pattern for calls (Controller/videoCallController.js
  // endActiveCall -> here, Controller/chatController.js endActiveChatSession
  // -> POST /api/chat/end-session). Reads chatTimer straight from
  // localStorage (the socketSlice reducer already persists it there on
  // start/stop) rather than a captured React closure, so it's correct
  // however long this tab has been open. The primary, unconditional
  // guarantee is still server-side: services/chatSessionManager.js starts a
  // grace-period timer the moment this socket disconnects for ANY reason and
  // auto-finalizes billing if it never reconnects — this beacon is a faster
  // best-effort path that reduces that window to near-zero when it succeeds.
  const chatEndBeaconSentRef = useRef(false);
  useEffect(() => {
    const readActiveChatTimer = () => {
      try {
        const raw = localStorage.getItem("chatTimer");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.isRunning || !parsed?.transactionId) return null;
        return parsed;
      } catch (_) {
        return null;
      }
    };

    const sendEndBeacon = (endby) => {
      if (chatEndBeaconSentRef.current) return; // one logical end request only
      const stored = readActiveChatTimer();
      if (!stored) return;
      chatEndBeaconSentRef.current = true;
      const payload = { transactionId: stored.transactionId, endby };
      navigator.sendBeacon(
        `${process.env.REACT_APP_BACKEND_HOST}/chat/end-session`,
        new Blob([JSON.stringify(payload)], { type: "application/json" }),
      );
    };

    const handleBeforeUnload = () => sendEndBeacon("user_page_refresh");
    const handlePageHide = () => sendEndBeacon("user_page_hide");

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  // Small, non-blocking connection indicator — only ever shown while a chat
  // is actively billing (chatTimer.isRunning). Does not itself end the
  // chat on the first offline blip; the server-side grace-period timeout
  // above is the authoritative fallback for a connection that never
  // recovers.
  const [connectionStatus, setConnectionStatus] = useState("connected");
  useEffect(() => {
    const handleOffline = () => setConnectionStatus("offline");
    const handleOnline = () =>
      setConnectionStatus((prev) => (prev === "offline" ? "reconnecting" : prev));
    const handleSocketDisconnect = () =>
      setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
    const handleSocketConnect = () => setConnectionStatus("connected");

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("connect", handleSocketConnect);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off("connect", handleSocketConnect);
    };
  }, []);

  const messageGroups = groupMessagesByDay(chatMessagesData);
  const showDaySeparators = messageGroups.length > 1;
  const isActive = Boolean(consultantOverview?.consultant?.isActive);
  const consultantName = consultantOverview?.consultant?.fullname || "Consultant";
  // Same flag that decides whether the request/accept overlay covers the
  // stream — messaging has no business being available while that overlay
  // is up, so the composer follows it exactly rather than a second flag.
  const canMessage = !showChatLock;
  const isAttachmentBusy = pendingAttachment?.status === "uploading";
  const canSend =
    canMessage &&
    !isAttachmentBusy &&
    (Boolean(text?.trim()) || pendingAttachment?.status === "ready");
  const endedToastMessage =
    lastSessionSeconds > 0
      ? `Chat ended · ${formatSessionDuration(lastSessionSeconds)} session`
      : "Chat ended";

  return (
    <Fragment>
      <InsufficientBalanceModal
        show={show}
        setShow={setShow}
        insufficientBalance={insufficientBalance}
      />

      <div
        className={`${styles.chatShell} ${isEmbeddedIframe ? styles.embedded : ""}`}
      >
        <div className={styles.chatCard}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIdentity}>
              <button
                onClick={() => backToViewProfile()}
                className={styles.backBtn}
                aria-label="Go back"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div className={styles.avatarWrap}>
                <div className={styles.avatarCircle}>
                  <img
                    src={imageUrl}
                    alt={consultantName}
                    className={styles.avatarImg}
                    onError={handleProfileImageError}
                  />
                </div>
                {isActive && (
                  <span className={styles.onlineDot} aria-hidden="true" />
                )}
              </div>
              <div className={styles.identityText}>
                <div className={styles.name}>{consultantName}</div>
                <div className={styles.status} data-active={isActive}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {isActive ? "Active now" : "Offline"}
                </div>
              </div>
            </div>
            {chatTimer.isRunning && (
              <div className={styles.sessionPill}>
                <span className={styles.timerBadge}>
                  <span className={styles.timerDot} aria-hidden="true" />
                  <span className={styles.timerValue}>
                    {minutes}:{String(remainingSeconds).padStart(2, "0")}
                  </span>
                </span>
                <button
                  onClick={stopChatTimer}
                  className={styles.endBtn}
                  aria-label="End chat session"
                >
                  End chat
                </button>
              </div>
            )}
          </div>

          {chatTimer.isRunning && connectionStatus !== "connected" && (
            <div className={styles.connectionBanner} data-status={connectionStatus}>
              {connectionStatus === "offline" ? "Connection lost" : "Reconnecting…"}
            </div>
          )}

          {/* Conversation stream */}
          <div className={styles.stream} ref={messagesAreaRef}>
            {chatMessagesData.length === 0 ? (
              <div className={styles.streamEmpty}>
                <div className={styles.streamEmptyIcon} aria-hidden="true">
                  {ICON_MESSAGE_START}
                </div>
                <p className={styles.streamEmptyText}>
                  No messages yet. Say hello to start the conversation.
                </p>
              </div>
            ) : (
              messageGroups.map((group, groupIndex) => (
                <Fragment key={group.date.toISOString() + groupIndex}>
                  {showDaySeparators && (
                    <div className={styles.daySeparator}>
                      <span className={styles.daySeparatorLabel}>
                        {formatDayLabel(group.date)}
                      </span>
                    </div>
                  )}
                  {group.messages.map((message) => {
                    const isOwn = message.senderId === clientId;
                    const timestamp = new Date(
                      message.timestamp,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });

                    return (
                      <div
                        key={message._id}
                        className={`${styles.bubbleRow} ${isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther}`}
                      >
                        <div
                          className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleOther}`}
                        >
                          {!isOwn && (
                            <div className={styles.bubbleSender}>
                              {consultantName}
                            </div>
                          )}
                          {message.messageType === "attachment" && message.attachment ? (
                            <>
                              {message._id?.startsWith("temp-") ? (
                                <OptimisticAttachmentMessage
                                  attachment={message.attachment}
                                  localPreviewUrl={message.localPreviewUrl}
                                />
                              ) : message.attachment.type === "image" ? (
                                <ChatImageMessage message={message} token={token} />
                              ) : (
                                <ChatPdfMessage message={message} token={token} />
                              )}
                              {message.text ? (
                                <div className={styles.bubbleText}>{message.text}</div>
                              ) : null}
                            </>
                          ) : (
                            <div className={styles.bubbleText}>{message.text}</div>
                          )}
                          <div className={styles.bubbleTime}>{timestamp}</div>
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))
            )}
          </div>

          <div className={styles.typingSlot}>
            <TypingIndicator label={partnerLabel} visible={isPartnerTyping} />
          </div>

          {/* Composer — disabled entirely until canMessage (mirrors the
              request/accept overlay's own condition), so a message can't be
              typed or sent before the chat has actually started. */}
          <div className={styles.composer}>
            {showChatLock && (
              <div className={styles.requestOverlay}>
                <div className={styles.requestCard}>
                  <div className={styles.requestIconWrap} data-variant={isLock ? "ready" : "waiting"}>
                    {isLock ? ICON_HANDSHAKE : ICON_WAITING}
                    {waitingForAccept && (
                      <span className={styles.requestPulseRing} aria-hidden="true" />
                    )}
                  </div>
                  <div className={styles.requestBody}>
                    {isLock ? (
                      <>
                        <h4 className={styles.requestTitle}>
                          {consultantName} is ready
                        </h4>
                        <p className={styles.requestSubtitle}>
                          Accept to start your consultation.
                        </p>
                      </>
                    ) : waitingForAccept ? (
                      <>
                        <h4 className={styles.requestTitle}>
                          Waiting for {consultantName}
                        </h4>
                        <p className={styles.requestSubtitle}>
                          They&apos;ve been notified of your request.
                        </p>
                      </>
                    ) : (
                      <>
                        <h4 className={styles.requestTitle}>
                          Start a conversation
                        </h4>
                        <p className={styles.requestSubtitle}>
                          Send a request to {consultantName} to begin.
                        </p>
                      </>
                    )}
                  </div>
                  {isLock ? (
                    <button
                      className={`${styles.requestAction} ${styles.requestActionAccept}`}
                      onClick={() => startCHatHandler()}
                    >
                      Accept chat
                    </button>
                  ) : (
                    <button
                      className={`${styles.requestAction} ${waitingForAccept ? styles.requestActionWaiting : styles.requestActionStart}`}
                      disabled={waitingForAccept}
                      onClick={() => {
                        sendChat("👋 Hi! I'd like to start a consultation.");
                        setWaitingForAccept(true);
                      }}
                    >
                      {waitingForAccept ? `Waiting ${waitCountdown}s` : "Start chat"}
                    </button>
                  )}
                </div>
              </div>
            )}
            <AttachmentComposerPreview
              pending={pendingAttachment}
              onCancel={handleCancelAttachment}
              onRetry={handleRetryAttachment}
            />
            <div className={styles.composerInner}>
              <AttachButton onFileSelected={handleFileSelected} disabled={!canMessage} />
              <input
                onChange={(e) => {
                  setText(e.target.value);
                  handleInputChange(e.target.value);
                }}
                value={text || ""}
                type="text"
                className={styles.composerInput}
                placeholder={canMessage ? "Type a message..." : "Start the chat to send a message"}
                aria-label="Message"
                disabled={!canMessage}
                onFocus={() => scrollToBottom(true)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    console.log("[CHAT DEBUG] enter pressed:", { text, canSend, shiftKey: e.shiftKey });
                  }
                  // Note: this is a single-line <input>, not a <textarea> — it
                  // cannot hold a newline character regardless of this check.
                  // Shift+Enter is still made an explicit no-op here (rather
                  // than sending) so it behaves correctly if this is ever
                  // upgraded to a multi-line composer later.
                  if (e.key === "Enter" && !e.shiftKey && canSend) {
                    handleComposerSend();
                  }
                }}
              />
              <button
                onClick={handleComposerSend}
                className={styles.sendBtn}
                disabled={!canSend}
                aria-label="Send message"
              >
                <svg
                  className={styles.sendIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <ReactToast
        show={showChatEndToast}
        message={endedToastMessage}
        onClose={() => setShowChatEndToast(false)}
      />
      <ReactToast
        show={Boolean(socketErrorMessage)}
        message={socketErrorMessage}
        onClose={() => setSocketErrorMessage(null)}
      />
      <RatingModal
        show={Boolean(ratingPromptTxId)}
        consultationId={ratingPromptTxId}
        consultantName={consultantName}
        consultantAvatar={consultantOverview?.consultant?.profileImage}
        consultationType="chat"
        // Only close the rating popup itself — the chat stays open behind it
        // (showing the ended state) instead of auto-closing/navigating away
        // the moment a rating is skipped or submitted.
        onClose={() => {
          setRatingPromptTxId(null);
        }}
      />
    </Fragment>
  );
};

export default UserChat;
