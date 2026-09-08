const crypto = require('crypto');

/**
 * Verify a Shopify webhook. Requires the RAW request body (Buffer) — the route
 * must be mounted with express.raw before this middleware.
 *
 * Uses a constant-time comparison and never logs the HMAC values or body.
 */
function verifyWebhook(req, res, next) {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const secret = process.env.SHOPIFY_API_SECRET;

    if (!hmacHeader || !secret || !Buffer.isBuffer(req.body)) {
        return res.status(401).send('Invalid webhook');
    }

    const generatedHash = crypto
        .createHmac('sha256', secret)
        .update(req.body)
        .digest('base64');

    const a = Buffer.from(generatedHash);
    const b = Buffer.from(hmacHeader);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).send('HMAC mismatch');
    }

    next(); // verified
}

module.exports = { verifyWebhook };
