/**
 * Typed errors for the astrology feature. Every failure the storefront can
 * see is one of these codes with a fixed, safe, user-facing message — raw
 * provider/axios/Mongo errors are logged server-side and never forwarded.
 */

const ERRORS = {
  INVALID_INPUT: { status: 400, message: "Please check the details you entered." },
  LOCATION_LOOKUP_FAILED: {
    status: 502,
    message: "We couldn't search for places right now. Please try again in a moment.",
  },
  LOGIN_REQUIRED: { status: 401, message: "Please sign in to use this feature." },
  NOT_FOUND: { status: 404, message: "This reading could not be found." },
  RATE_LIMITED: {
    status: 429,
    message: "You've made several requests in a short time. Please wait a few minutes and try again.",
  },
  NOT_CONFIGURED: {
    status: 503,
    message: "Astrology tools are not available on this store right now.",
  },
  PROVIDER_AUTH: {
    status: 503,
    message: "Astrology tools are temporarily unavailable. Please try again later.",
  },
  PROVIDER_QUOTA: {
    status: 503,
    message: "Astrology tools have reached their usage limit for now. Please try again later.",
  },
  PROVIDER_TIMEOUT: {
    status: 504,
    message: "The calculation is taking longer than expected. Please try again.",
  },
  PROVIDER_UNAVAILABLE: {
    status: 502,
    message: "The astrology calculation service is unavailable right now. Please try again shortly.",
  },
  PROVIDER_BAD_RESPONSE: {
    status: 502,
    message: "We received an unexpected response while preparing your reading. Please try again.",
  },
  INTERNAL: { status: 500, message: "Something went wrong. Please try again." },
};

class AstrologyError extends Error {
  /**
   * @param {keyof ERRORS} code
   * @param {object} [opts]
   * @param {string} [opts.message] safe user-facing override (validation detail)
   * @param {string} [opts.field]   form field the error belongs to
   * @param {string} [opts.detail]  server-side-only diagnostic, never sent
   */
  constructor(code, opts = {}) {
    const def = ERRORS[code] || ERRORS.INTERNAL;
    super(opts.message || def.message);
    this.code = ERRORS[code] ? code : "INTERNAL";
    this.status = def.status;
    this.field = opts.field || null;
    this.detail = opts.detail || null;
  }
}

const toSafeError = (err) => {
  if (err instanceof AstrologyError) return err;
  return new AstrologyError("INTERNAL", { detail: err?.message });
};

/** Sends the safe JSON shape every astrology endpoint uses for failures. */
const sendAstrologyError = (res, err, logLabel) => {
  const safe = toSafeError(err);
  if (safe.code === "INTERNAL" || safe.status >= 500) {
    console.error(`[astrology] ${logLabel} failed: ${safe.code}`, safe.detail || err?.stack || err);
  }
  res.set("Cache-Control", "no-store");
  return res.status(safe.status).json({
    success: false,
    code: safe.code,
    message: safe.message,
    ...(safe.field ? { field: safe.field } : {}),
  });
};

module.exports = { AstrologyError, sendAstrologyError };
