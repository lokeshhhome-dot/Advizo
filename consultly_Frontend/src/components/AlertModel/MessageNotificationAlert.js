import React, { useEffect } from "react";
export default function PopupNotification({ message, onClose, onOpen }) {
  if (!message) return null;
  const openChatPartnerId = localStorage.getItem("___U-B");
  if (
    String(openChatPartnerId || "") === String(message.senderId) ||
    String(message.receiverId) === String(openChatPartnerId || "")
  ) {
    return null;
  }

  return (
    <>
      <style>{`
          .bs-popup {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 330px;
            background: rgba(20,20,20,0.4);
            backdrop-filter: blur(12px);
            border-radius: 8px;
            padding: 1rem;
            z-index: 99999;
            color: #fff;
            animation: slideUp .4s ease forwards;
          }
  
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(50px); }
            to { opacity: 1; transform: translateY(0); }
          }
  
          .bs-popup img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
          }
  
          .bs-close-btn {
            position: absolute;
            top: 8px;
            right: 12px;
            font-size: 22px;
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
          }
        `}</style>

      <div
        className="bs-popup d-flex align-items-center gap-3"
        style={{ cursor: onOpen ? "pointer" : "default" }}
        onClick={() => onOpen?.(message)}
      >
        <button
          className="bs-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>

        <img
          src={"https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg"}
          alt={message.senderName || "User"}
        />

        <div>
          <h5 className="fw-bold mb-1">
            {message.senderName || "User"}
          </h5>
          <p>{message.text || "New message received"}</p>
        </div>
      </div>
    </>
  );
}

