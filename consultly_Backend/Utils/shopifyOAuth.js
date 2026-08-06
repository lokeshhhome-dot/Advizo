const crypto = require("crypto");

const normalizeBaseUrl = (url) => {
  if (!url || typeof url !== "string") return null;

  let normalized = url.trim().replace(/\/+$/, "");

  if (normalized.endsWith("/api")) {
    normalized = normalized.slice(0, -4);
  }

  return normalized || null;
};

const getRequestBaseUrl = (req) => {
  const forwardedProto = req?.get?.("x-forwarded-proto");
  const forwardedHost = req?.get?.("x-forwarded-host");
  const protocol = (forwardedProto || req?.protocol || "https")
    .split(",")[0]
    .trim();
  const host = (forwardedHost || req?.get?.("host") || req?.headers?.host || "")
    .split(",")[0]
    .trim();

  if (!host) return null;
  return `${protocol}://${host}`.replace(/\/+$/, "");
};

const getAppBaseUrl = (req) => {
  // A configured redirect URI is authoritative — derive the base from it so
  // the begin/callback endpoints always live on the same origin.
  if (process.env.SHOPIFY_REDIRECT_URI?.trim()) {
    return process.env.SHOPIFY_REDIRECT_URI.trim()
      .replace(/\/+$/, "")
      .replace(/\/api\/app\/callback$/, "");
  }

  let baseUrl = normalizeBaseUrl(process.env.APP_URL);

  if (
    !baseUrl ||
    baseUrl.includes("${HOST}") ||
    baseUrl.includes("${PORT}")
  ) {
    baseUrl = getRequestBaseUrl(req);
  }

  if (!baseUrl) {
    throw new Error(
      "OAuth base URL cannot be resolved. Set APP_URL or SHOPIFY_REDIRECT_URI.",
    );
  }

  return baseUrl;
};

const getOAuthRedirectUri = (req) => {
  if (process.env.SHOPIFY_REDIRECT_URI?.trim()) {
    return process.env.SHOPIFY_REDIRECT_URI.trim().replace(/\/+$/, "");
  }

  return `${getAppBaseUrl(req)}/api/app/callback`;
};

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const signStatePayload = (encodedPayload) =>
  crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(encodedPayload)
    .digest("base64url");

/**
 * Self-verifying OAuth state: `base64url(payload).hmac`.
 * The payload binds a 32-byte random nonce to the shop and a timestamp, and
 * the HMAC (app secret) makes it unforgeable. The state cookie remains the
 * primary CSRF binding; the signature guarantees integrity, shop binding,
 * and a 10-minute expiry even where an embedded browser drops the cookie.
 */
const buildOAuthState = (shop) => {
  const payload = {
    n: crypto.randomBytes(32).toString("hex"),
    s: shop,
    t: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signStatePayload(encoded)}`;
};

const verifyOAuthState = (state, shop) => {
  const [encoded, signature] = String(state || "").split(".");
  if (!encoded || !signature) {
    return { valid: false, reason: "malformed state" };
  }

  const expected = signStatePayload(encoded);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (_) {
    return { valid: false, reason: "unparseable payload" };
  }

  if (!payload?.n || payload.s !== shop) {
    return { valid: false, reason: "shop mismatch" };
  }

  const age = Date.now() - Number(payload.t || 0);
  if (!Number.isFinite(age) || age < 0 || age > OAUTH_STATE_TTL_MS) {
    return { valid: false, reason: "state expired" };
  }

  return { valid: true, reason: "ok" };
};

// Development-only step tracing (never enabled in production — state values
// are secrets while an OAuth flow is in flight).
const logOAuthDebug = (context, data) => {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[oauth-debug:${context}]`, data);
};

const logOAuthRedirectUri = (redirectUri, context = "oauth") => {
  console.log(`[${context}] OAuth redirect_uri=${redirectUri}`);
  console.log(
    `[${context}] APP_URL=${process.env.APP_URL || "(not set)"} SHOPIFY_REDIRECT_URI=${process.env.SHOPIFY_REDIRECT_URI || "(not set)"}`,
  );
};

module.exports = {
  getAppBaseUrl,
  getOAuthRedirectUri,
  logOAuthRedirectUri,
  buildOAuthState,
  verifyOAuthState,
  logOAuthDebug,
  OAUTH_STATE_TTL_MS,
};
