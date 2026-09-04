import React, { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./ChatsPage.module.css";
import axios from "axios";
import { socket, connectAndRegisterSocket } from "../Sokect-io/SokectConfig";
import { useTypingIndicator } from "../Sokect-io/useTypingIndicator";
import TypingIndicator from "../Sokect-io/TypingIndicator";
import {
  fetchChatHistory,
  updateUserRequestById,
} from "../Redux/slices/ConsultantSlices";
import { useDispatch, useSelector } from "react-redux";
import { addMessage } from "../Redux/slices/sokectSlice";
import { BsThreeDotsVertical } from "react-icons/bs";
import ReactToast from "../AlertModel/ReactToast";
import { toast } from "react-toastify";
import {
  getProfileImageUrl,
  handleProfileImageError,
} from "../../utils/getProfileImageUrl";
import { useConsultantIdentity } from "../../utils/useConsultantIdentity";
import AttachButton from "../ChatAttachments/AttachButton";
import AttachmentComposerPreview from "../ChatAttachments/AttachmentComposerPreview";
import ChatImageMessage from "../ChatAttachments/ChatImageMessage";
import ChatPdfMessage from "../ChatAttachments/ChatPdfMessage";
import OptimisticAttachmentMessage from "../ChatAttachments/OptimisticAttachmentMessage";
import {
  validateAttachmentFile,
  uploadChatAttachment,
} from "../ChatAttachments/chatAttachmentApi";

/* ---------------------------------------------------------------------------
   Pure, stateless presentation helpers — kept outside the component so they
   never re-create on render. None of these touch state/socket/API logic;
   they only reshape data ChatsPage already holds (chatMessagesData timestamps,
   the seconds counter) for display.
--------------------------------------------------------------------------- */

// mm:ss / h:mm:ss — same simple pattern VideoCallingPage.js already uses for
// its own call timer, kept local rather than a new shared util for one value.
const formatSessionDuration = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

const isSameCalendarDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatDayLabel = (date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameCalendarDay(date, today)) return "Today";
  if (isSameCalendarDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
};

// Groups an already-chronological message list into { dayLabel, messages[] }
// buckets so the message list can render one date separator per day instead
// of repeating the date per-message — purely a render-time reshape of
// chatMessagesData, no new data source.
const groupMessagesByDay = (list) => {
  const groups = [];
  list.forEach((message) => {
    const date = new Date(message.timestamp);
    const label = formatDayLabel(date);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ label, messages: [message] });
    }
  });
  return groups;
};

