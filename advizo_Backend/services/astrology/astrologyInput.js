/**
 * Validation + normalization of storefront astrology input.
 *
 * The storefront sends a place it picked from /astrology/places (name,
 * latitude, longitude, IANA timezone). Jyotisham itself only accepts a
 * decimal UTC offset (`tz`, e.g. 5.5), and that offset has to be the one
 * in force AT the birth date/time (DST and historical zone changes), so it
 * is derived here from the IANA zone via Intl — never trusted from the
 * browser.
 */
const { AstrologyError } = require("./astrologyErrors");

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_YEAR = 1900;
const MAX_NAME = 60;
const MAX_PLACE_LABEL = 160;

const invalid = (message, field) => new AstrologyError("INVALID_INPUT", { message, field });

const cleanText = (value, max) =>
  String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const isValidTimeZone = (tz) => {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Today's calendar date (YYYY-MM-DD) in the given IANA zone. */
const todayInZone = (timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/** UTC offset in minutes for `timeZone` at the given UTC instant. */
const offsetMinutesAt = (timeZone, utcMs) => {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === "timeZoneName")?.value;
  // "GMT", "GMT+05:30", "GMT-04:00"
  const m = /GMT(?:([+-])(\d{2}):?(\d{2})?)?/.exec(label || "");
  if (!m || !m[1]) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === "-" ? -mins : mins;
};

/**
 * Offset (decimal hours, as Jyotisham's `tz` expects) in force at a LOCAL
 * wall-clock date/time in `timeZone`. Two passes settle DST boundaries.
 */
const decimalOffsetForLocal = (timeZone, date, time) => {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  let offset = offsetMinutesAt(timeZone, wallAsUtc);
  offset = offsetMinutesAt(timeZone, wallAsUtc - offset * 60000);
  return Math.round((offset / 60) * 100) / 100;
};

const parseDate = (value, field, { allowFuture }) => {
  const m = DATE_RE.exec(String(value || ""));
  if (!m) throw invalid("Please enter a valid date.", field);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw invalid("Please enter a valid date.", field);
  }
  if (y < MIN_YEAR) throw invalid(`Please enter a date from ${MIN_YEAR} onwards.`, field);
  if (!allowFuture && dt.getTime() > Date.now() + 24 * 3600 * 1000) {
    throw invalid("Date of birth can't be in the future.", field);
  }
  if (allowFuture && y > new Date().getUTCFullYear() + 5) {
    throw invalid("Please choose a date within the next few years.", field);
  }
  return m[0];
};

const parseTime = (value, field, missingMessage) => {
  const raw = String(value || "").trim();
  if (!raw) throw invalid(missingMessage, field);
  const m = TIME_RE.exec(raw);
  if (!m) throw invalid("Please enter a valid time.", field);
  return m[0];
};

const parsePlace = (place, field) => {
  if (!place || typeof place !== "object") {
    throw invalid("Please choose a place from the suggestions.", field);
  }
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw invalid("Please choose a place from the suggestions.", field);
  }
  if (!isValidTimeZone(place.timezone)) {
    throw invalid("Please choose a place from the suggestions.", field);
  }
  const name = cleanText(place.name, MAX_PLACE_LABEL);
  if (!name) throw invalid("Please choose a place from the suggestions.", field);
  return {
    name,
    // 4 dp ≈ 11 m — far finer than any astrological calculation needs, and
    // it makes equal places produce equal cache keys.
    latitude: Math.round(latitude * 10000) / 10000,
    longitude: Math.round(longitude * 10000) / 10000,
    timezone: place.timezone,
  };
};

/** A person's birth details (Kundli, each Match Making partner). */
const normalizeBirthDetails = (raw, prefix = "") => {
  const src = raw && typeof raw === "object" ? raw : {};
  const date = parseDate(src.date, `${prefix}date`, { allowFuture: false });
  const time = parseTime(
    src.time,
    `${prefix}time`,
    "Birth time is required — the ascendant and house positions change roughly every two hours.",
  );
  const place = parsePlace(src.place, `${prefix}place`);
  return {
    name: cleanText(src.name, MAX_NAME),
    date,
    time,
    place,
    tz: decimalOffsetForLocal(place.timezone, date, time),
  };
};

/** Panchang: a date + moment at a place (no personal data). */
const normalizePanchangInput = (raw) => {
  const src = raw && typeof raw === "object" ? raw : {};
  const place = parsePlace(src.place, "place");
  const date = src.date
    ? parseDate(src.date, "date", { allowFuture: true })
    : todayInZone(place.timezone);
  const time = src.time ? parseTime(src.time, "time", "") : "06:00";
  return { date, time, place, tz: decimalOffsetForLocal(place.timezone, date, time) };
};

/** YYYY-MM-DD -> dd/mm/yyyy (the format Jyotisham documents for `date`). */
const toProviderDate = (isoDate) => {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
};

module.exports = {
  normalizeBirthDetails,
  normalizePanchangInput,
  toProviderDate,
  isValidTimeZone,
  decimalOffsetForLocal,
  cleanText,
};
