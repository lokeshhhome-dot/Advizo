const mongoose = require("mongoose");
const walletHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },

    shop_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "shopModel",
        required: true
    },
    customerId: {
        type: String,

    },

    amount: {
        type: Number,
        // required: true
    },
    currency: {
        type: String,
    },
    draftOrderId: {
        type: String,

    },
    invoiceUrl: {
        type: String,

    },

    transactionType: {
        type: String,
        enum: [
            "recharge",
            "bonus",
            "usage",          // call/chat/video cut
            "manual_credit",
            "manual_debit",
            "withdraw",
            "refund",
            "credit",
            "paid"
        ],
        required: true
    },

    referenceType: {
        type: String,
        enum: ["voice", "chat", "video", "recharge", "manual", "withdraw"],
        default: null
    },

    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },

    direction: {
        type: String,
        enum: ["credit", "debit", "paid"],
        required: true
    },

    description: {
        type: String,
        default: ""
    },

    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser", // admin id
        default: null
    },

    status: {
        type: String,
        enum: ["success", "pending", "failed"],
        default: ""
    },

    razorpayOrderId: {
        type: String,
        sparse: true,
        unique: true,
    },

    razorpayPaymentId: {
        type: String,
        sparse: true,
        unique: true,
    },
}, { timestamps: true });
// ---- Indexes ----
// User/consultant wallet activity-history: find({ userId, shop_id }).sort({createdAt:-1}).
walletHistorySchema.index({ userId: 1, shop_id: 1, createdAt: -1 });

// Admin customer list: find({ shop_id }).sort({createdAt:-1}) + countDocuments.
walletHistorySchema.index({ shop_id: 1, createdAt: -1 });

const WalletHistory = mongoose.model("WalletHistory", walletHistorySchema);
module.exports = { WalletHistory };
