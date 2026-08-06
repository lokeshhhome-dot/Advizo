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
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
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

const MessageModal = mongoose.model("Message", messageSchema);

module.exports = { MessageModal }

