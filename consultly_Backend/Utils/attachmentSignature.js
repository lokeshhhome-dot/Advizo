const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();

// Short-lived, self-issued signed link for the attachment-file route — that
// route is hit directly by <img src>/new-tab links, which can't carry an
// Authorization header, so access is gated by this HMAC instead. Reuses the
// existing JWT_SECRET_KEY rather than introducing a new secret env var.
function signAttachmentToken(messageId, expiresAtMs) {
    return crypto
        .createHmac("sha256", process.env.JWT_SECRET_KEY)
        .update(`${messageId}:${expiresAtMs}`)
        .digest("hex");
}

function verifyAttachmentToken(messageId, expiresAtMs, signature) {
    const expNum = Number(expiresAtMs);
    if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
    if (typeof signature !== "string" || !signature) return false;

    const expected = signAttachmentToken(messageId, expNum);
    const expectedBuf = Buffer.from(expected, "hex");
    const givenBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== givenBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

module.exports = { signAttachmentToken, verifyAttachmentToken };
