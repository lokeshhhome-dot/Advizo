import React, { useEffect } from "react";

export default function GlobalToast({ message, show, onClose, duration = 5000 }) {
  

    useEffect(() => {
        if (show && message) {
            const messageData = Array.isArray(message) ? message[0] : message;
            console.log("messageData____________________", messageData);

            if (messageData && window.parent) {
                window.parent.postMessage(
                    {
                        type: "SHOW_TOAST",
                        message: messageData.text,
                        senderName: messageData.senderName,
                        avatar: messageData.avatar
                    },
                    "*"
                );
            }

            if (onClose) {
                const timer = setTimeout(() => {
                    onClose();
                }, duration);
                return () => clearTimeout(timer);
            }
        }
    }, [show, message, duration, onClose]);

    return null;
}


