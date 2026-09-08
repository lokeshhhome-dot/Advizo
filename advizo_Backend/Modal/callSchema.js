const mongoose = require("mongoose");

const callSchema = new mongoose.Schema({
    callerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true
    },
    callType: {
        type: String,
        enum: ['voice', 'video'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'ended', 'missed'],
        default: null
    },
    channelName: {
        type: String,
        required: true
    },
    token: {
        type: String,
        required: true
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date
    },
    duration: {
        type: Number, // in seconds
        default: 0
    }
}, {
    timestamps: true
});

// Model already exists check karo - duplicate model name se bachne ke liye
// Create and export the Call model
const Call = mongoose.models.Call || mongoose.model("Call", callSchema);

module.exports = Call;
