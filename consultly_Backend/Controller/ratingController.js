const mongoose = require("mongoose");
const { Rating } = require("../Modal/rating");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { User } = require("../Modal/userSchema");
const { resolveAuthenticatedUserId } = require("../Auth/auth");

const MAX_FEEDBACK_LENGTH = 2000;

/**
 * Resolves the consultant + shop + consultation type for a rating attempt
 * from the ACTUAL consultation record — never from anything the client
 * sends. Returns null (with the response already written) when the
 * authenticated user isn't eligible to rate this consultation at all:
 * doesn't exist, isn't completed, they weren't a participant, or they
 * aren't the customer side of it (a consultant can't rate their own
 * session). Shared by submitRating and getRatingForConsultation so both
 * endpoints apply the exact same eligibility rule.
 */
const resolveRatingEligibility = async (authUserId, consultationId, res) => {
  if (!mongoose.Types.ObjectId.isValid(consultationId)) {
    res.status(400).json({ success: false, message: "Invalid consultation ID" });
    return null;
  }

  const transaction = await TransactionHistroy.findById(consultationId);
  if (!transaction) {
    res.status(404).json({ success: false, message: "Consultation not found" });
    return null;
  }

  if (transaction.status !== "completed") {
    // endChat's transaction.status="completed" write can still be in flight
    // (Socket.IO emit -> DB transaction commit) the instant the rating modal
    // opens right after it. `code` lets the frontend retry this specific
    // case automatically instead of showing the customer a raw error for a
    // timing gap that resolves itself within a moment.
    res.status(400).json({
      success: false,
      code: "NOT_COMPLETED",
      message: "This consultation hasn't finished yet, so it can't be rated.",
    });
    return null;
  }

  const senderId = String(transaction.senderId);
  const receiverId = String(transaction.receiverId);
  const authId = String(authUserId);
  const isParticipant = authId === senderId || authId === receiverId;
  if (!isParticipant) {
    res.status(403).json({
      success: false,
      message: "You weren't part of this consultation.",
    });
    return null;
  }

  const authUser = await User.findById(authUserId).select("userType shop_id");
  if (!authUser || authUser.userType !== "customer") {
    // Only the customer side may rate — a consultant hitting this endpoint
    // for their own session (or anyone else's) is rejected outright.
    res.status(403).json({
      success: false,
      message: "Only the customer who took part can rate this consultation.",
    });
    return null;
  }

  // The consultant is whichever participant ISN'T the authenticated
  // customer — derived from the transaction record, never accepted as an
  // input field.
  const consultantId = authId === senderId ? receiverId : senderId;

  return {
    transaction,
    consultantId,
    shopId: String(transaction.shop_id),
    consultationType: transaction.type,
  };
};

/**
 * POST /api/ratings
 * Body: { consultationId, rating, feedback }
 * Auth: Bearer token (authenticateToken) — same mechanism UserChat.js /
 * VideoCallingPage.js already use for every other authenticated call.
 */
const submitRating = async (req, res) => {
  try {
    const authUserId = await resolveAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { consultationId } = req.body || {};
    const ratingValue = Number(req.body?.rating);
    const feedbackRaw = req.body?.feedback;

    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be a whole number from 1 to 5." });
    }

    let feedback = "";
    if (feedbackRaw != null) {
      if (typeof feedbackRaw !== "string") {
        return res.status(400).json({ success: false, message: "Invalid feedback" });
      }
      feedback = feedbackRaw.trim().slice(0, MAX_FEEDBACK_LENGTH);
    }

    const eligibility = await resolveRatingEligibility(authUserId, consultationId, res);
    if (!eligibility) return; // response already sent

    const rating = await Rating.create({
      customerId: authUserId,
      consultantId: eligibility.consultantId,
      consultationId,
      shopId: eligibility.shopId,
      consultationType: eligibility.consultationType,
      rating: ratingValue,
      feedback,
    });

    return res.status(201).json({
      success: true,
      message: "Thanks for your feedback!",
      data: {
        id: rating._id,
        rating: rating.rating,
        feedback: rating.feedback,
        createdAt: rating.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      // The unique (customerId, consultationId) index — this is the actual
      // duplicate-rating guard, not just a disabled Submit button.
      return res.status(409).json({
        success: false,
        message: "You've already rated this consultation.",
      });
    }
    console.error("submitRating error:", error);
    return res.status(500).json({ success: false, message: "Failed to save rating" });
  }
};

/**
 * GET /api/ratings/consultation/:consultationId
 * Lets the client check (e.g. after a refresh) whether the authenticated
 * customer has already rated this consultation, without re-deriving
 * eligibility client-side — used to avoid showing a stale rating prompt.
 */
const getRatingForConsultation = async (req, res) => {
  try {
    const authUserId = await resolveAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { consultationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(consultationId)) {
      return res.status(400).json({ success: false, message: "Invalid consultation ID" });
    }

    const existing = await Rating.findOne({
      customerId: authUserId,
      consultationId,
    }).select("rating feedback createdAt");

    return res.status(200).json({
      success: true,
      rated: Boolean(existing),
      data: existing
        ? { rating: existing.rating, feedback: existing.feedback, createdAt: existing.createdAt }
        : null,
    });
  } catch (error) {
    console.error("getRatingForConsultation error:", error);
    return res.status(500).json({ success: false, message: "Failed to check rating" });
  }
};

/**
 * Aggregates a consultant's real rating summary. Returns a clearly-empty
 * shape (average: null, total: 0) rather than any fabricated placeholder
 * when the consultant has no ratings yet — callers must render "No ratings
 * yet" for that case, never a fake number.
 */
const getConsultantRatingSummary = async (consultantId) => {
  const rows = await Rating.aggregate([
    { $match: { consultantId: new mongoose.Types.ObjectId(consultantId) } },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const distribution = [0, 0, 0, 0, 0]; // index 0 = 1-star ... index 4 = 5-star
  let total = 0;
  let sum = 0;
  rows.forEach((row) => {
    const star = Number(row._id);
    if (star >= 1 && star <= 5) {
      distribution[star - 1] = row.count;
      total += row.count;
      sum += star * row.count;
    }
  });

  return {
    average: total > 0 ? Number((sum / total).toFixed(2)) : null,
    total,
    // Most-stars-first (5-star ... 1-star), matching the existing demo
    // ratingBreakdown shape consultant-card.js already renders.
    distribution: [distribution[4], distribution[3], distribution[2], distribution[1], distribution[0]],
  };
};

/**
 * Real completed-consultation count for a consultant — every finished chat,
 * voice, or video session, regardless of type. Rejected/never-connected/
 * abandoned sessions never reach status "completed" so they're already
 * excluded by construction (same status field chat/call billing sets).
 */
const getConsultantTotalConversations = async (consultantId) => {
  const id = new mongoose.Types.ObjectId(consultantId);
  return TransactionHistroy.countDocuments({
    status: "completed",
    $or: [{ senderId: id }, { receiverId: id }],
  });
};

module.exports = {
  submitRating,
  getRatingForConsultation,
  getConsultantRatingSummary,
  getConsultantTotalConversations,
};
