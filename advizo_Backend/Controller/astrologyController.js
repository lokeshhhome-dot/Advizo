/**
 * App Proxy JSON endpoints for the Theme App Extension's Astrology blocks
 * (astrology.liquid / astrology.js on /pages/astrology).
 *
 * Every route here is mounted behind verifyAppProxy (Shopify-signed
 * request), and identity comes ONLY from resolveStorefrontCustomer — the
 * same shared resolution every other storefront endpoint uses. No customer
 * or user id is ever read from the browser. Guests may run calculations
 * (unless ASTROLOGY_ALLOW_GUESTS=false); saving/history require a resolved
 * customer and every saved-reading query filters on shop_id + user_id.
 *
 * Provider credentials live only in services/astrology/jyotishamProvider.js
 * (env); responses here carry normalized results and safe error codes only.
 */
const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  resolveStorefrontCustomer,
  setAppSessionCookie,
} = require("./shopifyController");
const astrologyService = require("../services/astrology");
const { searchPlaces } = require("../services/astrology/geocodingProvider");
const { AstrologyError, sendAstrologyError } = require("../services/astrology/astrologyErrors");
const { AstrologyResult, ASTROLOGY_RETENTION_DAYS } = require("../Modal/astrologyResult");
const { TtlCache } = require("../Utils/ttlCache");

const guestsAllowed = () => String(process.env.ASTROLOGY_ALLOW_GUESTS || "true").toLowerCase() !== "false";

// ------------------------------------------------------------ rate limiting
//
// App Proxy requests arrive from Shopify's servers, so a plain per-IP
// limiter (express-rate-limit on req.ip) would throttle every shopper of
// every store together. Limits are therefore keyed per shop + resolved
// customer (or the forwarded client IP for guests), with a per-shop guest
// ceiling as a backstop against a rotated X-Forwarded-For.
const rateBuckets = new TtlCache({ maxEntries: 5000 });

const hit = (key, max, windowMs) => {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs }, windowMs);
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
};

const clientKey = (req, userResult) =>
  userResult?.userId
    ? `u:${userResult.userId}`
    : `ip:${String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip}`;

const LIMITS = {
  compute: { max: 15, windowMs: 15 * 60 * 1000 },
  guestShopCompute: { max: 300, windowMs: 60 * 60 * 1000 },
  places: { max: 60, windowMs: 5 * 60 * 1000 },
};

const enforceLimit = (bucket, key) => {
  const { max, windowMs } = LIMITS[bucket];
  if (!hit(`${bucket}:${key}`, max, windowMs)) {
    throw new AstrologyError("RATE_LIMITED", { detail: `${bucket} limit for ${key}` });
  }
};

// ------------------------------------------------------------ helpers

const requireShop = (req) => {
  const shop = req.query.shop;
  if (!shop) throw new AstrologyError("INVALID_INPUT", { message: "Missing shop" });
  return shop;
};

const resolveIdentity = async (req, res, shop) => {
  const userResult = await resolveStorefrontCustomer(req, shop);
  if (userResult?.token) setAppSessionCookie(res, userResult.token);
  return userResult?.userId ? userResult : null;
};

const requireCustomer = async (req, res, shop) => {
  const user = await resolveIdentity(req, res, shop);
  if (!user || !user.shop_id) throw new AstrologyError("LOGIN_REQUIRED");
  return user;
};

const hashInput = (feature, input) =>
  crypto.createHash("sha256").update(`${feature}|${JSON.stringify(input)}`).digest("hex");

const toHistoryItem = (doc) => ({
  id: String(doc._id),
  feature: doc.feature,
  title: doc.title,
  createdAt: doc.createdAt,
  expiresAt: doc.expiresAt,
});

const sendJson = (res, status, body) => {
  res.set("Cache-Control", "no-store");
  return res.status(status).json(body);
};

// ------------------------------------------------------------ handlers

/** GET /apps/advizo/astrology/config — what the page may offer this visitor. */
const proxyAstrologyConfig = async (req, res) => {
  try {
    const shop = requireShop(req);
    const user = await resolveIdentity(req, res, shop);
    return sendJson(res, 200, {
      success: true,
      authenticated: Boolean(user),
      available: astrologyService.isConfigured(),
      guestsAllowed: guestsAllowed(),
      retentionDays: ASTROLOGY_RETENTION_DAYS,
      features: astrologyService.listFeatures(),
    });
  } catch (err) {
    return sendAstrologyError(res, err, "config");
  }
};

