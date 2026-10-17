/**
 * Jyotisham Astro API client — the ONLY module that knows the provider's
 * URLs, auth scheme and response envelope. Everything above it works with
 * normalized Advizo shapes, so swapping providers means replacing this file
 * (and the normalizers), not the controller or the storefront.
 *
 * Contract (per the provider's published Postman collection,
 * documenter.getpostman.com/view/22952033/2sA3s4nWfA):
 *   - Base:  https://api.jyotishamastroapi.com
 *   - Auth:  request header `key: <api key>`
 *   - All endpoints used here are GET with query params.
 *   - JSON envelope: { status: 200, response: {...}, callsRemaining: N }
 *   - chart_image/* returns an SVG document as a string.
 *
 * The API key is read from the environment only, sent only in a server-to-
 * server header, and never logged (nor are query strings, which carry birth
 * data).
 */
const axios = require("axios");
const { AstrologyError } = require("./astrologyErrors");

const DEFAULT_BASE_URL = "https://api.jyotishamastroapi.com";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_SVG_BYTES = 300 * 1024;
const LOW_CREDIT_WARN_AT = 500;

// Languages the provider documents for `lang`.
const SUPPORTED_LANGS = ["en", "hi", "ta", "te", "ka", "ml", "be", "gr", "mr"];
const CHART_STYLES = ["north", "south", "east"];

const getConfig = () => ({
  baseUrl: String(process.env.ASTROLOGY_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
  apiKey: String(process.env.ASTROLOGY_API_KEY || "").trim(),
  timeoutMs: Number(process.env.ASTROLOGY_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
});

const isConfigured = () => Boolean(getConfig().apiKey);

// One startup line so `pm2 logs` shows immediately whether this server
// process can serve astrology. Logs a boolean only — never the key.
if (isConfigured()) {
  console.log("[astrology] ASTROLOGY_API_KEY configured = true");
} else {
  console.warn(
    "[astrology] ASTROLOGY_API_KEY configured = false — astrology tools will show " +
    "\"not available\". Add ASTROLOGY_API_KEY to advizo_Backend/.env ON THE SERVER and restart.",
  );
}

const errorForStatus = (status, path) => {
  const detail = `jyotisham ${path} -> HTTP/status ${status}`;
  if (status === 401 || status === 403) return new AstrologyError("PROVIDER_AUTH", { detail });
  if (status === 402 || status === 429) return new AstrologyError("PROVIDER_QUOTA", { detail });
  if (status === 400 || status === 422) {
    return new AstrologyError("INVALID_INPUT", {
      message: "These details couldn't be calculated. Please check the date, time and place.",
      detail,
    });
  }
  if (status >= 500) return new AstrologyError("PROVIDER_UNAVAILABLE", { detail });
  return new AstrologyError("PROVIDER_BAD_RESPONSE", { detail });
};

const request = async (path, params) => {
  const { baseUrl, apiKey, timeoutMs } = getConfig();
  if (!apiKey) {
    throw new AstrologyError("NOT_CONFIGURED", { detail: "ASTROLOGY_API_KEY is not set" });
  }

  let res;
  try {
    res = await axios.get(`${baseUrl}${path}`, {
      params,
      headers: { key: apiKey, Accept: "application/json, image/svg+xml, */*" },
      timeout: timeoutMs,
      maxContentLength: 2 * 1024 * 1024,
      validateStatus: () => true,
    });
  } catch (err) {
    const timedOut = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" ||
      /timeout/i.test(err.message || "");
    throw new AstrologyError(timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", {
      detail: `jyotisham ${path} -> ${err.code || err.message}`,
    });
  }

  if (res.status < 200 || res.status >= 300) throw errorForStatus(res.status, path);
  return res.data;
};

/** Unwraps { status, response, callsRemaining } and checks it. */
const unwrapEnvelope = (data, path) => {
  if (!data || typeof data !== "object") {
    throw new AstrologyError("PROVIDER_BAD_RESPONSE", { detail: `jyotisham ${path} -> non-object body` });
  }
  const status = Number(data.status);
  if (Number.isFinite(status) && status !== 200) throw errorForStatus(status, path);
  if (!data.response || typeof data.response !== "object") {
    throw new AstrologyError("PROVIDER_BAD_RESPONSE", { detail: `jyotisham ${path} -> missing response` });
  }
  const remaining = Number(data.callsRemaining);
  if (Number.isFinite(remaining) && remaining < LOW_CREDIT_WARN_AT) {
    console.warn(`[astrology] Jyotisham credits running low: ${remaining} calls remaining`);
  }
  return data.response;
};

const getJson = async (path, params) => unwrapEnvelope(await request(path, params), path);

/**
 * Charts come back as an SVG string (sometimes JSON-encoded, sometimes in
 * the envelope). Returned only after basic shape + size checks; the
 * storefront renders it through an <img> data URI, so any script inside an
 * SVG could not execute regardless.
 */
const getSvg = async (path, params) => {
  const data = await request(path, params);
  let svg = typeof data === "string" ? data : data && typeof data.response === "string" ? data.response : "";
  if (data && typeof data === "object" && Number.isFinite(Number(data.status)) && Number(data.status) !== 200) {
    throw errorForStatus(Number(data.status), path);
  }
  svg = svg.trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg) || Buffer.byteLength(svg) > MAX_SVG_BYTES) {
    throw new AstrologyError("PROVIDER_BAD_RESPONSE", { detail: `jyotisham ${path} -> not an svg` });
  }
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return withViewBoxMargin(svg);
};

