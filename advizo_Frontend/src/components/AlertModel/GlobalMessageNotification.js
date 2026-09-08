import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import PopupNotification from "./MessageNotificationAlert";

export default function GlobalMessageNotification() {
    const [notificationMessage, setNotificationMessage] = useState(null);
    const [showNotification, setShowNotification] = useState(false);
    const lastProcessedMessageId = useRef(null);
    const [userId, setUserId] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const id = localStorage.getItem("client_u_Identity");
        if (id) setUserId(id);
    }, []);
    const socketMessages = useSelector(
        (state) => state.socket.messages
    );

    useEffect(() => {
        // 🔒 basic safety checks
        if (!Array.isArray(socketMessages)) return;
        if (socketMessages.length === 0) return;
        if (!userId) return;

        const lastIndex = socketMessages.length - 1;
        const lastMessage = socketMessages[lastIndex];

        if (!lastMessage) return;

        // 🔔 sirf receiver ko notify
        if (lastMessage.receiverId !== userId) return;

        // 🔁 duplicate prevent
        if (lastProcessedMessageId.current === lastMessage._id) return;

        lastProcessedMessageId.current = lastMessage._id;

        setNotificationMessage(lastMessage);
        setShowNotification(true);

        const timer = setTimeout(() => {
            setShowNotification(false);
        }, 6000);

        return () => clearTimeout(timer);
    }, [socketMessages, userId]);

    // Clicking the popup opens that sender's chat, like a normal messenger.
    const handleOpenChat = (message) => {
        setShowNotification(false);
        const senderId = message?.senderId;
        if (!senderId) return;

        const activeSession = localStorage.getItem("advizo_active_session");
        if (activeSession === "consultant") {
            // Same mechanism the header notifications use — ChatsPage picks
            // this up and opens the conversation.
            localStorage.setItem(
                "advizo_pending_chat_user",
                String(senderId)
            );
            window.dispatchEvent(new Event("advizo:pending-chat"));
            navigate("/consultant-dashboard/chats");
        } else {
            // User side: the sender is the consultant.
            navigate(`/chats?consultantId=${senderId}`);
        }
    };

    return (
        <>
            {showNotification && notificationMessage && (
                <PopupNotification
                    message={notificationMessage}
                    onClose={() => setShowNotification(false)}
                    onOpen={handleOpenChat}
                />
            )}
        </>
    );
}
