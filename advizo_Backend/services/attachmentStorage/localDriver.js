const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "uploads", "chat-attachments");

/**
 * Local-disk implementation of the attachment storage interface. NOT
 * persistent-safe on Render (disk can reset on redeploy/restart) — this is
 * the accepted stopgap driver until a real object-storage driver (e.g. S3)
 * is added under this same folder implementing the same three methods:
 *   putObject({ key, buffer, contentType }) -> { key }
 *   getObjectStream(key) -> Readable
 *   deleteObject(key) -> void (must not throw if the object is already gone)
 * Swapping drivers is a one-line change in ./index.js — no caller changes.
 */
function resolvePath(key) {
    const safeKey = String(key).replace(/\\/g, "/");
    if (safeKey.includes("..")) {
        throw new Error("Invalid storage key");
    }
    return path.join(ROOT, safeKey);
}

async function putObject({ key, buffer }) {
    const filePath = resolvePath(key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    return { key };
}

function getObjectStream(key) {
    return fs.createReadStream(resolvePath(key));
}

async function deleteObject(key) {
    try {
        await fs.promises.unlink(resolvePath(key));
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
    }
}

module.exports = { putObject, getObjectStream, deleteObject };
