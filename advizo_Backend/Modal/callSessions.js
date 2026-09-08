const { mongoose } = require("mongoose");

const callSessionsSchema = new mongoose.Schema(
    {
        sessionId: { type: String, required: true, unique: true },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ragisterUser",
            required: true,
        },
        callUniqueId: {
            type: String
        },
        callerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ragisterUser",
            required: true,
        },
        transtionId: { type: String },
        callType: {
            type: String,
            enum: ["voice", "video"],
            default: "voice",
        },
        shopId: {
            type: String
        },
        startTime: { type: Date,},
        endTime: { type: Date },
        status: {
            type: String,
            enum: [
                "ringing",
                "active",
                "ongoing",
                "ended",
                "completed",
                "missed",
                "cancelled",
                "pending",
                "failed",
            ],
            default: "pending",
        },
        stateLog: [
            {
                from: String,
                to: String,
                reason: String,
                at: { type: Date, default: Date.now },
            },
        ],
        lastActivityAt: { type: Date },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
    },

    { timestamps: true }
);

callSessionsSchema.index({ receiverId: 1, startTime: -1 });
callSessionsSchema.index({ callerId: 1, startTime: -1 });
// Orphan-cleanup cron: find({ status:$in['ongoing','active'], updatedAt:$lt }).
callSessionsSchema.index({ status: 1, updatedAt: 1 });
// Reverse lookup from a transaction back to its session during orphan cleanup.
callSessionsSchema.index({ transtionId: 1 });
const CallSession = mongoose.model("CallSession", callSessionsSchema);

module.exports = { CallSession };