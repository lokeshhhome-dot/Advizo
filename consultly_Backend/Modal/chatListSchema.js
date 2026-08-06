const mongoose = require("mongoose");

const ChatListSchema = new mongoose.Schema(
    {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ragisterUser",
            // required: true
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ragisterUser",
            required: true
        },
        shop_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "shopifyShop",
            required: true
        },
        lastMessage: {
            type: String
        },
        isRequest: {
            type: Boolean,
            // default: false
        }
    },
    { timestamps: true }
);

// ---- Indexes ----
// Consultant inbox: find({ shop_id, receiverId }).sort({updatedAt:-1}).
ChatListSchema.index({ shop_id: 1, receiverId: 1, updatedAt: -1 });

// Per-conversation upsert on every single chat message (sendMessage hot path):
// findOne({ senderId, receiverId, shop_id }).
ChatListSchema.index({ senderId: 1, receiverId: 1, shop_id: 1 });

const ChatList = mongoose.models.chatlist || mongoose.model("chatlist", ChatListSchema);

module.exports = { ChatList };
 