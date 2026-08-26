const mongoose = require('mongoose');
const shop = new mongoose.Schema({
    shop: { type: String, },
    accessToken: String,
    // The comma-separated `scope` string Shopify's own OAuth token-exchange
    // response returns (tokenResponse.data.scope in authCallback) — the
    // ACTUAL scopes granted to this specific installation's token, which can
    // differ from shopify.app.toml's current [access_scopes] if this shop
    // installed/last re-authorized before a scope was added there. Existing
    // installations are never retroactively upgraded by a toml/env change;
    // comparing this field against the app's current declared scopes is how
    // to tell whether a shop needs to be re-authorized. Null until an OAuth
    // callback runs after this field was added.
    grantedScopes: { type: String, default: null },
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