const mongoose = require("mongoose");

const registerUserSchema = new mongoose.Schema(
    {
        fullname: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        shop_id: {
            type: String,
        },
        password: {
            type: String,
            trim: true,
        },
        // Forgot-password flow: hashed 6-digit OTP + expiry + attempt counter.
        resetPasswordOtpHash: {
            type: String,
            default: null,
        },
        resetPasswordExpires: {
            type: Date,
            default: null,
        },
        resetPasswordAttempts: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },

        // User Type
        userType: {
            type: String,
            required: true,
        },

        displayName: {
            type: String,
        },

        phone: {
            type: String,
        },

        // Consultant Details
        experience: {
            type: String,
        },
        fees: {
            type: String,
        },
        language: {
            type: Array,
        },
        bio: {
            type: String,
            // required: true,
        },
        gender: {
            type: String,
        },

        // Address Fields
        houseNumber: {
            type: String,
        },
        streetArea: {
            type: String,
        },
        landmark: {
            type: String,
        },
        address: {
            type: String,
        },
        pincode: {
            type: String,
        },

        dateOfBirth: {
            type: Date,
        },

        pan_cardNumber: {
            type: String,
        },

        // User-specific
        agoraUid: {
            type: Number,
            unique: true,
            sparse: true, // null values ko ignore karega - duplicate error se bachayega
        },
        walletBalance: {
            type: Number,

        },

        profession: {
            type: String,

        },
        specialization: {
            type: String,
        },
        licenseNo: {
            type: String,
            unique: true,
            sparse: true, // null values ko ignore karega - duplicate error se bachayega
        },
        consultantStatus: {
            type: Boolean,

        },
        profileImage: {
            type: String,
            // required: true,
            default: "default.png",
        },

        // Shopify
        shopifyCustomerId: {
            type: String,
            sparse: true,
            trim: true,
        },
        chatCost: {
            type: Number,
            // default: 0,
        },
        voicePerMinute: {
            type: Number,
            // default: 0,
        },
        videoPerMinute: {
            type: Number,
            // default: 0,
        },
        chatPerMinute: {
            type: Number,
            // default: 0,
        },
        chatLock: {
            type: String,
            default: false,

        },
        isBusy: {
            type: Boolean,
            default: false,
        },
        isChatAccepted: {
            type: String,
            default: "request",

        },

        // Consultant single-device login: each login stores a fresh id here
        // and puts it in the JWT as `sid`. Tokens carrying any other sid are
        // rejected, which logs the previous device out.
        activeSessionId: {
            type: String,
            default: null,
        },

        firebaseToken: {
            token: { type: String, default: null },
            updatedAt: { type: Date, default: null },
            userAgent: { type: String, default: "" },
            browser: { type: String, default: "" },
            os: { type: String, default: "" }
        }
    },

    { timestamps: true }
);


registerUserSchema.index({ shop_id: 1, userType: 1 });

// Enforces "one User per (Shopify customer, shop)" at the database level —
// closes the race where two near-simultaneous first-ever requests from the
// same brand-new Shopify customer could otherwise both pass a findOne()
// check and both insert (see manageShopifyUser in handleShopifyUser.js,
// which now catches the resulting E11000 and reconciles to the winner).
// PARTIAL, not sparse: consultants/admins/manually-created users have no
// shopifyCustomerId at all, and a plain sparse compound index would still
// collide two such documents sharing the same shop_id (sparse only skips a
// document that's missing ALL indexed fields, not just one). The partial
// filter scopes this constraint to actual Shopify-customer documents only,
// so it can never affect any existing non-Shopify user record.
registerUserSchema.index(
    { shopifyCustomerId: 1, shop_id: 1 },
    {
        unique: true,
        partialFilterExpression: {
            shopifyCustomerId: { $exists: true, $type: "string", $ne: "" },
        },
    },
);

// Model already exists check karo - duplicate model name se bachne ke liye
const User = mongoose.models.ragisterUser || mongoose.model("ragisterUser", registerUserSchema);

module.exports = { User };
