const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },
    shop_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "shopModel",
        required: true
    },
    amount: {
        type: Number,
        default: 0
    },
    debitFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        // required: true
    },
    creditTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        // required: true
    },
    adminAmount: {
        type: Number,
        default: 0
    },
    consultantAmount: {
        type: Number,
        default: 0
    },
    startTime: {
        type: Date,
        default: null
    },
    // The moment BOTH parties actually connected (when the on-screen timer
    // starts). Billing is anchored here so the amount charged always equals the
    // duration the user sees — never from call-accept.
    connectedAt: {
        type: Date,
        default: null
    },
    endTime: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ["active", "ended", "completed"],
        default: "active"
    },
    endedBy: {
        type: String
    },
    type: {
        type: String,
        enum: ["chat", "voice", "video"],
        required: true
    },
    duration: {
        type: Number,
        default: 0
    },
    totalSeconds: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    lastActivityAt: {
        type: Date
    }
}, { timestamps: true });

// ---- Indexes ----
// Admin activity list: find({ shop_id[, type] }).sort({createdAt:-1}).skip().limit()
// plus countDocuments on the same filter. Serves both the filtered and unfiltered
// variants and removes the in-memory SORT that pagination would otherwise force.
transactionSchema.index({ shop_id: 1, createdAt: -1 });
transactionSchema.index({ shop_id: 1, type: 1, createdAt: -1 });

// Per-user conversation history: $or:[{senderId},{receiverId}] sorted by createdAt.
// Mongo evaluates each $or branch independently, so each branch needs its own index.
transactionSchema.index({ senderId: 1, createdAt: -1 });
transactionSchema.index({ receiverId: 1, createdAt: -1 });

// Orphan-cleanup cron (runs every 5 min): find({ status, type:$in, updatedAt:$lt }).
transactionSchema.index({ status: 1, type: 1, updatedAt: 1 });

const TransactionHistroy = mongoose.model("Transaction", transactionSchema);

module.exports = { TransactionHistroy };