// Inline SVGs replacing the old emoji (💬 / 🔒) used for the chat-request and
// chat-ended states — same visual weight/stroke convention as the other
// icons already in this file (send/attach/back buttons below).
const CHAT_REQUEST_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const CHAT_ENDED_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const ChatsPage = () => {
  const [selectedChat, setSelectedChat] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [showChatView, setShowChatView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [chatMessagesData, setChatMessagesData] = useState([]);
  const [consultantId, setConsultantId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [chaterIds, setChaterIds] = useState(null);
  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const pendingAbortRef = useRef(null);
  const dispatch = useDispatch();
  const { chatHistory } = useSelector((state) => state.consultants);
  const messages = useSelector((state) => state.socket.messages);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [chatAccepted, setChatAccepted] = useState(null);
  const lastNotificationMessageId = useRef(null);
  const lastProcessedMessageId = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const [refreshed, setRefreshed] = useState(false);
  const [userControlMenu, setUserControlMenu] = useState(null);
  const [showChatEndToast, setShowChatEndToast] = useState(false);
  // TEMPORARY (debugging silent send failures): see the matching UserChat.js
  // comment — nothing here listened for the backend's "socket-error" either,
  // so a rejected sendMessage looked identical to Send doing nothing.
  const [socketErrorMessage, setSocketErrorMessage] = useState(null);
  const [showChatEndPop, setShowChatEndPop] = useState(false);
  const prevIsRunningRef = useRef(null);
  const { userInRequest } = useSelector((state) => state.consultants);
  const { chatTimer } = useSelector((state) => state.socket);
  const [seconds, setSeconds] = useState(0);
  // Snapshot of `seconds` at the moment a session ends, purely for the
  // "Consultation ended" state's duration display — see stopChatTimer and
  // the chatTimer.isRunning effect below.
  const [lastSessionSeconds, setLastSessionSeconds] = useState(0);
  // Seconds left after clicking "Accept Chat" while the user still has to
  // press their confirm button; null = not waiting. Reverts to the plain
  // "Accept Chat" button at zero so the consultant can accept again.
  const ACCEPT_WAIT_SECONDS = 30;
  const [acceptCountdown, setAcceptCountdown] = useState(null);
  const [selectChatUser, setSelectChatUser] = useState(null);
  const isActiveChatUser = localStorage.getItem("activeChatUserId");
  const token = localStorage.getItem("token");
  const shop = localStorage.getItem("shop");

  // Server-derived identity (Redux, populated from the verified JWT) with a
  // localStorage fallback for renders before verifyToken resolves.
  const identity = useConsultantIdentity();
  useEffect(() => {
    setConsultantId(identity.consultantId);
    setShopId(identity.shopId);
  }, [identity.consultantId, identity.shopId]);

  useEffect(() => {
    if (chatTimer.isRunning) {
      localStorage.setItem("activeChatUserId", chatTimer.userId);
    }
  }, [chatTimer.isRunning]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) {
        setShowChatView(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const scrollToBottom = (behavior = "auto") => {
    if (messagesAreaRef.current) {
      messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (chatHistory?.chatHistory) {
      setChatMessagesData(chatHistory.chatHistory);
      lastProcessedMessageId.current = null;
      setTimeout(() => {
        scrollToBottom("auto");
      }, 300);
    }
  }, [chatHistory]);

  useEffect(() => {
    if (chatMessagesData.length > 0 && messagesAreaRef.current) {
      setTimeout(() => {
        scrollToBottom("auto");
      }, 100);
    }
  }, [chatMessagesData]);

  useEffect(() => {
    if (!chaterIds || !consultantId || !messages.length) return;

    const latestMessage = messages[messages.length - 1];

    if (latestMessage._id === lastProcessedMessageId.current) return;

    const isCurrentChatMessage =
      String(latestMessage.shop_id) === String(chaterIds.shopId) &&
      ((String(latestMessage.senderId) === String(chaterIds.userId) &&
        String(latestMessage.receiverId) === String(consultantId)) ||
        (String(latestMessage.senderId) === String(consultantId) &&
          String(latestMessage.receiverId) === String(chaterIds.userId)));

    if (isCurrentChatMessage) {
      lastProcessedMessageId.current = latestMessage._id;
      setChatMessagesData((prev) => {
        const messageExists = prev.some((msg) => msg._id === latestMessage._id);
        if (messageExists) {
          return prev;
        }
        const tempMessageIndex = prev.findIndex((msg) => {
          if (!msg._id?.startsWith("temp-")) return false;
          if (msg.tempId && latestMessage.tempId) return msg.tempId === latestMessage.tempId;
          return (
            msg.text === latestMessage.text &&
            String(msg.senderId) === String(latestMessage.senderId)
          );
        });

        if (tempMessageIndex !== -1) {
          const newMessages = [...prev];
          newMessages[tempMessageIndex] = latestMessage;
          return newMessages;
        }

        return [...prev, latestMessage];
      });
    }
  }, [messages, chaterIds, consultantId]);

  useEffect(() => {
    if (selectedChat && chatList.length > 0) {
      const conversation = chatList.find((conv) => conv.id === selectedChat);
      console.log(conversation);
      if (conversation) {
      }
    }
  }, [selectedChat]);

  const handleBackToList = () => {
    setShowChatView(false);
    // Closing the chat view means no chat is open anymore — clear the open
    // chat marker so new messages from this user ring/notify again.
    setChaterIds(null);
    setSelectedChat(null);
    localStorage.removeItem("___U-B");
  };

  const selectedConversation = chaterIds
    ? chatList.find(
      (conv) =>
        String(conv.sender?.id) === String(chaterIds.userId) &&
        String(conv.shop?.id) === String(chaterIds.shopId),
    )
    : chatList.find((conv) => conv.id === selectedChat);

  const { isPartnerTyping, handleInputChange, stopTyping, partnerLabel } =
    useTypingIndicator({
      senderId: consultantId,
      receiverId: chaterIds?.userId,
      shopId: chaterIds?.shopId || shopId,
      partnerName: selectedConversation?.sender?.fullname || "User",
    });

  useEffect(() => {
    if (selectedConversation) {
      setSelectChatUser(selectedConversation.sender.id);
      localStorage.setItem("___U-B", selectedConversation.sender.id);
    }
  }, [selectedConversation]);

  // Leaving the chats page closes whatever chat was open — without this the
  // stale "___U-B" marker kept suppressing the ringtone for that user.
  useEffect(() => {
    return () => {
      localStorage.removeItem("___U-B");
    };
  }, []);

  useEffect(() => {
    if (!chaterIds?.userId || !consultantId) return;

    socket.emit("markSeen", {
      senderId: chaterIds.userId,
      receiverId: consultantId,
    });
  }, [chaterIds?.userId, consultantId, chatHistory]);

  const getChatList = async () => {
    if (!shopId || !consultantId) return;

    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/get/chat-list/${shopId}/${consultantId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (response.data?.payload) {
        setChatList(response.data.payload);
        if (response.data.payload.length > 0) {
          const firstChat = response.data.payload[0];
          // setSelectedChat(firstChat.id);
        }
      }
    } catch (error) {
      if (error.response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        window.location.href = `https://${shop}/apps/consultly/login`;
      }
      console.log("error", error);
    }
  };

  useEffect(() => {
    getChatList();
  }, [messages, userInRequest, shopId, consultantId, chatAccepted, refreshed]);

  const sendChat = () => {
    console.log("[CHAT DEBUG] send clicked:", { text, chaterIds, socketConnected: socket.connected });
    if (text.trim() === "" || !chaterIds) return;
    if (!socket.connected) {
      console.warn("Socket not connected, attempting to reconnect...");
      connectAndRegisterSocket();
      setTimeout(() => {
        if (socket.connected) {
          sendMessage();
        } else {
          console.error("Failed to connect socket");
        }
      }, 1000);
      return;
    }

    sendMessage();

    function sendMessage() {
      const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const messageData = {
        senderId: consultantId || consultantId,
        receiverId: chaterIds?.userId,
        shop_id: shopId || chaterIds?.shopId,
        text: text,
        timestamp: new Date().toISOString(),
        tempId,
      };
      console.log("[CHAT DEBUG] emitting sendMessage:", messageData);
      socket.emit("sendMessage", messageData);
      setText("");
      stopTyping();
      dispatch(addMessage({ _id: `temp-${Date.now()}`, ...messageData }));
    }
  };

  const handleFileSelected = (file) => {
    const validation = validateAttachmentFile(file);
    if (!validation.valid) {
      toast.error(validation.reason);
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
      const uploadedMeta = await uploadChatAttachment({
        shopId: shopId || chaterIds?.shopId,
        userId: chaterIds?.userId,
        consultantId,
        file,
        token,
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

  const sendAttachmentMessage = () => {
    if (!pendingAttachment || pendingAttachment.status !== "ready" || !chaterIds) return;

    if (!socket.connected) {
      console.warn("Socket not connected, attempting to reconnect...");
      connectAndRegisterSocket();
      setTimeout(() => {
        if (socket.connected) sendAttachmentMessage();
        else console.error("Failed to connect socket");
      }, 1000);
      return;
    }

    const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const messageData = {
      senderId: consultantId,
      receiverId: chaterIds?.userId,
      shop_id: shopId || chaterIds?.shopId,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      attachment: pendingAttachment.uploadedMeta,
      tempId,
    };

    socket.emit("sendMessage", messageData);
    setText("");
    stopTyping();
    dispatch(
      addMessage({
        _id: `temp-${Date.now()}`,
        ...messageData,
        messageType: "attachment",
        localPreviewUrl: pendingAttachment.previewUrl,
      }),
    );
    setPendingAttachment(null);
  };

  const handleComposerSend = () => {
    if (pendingAttachment) {
      sendAttachmentMessage();
    } else {
      sendChat();
    }
  };

  const isAttachmentBusy = pendingAttachment?.status === "uploading";
  const canSend =
    Boolean(chaterIds) &&
    !isAttachmentBusy &&
    (Boolean(text.trim()) || pendingAttachment?.status === "ready");

  useEffect(() => {
    if (messages && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];

      if (latestMessage._id === lastNotificationMessageId.current) return;

      const isIncomingMessage =
        String(latestMessage.senderId) !== String(consultantId);

      let isCurrentChatMessage = true;
      if (chaterIds) {
        isCurrentChatMessage =
          String(latestMessage.shop_id) === String(chaterIds.shopId) &&
          ((String(latestMessage.senderId) === String(chaterIds.userId) &&
            String(latestMessage.receiverId) === String(consultantId)) ||
            (String(latestMessage.senderId) === String(consultantId) &&
              String(latestMessage.receiverId) === String(chaterIds.userId)));
      }

      if (isIncomingMessage) {
        const senderConversation = chatList.find(
          (conv) =>
            conv.sender?.id === latestMessage.senderId &&
            conv.shop?.id === latestMessage.shop_id,
        );

        const senderName = senderConversation?.sender?.fullname || "User";
        const senderAvatar = getProfileImageUrl(
          senderConversation?.sender?.profileImage,
        );

        setNotificationMessage({
          senderName: senderName,
          text: latestMessage.text,
          avatar: senderAvatar,
        });

        setShowNotification(true);

        lastNotificationMessageId.current = latestMessage._id;

        setTimeout(() => {
          setShowNotification(false);
        }, 5000);
      }
    }
  }, [messages, consultantId, chaterIds, chatList]);

  const updateUser = (conversation) => {
    dispatch(
      updateUserRequestById({
        shopId: conversation.shop.id,
        userId: conversation.sender.id,
        consultantId: consultantId,
        token: token,
        shop: shop,
      }),
    );
    setUserControlMenu(null);
    setRefreshed((prev) => !prev);
  };

  const isRequestModalOpen = chatList.filter(
    (conversation) => conversation.isRequest === false,
  );
  const isRequestModalCloseAll = chatList.filter(
    (conversation) => conversation.isRequest === true,
  );
  // Search + "unread only" are purely additive, client-side view filters over
  // the same real list above — they never change which conversations count
  // as requests vs. active.
  const isRequestModalClose = isRequestModalCloseAll.filter((conversation) => {
    if (unreadOnly && !(conversation.unreadCount > 0)) return false;
    if (
      searchQuery &&
      !conversation.sender?.fullname?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleChatSelect = (chatData) => {
    setChaterIds(chatData);
    setChatAccepted(chatData);
    // Opening the chat marks messages seen (markSeen below) — clear the
    // unread badge immediately instead of waiting for the next refetch.
    setChatList((prev) =>
      prev.map((c) =>
        String(c.sender?.id) === String(chatData.userId)
          ? { ...c, unreadCount: 0 }
          : c,
      ),
    );
    const conversation = chatList.find(
      (conv) =>
        conv.sender?.id === chatData.userId &&
        conv.shop?.id === chatData.shopId,
    );

    if (conversation) {
      setSelectedChat(conversation.id);
      if (isMobile) {
        setShowChatView(true);
      }
      window.scrollTo(0, 0);
      dispatch(
        fetchChatHistory({
          shopId: chatData.shopId,
          userId: chatData.userId,
          consultantId: consultantId,
        }),
      );
    }
  };

  // Bumped when a message-notification popup is clicked while this page is
  // already mounted, so the pending-chat effect below re-runs and opens it.
  const [pendingChatTick, setPendingChatTick] = useState(0);
  useEffect(() => {
    const onPendingChat = () => setPendingChatTick((t) => t + 1);
    window.addEventListener("consultly:pending-chat", onPendingChat);
    return () =>
      window.removeEventListener("consultly:pending-chat", onPendingChat);
  }, []);

  useEffect(() => {
    const pendingUserId = localStorage.getItem("consultly_pending_chat_user");
    if (!pendingUserId || !chatList.length || !shopId) return;

    const conversation = chatList.find(
      (conv) => String(conv.sender?.id) === String(pendingUserId),
    );

    if (conversation) {
      handleChatSelect({
        shopId: conversation.shop.id,
        userId: conversation.sender.id,
        isChatAccepted: conversation.isChatAccepted,
      });
      localStorage.removeItem("consultly_pending_chat_user");
    }
  }, [chatList, shopId, consultantId, isMobile, dispatch, pendingChatTick]);

  const acceptUserChat = (data) => {
    if (!data || !consultantId) return;
    if (acceptCountdown !== null) return; // already waiting for the user
    const acceptDataIds = {
      userId: data.userId,
      shopId: data.shopId,
      consultantId: consultantId,
    };
    socket.emit("conFirmChatEmit", acceptDataIds);
    // socket.emit("acceptUserChat", acceptDataIds);
    setChatAccepted((prev) => !prev);
    setAcceptCountdown(ACCEPT_WAIT_SECONDS);
  };

  useEffect(() => {
    if (acceptCountdown === null) return;
    // User confirmed — chat timer started, no need to keep counting.
    if (chatTimer.isRunning) {
      setAcceptCountdown(null);
      return;
    }
    if (acceptCountdown <= 0) {
      setAcceptCountdown(null);
      return;
    }
    const timeout = setTimeout(
      () => setAcceptCountdown((prev) => (prev === null ? null : prev - 1)),
      1000,
    );
    return () => clearTimeout(timeout);
  }, [acceptCountdown, chatTimer.isRunning]);

  useEffect(() => {
    if (socket) {
      socket.on("userChatAccepted", (response) => {
        console.log("acceptUserChat", response);
      });
    }
  }, [socket]);

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
    if (!chatTimer.isRunning || !chatTimer.startTime) return;
    const interval = setInterval(() => {
      const diff = Math.floor(
        (Date.now() - new Date(chatTimer.startTime)) / 1000,
      );
      setSeconds(diff);
    }, 1000);
    if (chatTimer?.isRunning === false) {
      setChatAccepted((prev) => !prev);
      localStorage.removeItem("activeChatUserId");
    }

    return () => clearInterval(interval);
  }, [chatTimer.isRunning, chatTimer.startTime]);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const stopChatTimer = () => {
    // Captured before the reset below so the redesigned "Consultation
    // ended" state can show the real elapsed time (section 7 of the brief)
    // instead of always reading 0 — purely a display snapshot, the
    // endChat socket payload/contract right below is unchanged.
    setLastSessionSeconds(seconds);
    socket.emit("endChat", {
      transactionId: chatTimer.transactionId,
      startTime: chatTimer.startTime,
      isRunning: chatTimer.isRunning,
      shopId: chatTimer.shopId,
      userId: chaterIds?.userId,
      consultantId: consultantId,
    });
    setSeconds(0);
    setRefreshed((prev) => !prev);
    getChatList();
    setShowChatEndPop(true);
    localStorage.removeItem("chatTimer");
    localStorage.removeItem("___U-B");
  };
  const handlerUserControlMenu = (conversation) => {
    setUserControlMenu((prev) =>
      prev === conversation?.chatListId ? null : conversation?.chatListId,
    );
  };

  const HandleRemoveUser = async (conversation) => {
    const senderId = conversation?.sender?.id;
    console.log("senderId", senderId)
    try {
      // This route is protected by authenticateToken — without the Bearer
      // header the request always 401'd and the delete silently failed.
      const response = await axios.delete(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/remove/user/chat-list/${conversation.chatListId}/${senderId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 200 || response.status === 204) {
        setUserControlMenu(null);
        setChatList((prev) =>
          prev.filter((c) => c.chatListId !== conversation.chatListId),
        );
        // If the deleted conversation was open, close the chat view.
        if (String(chaterIds?.userId) === String(senderId)) {
          setChaterIds(null);
          setSelectedChat(null);
          setShowChatView(false);
          localStorage.removeItem("___U-B");
        }
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        window.location.href = `https://${shop}/apps/consultly/login`;
        return;
      }
      console.log("error", error);
    }
  };
  useEffect(() => {
    if (prevIsRunningRef.current === true && chatTimer.isRunning === false) {
      // Same duration snapshot as stopChatTimer, for the case where the
      // session ends without this consultant clicking "Stop Chat"
      // themselves (other party ended it / server timeout).
      setLastSessionSeconds(seconds);
      setShowChatEndToast(true);
      getChatList();
      setShowChatEndPop(true);
      localStorage.removeItem("activeChatUserId");
    }
    prevIsRunningRef.current = chatTimer.isRunning;
  }, [chatTimer.isRunning, seconds]);

  useEffect(() => {
    if (chatTimer.isRunning) {
      localStorage.setItem("chatTimer", JSON.stringify(chatTimer));
    }
  }, [chatTimer.isRunning]);

  const currentUserId = localStorage.getItem("activeChatUserId");

  const hasMatchedUser = isRequestModalClose?.some(
    (conv) => conv?.sender?.id === currentUserId,
  );

  const messageGroups = groupMessagesByDay(chatMessagesData);

  return (
    <Fragment>
      <div className={styles.workspace}>
        {/* ------------------------------ CONVERSATION RAIL ----------------------------- */}
        <aside className={`${styles.rail} ${showChatView ? styles.hideOnMobile : ""}`}>
          <div className={styles.railTop}>
            <h1 className={styles.railTitle}>Conversations</h1>
            <div className={styles.railSearch}>
              <svg className={styles.railSearchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                className={styles.railSearchInput}
                placeholder="Search conversations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search conversations"
              />
            </div>

            <div className={styles.railTabRow}>
              <div className={styles.railTabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showRequestModal}
                  className={`${styles.railTab} ${!showRequestModal ? styles.railTabActive : ""}`}
                  onClick={() => setShowRequestModal(false)}
                >
                  Active
                </button>
                {isRequestModalOpen.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showRequestModal}
                    className={`${styles.railTab} ${showRequestModal ? styles.railTabActive : ""}`}
                    onClick={() => setShowRequestModal(true)}
                  >
                    Requests <span className={styles.railTabCount}>{isRequestModalOpen.length}</span>
                  </button>
                )}
              </div>
              {!showRequestModal ? (
                <button
                  type="button"
                  className={`${styles.railUnreadToggle} ${unreadOnly ? styles.railUnreadToggleActive : ""}`}
                  onClick={() => setUnreadOnly((v) => !v)}
                  aria-pressed={unreadOnly}
                >
                  Unread
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.railList}>
            {showRequestModal ? (
              isRequestModalOpen.length === 0 ? (
                <div className={styles.railEmpty}>
                  <p className={styles.railEmptyText}>New consultation requests will appear here.</p>
                </div>
              ) : (
                isRequestModalOpen.map((conversation) => {
                  const updatedAt = new Date(conversation?.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });
                  return (
                    <div key={conversation.id} className={styles.requestRow}>
                      <div className={styles.threadAvatarWrap}>
                        <img
                          src={getProfileImageUrl(conversation?.sender?.profileImage)}
                          onError={handleProfileImageError}
                          alt=""
                          className={styles.threadAvatar}
                        />
                        {conversation.isActive && <span className={styles.threadOnlineDot} />}
                      </div>
                      <div className={styles.threadBody}>
                        <div className={styles.threadTopRow}>
                          <span className={styles.threadName}>{conversation.sender?.fullname}</span>
                          <span className={styles.threadTime}>{updatedAt}</span>
                        </div>
                        <p className={styles.threadPreview}>{conversation?.lastMessage}</p>
                      </div>
                      <div className={styles.requestRowActions}>
                        <button
                          type="button"
                          className={styles.requestAcceptBtn}
                          onClick={() => {
                            updateUser(conversation);
                            setShowRequestModal(!showRequestModal);
                          }}
                        >
                          Accept
                        </button>
                        <div className={styles.threadMenuWrapper}>
                          <button
                            type="button"
                            className={styles.threadMenuBtn}
                            aria-label="More options"
                            onClick={() => handlerUserControlMenu(conversation)}
                          >
                            <BsThreeDotsVertical />
                          </button>
                          {userControlMenu === conversation?.chatListId && (
                            <div className={styles.threadMenu} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className={styles.threadMenuItem}
                                onClick={() => {
                                  updateUser(conversation);
                                  setShowRequestModal(false);
                                }}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className={styles.threadMenuItem}
                                onClick={() => HandleRemoveUser(conversation)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : isRequestModalCloseAll.length === 0 ? (
              <div className={styles.railEmpty}>
                <svg className={styles.railEmptyIcon} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className={styles.railEmptyText}>Your conversations will appear here</p>
              </div>
            ) : isRequestModalClose.length === 0 ? (
              <div className={styles.railEmpty}>
                <svg className={styles.railEmptyIcon} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <p className={styles.railEmptyText}>No conversations match your filters</p>
              </div>
            ) : (
              isRequestModalClose.map((conversation) => {
                const updatedAt = new Date(conversation?.updatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
                const isMatchedUser = conversation?.sender?.id === currentUserId;
                const shouldDisable = hasMatchedUser && !isMatchedUser;

                return (
                  <div
                    key={conversation.id}
                    onClick={() => {
                      if (shouldDisable) return;
                      handleChatSelect({
                        shopId: conversation.shop.id,
                        userId: conversation.sender.id,
                        isChatAccepted: conversation.isChatAccepted,
                      });
                    }}
                    className={`${styles.threadRow} ${shouldDisable ? styles.threadRowDisabled : ""} ${isMatchedUser ? styles.threadRowActive : ""}`}
                  >
                    <div className={styles.threadAvatarWrap}>
                      <img
                        src={getProfileImageUrl(conversation?.sender?.profileImage)}
                        onError={handleProfileImageError}
                        alt=""
                        className={styles.threadAvatar}
                      />
                      {conversation.sender.isActive && <span className={styles.threadOnlineDot} />}
                    </div>
                    <div className={styles.threadBody}>
                      <div className={styles.threadTopRow}>
                        <span className={styles.threadName}>
                          {conversation.sender?.fullname}
                          {conversation.unreadCount > 0 && (
                            <span className={styles.threadUnreadBadge}>
                              {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                            </span>
                          )}
                        </span>
                        <span className={styles.threadTime}>{updatedAt}</span>
                      </div>
                      <div className={styles.threadBottomRow}>
                        <p className={`${styles.threadPreview} ${conversation.unreadCount > 0 ? styles.threadPreviewUnread : ""}`}>
                          {conversation?.lastMessage}
                        </p>
                        <div className={styles.threadMenuWrapper}>
                          <button
                            type="button"
                            className={styles.threadMenuBtn}
                            aria-label="More options"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserControlMenu((prev) =>
                                prev === conversation?.chatListId ? null : conversation?.chatListId,
                              );
                            }}
                          >
                            <BsThreeDotsVertical />
                          </button>
                          {userControlMenu === conversation?.chatListId && (
                            <div className={styles.threadMenu} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className={styles.threadMenuItem}
                                onClick={() => HandleRemoveUser(conversation)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`${styles.threadStatus} ${conversation.isOnline ? styles.threadStatusOnline : styles.threadStatusOffline}`}>
                        {conversation.lastActive}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ---------------------------- CONVERSATION WORKSPACE --------------------------- */}
        <section className={`${styles.conversation} ${!showChatView ? styles.hideOnMobile : ""}`}>
          {selectedConversation ? (
            <>
              <header className={styles.conversationBar}>
                <button
                  type="button"
                  className={styles.conversationBack}
                  onClick={handleBackToList}
                  aria-label="Back to conversations"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className={styles.conversationIdentity}>
                  <div className={styles.threadAvatarWrap}>
                    <img
                      src={getProfileImageUrl(selectedConversation?.sender?.profileImage)}
                      onError={handleProfileImageError}
                      alt=""
                      className={styles.conversationAvatarImg}
                    />
                    {selectedConversation?.sender.isActive && <span className={styles.threadOnlineDot} />}
                  </div>
                  <span className={styles.conversationName}>
                    {selectedConversation?.sender?.fullname || "User"}
                  </span>
                </div>

                {chatTimer.isRunning && isActiveChatUser === selectChatUser && (
                  <div className={styles.sessionPill}>
                    <span className={styles.sessionDot} />
                    <span className={styles.sessionTime}>
                      {minutes}:{String(remainingSeconds).padStart(2, "0")}
                    </span>
                    <button type="button" onClick={stopChatTimer} className={styles.sessionEndBtn}>
                      End
                    </button>
                  </div>
                )}
              </header>

              <div className={styles.messageStream} ref={messagesAreaRef}>
                {showChatEndPop ? (
                  <div className={styles.stateCard}>
                    <span className={styles.stateCardIcon}>{CHAT_ENDED_ICON}</span>
                    <h3 className={styles.stateCardTitle}>Consultation ended</h3>
                    <p className={styles.stateCardText}>
                      Session with {selectedConversation?.sender?.fullname || "this client"} lasted{" "}
                      {formatSessionDuration(lastSessionSeconds)}.
                    </p>
                    <button type="button" onClick={() => setShowChatEndPop(false)} className={styles.stateCardAction}>
                      Done
                    </button>
                  </div>
                ) : !chatTimer.isRunning &&
                  (selectedConversation?.isChatAccepted === "request" ||
                    chatAccepted?.isChatAccepted === "request") ? (
                  <div className={styles.stateCard}>
                    <span className={`${styles.stateCardIcon} ${styles.stateCardIconAccent}`}>{CHAT_REQUEST_ICON}</span>
                    <h3 className={styles.stateCardTitle}>New consultation request</h3>
                    <p className={styles.stateCardText}>
                      {acceptCountdown !== null
                        ? "Accepted — waiting for the client to confirm"
                        : "A client wants to start a conversation with you"}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        acceptUserChat({
                          userId: chaterIds?.userId || selectedConversation?.sender?.id,
                          shopId: chaterIds?.shopId || selectedConversation?.shop?.id || shopId,
                        })
                      }
                      className={`${styles.stateCardAction} ${styles.stateCardActionPrimary} ${acceptCountdown !== null ? styles.stateCardActionWaiting : ""}`}
                      disabled={acceptCountdown !== null}
                    >
                      {acceptCountdown !== null ? `Waiting… ${acceptCountdown}s` : "Accept request"}
                    </button>
                  </div>
                ) : chatMessagesData.length === 0 ? (
                  <div className={styles.streamEmpty}>
                    <p className={styles.streamEmptyTitle}>Start the conversation</p>
                    <p className={styles.streamEmptyText}>Send the first message to begin.</p>
                  </div>
                ) : (
                  <>
                    {messageGroups.map((group, groupIndex) => (
                      <Fragment key={`${group.label}-${groupIndex}`}>
                        <div className={styles.daySeparator}>
                          <span className={styles.daySeparatorLabel}>{group.label}</span>
                        </div>
                        {group.messages.map((message) => {
                          const isOwn = message.senderId === consultantId;
                          const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          });

                          return (
                            <div
                              key={message._id}
                              className={`${styles.bubbleRow} ${isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther}`}
                            >
                              <div className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleOther}`}>
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
                                      <p className={styles.bubbleText}>{message.text}</p>
                                    ) : null}
                                  </>
                                ) : (
                                  <p className={styles.bubbleText}>{message.text}</p>
                                )}
                                <span className={styles.bubbleTime}>{timestamp}</span>
                              </div>
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <TypingIndicator label={partnerLabel} visible={isPartnerTyping} />

              <div className={styles.composer}>
                <AttachmentComposerPreview
                  pending={pendingAttachment}
                  onCancel={handleCancelAttachment}
                  onRetry={handleRetryAttachment}
                />
                <div className={styles.composerGroup}>
                  <AttachButton
                    onFileSelected={handleFileSelected}
                    disabled={!chaterIds}
                    className={styles.composerAttach}
                  />
                  <input
                    onChange={(e) => {
                      setText(e.target.value);
                      handleInputChange(e.target.value);
                    }}
                    value={text}
                    type="text"
                    className={styles.composerInput}
                    placeholder="Type a message…"
                    aria-label="Message"
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        console.log("[CHAT DEBUG] enter pressed:", { text, canSend });
                      }
                      if (e.key === "Enter" && canSend) {
                        handleComposerSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleComposerSend}
                    className={styles.composerSend}
                    title="Send"
                    aria-label="Send message"
                    disabled={!canSend}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.streamEmpty}>
              <svg className={styles.streamEmptyIcon} width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className={styles.streamEmptyTitle}>Select a conversation</p>
              <p className={styles.streamEmptyText}>Choose a conversation from the list to continue.</p>
            </div>
          )}
        </section>
      </div>
      <ReactToast
        show={showChatEndToast}
        message="Chat ended"
        onClose={() => setShowChatEndToast(false)}
      />
      <ReactToast
        show={Boolean(socketErrorMessage)}
        message={socketErrorMessage}
        onClose={() => setSocketErrorMessage(null)}
      />
    </Fragment>
  );
};

export default ChatsPage;
