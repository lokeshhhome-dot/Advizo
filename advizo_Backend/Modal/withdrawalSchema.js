const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema({
    consultantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },

    shopId: String,

    amount: {
        type: Number,
        required: true
    },

    note: String,

    status: {
        type: String,
        enum: ["pending", "paid", "declined"],
        default: "pending"
    },
    transactionNumber: {
        type: String,
        default: ""
    },

    createdAt: {
        type: Date,
        default: Date.now
    },
    amount: {
        type: Number,
        required: true
    },

    paidAt: Date
});
// ---- Indexes ----
// Admin withdrawal queue: find({ shopId }).sort({createdAt:-1}) + countDocuments.
WithdrawalSchema.index({ shopId: 1, createdAt: -1 });
// Consultant's own requests: find({ consultantId }).sort({createdAt:-1}).limit(10).
WithdrawalSchema.index({ consultantId: 1, createdAt: -1 });

const WithdrawalRequestSchema = mongoose.model("WithdrawalRequest", WithdrawalSchema);

module.exports = { WithdrawalRequestSchema }
