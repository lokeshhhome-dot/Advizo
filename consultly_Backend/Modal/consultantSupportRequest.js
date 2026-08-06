const { mongoose } = require("mongoose");

const consultantSupportRequestSchema = new mongoose.Schema(
  {
    consultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ragisterUser",
      required: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "shopifyShop",
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // Who raised the request. Storefront customers reuse this collection so
    // the admin inbox shows every query in one place.
    requesterType: {
      type: String,
      enum: ["consultant", "user"],
      default: "consultant",
    },
    isDummyAccount: { type: Boolean, default: false },
    consultantName: { type: String },
    consultantEmail: { type: String },
    shopDomain: { type: String },
    adminEmail: { type: String },
    emailSent: { type: Boolean, default: false },
    emailError: { type: String, default: null },
    status: {
      type: String,
      enum: ["open", "replied", "closed"],
      default: "open",
    },
    adminHasUnread: { type: Boolean, default: true },
    consultantHasUnreadReply: { type: Boolean, default: false },
    replies: [
      {
        message: { type: String, required: true, trim: true },
        repliedBy: { type: String, default: "admin" },
        repliedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

consultantSupportRequestSchema.index({ shopId: 1, createdAt: -1 });
consultantSupportRequestSchema.index({ consultantId: 1, createdAt: -1 });

const ConsultantSupportRequest = mongoose.model(
  "ConsultantSupportRequest",
  consultantSupportRequestSchema,
);

module.exports = { ConsultantSupportRequest };
