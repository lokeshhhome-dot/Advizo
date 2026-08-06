const mongoose = require("mongoose");

const knowledgeBaseSchema = new mongoose.Schema(
    {
        shopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "shopifyShop",
            required: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        category: {
            type: String,
            default: "General",
            trim: true,
            index: true,
        },

        question: {
            type: String,
            required: true,
            trim: true,
        },

        answer: {
            type: String,
            required: true,
            trim: true,
        },

        keywords: [{
            type: String,
            trim: true,
        }],

        // Ollama embedding
        embedding: {
            type: [Number],
            default: [],
            select: false,
        },

        isDefault: {
            type: Boolean,
            default: false,
            index: true,
        },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
            index: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Search indexes
knowledgeBaseSchema.index({
    shopId: 1,
    status: 1,
});

knowledgeBaseSchema.index({
    shopId: 1,
    category: 1,
});

knowledgeBaseSchema.index({
    title: "text",
    question: "text",
    answer: "text",
});

module.exports =
    mongoose.models.KnowledgeBase ||
    mongoose.model("KnowledgeBase", knowledgeBaseSchema);