/**
 * The provider draws planet labels close to (sometimes past) its fixed
 * width/height, which clips them once scaled in an <img>. Giving the root a
 * viewBox with a small even margin keeps every label visible without
 * touching the chart's content.
 */
const withViewBoxMargin = (svg) => {
  const open = /^<svg\b[^>]*>/i.exec(svg);
  if (!open || /\bviewBox\s*=/i.test(open[0])) return svg;
  const w = Number((/\bwidth\s*=\s*["']?([\d.]+)/i.exec(open[0]) || [])[1]);
  const h = Number((/\bheight\s*=\s*["']?([\d.]+)/i.exec(open[0]) || [])[1]);
  if (!w || !h) return svg;
  const m = Math.round(Math.max(w, h) * 0.1);
  return svg.replace(/^<svg\b/i, `<svg viewBox="${-m} ${-m} ${w + 2 * m} ${h + 2 * m}"`);
};

// -------------------------------------------------------------- param sets

const lang = (value) => (SUPPORTED_LANGS.includes(value) ? value : "en");

/** Shared single-chart params: date (dd/mm/yyyy), time, lat, lon, tz. */
const chartParams = (p, options = {}) => ({
  date: p.providerDate,
  time: p.time,
  latitude: p.latitude,
  longitude: p.longitude,
  tz: p.tz,
  lang: lang(options.lang),
});

const matchParams = (boy, girl, options = {}) => ({
  boy_dob: boy.providerDate,
  boy_tob: boy.time,
  boy_lat: boy.latitude,
  boy_lon: boy.longitude,
  boy_tz: boy.tz,
  girl_dob: girl.providerDate,
  girl_tob: girl.time,
  girl_lat: girl.latitude,
  girl_lon: girl.longitude,
  girl_tz: girl.tz,
  lang: lang(options.lang),
});

// -------------------------------------------------------------- endpoints

const jyotishamProvider = {
  name: "jyotisham",
  isConfigured,
  CHART_STYLES,

  // Panchang
  panchang: (p, o) => getJson("/api/panchang/panchang", chartParams(p, o)),

  // Kundli building blocks
  extendedKundli: (p, o) => getJson("/api/extended_horoscope/extended_kundali", chartParams(p, o)),
  planetDetails: (p, o) => getJson("/api/horoscope/planet-details", chartParams(p, o)),
  currentMahadasha: (p, o) => getJson("/api/dasha/current-mahadasha", chartParams(p, o)),
  mangalDosh: (p, o) => getJson("/api/dosha/mangal_dosh", chartParams(p, o)),
  kaalsarpDosh: (p, o) => getJson("/api/dosha/kaalsarp-dosh", chartParams(p, o)),
  chartSvg: (division, p, o = {}) =>
    getSvg(`/api/chart_image/${division}`, {
      ...chartParams(p, o),
      style: CHART_STYLES.includes(o.style) ? o.style : "north",
      colored_planets: true,
      color: "#1f2a44",
    }),

  // Match Making
  aggregateMatch: (boy, girl, o) => getJson("/api/matching/aggregate-match", matchParams(boy, girl, o)),
  ashtakootMatch: (boy, girl, o) => getJson("/api/matching/ashtakoot-astro", matchParams(boy, girl, o)),
};

module.exports = { jyotishamProvider };
