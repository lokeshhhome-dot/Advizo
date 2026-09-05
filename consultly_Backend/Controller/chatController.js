const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const { MessageModal } = require("../Modal/messageSchema");
const { ChatList } = require("../Modal/chatListSchema");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { authorizeChatParticipant, resolveAuthenticatedUserId } = require("../Auth/auth");
const { validateAttachmentFile } = require("../Utils/attachmentValidation");
const { signAttachmentToken, verifyAttachmentToken } = require("../Utils/attachmentSignature");
const { getAttachmentStorage } = require("../services/attachmentStorage");

let sharp;
try {
    sharp = require("sharp");
} catch (_) {
    sharp = null;
}

const ATTACHMENT_URL_TTL_MS = 5 * 60 * 1000;

const getChatHistory = async (request, response) => {
    try {
        const { shopId, consultantId, userId } = request.params;

        if (
            !(await authorizeChatParticipant(request, response, {
                shopId,
                userId,
                consultantId,
            }))
        ) {
            return;
        }

        const chatHistory = await MessageModal.find({
            shop_id: shopId,
            $or: [
                { senderId: userId, receiverId: consultantId },
                { senderId: consultantId, receiverId: userId }
            ]
        }).sort({ timestamp: 1 });

        if (!chatHistory) {
            return response.status(400).json({ message: "Chat history not found" });
        }

        return response.status(200).json({
            success: true,
            message: "Chat history fetched successfully",
            chatHistory
        });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: "Server error" });
    }
};


const getUserInRecentChat = async (request, response) => {
    try {
        const { shopId, userId, consultantId } = request.params;

        if (
            !(await authorizeChatParticipant(request, response, {
                shopId,
                userId,
                consultantId,
            }))
        ) {
            return;
        }

        const userInRecentChat = await ChatList.findOne({ shop_id: shopId, senderId: userId, receiverId: consultantId });
        if (!userInRecentChat) {
            return response.status(400).json({ message: "User not found in recent chat" });
        }
        userInRecentChat.isRequest = true;
        await userInRecentChat.save();
        return response.status(200).json({ success: true, message: "User found in recent chat", });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: "Server error" });
    }
};

const uploadChatAttachment = async (request, response) => {
    try {
        const { shopId, userId, consultantId } = request.params;

        if (
            !(await authorizeChatParticipant(request, response, {
                shopId,
                userId,
                consultantId,
            }))
        ) {
            return;
        }

        const file = request.file;
        if (!file) {
            return response.status(400).json({ success: false, message: "No file uploaded" });
        }

        const validation = validateAttachmentFile({
            mimetype: file.mimetype,
            originalname: file.originalname,
            buffer: file.buffer,
        });
        if (!validation.valid) {
            return response.status(400).json({ success: false, message: validation.reason });
        }

        const authUserId = await resolveAuthenticatedUserId(request);
        if (!authUserId) {
            return response.status(401).json({ success: false, message: "Authentication required" });
        }

        let width = null;
        let height = null;
        if (validation.type === "image" && sharp) {
            try {
                const metadata = await sharp(file.buffer).metadata();
                width = metadata.width || null;
                height = metadata.height || null;
            } catch (_) {
                // best-effort only — the bubble just skips reserving aspect-ratio space
            }
        }

        const ext = path.extname(file.originalname || "").toLowerCase();
        // Scoped by shop + uploader so sendMessage can verify ownership before
        // trusting a client-supplied storageKey (see server-io.js sendMessage).
        const storageKey = `chat/${shopId}/${authUserId}/${Date.now()}-${crypto.randomUUID()}${ext}`;

        const storage = getAttachmentStorage();
        await storage.putObject({ key: storageKey, buffer: file.buffer, contentType: file.mimetype });

        return response.status(200).json({
            success: true,
            message: "Attachment uploaded",
            attachment: {
                type: validation.type,
                storageKey,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                width,
                height,
            },
        });
    } catch (error) {
        console.error("uploadChatAttachment error:", error);
        return response.status(500).json({ success: false, message: "Server error" });
    }
};

const getAttachmentUrl = async (request, response) => {
    try {
        const { messageId } = request.params;
        const download = request.query.download === "1";

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return response.status(400).json({ success: false, message: "Invalid message ID" });
        }

        const authUserId = await resolveAuthenticatedUserId(request);
        if (!authUserId) {
            return response.status(401).json({ success: false, message: "Authentication required" });
        }

        const message = await MessageModal.findById(messageId).select("senderId receiverId attachment");
        if (!message || !message.attachment || !message.attachment.storageKey) {
            return response.status(404).json({ success: false, message: "Attachment not found" });
        }

        // IDOR guard: only the two participants of this specific message may
        // mint a view URL for it.
        const authId = String(authUserId);
        if (authId !== String(message.senderId) && authId !== String(message.receiverId)) {
            return response.status(403).json({ success: false, message: "Forbidden" });
        }

        if (message.attachment.expiresAt && message.attachment.expiresAt.getTime() <= Date.now()) {
            return response.status(410).json({ success: false, message: "Attachment has expired", code: "EXPIRED" });
        }

        const exp = Date.now() + ATTACHMENT_URL_TTL_MS;
        const sig = signAttachmentToken(messageId, exp);
        const downloadParam = download ? "&download=1" : "";

        return response.status(200).json({
            success: true,
            path: `/api/chat/attachment-file/${messageId}?exp=${exp}&sig=${sig}${downloadParam}`,
            attachment: {
                type: message.attachment.type,
                originalName: message.attachment.originalName,
                mimeType: message.attachment.mimeType,
                size: message.attachment.size,
                width: message.attachment.width,
                height: message.attachment.height,
            },
        });
    } catch (error) {
        console.error("getAttachmentUrl error:", error);
        return response.status(500).json({ success: false, message: "Server error" });
    }
};

