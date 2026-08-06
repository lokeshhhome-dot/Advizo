const mongoose = require('mongoose');
const shop = new mongoose.Schema({
    shop: { type: String, },
    accessToken: String,
    // Expiring offline token support (Shopify mandate for new public apps).
    // Legacy shops keep refreshToken null and use accessToken as-is.
    refreshToken: { type: String, default: null },
    accessTokenExpiresAt: { type: Date, default: null },
    refreshTokenExpiresAt: { type: Date, default: null },
    shopId: String,
    email: String,
    shopName: { type: String, default: "" },
    shopOwnerName: { type: String, default: "" },
    shopEmail: { type: String, default: "" },
    myshopifyDomain: { type: String, default: "" },
    isWelcomeShown: { type: Boolean, default: false },
    totalEarning: {
        type: Number,
        default: 0,
    },
    adminPersenTage: {
        type: mongoose.Schema.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString("0")
    },

    adminWalletBalance: {
        type: mongoose.Schema.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString("0")
    },
    appEnabled: {
        type: Boolean,
        default: false
    },

    vouchers: [
        {
            voucherCode: String,
            totalCoin: Number,
            extraCoin: Number,
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        }
    ],
    accountPlanInfo: [{
        planName: String,
        planType: String,
        planAmount: String,
        currency: String
    }
    ],
    activeChargeId: {
        type: String,
        default: ""
    },
    planStatus: {
        type: String,
        default: ""
    },
    currency: {
        type: String,
        required: true,

    },
    currencyCode: {
        type: String,
        // required: true,
    },
    menuSetupComplete: {
        type: Boolean,

    },

    installedAt: { type: Date, default: Date.now }
});

const shopModel = mongoose.models.shopifyShop || mongoose.model('shopifyShop', shop);

module.exports = { shopModel }