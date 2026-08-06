const mongoose = require("mongoose");

const reachargeTransactionHistroySchema = new mongoose.Schema({
    shop: {
        type: String,
        required: true
    },
    customerId: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true
    },
    draftOrderId: {
        type: String,
        required: true
    },
    invoiceUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["PENDING", "PAID", "FAILED"],
        default: "PENDING"
    },
    purpose: {
        type: String,
        enum: ["RECHARGE", "WITHDRAW"],
        default: "RECHARGE"
    }
});

const ReachargeTransactionHistroy = mongoose.model("ReachargeTransactionHistroy", reachargeTransactionHistroySchema);

module.exports = { ReachargeTransactionHistroy };