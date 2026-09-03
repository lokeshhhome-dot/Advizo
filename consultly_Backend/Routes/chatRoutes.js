const express = require("express");
const path = require("path");
const multer = require("multer");
const {
    getChatHistory,
    getUserInRecentChat,
    uploadChatAttachment,
    getAttachmentUrl,
    serveAttachmentFile,
} = require("../Controller/chatController");
const { optionalAuthenticateToken } = require("../Auth/signup-signin");
const chatRoutes = express.Router();

const ALLOWED_ATTACHMENT_MIME = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
]);
const ALLOWED_ATTACHMENT_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const MAX_ATTACHMENT_BYTES =
    Number(process.env.CHAT_ATTACHMENT_MAX_SIZE_MB || 10) * 1024 * 1024;

const attachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        if (ALLOWED_ATTACHMENT_MIME.has(file.mimetype) && ALLOWED_ATTACHMENT_EXT.has(ext)) {
            return cb(null, true);
        }
        return cb(new Error("Only JPG, PNG, WEBP images or PDF files are allowed"));
    },
});

// Clean JSON instead of multer's default HTML/stack-trace error page —
// covers both fileFilter rejections and LIMIT_FILE_SIZE.
const handleAttachmentUpload = (req, res, next) => {
    attachmentUpload.single("file")(req, res, (err) => {
        if (!err) return next();
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                success: false,
                message: `File too large. Max size is ${process.env.CHAT_ATTACHMENT_MAX_SIZE_MB || 10}MB`,
            });
        }
        return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    });
};

chatRoutes.get("/get/chat-history/:shopId/:userId/:consultantId", optionalAuthenticateToken, getChatHistory);
chatRoutes.put("/update-user-request/:shopId/:userId/:consultantId", optionalAuthenticateToken, getUserInRecentChat);

chatRoutes.post(
    "/upload-attachment/:shopId/:userId/:consultantId",
    optionalAuthenticateToken,
    handleAttachmentUpload,
    uploadChatAttachment,
);
chatRoutes.get("/attachment-url/:messageId", optionalAuthenticateToken, getAttachmentUrl);
// No auth middleware — hit directly by <img src>/new-tab links; gated by the
// signed token inside serveAttachmentFile instead.
chatRoutes.get("/attachment-file/:messageId", serveAttachmentFile);

module.exports = chatRoutes;
