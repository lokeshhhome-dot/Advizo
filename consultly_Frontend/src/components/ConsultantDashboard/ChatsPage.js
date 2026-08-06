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
  const dispatch = useDispatch();
  const { chatHistory } = useSelector((state) => state.consultants);
  const messages = useSelector((state) => state.socket.messages);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [chatAccepted, setChatAccepted] = useState(null);
  const lastNotificationMessageId = useRef(null);
  const lastProcessedMessageId = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const [refreshed, setRefreshed] = useState(false);
  const [userControlMenu, setUserControlMenu] = useState(null);
  const [showChatEndToast, setShowChatEndToast] = useState(false);
  const [showChatEndPop, setShowChatEndPop] = useState(false);
  const prevIsRunningRef = useRef(null);
  const { userInRequest } = useSelector((state) => state.consultants);
  const { chatTimer } = useSelector((state) => state.socket);
  const [seconds, setSeconds] = useState(0);
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
        const tempMessageIndex = prev.findIndex(
          (msg) =>
            msg._id?.startsWith("temp-") &&
            msg.text === latestMessage.text &&
            String(msg.senderId) === String(latestMessage.senderId),
        );

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

  const filteredConversations = chatList.filter((conv) =>
    conv.sender?.fullname?.toLowerCase().includes(searchQuery.toLowerCase()),
  );
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
      const messageData = {
        senderId: consultantId || consultantId,
        receiverId: chaterIds?.userId,
        shop_id: shopId || chaterIds?.shopId,
        text: text,
        timestamp: new Date().toISOString(),
      };
      socket.emit("sendMessage", messageData);
      setText("");
      stopTyping();
      dispatch(addMessage(messageData));
    }
  };

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
  const isRequestModalClose = chatList.filter(
    (conversation) => conversation.isRequest === true,
  );

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
      setShowChatEndToast(true);
      getChatList();
      setShowChatEndPop(true);
      localStorage.removeItem("activeChatUserId");
    }
    prevIsRunningRef.current = chatTimer.isRunning;
  }, [chatTimer.isRunning]);

  useEffect(() => {
    if (chatTimer.isRunning) {
      localStorage.setItem("chatTimer", JSON.stringify(chatTimer));
    }
  }, [chatTimer.isRunning]);

  const currentUserId = localStorage.getItem("activeChatUserId");

  const hasMatchedUser = isRequestModalClose?.some(
    (conv) => conv?.sender?.id === currentUserId,
  );

  return (
    <Fragment>
      <div className={styles.pageContainer}>
        <div className={styles.headerSection}>
          <h1 className={styles.pageTitle}>Messages</h1>
          <p className={styles.pageDescription}>
            Communicate with clients and manage your conversations.
          </p>
        </div>
        <div className={styles.chatLayout}>
          {/* Conversations Sidebar */}
          <div
            className={`${styles.conversationsSidebar} ${showChatView ? styles.hideOnMobile : ""}`}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              {/* Search Bar */}
              <div className={styles.searchBar}>
                <div className={styles.searchInputWrapper}>
                  <svg
                    className={styles.searchIcon}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "end",
                }}
              >
                {isRequestModalOpen.length > 0 && (
                  <p
                    onClick={() => setShowRequestModal(!showRequestModal)}
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      padding: "10px",
                      cursor: "pointer",
                    }}
                  >
                    {" "}
                    <span style={{ color: "#63ba77" }}> New Request</span> (
                    {isRequestModalOpen.length})
                  </p>
                )}
              </div>
              {showRequestModal ? (
                isRequestModalOpen?.map((conversation) => {
                  const updatedAt = new Date(
                    conversation?.updatedAt,
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });
                  return (
                    <Fragment>
                      <div
                        key={conversation.id}
                        className={`${styles.conversationItem} ${selectedChat === conversation.id ? styles.conversationItemActive : ""}`}
                      >
                        <div className={styles.conversationContent}>
                          <div className={styles.avatarWrapper}>
                            <img
                              src={getProfileImageUrl(
                                conversation?.sender?.profileImage,
                              )}
                              onError={handleProfileImageError}
                              alt="profile"
                              className={styles.conversationAvatar}
                            />
                            {conversation.isActive && (
                              <div className={styles.onlineIndicator}></div>
                            )}
                          </div>
                          <div className={styles.conversationDetails}>
                            <div
                              className={`${styles.conversationHeader} ${styles.flexBetween} ${styles.flexStart}`}
                            >
                              <div className={styles.conversationName}>
                                {conversation.sender?.fullname}
                              </div>
                              <div className={styles.conversationTimestamp}>
                                {updatedAt}
                              </div>
                            </div>
                            <div
                              className={`${styles.conversationMessage} ${styles.flexBetween} ${styles.flexCenter}`}
                            >
                              <div className={styles.messageText}>
                                {conversation?.lastMessage}
                              </div>

                              <div className={styles.moreMenuWrapper}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "10px",
                                  }}
                                >
                                  <button
                                    type="button"
                                    style={{
                                      padding: "5px 12px",
                                      backgroundColor: "green",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                    }}
                                    onClick={() => {
                                      updateUser(conversation);
                                      setShowRequestModal(!showRequestModal);
                                    }}
                                  >
                                    add
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.unreadBadgeIcon}
                                    onClick={(e) => {
                                      handlerUserControlMenu(conversation);
                                    }}
                                  >
                                    <BsThreeDotsVertical />
                                  </button>
                                </div>
                                {userControlMenu ===
                                  conversation?.chatListId && (
                                    <div
                                      className={styles.moreMenu}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        className={styles.moreMenuItem}
                                        onClick={() => {
                                          updateUser(conversation);
                                          setShowRequestModal(false);
                                        }}
                                      >
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.moreMenuItem}
                                        onClick={() => {
                                          HandleRemoveUser(conversation);
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  );
                })
              ) : (
                <div className={styles.conversationsList}>
                  {isRequestModalClose.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div>
                        <svg
                          className={styles.emptyIcon}
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <p className={styles.emptyText}>
                          Loading conversations...
                        </p>
                      </div>
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div>
                        <svg
                          className={styles.emptyIcon}
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <p className={styles.emptyText}>
                          No conversations found
                        </p>
                      </div>
                    </div>
                  ) : (
                    isRequestModalClose?.map((conversation) => {
                      const updatedAt = new Date(
                        conversation?.updatedAt,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      const isChatAccepted = conversation?.isChatAccepted;
                      const isMatchedUser =
                        conversation?.sender?.id === currentUserId;

                      const shouldDisable = hasMatchedUser && !isMatchedUser;
                      return (
                        <Fragment>
                          <div
                            style={{
                              backgroundColor: shouldDisable
                                ? "transparent"
                                : "rgba(74, 144, 226, 0.1)",
                              margin: "4px",
                              borderRadius: "11px",
                            }}
                            key={conversation.id}
                            onClick={() => {
                              if (shouldDisable) return;
                              handleChatSelect({
                                shopId: conversation.shop.id,
                                userId: conversation.sender.id,
                                isChatAccepted: conversation.isChatAccepted,
                              });
                            }}
                            className={`${styles.conversationItem} 
                            ${shouldDisable ? styles.disabledItem : ""}
                            ${isMatchedUser ? styles.conversationItemActive : ""}
                          `}
                          >
                            <div className={styles.conversationContent}>
                              <div className={styles.avatarWrapper}>
                                <img
                                  src={getProfileImageUrl(
                                    conversation?.sender?.profileImage,
                                  )}
                                  onError={handleProfileImageError}
                                  alt={conversation?.sender?.fullname || "User"}
                                  className={styles.conversationAvatar}
                                />
                                {conversation.sender.isActive && (
                                  <div className={styles.onlineIndicator}></div>
                                )}
                              </div>
                              <div className={styles.conversationDetails}>
                                <div
                                  className={`${styles.conversationHeader} ${styles.flexBetween} ${styles.flexStart}`}
                                >
                                  <div className={styles.conversationName}>
                                    {conversation.sender?.fullname}
                                    {conversation.unreadCount > 0 && (
                                      <span className={styles.unreadCountBadge}>
                                        {conversation.unreadCount > 9
                                          ? "9+"
                                          : conversation.unreadCount}
                                      </span>
                                    )}
                                  </div>
                                  <div className={styles.conversationTimestamp}>
                                    {updatedAt}
                                  </div>
                                </div>
                                <div
                                  className={`${styles.conversationMessage} ${styles.flexBetween} ${styles.flexCenter}`}
                                >
                                  <div
                                    className={`${styles.messageText} ${conversation.unreadCount > 0 ? styles.messageTextUnread : ""}`}
                                  >
                                    {conversation?.lastMessage}
                                  </div>

                                  <div className={styles.moreMenuWrapper}>
                                    <button
                                      type="button"
                                      className={styles.unreadBadgeIcon}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setUserControlMenu((prev) =>
                                          prev === conversation?.chatListId
                                            ? null
                                            : conversation?.chatListId,
                                        );
                                      }}
                                    >
                                      <BsThreeDotsVertical />
                                    </button>

                                    {userControlMenu ===
                                      conversation?.chatListId && (
                                        <div
                                          className={styles.moreMenu}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            className={styles.moreMenuItem}
                                            onClick={() => {
                                              HandleRemoveUser(conversation);
                                            }}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      )}
                                  </div>
                                  {/* )} */}
                                </div>
                                <div
                                  className={`${styles.conversationStatus} ${conversation.isOnline ? styles.statusOnline : styles.statusOffline}`}
                                >
                                  {conversation.lastActive}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Fragment>
                      );
                    })
                  )}
                </div>
              )}
              {/* Conversations List */}
            </div>
          </div>

          {/* Chat Window */}
          <div
            className={`${styles.chatWindow} ${!showChatView ? styles.hideOnMobile : ""}`}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div
                    className={`${styles.chatHeader} ${styles.flexBetween} ${styles.flexCenter}`}
                  >
                    {/* Mobile Back Button */}
                    <button
                      className={styles.mobileBackButton}
                      onClick={handleBackToList}
                      aria-label="Back to conversations"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div
                      className={`${styles.chatHeaderInfo} ${styles.flex} ${styles.flexCenter}`}
                    >
                      <div className={styles.avatarWrapper}>
                        {/* {
                                                        selectedConversation?.sender?.profileImage ? ( */}
                        <img
                          src={getProfileImageUrl(
                            selectedConversation?.sender?.profileImage,
                          )}
                          onError={handleProfileImageError}
                          alt={selectedConversation?.sender?.fullname || "User"}
                          className={styles.chatHeaderAvatar}
                          style={{
                            borderRadius: "50%",
                            width: "40px",
                            height: "40px",
                            objectFit: "cover",
                          }}
                        />

                        {selectedConversation?.sender.isActive && (
                          <div className={styles.onlineIndicator}></div>
                        )}
                      </div>
                      <div>
                        <div className={styles.chatHeaderName}>
                          {selectedConversation?.sender?.fullname || "User"}
                        </div>
                        {/* <div className={styles.chatHeaderStatus} style={{ color: selectedConversation?.sender.isActive ? '#10b981' : '#6c757d' }}>
                                                        {selectedConversation?.isOnline ? 'Active now' : selectedConversation?.lastActive || 'Offline'}
                                                    </div> */}
                      </div>
                    </div>
                    {chatTimer.isRunning &&
                      isActiveChatUser === selectChatUser && (
                        <div className={styles.timerWrap}>
                          <span className={styles.timerPill}>
                            <span className={styles.timerDot} />
                            {minutes}:
                            {String(remainingSeconds).padStart(2, "0")}
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

                  {/* Messages Area */}
                  <div className={styles.messagesArea} ref={messagesAreaRef}>
                    {showChatEndPop ? (
                      <div className={styles.mainChatReqBox}>
                        <div className={styles.chatRequestBox}>
                          <div className={styles.chatIcon}>🔒</div>

                          <div className={styles.chatRequestContent}>
                            <h4>Chat Ended</h4>
                            <p>The chat session has been ended successfully</p>
                          </div>

                          <button
                            onClick={() => setShowChatEndPop(false)}
                            className={styles.acceptBtn}
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    ) : !chatTimer.isRunning &&
                      (selectedConversation?.isChatAccepted === "request" ||
                        chatAccepted?.isChatAccepted === "request") ? (
                      <div className={styles.mainChatReqBox}>
                        <div className={styles.chatRequestBox}>
                          <div className={styles.chatIcon}>💬</div>

                          <div className={styles.chatRequestContent}>
                            <h4>New Chat Request</h4>
                            <p>
                              {acceptCountdown !== null
                                ? "Accepted — waiting for the user to confirm"
                                : "A user wants to start a chat with you"}
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              acceptUserChat({
                                userId:
                                  chaterIds?.userId ||
                                  selectedConversation?.sender?.id,
                                shopId:
                                  chaterIds?.shopId ||
                                  selectedConversation?.shop?.id ||
                                  shopId,
                              })
                            }
                            className={styles.acceptBtn}
                            disabled={acceptCountdown !== null}
                            style={
                              acceptCountdown !== null
                                ? { background: "#22c55e", cursor: "wait" }
                                : undefined
                            }
                          >
                            {acceptCountdown !== null
                              ? `Waiting… ${acceptCountdown}s`
                              : "Accept Chat"}
                          </button>
                        </div>
                      </div>
                    ) : chatMessagesData.length === 0 ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          height: "100%",
                        }}
                      >
                        <p>No messages yet. Start the conversation!</p>
                      </div>
                    ) : (
                      <>
                        {chatMessagesData.map((message) => {
                          const isOwn = message.senderId === consultantId;
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
                                {/* {!isOwn && (
                                                                <div className={styles.messageSender}>
                                                                    User
                                                                </div>
                                                            )} */}
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
                        <div ref={messagesEndRef} />
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
                      <button
                        className={styles.attachButton}
                        title="Attach File"
                      >
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
                        value={text}
                        type="text"
                        className={styles.messageInput}
                        placeholder="Type a message..."
                        onKeyPress={(e) => {
                          if (e.key === "Enter" && text.trim()) {
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
                </>
              ) : (
                <div className={styles.emptyChatState}>
                  <div className={styles.emptyChatContent}>
                    <svg
                      className={styles.emptyChatIcon}
                      width="64"
                      height="64"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <p className={styles.emptyChatText}>
                      Select a conversation to start chatting
                    </p>
                  </div>
                </div>
              )}
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

export default ChatsPage;
