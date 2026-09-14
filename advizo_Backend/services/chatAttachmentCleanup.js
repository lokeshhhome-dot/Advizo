const { MessageModal } = require("../Modal/messageSchema");
const { getAttachmentStorage } = require("./attachmentStorage");

// Matches the plain-setInterval pattern already used for call-session cleanup
// (services/callSessionManager.js's startOrphanCleanupJob) — no cron library
// exists in this repo, so this follows the same convention rather than
// introducing one.
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 500;

async function cleanupExpiredAttachments() {
    const storage = getAttachmentStorage();
    const now = new Date();

    const expired = await MessageModal.find({
        "attachment.expiresAt": { $lte: now },
        "attachment.purgedAt": null,
    })
        .select("_id attachment")
        .limit(BATCH_LIMIT);

    let purged = 0;
    for (const msg of expired) {
        try {
            await storage.deleteObject(msg.attachment.storageKey);
        } catch (err) {
            console.error(
                `[chat-attachment-cleanup] delete failed for message ${msg._id}:`,
                err.message,
            );
            continue; // leave purgedAt unset — retried next run
        }

        // The Message document and its attachment metadata are kept — only
        // the stored bytes are purged, so chat activity-history stays intact. Access
        // is already blocked by attachment.expiresAt regardless of purgedAt.
        await MessageModal.updateOne(
            { _id: msg._id },
            { $set: { "attachment.purgedAt": now } },
        );
        purged += 1;
    }

    if (purged) {
        console.log(`[chat-attachment-cleanup] purged ${purged} expired attachment(s)`);
    }
}

function startChatAttachmentCleanupJob() {
    cleanupExpiredAttachments().catch((err) =>
        console.error("[chat-attachment-cleanup] initial run failed:", err.message),
    );
    return setInterval(() => {
        cleanupExpiredAttachments().catch((err) =>
            console.error("[chat-attachment-cleanup] run failed:", err.message),
        );
    }, CLEANUP_INTERVAL_MS);
}

module.exports = { startChatAttachmentCleanupJob, cleanupExpiredAttachments };
