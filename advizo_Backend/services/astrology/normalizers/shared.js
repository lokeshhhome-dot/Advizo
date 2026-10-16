/**
 * Small helpers shared by the normalizers. The rule they enforce: a field
 * only reaches the storefront if the provider actually returned a usable
 * value for it — no defaults, no placeholders, no invented interpretation.
 */

const EMPTY_STRINGS = new Set(["", "-", " - ", "--", "n/a", "na", "null", "undefined"]);

/** Trimmed non-empty string, a finite number, or null. */
const val = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    return EMPTY_STRINGS.has(s.toLowerCase()) ? null : s;
  }
  return null;
};

const bool = (v) => (typeof v === "boolean" ? v : null);

const round = (n, dp = 2) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 10 ** dp) / 10 ** dp : null;
};

/** {label, value} only when value is present. */
const fact = (label, value) => {
  const v = val(value);
  return v === null ? null : { label, value: v };
};

const facts = (...items) => items.filter(Boolean);

/** Array of non-empty strings from a string|array. */
const list = (v) => {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr.map(val).filter((x) => x !== null).map(String);
};

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

const titleCase = (s) =>
  String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** Drops null/undefined/empty-array/empty-object keys. */
const compact = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (obj(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
};

module.exports = { val, bool, round, fact, facts, list, obj, titleCase, compact };
