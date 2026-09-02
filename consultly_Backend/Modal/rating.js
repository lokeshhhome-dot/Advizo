const mongoose = require("mongoose");

// One row per completed consultation actually rated by its customer.
// Uniqueness is enforced at the consultation level (customerId + consultationId),
// not customer+consultant — the same customer can rate the same consultant
// again after a NEW completed consultation, but never rate the same
// consultation twice.
const ratingSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ragisterUser",
      required: true,
    },
    consultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ragisterUser",
      required: true,
    },
    // References the same TransactionHistroy document chat/call billing
    // already creates and marks "completed" — not a second session record.
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "shopModel",
      required: true,
    },
    consultationType: {
      type: String,
      enum: ["chat", "voice", "video"],
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
      default: "",
      maxlength: 2000,
      trim: true,
    },
  },
  { timestamps: true },
);

// The actual duplicate-rating guard — a unique DB constraint, not just a
// disabled Submit button. A second insert attempt for the same
// customer+consultation throws a Mongo E11000 error the controller catches.
ratingSchema.index({ customerId: 1, consultationId: 1 }, { unique: true });

// Consultant profile's rating summary reads newest-first per consultant.
ratingSchema.index({ consultantId: 1, createdAt: -1 });

const Rating = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);
module.exports = { Rating };