// No auth middleware on this route on purpose — it's what <img src>/a
// new-tab link hits directly and can't carry an Authorization header.
// Access is gated entirely by the short-lived signed token instead.
const serveAttachmentFile = async (request, response) => {
    try {
        const { messageId } = request.params;
        const { exp, sig, download } = request.query;

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return response.status(400).json({ success: false, message: "Invalid message ID" });
        }

        if (!verifyAttachmentToken(messageId, exp, sig)) {
            return response.status(403).json({ success: false, message: "Invalid or expired link" });
        }

        const message = await MessageModal.findById(messageId).select("attachment");
        if (!message || !message.attachment || !message.attachment.storageKey) {
            return response.status(404).json({ success: false, message: "Attachment not found" });
        }

        if (message.attachment.expiresAt && message.attachment.expiresAt.getTime() <= Date.now()) {
            return response.status(410).json({ success: false, message: "Attachment has expired", code: "EXPIRED" });
        }

        const storage = getAttachmentStorage();
        const stream = storage.getObjectStream(message.attachment.storageKey);

        stream.on("error", (err) => {
            console.error("serveAttachmentFile stream error:", err.message);
            if (!response.headersSent) {
                response.status(404).json({ success: false, message: "Attachment file missing" });
            }
        });

        const disposition = download === "1" ? "attachment" : "inline";
        response.setHeader("Content-Type", message.attachment.mimeType || "application/octet-stream");
        response.setHeader(
            "Content-Disposition",
            `${disposition}; filename="${encodeURIComponent(message.attachment.originalName || "file")}"`,
        );
        response.setHeader("Cache-Control", "private, max-age=300");

        stream.pipe(response);
    } catch (error) {
        console.error("serveAttachmentFile error:", error);
        return response.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * POST /api/chat/end-session
 * Body: { transactionId }
 * Mirrors Controller/videoCallController.js's endActiveCall — the same
 * "reliable session termination on refresh/close/network-loss" pattern
 * already used for calls (browser fires this via navigator.sendBeacon on
 * beforeunload/pagehide; see UserChat.js/ChatsPage.js). Never trusts
 * userId/consultantId/shopId from the client: they're derived from the
 * transaction record itself, then authorizeChatParticipant resolves the
 * REQUESTER's identity from their own auth token/session and checks they
 * are actually a participant — the exact same helper getChatHistory already
 * uses. Idempotent via chatSessionManager.finalizeChatSession, so this can
 * safely race with an explicit "endChat" socket emit or a disconnect-
 * timeout for the same transactionId — only one performs the billing.
 */
const endActiveChatSession = async (request, response) => {
    try {
        const { transactionId } = request.body || {};
        if (!mongoose.Types.ObjectId.isValid(transactionId)) {
            return response.status(400).json({ success: false, message: "Invalid transaction ID" });
        }

        const transaction = await TransactionHistroy.findById(transactionId).select(
            "senderId receiverId shop_id status type",
        );
        if (!transaction) {
            return response.status(404).json({ success: false, message: "Consultation not found" });
        }
        if (transaction.type !== "chat") {
            return response.status(400).json({ success: false, message: "Not a chat consultation" });
        }

        if (
            !(await authorizeChatParticipant(request, response, {
                shopId: String(transaction.shop_id),
                userId: String(transaction.senderId),
                consultantId: String(transaction.receiverId),
            }))
        ) {
            return; // response already sent
        }

        if (transaction.status === "completed") {
            return response.status(200).json({ success: true, skipped: true, reason: "already_completed" });
        }

        const { getChatManager } = require("../server-io");
        const chatManager = getChatManager();
        if (!chatManager) {
            return response.status(503).json({ success: false, message: "Chat service not ready" });
        }

        const authUserId = await resolveAuthenticatedUserId(request);
        const result = await chatManager.finalizeChatSession(transactionId, {
            reason: "page_unload",
            endedBy:
                String(authUserId) === String(transaction.senderId)
                    ? "user_page_unload"
                    : "consultant_page_unload",
        });

        return response.status(200).json({ success: Boolean(result?.success || result?.skipped), ...result });
    } catch (error) {
        console.error("endActiveChatSession error:", error);
        return response.status(500).json({ success: false, message: "Failed to end chat" });
    }
};

module.exports = {
    getChatHistory,
    getUserInRecentChat,
    uploadChatAttachment,
    getAttachmentUrl,
    serveAttachmentFile,
    endActiveChatSession,
};
