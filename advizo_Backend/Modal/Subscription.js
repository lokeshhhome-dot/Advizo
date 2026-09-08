const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
    {
        shopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "shopifyShop",
            required: true,
            unique: true,
            index: true,
        },

        planName: {
            type: String,
            required: true,
        },

        billingCycle: {
            type: String,
            enum: ["monthly", "yearly"],
            default: "monthly",
        },

        planStatus: {
            type: String,
            enum: [
                "trial",
                "ACTIVE",
                "expired",
                "cancelled",
                "paused",
            ],
            default: "ACTIVE",
            index: true,
        },

        planPrice: {
            type: Number,
            required: true,
        },

        currency: {
            type: String,
            default: "USD",
        },


        maxConsultants: {
            type: Number,
            required: true,
            default: 3,
        },

        // Communication Minutes
        totalMinutes: {
            type: Number,
            required: true,
            default: 3000,
        },

        usedMinutes: {
            type: Number,
            default: 0,
        },

        remainingMinutes: {
            type: Number,
            default: 3000,
        },

        // ---- Shopify trial (separate from paid counters — never mixed) ----
        // While trialEndsOn is in the future, the shop runs on trial minutes.
        trialEndsOn: {
            type: Date,
            default: null,
        },
        trialMinutesLimit: {
            type: Number,
            default: 40,
        },
        trialMinutesUsed: {
            type: Number,
            default: 0,
        },

        // Shopify Billing
        shopifyChargeId: {
            type: String,
            default: "",
            index: true,
        },

        currentPeriodStart: Date,

        currentPeriodEnd: {
            type: Date,
            index: true,
        },

        autoRenew: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

subscriptionSchema.index({
    status: 1,
    currentPeriodEnd: 1,
});

module.exports =
    mongoose.models.Subscription ||
    mongoose.model("Subscription", subscriptionSchema);