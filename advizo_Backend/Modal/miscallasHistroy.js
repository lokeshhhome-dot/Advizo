const mongoose = require("mongoose")

const missed = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ragisterUser",
        required: true
    },
   
    type: {
        type: String,
    },
    reason: {
        type: String,
    },
    shop_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "shopifyShop",
    },
    isRead: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true })

// ---- Indexes ----
// Consultant notification bell: find({ receiverId, isRead:{$ne:true} })
// .sort({createdAt:-1}).limit(20) — polled frequently by the dashboard.
//
// `isRead` is deliberately NOT in this index. The query filters it with $ne,
// which is an inequality: Mongo cannot use an equality bound for it, and any key
// after it then stops supplying sort order — so a {receiverId, isRead, createdAt}
// index still forced a blocking in-memory SORT. Indexing (receiverId, createdAt)
// instead lets Mongo walk this consultant's rows already newest-first and stop at
// 20, filtering isRead as it goes.
missed.index({ receiverId: 1, createdAt: -1 })

const missCalled = mongoose.model("missCalleHistroy", missed)

module.exports = { missCalled }