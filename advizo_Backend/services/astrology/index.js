/**
 * AstrologyService — the feature registry.
 *
 * Each feature declares how to validate its input, which provider calls it
 * makes, how to normalize them, and how long the result may be cached. The
 * controller has ONE generic handler that works for every entry here, so a
 * new tool (Horoscope, Dasha, Numerology, ...) is: a provider method in
 * jyotishamProvider.js, a normalizer, an entry below, and a renderer in the
 * storefront astrology.js — no new route/controller plumbing.
 */
const { jyotishamProvider: provider } = require("./jyotishamProvider");
const { AstrologyError } = require("./astrologyErrors");
const { buildKey, getOrCompute } = require("./astrologyCache");
const { normalizeBirthDetails, normalizePanchangInput, toProviderDate } = require("./astrologyInput");
const { normalizeKundli } = require("./normalizers/kundliNormalizer");
const { normalizePanchang } = require("./normalizers/panchangNormalizer");
const { normalizeMatchmaking } = require("./normalizers/matchmakingNormalizer");

/** Normalized place/date -> the numeric point every provider call takes. */
const toPoint = (n) => ({
  providerDate: toProviderDate(n.date),
  time: n.time,
  latitude: n.place.latitude,
  longitude: n.place.longitude,
  tz: n.tz,
});

const chartStyle = (s) => (provider.CHART_STYLES.includes(s) ? s : "north");

/**
 * Runs named provider calls in parallel. Optional calls may fail — their
 * section is reported as unavailable instead of failing the whole reading;
 * if every REQUIRED call fails, the first required failure is thrown.
 */
const settle = async (calls, required) => {
  const names = Object.keys(calls);
  const results = await Promise.allSettled(names.map((n) => calls[n]()));
  const data = {};
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") data[names[i]] = r.value;
    else {
      failed.push(names[i]);
      console.warn(`[astrology] provider call "${names[i]}" failed: ${r.reason?.code} ${r.reason?.detail || r.reason?.message || ""}`);
    }
  });
  if (required.every((n) => failed.includes(n))) {
    throw results[names.indexOf(required[0])].reason;
  }
  return { data, failed };
};

const FEATURES = {
  kundli: {
    label: "Kundli",
    cacheTtlSeconds: 15 * 60,
    parseInput: (body) => ({
      person: normalizeBirthDetails(body?.person, "person."),
      style: chartStyle(body?.options?.chartStyle),
    }),
    cacheParams: (input) => ({ p: toPoint(input.person), style: input.style }),
    title: (input) => (input.person.name ? `Kundli · ${input.person.name}` : "Kundli"),
    async compute(input) {
      const p = toPoint(input.person);
      const opts = { style: input.style };
      const SECTION_OF = {
        extended: "summary", planets: "planets", d1: "charts", d9: "charts",
        dasha: "dasha", mangal: "doshas", kaalsarp: "doshas",
      };
      const { data, failed } = await settle(
        {
          extended: () => provider.extendedKundli(p),
          planets: () => provider.planetDetails(p),
          d1: () => provider.chartSvg("d1", p, opts),
          d9: () => provider.chartSvg("d9", p, opts),
          dasha: () => provider.currentMahadasha(p),
          mangal: () => provider.mangalDosh(p),
          kaalsarp: () => provider.kaalsarpDosh(p),
        },
        ["extended", "planets"],
      );
      return {
        result: normalizeKundli(data),
        unavailableSections: [...new Set(failed.map((f) => SECTION_OF[f]))],
      };
    },
  },

  panchang: {
    label: "Panchang",
    // Panchang depends only on date/time/place — safe and cheap to share longer.
    cacheTtlSeconds: 60 * 60,
    parseInput: (body) => normalizePanchangInput(body),
    cacheParams: (input) => toPoint(input),
    title: (input) => `Panchang · ${input.place.name.split(",")[0]}`,
    async compute(input) {
      const raw = await provider.panchang(toPoint(input));
      const result = normalizePanchang(raw);
      if (!result.limbs) {
        throw new AstrologyError("PROVIDER_BAD_RESPONSE", { detail: "panchang: no limbs in response" });
      }
      return { result, unavailableSections: [] };
    },
  },

  matchmaking: {
    label: "Match Making",
    cacheTtlSeconds: 15 * 60,
    parseInput: (body) => ({
      boy: normalizeBirthDetails(body?.boy, "boy."),
      girl: normalizeBirthDetails(body?.girl, "girl."),
    }),
    cacheParams: (input) => ({ boy: toPoint(input.boy), girl: toPoint(input.girl) }),
    title: (input) =>
      input.boy.name && input.girl.name
        ? `Match · ${input.boy.name} & ${input.girl.name}`
        : "Match Making",
    async compute(input) {
      const boy = toPoint(input.boy);
      const girl = toPoint(input.girl);
      const { data, failed } = await settle(
        {
          aggregate: () => provider.aggregateMatch(boy, girl),
          ashtakoot: () => provider.ashtakootMatch(boy, girl),
        },
        ["aggregate", "ashtakoot"],
      );
      return {
        result: normalizeMatchmaking(data),
        unavailableSections: failed.map((f) => (f === "aggregate" ? "overall" : "ashtakoot")),
      };
    },
  },
};

const getFeature = (key) => (Object.prototype.hasOwnProperty.call(FEATURES, key) ? FEATURES[key] : null);

const listFeatures = () => Object.keys(FEATURES).map((key) => ({ key, label: FEATURES[key].label }));

/**
 * Validate -> cache/compute -> normalized result. Never touches identity or
 * persistence (the controller owns those).
 */
const runFeature = async (featureKey, body, { shop }) => {
  const feature = getFeature(featureKey);
  if (!feature) throw new AstrologyError("NOT_FOUND");
  if (!provider.isConfigured()) {
    throw new AstrologyError("NOT_CONFIGURED", { detail: "ASTROLOGY_API_KEY is not set" });
  }

  const input = feature.parseInput(body || {});
  const key = buildKey(shop, featureKey, feature.cacheParams(input));
  const { value, cached } = await getOrCompute(
    key,
    feature.cacheTtlSeconds,
    () => feature.compute(input),
    (v) => v.unavailableSections.length === 0,
  );

  return {
    feature: featureKey,
    title: feature.title(input),
    input,
    result: value.result,
    unavailableSections: value.unavailableSections,
    cached,
    provider: provider.name,
  };
};

module.exports = { runFeature, getFeature, listFeatures, isConfigured: provider.isConfigured };
