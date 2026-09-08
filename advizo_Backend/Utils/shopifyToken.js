/**
 * Centralized Shopify Admin API token lifecycle.
 *
 * Shopify now issues EXPIRING offline tokens (access token ~1h + rotating
 * refresh token ~90d) for new public apps; legacy non-expiring tokens keep
 * working for shops installed before the mandate. Every Admin API call must
 * resolve its token through getShopAccessToken() so both kinds work:
 *
 *   - legacy shop (no refreshToken stored)  -> return accessToken unchanged
 *   - expiring shop, token still fresh      -> return cached accessToken
 *   - expiring shop, token expired/expiring -> refresh, persist, return new
 *
 * Never log token values.
 */
const axios = require("axios");
const { shopModel } = require("../Modal/shopify");

// Refresh slightly before the real expiry so an in-flight request never
// crosses the boundary mid-call.
const REFRESH_BUFFER_MS = 2 * 60 * 1000;

// Overlay of freshly rotated tokens, keyed by shop _id. Callers often hold
// stale lean copies of the shop doc (e.g. from a 5-minute doc cache); this
// map guarantees they still get the newest token without a DB read.
const freshTokens = new Map();

// One refresh per shop at a time — concurrent callers await the same promise.
const inFlightRefreshes = new Map();

const toMs = (value) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const isStillValid = (expiresAtMs) =>
  expiresAtMs > 0 && expiresAtMs - REFRESH_BUFFER_MS > Date.now();

/**
 * Normalize a token-exchange / refresh response into the fields we persist.
 * Returns null for legacy (non-expiring) responses that carry no refresh_token.
 */
const buildExpiringFields = (data) => {
  if (!data?.refresh_token) return null;
  const now = Date.now();
  const accessTtlMs = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 60 * 60 * 1000;
  const refreshTtlMs =
    Number(data.refresh_token_expires_in) > 0
      ? Number(data.refresh_token_expires_in) * 1000
      : 90 * 24 * 60 * 60 * 1000;
  return {
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(now + accessTtlMs),
    refreshTokenExpiresAt: new Date(now + refreshTtlMs),
  };
};

const persistRotatedTokens = async (shopId, accessToken, expiringFields) => {
  await shopModel.updateOne(
    { _id: shopId },
    {
      $set: {
        accessToken,
        refreshToken: expiringFields?.refreshToken || null,
        accessTokenExpiresAt: expiringFields?.accessTokenExpiresAt || null,
        refreshTokenExpiresAt: expiringFields?.refreshTokenExpiresAt || null,
      },
    },
  );
};

const refreshShopAccessToken = async (shopDoc) => {
  const shopId = String(shopDoc._id);
  const existing = inFlightRefreshes.get(shopId);
  if (existing) return existing;

  const doRefresh = (async () => {
    console.log(`[shopifyToken] Refreshing expired token for ${shopDoc.shop}`);
    const response = await axios.post(
      `https://${shopDoc.shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: shopDoc.refreshToken,
      },
      { timeout: 15000 },
    );

    const accessToken = response.data?.access_token;
    if (!accessToken) {
      throw new Error("Refresh response missing access_token");
    }

    const expiringFields = buildExpiringFields(response.data);
    await persistRotatedTokens(shopId, accessToken, expiringFields);

    freshTokens.set(shopId, {
      accessToken,
      accessTokenExpiresAtMs: toMs(expiringFields?.accessTokenExpiresAt),
      refreshToken: expiringFields?.refreshToken || null,
    });

    console.log(`[shopifyToken] Access token refreshed for ${shopDoc.shop}`);
    return accessToken;
  })().finally(() => inFlightRefreshes.delete(shopId));

  inFlightRefreshes.set(shopId, doRefresh);
  return doRefresh;
};

/**
 * Resolve a working Admin API access token for a shop.
 *
 * @param {object|string} shopRef — a shop document (full or lean; must carry
 *   _id, shop, accessToken, refreshToken, accessTokenExpiresAt when available)
 *   OR a myshopify domain string OR a shop _id string.
 * @returns {Promise<string|null>} a usable token, or null if none exists.
 */
const getShopAccessToken = async (shopRef) => {
  try {
    let shopDoc = shopRef;

    if (typeof shopRef === "string") {
      const query = shopRef.includes(".myshopify.com")
        ? { shop: shopRef }
        : { _id: shopRef };
      shopDoc = await shopModel
        .findOne(query)
        .select("_id shop accessToken refreshToken accessTokenExpiresAt refreshTokenExpiresAt")
        .lean();
    }

    if (!shopDoc?.accessToken) return null;

    // Legacy non-expiring token: nothing to manage.
    if (!shopDoc.refreshToken) {
      const overlay = shopDoc._id ? freshTokens.get(String(shopDoc._id)) : null;
      // (A shop could have been migrated after this stale doc was cached.)
      if (!overlay) return shopDoc.accessToken;
    }

    const shopId = String(shopDoc._id);

    // Newest rotated token wins over whatever stale doc the caller holds.
    const overlay = freshTokens.get(shopId);
    if (overlay && isStillValid(overlay.accessTokenExpiresAtMs)) {
      return overlay.accessToken;
    }

    if (!overlay && isStillValid(toMs(shopDoc.accessTokenExpiresAt))) {
      return shopDoc.accessToken;
    }

    // Expired (or unknown expiry) — refresh with the newest refresh token we
    // know about. If the caller's doc is stale, re-read from the DB so we
    // never send an already-rotated refresh token.
    let refreshSource = shopDoc;
    if (overlay?.refreshToken) {
      refreshSource = { ...shopDoc, refreshToken: overlay.refreshToken };
    } else {
      const latest = await shopModel
        .findById(shopId)
        .select("_id shop accessToken refreshToken accessTokenExpiresAt")
        .lean();
      if (latest) {
        if (!latest.refreshToken) return latest.accessToken; // legacy after all
        if (isStillValid(toMs(latest.accessTokenExpiresAt))) {
          return latest.accessToken; // someone else refreshed already
        }
        refreshSource = latest;
      }
    }

    try {
      return await refreshShopAccessToken(refreshSource);
    } catch (err) {
      console.error(
        `[shopifyToken] Refresh failed for ${shopDoc.shop}:`,
        err.response?.data?.error || err.message,
      );
      // Fall back to the stored token — if it is genuinely dead the Admin API
      // call fails exactly as it would have before this helper existed.
      return shopDoc.accessToken;
    }
  } catch (err) {
    console.error("[shopifyToken] getShopAccessToken error:", err.message);
    return typeof shopRef === "object" ? shopRef?.accessToken || null : null;
  }
};

/** Called from the OAuth callback so a fresh install's tokens are cached. */
const rememberFreshInstallTokens = (shopId, accessToken, expiringFields) => {
  if (!shopId || !accessToken) return;
  freshTokens.set(String(shopId), {
    accessToken,
    accessTokenExpiresAtMs: toMs(expiringFields?.accessTokenExpiresAt),
    refreshToken: expiringFields?.refreshToken || null,
  });
};

module.exports = {
  getShopAccessToken,
  buildExpiringFields,
  rememberFreshInstallTokens,
};
