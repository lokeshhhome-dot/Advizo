const localDriver = require("./localDriver");

// Add an "s3" (or other) entry here — implementing the same putObject /
// getObjectStream / deleteObject interface as localDriver.js — to migrate
// storage providers without touching any route/controller/socket code.
const DRIVERS = {
    local: localDriver,
};

function getAttachmentStorage() {
    const driverName = process.env.CHAT_ATTACHMENT_STORAGE_DRIVER || "local";
    const driver = DRIVERS[driverName];
    if (!driver) {
        throw new Error(`Unknown CHAT_ATTACHMENT_STORAGE_DRIVER "${driverName}"`);
    }
    return driver;
}

module.exports = { getAttachmentStorage };
