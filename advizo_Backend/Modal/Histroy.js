const mongoose = require("mongoose");

const SnapshotSchema = new mongoose.Schema(
   {
      fullname: String,
      email: String,
      contactNumber: String,
   },
   { _id: false }
);

const ConversationSchema = new mongoose.Schema(
   {
      consultantId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Consultant",
         required: true,
      },
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "ragisterUser",
         required: true,
      },
      userSnapshot: SnapshotSchema,
      consultantSnapshot: SnapshotSchema, 
      type: {
         type: String,
         enum: ["voice", "video", "chat"],
         default: "voice",
      },
      startTime: { type: Date, required: true },
      endTime: { type: Date },
      durationSeconds: { type: Number, default: 0 },
      transcript: { type: String },
      recordingUrl: { type: String },
     
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
   },
   { timestamps: true }
);

ConversationSchema.index({ consultantId: 1, startTime: -1 });
ConversationSchema.index({ userId: 1, startTime: -1 });

// Model already exists check karo - duplicate model name se bachne ke liye
const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);

module.exports = { Conversation };
