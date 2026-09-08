const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true,
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true,
    },
    shop_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "shopifyShop",
        required: true,
    },
    // No longer required — an attachment-only message has empty text.
    // "text or attachment required" is enforced in assertChatMessage.
    text: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    messageType: { type: String, enum: ["text", "attachment"], default: "text" },
    attachment: {
        type: { type: String, enum: ["image", "pdf"] },
        storageKey: String,
        originalName: String,
        mimeType: String,
        size: Number,
        width: Number,
        height: Number,
        uploadedAt: Date,
        // 30-day (configurable) retention deadline — the attachment-file route
        // 410s once this passes, independent of whether the daily cleanup job
        // has physically deleted the storage object yet.
        expiresAt: Date,
        // Set by the cleanup job once the storage object has been deleted, so
        // re-runs skip it (idempotent) without re-deleting/erroring.
        purgedAt: { type: Date, default: null },
    },
});

// ---- Indexes ----
// getChatHistory: { shop_id, $or:[{sender,receiver},{receiver,sender}] } sorted by
// timestamp. Both $or branches are served by these two, and `timestamp` as the
// last key lets Mongo return them already ordered (no in-memory SORT — which
// otherwise hits the 32MB sort limit and hard-fails once a chat gets long).
messageSchema.index({ shop_id: 1, senderId: 1, receiverId: 1, timestamp: 1 });
messageSchema.index({ shop_id: 1, receiverId: 1, senderId: 1, timestamp: 1 });

// Unread-notification aggregation + markSeen/markAsRead updateMany.
messageSchema.index({ receiverId: 1, shop_id: 1, isRead: 1, timestamp: -1 });

// Daily attachment-retention cleanup job query.
messageSchema.index({ "attachment.expiresAt": 1, "attachment.purgedAt": 1 });

const MessageModal = mongoose.model("Message", messageSchema);

module.exports = { MessageModal }

