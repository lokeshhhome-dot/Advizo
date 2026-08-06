import React, { Fragment, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

const UserChat = () => {
  const [text, setText] = useState();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [clientId, setClientId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [show, setShow] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const parms = new URLSearchParams(window.location.search);
  const consultantId = parms.get("consultantId");
  const shop = parms.get("shop");
  const authTokenFromUrl = (parms.get("authToken") || "").trim();
  const customerIdFromUrl = parms.get("customerId") || parms.get("userId");
  const shopIdFromUrl = parms.get("shopid") || parms.get("shopId");

  useEffect(() => {
    // Capture token BEFORE session switch — prepareSessionLogin(USER) clears
    // consultant keys and used to wipe `token` before we could restore it.
    const priorToken = (localStorage.getItem("token") || "").trim();
    const urlToken = authTokenFromUrl;

    prepareSessionLogin(SESSION_TYPES.USER);

    const resolvedClientId =
      customerIdFromUrl || localStorage.getItem("client_u_Identity");
    const resolvedShopId =
      shopIdFromUrl || localStorage.getItem("shop_o_Identity");
    const resolvedToken = urlToken || priorToken;

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
  }, [authTokenFromUrl, customerIdFromUrl, shopIdFromUrl, shop]);

  const token = localStorage.getItem("token") || authTokenFromUrl;

  const { consultantOverview } = useSelector((state) => state.consultants);
  const { chatHistory } = useSelector((state) => state.consultants);
  const { messages: socketMessages } = useSelector((state) => state.socket);
  const imageUrl = getProfileImageUrl(
    consultantOverview?.consultant?.profileImage,
  );
  const [chatMessagesData, setChatMessagesData] = useState([]);
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
  const [isLock, seIsLock] = useState(false);
  const { isPartnerTyping, handleInputChange, stopTyping, partnerLabel } =
    useTypingIndicator({
      senderId: clientId,
      receiverId: consultantId,
      shopId,
      partnerName: consultantOverview?.consultant?.fullname || "Consultant",
    });

  useEffect(() => {
    if (userDetails?.data?.chatLock === "true") {
      setShowChatLock(true);
    } else {
      setShowChatLock(false);
    }
  }, [userDetails, showChatLock]);

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

          const tempMessageIndex = prev.findIndex(
            (msg) =>
              msg._id?.startsWith("temp-") &&
              msg.text === message.text &&
              String(msg.senderId) === messageSenderId,
          );

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

  const sendChat = async (input = "") => {
    const finalMessage = typeof input === "string" ? input : text;

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
      await ensureSocketConnected(clientId, null, 8000, liveToken || null);
    } catch (error) {
      console.error("Failed to connect socket:", error?.message || error);
      alert(
        error?.message ||
          "Unable to connect chat. Please refresh the page and try again.",
      );
      return;
    }

    const messageText =
      (typeof input === "string" && input.trim() ? input : text) ||
      "👋 Hi! I'd like to start a consultation.";

    const messageData = {
      senderId: clientId,
      receiverId: consultantId,
      shop_id: shopId,
      text: messageText,
      timestamp: new Date().toISOString(),
    };

    const optimisticMessage = {
      _id: `temp-${Date.now()}`,
      ...messageData,
    };
    setChatMessagesData((prev) => [...prev, optimisticMessage]);

    socket.emit("sendMessage", messageData);
    setText("");
    stopTyping();

    shouldAutoScrollRef.current = true;
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);
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

  useEffect(() => {
    if (!clientId || !consultantId || !shopId) return;

    const handleDirectMessage = (message) => {
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
          const tempMessageIndex = prev.findIndex(
            (msg) =>
              msg._id?.startsWith("temp-") &&
              msg.text === message.text &&
              String(msg.senderId) === messageSenderId,
          );

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
  const backToViewProfile = () => {
    const targetShop = shop;
    const hostQuery = "";
    // window.top.location.href = `https://${targetShop}/apps/consultly/view-profile?consultantId=${consultantId}&shopId=${shopId}${hostQuery}`;
    window.top.location.href = `https://${targetShop}/apps/consultly`;
  };

  const { chatTimer } = useSelector((state) => state.socket);
  const { autoChatEnded } = useSelector((state) => state.socket);
  const [seconds, setSeconds] = useState(0);

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
    navigate(-1);
  };

  useEffect(() => {
    if (autoChatEnded) {
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
      navigate(-1);
    }
  }, [autoChatEnded]);

  useEffect(() => {
    if (prevIsRunningRef.current === true && chatTimer.isRunning === false) {
      setShowChatEndToast(true);
      seIsLock(false);
      setWaitingForAccept(false);
      navigate(-1);
    }
    prevIsRunningRef.current = chatTimer.isRunning;
  }, [chatTimer.isRunning]);

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

  return (
    <Fragment>
      <InsufficientBalanceModal
        show={show}
        setShow={setShow}
        insufficientBalance={insufficientBalance}
      />

      <div className={styles.chatPageContainer}>
        <div className={styles.container}>
          {/* Chat Window */}
          <div className={styles.chatWindow}>
            <div className={styles.chatWindowContent}>
              {/* Chat Header */}
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderInfo}>
                  <button
                    onClick={() => backToViewProfile()}
                    className={styles.backButton}
                    title="Go Back"
                  >
                    <svg
                      width="20"
                      height="20"
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
                  <div className={styles.avatarWrapper}>
                    <div className={styles.chatHeaderAvatar}>
                      <img
                        src={imageUrl}
                        alt={consultantOverview?.consultant?.fullname || "Consultant"}
                        className={styles.chatHeaderAvatar}
                        onError={handleProfileImageError}
                      />
                    </div>
                    {consultantOverview?.consultant?.isActive && (
                      <div className={styles.onlineIndicator}></div>
                    )}
                  </div>
                  <div>
                    <div className={styles.chatHeaderName}>
                      {consultantOverview?.consultant?.fullname}
                    </div>
                    <div
                      className={styles.chatHeaderStatus}
                      style={{
                        color: consultantOverview?.consultant?.isActive
                          ? "#10b981"
                          : "#6c757d",
                      }}
                    >
                      {consultantOverview?.consultant?.isActive
                        ? "Active now"
                        : "Offline"}
                    </div>
                  </div>
                </div>
                <div className={styles.chatHeaderActions}>
                  {chatTimer.isRunning && (
                    <div className={styles.timerWrap}>
                      <span className={styles.timerPill}>
                        <span className={styles.timerDot} />
                        {minutes}:{String(remainingSeconds).padStart(2, "0")}
                      </span>
                      <button
                        onClick={stopChatTimer}
                        className={styles.stopChatBtn}
                      >
                        Stop Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Area */}
              <div className={styles.messagesArea} ref={messagesAreaRef}>
                {showChatLock && (
                  <div className={styles.chatEndOverlay}>
                    <div className={styles.chatEndBox}>
                      <div
                        style={{
                          position: "relative",
                          width: "44px",
                          height: "44px",
                        }}
                      >
                        <div className={styles.lockIcon}>🔒</div>
                        {waitingForAccept && (
                          <div className={styles.reverseRing}></div>
                        )}
                      </div>
                      <div className={styles.chatEndContent}>
                        <h4>chat unlock </h4>
                        <p>Your chat session has unlocked.</p>
                      </div>
                      {isLock ? (
                        <button
                          style={{
                            marginLeft: "auto",
                            background: "green",
                            color: "#fff",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            width: "100px",
                            fontFamily: "sans-serif",
                          }}
                          onClick={() => {
                            startCHatHandler();
                          }}
                        >
                          Accept chat
                        </button>
                      ) : (
                        <button
                          style={{
                            marginLeft: "auto",
                            background: waitingForAccept ? "gray" : "yellow",
                            color: waitingForAccept ? "#fff" : "#000",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            width: "100px",
                            fontFamily: "sans-serif",
                          }}
                          disabled={waitingForAccept ? true : false}
                          onClick={() => {
                            sendChat("👋 Hi! I'd like to start a consultation.");
                            setWaitingForAccept(true);
                          }}
                        >
                          {waitingForAccept
                            ? `Wait ${waitCountdown}s`
                            : "start chat"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {chatMessagesData.length === 0 ? (
                  <div className={styles.emptyMessages}>
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  <>
                    {chatMessagesData.map((message) => {
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
                          className={`${styles.messageContainer} ${isOwn ? styles.messageContainerRight : styles.messageContainerLeft}`}
                        >
                          <div
                            className={`${styles.messageBubble} ${isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther}`}
                          >
                            {!isOwn && (
                              <div className={styles.messageSender}>
                                {consultantOverview?.consultant?.fullname ||
                                  "Consultant"}
                              </div>
                            )}
                            <div className={styles.messageText}>
                              {message.text}
                            </div>
                            <div className={styles.messageTimestamp}>
                              {timestamp}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <TypingIndicator
                label={partnerLabel}
                visible={isPartnerTyping}
              />

              {/* Message Input */}
              <div className={styles.messageInputArea}>
                <div className={styles.inputGroup}>
                  <button className={styles.attachButton} title="Attach File">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    onChange={(e) => {
                      setText(e.target.value);
                      handleInputChange(e.target.value);
                    }}
                    value={text || ""}
                    type="text"
                    className={styles.messageInput}
                    placeholder="Type a message..."
                    onFocus={() => scrollToBottom(true)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && text?.trim()) {
                        sendChat();
                      }
                    }}
                  />
                  <button
                    onClick={sendChat}
                    className={styles.sendButton}
                    title="Send"
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
        </div>
      </div>
      <ReactToast
        show={showChatEndToast}
        message="Chat ended"
        onClose={() => setShowChatEndToast(false)}
      />
    </Fragment>
  );
};

export default UserChat;
