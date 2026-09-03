const path = require("path");

const MIME_TO_EXT = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "application/pdf": [".pdf"],
};

const MIME_TO_TYPE = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "application/pdf": "pdf",
};

// Magic-byte (file signature) checks so a renamed/mislabeled file can't slip
// through on MIME type or extension alone. WEBP needs a second check at
// bytes 8-11 ("WEBP") since the first 4 bytes ("RIFF") are shared with other
// RIFF-container formats.
function matchesSignature(mimeType, buffer) {
    if (!buffer || buffer.length < 12) return false;

    switch (mimeType) {
        case "image/jpeg":
            return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        case "image/png":
            return (
                buffer[0] === 0x89 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x4e &&
                buffer[3] === 0x47
            );
        case "image/webp":
            return (
                buffer.slice(0, 4).toString("ascii") === "RIFF" &&
                buffer.slice(8, 12).toString("ascii") === "WEBP"
            );
        case "application/pdf":
            return buffer.slice(0, 4).toString("ascii") === "%PDF";
        default:
            return false;
    }
}

/**
 * Validates a candidate chat attachment against the MIME whitelist,
 * extension, and file-signature (magic bytes) all agreeing. Returns
 * { valid: true, type: "image"|"pdf" } or { valid: false, reason }.
 */
function validateAttachmentFile({ mimetype, originalname, buffer }) {
    const type = MIME_TO_TYPE[mimetype];
    if (!type) {
        return { valid: false, reason: "Unsupported file type" };
    }

    const ext = path.extname(originalname || "").toLowerCase();
    if (!MIME_TO_EXT[mimetype]?.includes(ext)) {
        return { valid: false, reason: "File extension does not match its type" };
    }

    if (!matchesSignature(mimetype, buffer)) {
        return { valid: false, reason: "File content does not match its declared type" };
    }

    return { valid: true, type };
}

module.exports = { validateAttachmentFile };
