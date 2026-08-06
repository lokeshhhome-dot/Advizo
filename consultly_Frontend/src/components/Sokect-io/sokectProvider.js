import { useEffect, useState, useCallback, useRef } from "react";
import { useDispatch } from "react-redux";
import { usePolarisToast } from "../AlertModel/PolariesTostContext";
import {
  getSocket,
  getSocketUserId,
  isValidSocketUserId,
  registerSocketUser,
} from "./SokectConfig";
import {
  setConnected,
  setActiveUsers,
  addMessage,
  markMessagesSeen,
  setInsufficientBalanceError,
  setChatAccepted,
  setChatTimerStarted,
  setChatTimerStopped,
  setAutoChatEnded,
  setIncomingCall,
  setCallAccepted,
  setCallEnded,
  setCallRejected,
  setConfirmChat,
} from "../Redux/slices/sokectSlice";
import { playNotificationSound } from "../ringTone/notificationTune";

export default function SocketProvider({ children }) {
  const dispatch = useDispatch();
  const [userId, setUserId] = useState(() => getSocketUserId());
  // Ref so socket handlers always reach the latest toast without re-binding
  // listeners (showToast is re-created on every ToastProvider render).
  const toastCtx = usePolarisToast();
  const toastRef = useRef(toastCtx);
  toastRef.current = toastCtx;

  const syncUserId = useCallback(() => {
    setUserId(getSocketUserId());
  }, []);

  useEffect(() => {
    syncUserId();
    window.addEventListener("consultly:socket-user", syncUserId);
    window.addEventListener("storage", syncUserId);
    return () => {
      window.removeEventListener("consultly:socket-user", syncUserId);
      window.removeEventListener("storage", syncUserId);
    };
  }, [syncUserId]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      registerSocketUser(socket, userId);
      dispatch(setConnected(true));
    };

    const onDisconnect = () => {
      dispatch(setConnected(false));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("activeUsers", (list) => dispatch(setActiveUsers(list)));
    socket.on("receiveMessage", (msg) => {
      dispatch(addMessage(msg));
      // Ring only for messages addressed to me from a chat that is NOT
      // currently open ("___U-B" holds the open chat partner's id).
      const openChatPartnerId = localStorage.getItem("___U-B");
      const isIncoming =
        msg?.receiverId && String(msg.receiverId) === String(userId || "");
      const isOpenChat =
        openChatPartnerId &&
        String(msg?.senderId) === String(openChatPartnerId);
      if (isIncoming && !isOpenChat) {
        playNotificationSound();
      }
    });
    socket.on("seenUpdate", (data) =>
      dispatch(markMessagesSeen(data))
    );
    socket.on("balanceError", (err) =>
      dispatch(setInsufficientBalanceError(err))
    );
    socket.on("userChatAccepted", (res) =>
      dispatch(setChatAccepted(res.message))
    );
    socket.on("chatTimerStarted", (res) =>
      dispatch(setChatTimerStarted(res))
    );
    socket.on("chatEnded", () => dispatch(setChatTimerStopped()));
    socket.on("autoChatEnded", (data) => dispatch(setAutoChatEnded(data)));
    socket.on("incoming-call", (call) => dispatch(setIncomingCall(call)));
    socket.on("call-accepted-started", (data) =>
      dispatch(setCallAccepted(data))
    );
    socket.on("call-missed", (data) => dispatch(setCallEnded(data)));
    socket.on("call-ended-rejected", (data) =>
      dispatch(setCallRejected(data))
    );
    socket.on("acceptUser", (data) => dispatch(setConfirmChat(data)));
    socket.on("COMMUNICATION_DISABLED", (data) =>
      toastRef.current?.showToast?.(
        data?.message || "Communication is currently unavailable.",
        true,
      ),
    );
    socket.on("CHAT_ENDED_LOW_BALANCE", (data) =>
      toastRef.current?.showToast?.(
        data?.message || "Communication minutes exhausted.",
        true,
      ),
    );

    if (isValidSocketUserId(userId)) {
      if (!socket.connected) {
        socket.connect();
      } else {
        registerSocketUser(socket, userId);
        dispatch(setConnected(true));
      }
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("activeUsers");
      socket.off("receiveMessage");
      socket.off("seenUpdate");
      socket.off("balanceError");
      socket.off("userChatAccepted");
      socket.off("chatTimerStarted");
      socket.off("chatEnded");
      socket.off("autoChatEnded");
      socket.off("incoming-call");
      socket.off("call-accepted-started");
      socket.off("call-missed");
      socket.off("call-ended-rejected");
      socket.off("acceptUser");
      socket.off("COMMUNICATION_DISABLED");
      socket.off("CHAT_ENDED_LOW_BALANCE");
    };
  }, [dispatch, userId]);

  return children;
}
