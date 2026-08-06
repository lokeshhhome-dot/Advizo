const axios = require("axios");
const KnowledgeBase = require("../Modal/KnowledgeBase");

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 60000);

const FALLBACK_ANSWER =
    "I couldn't find that information in the Consultly knowledge base.";

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Retrieval layer (MVP): simple MongoDB regex search over the KnowledgeBase.
 *
 * Kept behind this single function so it can later be swapped for an
 * embeddings / vector-DB (Qdrant, Redis) implementation without touching
 * the controller or prompt code.
 */
const searchKnowledge = async (shopId, query, limit = 5) => {
    const words = String(query)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);

    if (!words.length) return [];

    const wordRegexes = words.map((w) => new RegExp(escapeRegex(w), "i"));

    const candidates = await KnowledgeBase.find({
        shopId,
        status: "active",
        $or: [
            ...wordRegexes.map((re) => ({ question: re })),
            ...wordRegexes.map((re) => ({ answer: re })),
            ...wordRegexes.map((re) => ({ title: re })),
            ...wordRegexes.map((re) => ({ keywords: re })),
        ],
    })
        .limit(50)
        .lean();

    // Score by how many query words each entry matches (question > keywords > answer).
    const scored = candidates.map((doc) => {
        const question = (doc.question || "").toLowerCase();
        const answer = (doc.answer || "").toLowerCase();
        const title = (doc.title || "").toLowerCase();
        const keywords = (doc.keywords || []).join(" ").toLowerCase();

        let score = 0;
        for (const w of words) {
            if (question.includes(w) || title.includes(w)) score += 3;
            if (keywords.includes(w)) score += 2;
            if (answer.includes(w)) score += 1;
        }
        return { doc, score };
    });

    return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.doc);
};

const buildPrompt = (matches, question) => {
    const knowledge = matches
        .map(
            (m, i) =>
                `${i + 1}. Q: ${m.question}\n   A: ${m.answer}`,
        )
        .join("\n\n");

    return [
        "You are Consultly AI Assistant, helping a Shopify store admin use the Consultly consultation app.",
        "Answer ONLY from the knowledge below. Be short and direct.",
        `If the answer cannot be found in the knowledge, say exactly: "${FALLBACK_ANSWER}"`,
        "",
        "Knowledge:",
        knowledge || "(no matching knowledge found)",
        "",
        `Question: ${question}`,
        "",
        "Answer:",
    ].join("\n");
};

/** Low-level Ollama call. Throws OLLAMA_OFFLINE if the service is unreachable. */
const askOllama = async (prompt) => {
    try {
        const response = await axios.post(
            `${OLLAMA_URL}/api/generate`,
            {
                model: OLLAMA_MODEL,
                prompt,
                stream: false,
                options: { temperature: 0.2 },
            },
            { timeout: OLLAMA_TIMEOUT_MS },
        );
        return String(response?.data?.response || "").trim();
    } catch (err) {
        const offline =
            err.code === "ECONNREFUSED" ||
            err.code === "ECONNABORTED" ||
            err.code === "ENOTFOUND" ||
            err.code === "ETIMEDOUT" ||
            !err.response;
        if (offline) {
            const e = new Error("AI service unavailable.");
            e.code = "OLLAMA_OFFLINE";
            throw e;
        }
        throw err;
    }
};

/**
 * Main entry: question -> FAQ search -> prompt -> Ollama -> reply.
 */
const answerQuestion = async ({ shopId, question }) => {
    const matches = await searchKnowledge(shopId, question);

    // Nothing relevant at all — skip the model, return the fallback directly.
    if (!matches.length) {
        return { reply: FALLBACK_ANSWER, sources: [] };
    }

    const prompt = buildPrompt(matches, question);
    const reply = await askOllama(prompt);

    return {
        reply: reply || FALLBACK_ANSWER,
        sources: matches.map((m) => ({ id: m._id, title: m.title })),
    };
};

module.exports = {
    searchKnowledge,
    buildPrompt,
    askOllama,
    answerQuestion,
    FALLBACK_ANSWER,
};
