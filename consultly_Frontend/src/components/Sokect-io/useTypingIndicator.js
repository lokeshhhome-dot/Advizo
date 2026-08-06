import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "./SokectConfig";

const TYPING_STOP_DELAY = 2000;

export function useTypingIndicator({
  senderId,
  receiverId,
  shopId,
  partnerName = "User",
}) {
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const isTypingRef = useRef(false);
  const stopTypingTimeoutRef = useRef(null);
  const partnerTypingTimeoutRef = useRef(null);

  const emitTyping = useCallback(
    (isTyping) => {
      if (!senderId || !receiverId || !shopId || !socket.connected) return;
      if (isTypingRef.current === isTyping) return;

      isTypingRef.current = isTyping;
      socket.emit("typing", {
        receiverId,
        shop_id: shopId,
        isTyping,
      });
    },
    [senderId, receiverId, shopId],
  );

  const handleInputChange = useCallback(
    (value) => {
      if (!value?.trim()) {
        emitTyping(false);
        return;
      }

      emitTyping(true);

      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
      }

      stopTypingTimeoutRef.current = setTimeout(() => {
        emitTyping(false);
      }, TYPING_STOP_DELAY);
    },
    [emitTyping],
  );

  const stopTyping = useCallback(() => {
    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
    }
    emitTyping(false);
  }, [emitTyping]);

  useEffect(() => {
    if (!senderId || !receiverId || !shopId) {
      setIsPartnerTyping(false);
      return undefined;
    }

    const isCurrentChatEvent = (data) => {
      const msgSender = String(data?.senderId || "");
      const msgReceiver = String(data?.receiverId || "");
      const msgShop = String(data?.shop_id || data?.shopId || "");

      return (
        msgShop === String(shopId) &&
        msgSender === String(receiverId) &&
        msgReceiver === String(senderId)
      );
    };

    const onUserTyping = (data) => {
      if (!isCurrentChatEvent(data)) return;

      setIsPartnerTyping(Boolean(data.isTyping));

      if (partnerTypingTimeoutRef.current) {
        clearTimeout(partnerTypingTimeoutRef.current);
      }

      if (data.isTyping) {
        partnerTypingTimeoutRef.current = setTimeout(() => {
          setIsPartnerTyping(false);
        }, TYPING_STOP_DELAY + 500);
      }
    };

    const onReceiveMessage = (message) => {
      const messageShopId = String(message?.shop_id || message?.shopId || "");
      const messageSenderId = String(message?.senderId || "");

      if (
        messageShopId === String(shopId) &&
        messageSenderId === String(receiverId)
      ) {
        setIsPartnerTyping(false);
      }
    };

    socket.on("userTyping", onUserTyping);
    socket.on("receiveMessage", onReceiveMessage);

    return () => {
      socket.off("userTyping", onUserTyping);
      socket.off("receiveMessage", onReceiveMessage);

      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
      }
      if (partnerTypingTimeoutRef.current) {
        clearTimeout(partnerTypingTimeoutRef.current);
      }

      emitTyping(false);
      setIsPartnerTyping(false);
    };
  }, [senderId, receiverId, shopId, emitTyping]);

  return {
    isPartnerTyping,
    handleInputChange,
    stopTyping,
    partnerLabel: `${partnerName} is typing`,
  };
}
