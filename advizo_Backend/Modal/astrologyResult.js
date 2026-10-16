const { mongoose } = require("mongoose");

/**
 * A saved astrology reading (Kundli / Panchang / Match Making / future tools).
 *
 * Created ONLY when a signed-in customer explicitly ticks "Save to my
 * account" — guests and unticked readings are never persisted. Always
 * scoped to shop_id + user_id resolved server-side from the App Proxy
 * identity; every read/delete filters on both, so an id from another
 * customer simply doesn't match.
 *
 * Holds the normalized Advizo result (not the raw provider payloads), and
 * expires automatically via the TTL index on expiresAt.
 */
const RETENTION_DAYS = 90;

const astrologyResultSchema = new mongoose.Schema(
  {
    shop_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "shopifyShop",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ragisterUser",
      required: true,
    },
    feature: { type: String, required: true, trim: true },
    title: { type: String, trim: true, maxlength: 200 },
    // Normalized request details (names, dates, place) — needed to show the
    // "Birth details" header when the reading is reopened.
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
    unavailableSections: { type: [String], default: [] },
    // sha256 of feature + normalized input — lets a repeated "save" of the
    // same reading (double submit, retry) reuse the existing record.
    inputHash: { type: String, required: true },
    provider: { type: String, default: "jyotisham" },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + RETENTION_DAYS * 24 * 3600 * 1000),
    },
  },
  { timestamps: true, minimize: false },
);

astrologyResultSchema.index({ shop_id: 1, user_id: 1, createdAt: -1 });
astrologyResultSchema.index({ shop_id: 1, user_id: 1, inputHash: 1 });
astrologyResultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AstrologyResult =
  mongoose.models.astrologyResult || mongoose.model("astrologyResult", astrologyResultSchema);

module.exports = { AstrologyResult, ASTROLOGY_RETENTION_DAYS: RETENTION_DAYS };
