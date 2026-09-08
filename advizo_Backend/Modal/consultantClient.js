const mongoose = require("mongoose");

const ConsultantClientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ragisterUser",
            // required: true
        },
        consultantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ragisterUser",
            required: true
        },
        shop_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "shopifyShop",
            required: true
        },
      
    },
    { timestamps: true }
);

// ---- Indexes ----
// "Have we already linked this client?" check runs on every accepted call and
// every chat message: findOne({ userId, consultantId, shop_id }).
ConsultantClientSchema.index({ userId: 1, consultantId: 1, shop_id: 1 });

// Consultant's client list: find({ consultantId }).sort({createdAt:-1}).
ConsultantClientSchema.index({ consultantId: 1, createdAt: -1 });

const ConsultantClient = mongoose.models.consultantClient || mongoose.model("consultantClient", ConsultantClientSchema);

module.exports = { ConsultantClient };
