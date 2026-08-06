const { assertAdminShopAccess } = require("../Auth/auth");
const { answerQuestion } = require("../services/aiService");
const { ensureDefaultKnowledge } = require("../services/knowledgeBaseService");

const MAX_MESSAGE_LENGTH = 2000;

/**
 * POST /api/admin/ai/chat/:adminId
 * Body: { message: "..." }
 * Admin-only (Shopify session token + shop ownership check).
 */
const aiChatController = async (req, res) => {
    try {
        const { adminId } = req.params;
        if (!(await assertAdminShopAccess(req, res, adminId))) return;

        const message =
            typeof req.body?.message === "string" ? req.body.message.trim() : "";

        if (!message) {
            return res
                .status(400)
                .json({ success: false, message: "Message is required." });
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
            });
        }

        // First use for this shop: import the FAQ content into the KnowledgeBase.
        await ensureDefaultKnowledge(adminId);

        const { reply, sources } = await answerQuestion({
            shopId: adminId,
            question: message,
        });

        return res.json({ success: true, reply, sources });
    } catch (err) {
        if (err.code === "OLLAMA_OFFLINE") {
            return res
                .status(503)
                .json({ success: false, message: "AI service unavailable." });
        }
        console.error("AI chat failed:", err);
        return res
            .status(500)
            .json({ success: false, message: "Something went wrong." });
    }
};

module.exports = { aiChatController };