/** GET /apps/advizo/astrology/places?q= — place search (no identity needed). */
const placeCache = new TtlCache({ maxEntries: 1000 });
const proxyAstrologyPlaces = async (req, res) => {
  try {
    const shop = requireShop(req);
    const q = String(req.query.q || "").trim().toLowerCase().slice(0, 80);
    if (q.length < 2) return sendJson(res, 200, { success: true, places: [] });

    const cached = placeCache.get(q);
    if (cached) return sendJson(res, 200, { success: true, places: cached });

    enforceLimit("places", `${shop}:${clientKey(req, null)}`);
    const places = await searchPlaces(q);
    placeCache.set(q, places, 24 * 3600 * 1000);
    return sendJson(res, 200, { success: true, places });
  } catch (err) {
    return sendAstrologyError(res, err, "places");
  }
};

/**
 * POST /apps/advizo/astrology/:feature — run a registered feature
 * (kundli | panchang | matchmaking). Body: feature input + optional
 * `save: true` (signed-in customers only).
 */
const proxyAstrologyRun = async (req, res) => {
  const featureKey = String(req.params.feature || "");
  try {
    const shop = requireShop(req);
    if (!astrologyService.getFeature(featureKey)) throw new AstrologyError("NOT_FOUND");

    const user = await resolveIdentity(req, res, shop);
    if (!user && !guestsAllowed()) throw new AstrologyError("LOGIN_REQUIRED");

    enforceLimit("compute", `${shop}:${clientKey(req, user)}`);
    if (!user) enforceLimit("guestShopCompute", shop);

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const reading = await astrologyService.runFeature(featureKey, body, { shop });

    let savedId = null;
    if (body.save === true && user?.shop_id) {
      const inputHash = hashInput(featureKey, reading.input);
      const ownerFilter = { shop_id: user.shop_id, user_id: user.userId };
      const existing = await AstrologyResult.findOne({
        ...ownerFilter,
        inputHash,
        unavailableSections: { $size: 0 },
      }).select("_id").lean();

      if (existing) {
        savedId = String(existing._id);
      } else {
        const doc = await AstrologyResult.create({
          ...ownerFilter,
          feature: featureKey,
          title: reading.title,
          input: reading.input,
          result: reading.result,
          unavailableSections: reading.unavailableSections,
          provider: reading.provider,
          inputHash,
        });
        savedId = String(doc._id);
      }
    }

    return sendJson(res, 200, {
      success: true,
      authenticated: Boolean(user),
      feature: reading.feature,
      title: reading.title,
      input: reading.input,
      result: reading.result,
      unavailableSections: reading.unavailableSections,
      savedId,
    });
  } catch (err) {
    return sendAstrologyError(res, err, `run:${featureKey}`);
  }
};

/** GET /apps/advizo/astrology/history — the customer's own saved readings. */
const proxyAstrologyHistory = async (req, res) => {
  try {
    const shop = requireShop(req);
    const user = await requireCustomer(req, res, shop);
    const docs = await AstrologyResult.find({ shop_id: user.shop_id, user_id: user.userId })
      .select("feature title createdAt expiresAt")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    return sendJson(res, 200, { success: true, authenticated: true, items: docs.map(toHistoryItem) });
  } catch (err) {
    return sendAstrologyError(res, err, "history");
  }
};

const findOwnedReading = async (req, res) => {
  const shop = requireShop(req);
  const user = await requireCustomer(req, res, shop);
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AstrologyError("NOT_FOUND");
  return { user, filter: { _id: id, shop_id: user.shop_id, user_id: user.userId } };
};

/** GET /apps/advizo/astrology/history/:id — one saved reading (owner only). */
const proxyAstrologyReading = async (req, res) => {
  try {
    const { filter } = await findOwnedReading(req, res);
    const doc = await AstrologyResult.findOne(filter).lean();
    if (!doc) throw new AstrologyError("NOT_FOUND");
    return sendJson(res, 200, {
      success: true,
      authenticated: true,
      ...toHistoryItem(doc),
      savedId: String(doc._id),
      input: doc.input,
      result: doc.result,
      unavailableSections: doc.unavailableSections || [],
    });
  } catch (err) {
    return sendAstrologyError(res, err, "reading");
  }
};

/** POST /apps/advizo/astrology/history/:id/delete — owner-only delete. */
const proxyAstrologyDeleteReading = async (req, res) => {
  try {
    const { filter } = await findOwnedReading(req, res);
    const out = await AstrologyResult.deleteOne(filter);
    if (!out.deletedCount) throw new AstrologyError("NOT_FOUND");
    return sendJson(res, 200, { success: true, authenticated: true });
  } catch (err) {
    return sendAstrologyError(res, err, "delete");
  }
};

module.exports = {
  proxyAstrologyConfig,
  proxyAstrologyPlaces,
  proxyAstrologyRun,
  proxyAstrologyHistory,
  proxyAstrologyReading,
  proxyAstrologyDeleteReading,
};
