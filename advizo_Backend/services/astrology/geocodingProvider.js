/**
 * Place search for birth/Panchang locations.
 *
 * Jyotisham has no place-lookup endpoint — it needs latitude, longitude and a
 * UTC offset. This resolves a typed place name to coordinates + an IANA
 * timezone (from which astrologyInput derives the offset for the exact
 * date/time). Default source: Open-Meteo's geocoding API (GeoNames data),
 * which returns the timezone with each result.
 *
 * Open-Meteo's free endpoint is for non-commercial use; for production set
 * ASTROLOGY_GEOCODER_API_KEY (and, if their docs require, the customer
 * ASTROLOGY_GEOCODER_URL) from an Open-Meteo commercial plan.
 */
const axios = require("axios");
const { AstrologyError } = require("./astrologyErrors");
const { isValidTimeZone, cleanText } = require("./astrologyInput");

const DEFAULT_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 6000;
const MAX_RESULTS = 8;

const labelFor = (r) =>
  [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : null, r.country]
    .filter(Boolean)
    .join(", ");

const searchPlaces = async (query) => {
  const q = cleanText(query, 80);
  if (q.length < 2) return [];

  const url = String(process.env.ASTROLOGY_GEOCODER_URL || DEFAULT_URL);
  const apiKey = String(process.env.ASTROLOGY_GEOCODER_API_KEY || "").trim();

  let res;
  try {
    res = await axios.get(url, {
      params: { name: q, count: MAX_RESULTS, language: "en", format: "json", ...(apiKey ? { apikey: apiKey } : {}) },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
  } catch (err) {
    throw new AstrologyError("LOCATION_LOOKUP_FAILED", { detail: `geocoder -> ${err.code || err.message}` });
  }
  if (res.status !== 200 || !res.data || typeof res.data !== "object") {
    throw new AstrologyError("LOCATION_LOOKUP_FAILED", { detail: `geocoder -> HTTP ${res.status}` });
  }

  const results = Array.isArray(res.data.results) ? res.data.results : [];
  return results
    .filter((r) =>
      Number.isFinite(Number(r.latitude)) &&
      Number.isFinite(Number(r.longitude)) &&
      isValidTimeZone(r.timezone))
    .map((r) => ({
      id: String(r.id || `${r.latitude},${r.longitude}`),
      name: labelFor(r),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      timezone: r.timezone,
      countryCode: r.country_code || null,
    }));
};

module.exports = { searchPlaces };
