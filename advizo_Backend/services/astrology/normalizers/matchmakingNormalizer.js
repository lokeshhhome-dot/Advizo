/**
 * Jyotisham matching/aggregate-match + matching/ashtakoot-astro responses
 * -> Advizo Match Making shape. Field names are those in the provider's
 * documented sample responses. The provider's own matching uses boy/girl
 * roles, which this keeps (labelled with the entered names in the UI).
 */
const { val, bool, obj, compact } = require("./shared");

// [response key, per-person field suffix] in the provider's Ashtakoot order.
const KOOTS = [
  ["varna", "varna"],
  ["vasya", "vasya"],
  ["tara", "tara"],
  ["yoni", "yoni"],
  ["grahamaitri", "lord"],
  ["gana", "gana"],
  ["bhakoot", "rasi_name"],
  ["nadi", "nadi"],
];

const parseFraction = (s) => {
  const m = /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(String(s || ""));
  return m ? { score: Number(m[1]), outOf: Number(m[2]) } : null;
};

const pointPair = (p) => {
  const o = obj(p);
  if (!o) return null;
  const norm = (v) => (typeof v === "boolean" ? v : val(v));
  const boy = norm(o.boy);
  const girl = norm(o.girl);
  return boy === null && girl === null ? null : compact({ boy, girl });
};

const normalizeAshtakoot = (a) => {
  const x = obj(a);
  if (!x) return null;
  const koots = KOOTS.map(([key, suffix]) => {
    const k = obj(x[key]);
    if (!k || val(k[key]) === null || val(k.full_score) === null) return null;
    return compact({
      key,
      name: val(k.name),
      description: val(k.description),
      score: val(k[key]),
      outOf: val(k.full_score),
      boy: val(k[`boy_${suffix}`]),
      girl: val(k[`girl_${suffix}`]),
    });
  }).filter(Boolean);
  if (!koots.length && val(x.score) === null) return null;
  return compact({
    score: val(x.score),
    outOf: 36,
    summary: val(x.bot_response),
    koots,
  });
};

const normalizeAggregate = (g) => {
  const x = obj(g);
  if (!x) return { overall: null, doshas: [] };

  const doshas = [
    { key: "mangal", label: "Mangal Dosha", summary: x.mangaldosh, points: x.mangaldosh_points },
    { key: "pitra", label: "Pitra Dosha", summary: x.pitradosh, points: x.pitradosh_points },
    { key: "kaalsarp", label: "Kaal Sarp Dosha", summary: x.kaalsarpdosh, points: x.kaalsarp_points },
    { key: "manglik_saturn", label: "Manglik Dosha (Saturn)", summary: x.manglikdosh_saturn, points: x.manglikdosh_saturn_points },
    { key: "manglik_rahuketu", label: "Manglik Dosha (Rahu/Ketu)", summary: x.manglikdosh_rahuketu, points: x.manglikdosh_rahuketu_points },
  ]
    .map((d) => {
      const summary = val(d.summary);
      const points = pointPair(d.points);
      return summary || points ? compact({ key: d.key, label: d.label, summary, points }) : null;
    })
    .filter(Boolean);

  // Couple-level doshas the provider reports as a single boolean.
  [["rajju", "Rajju Dosha", x.rajjudosh], ["vedha", "Vedha Dosha", x.vedhadosh]].forEach(([key, label, v]) => {
    if (bool(v) !== null) doshas.push({ key, label, present: bool(v) });
  });

  const overall = val(x.score) !== null
    ? compact({
      score: val(x.score),
      outOf: 100,
      summary: val(x.bot_response),
      detail: val(x.extended_response),
    })
    : null;

  return {
    overall,
    ashtakootScore: parseFraction(x.ashtakoot_score),
    dashakootScore: parseFraction(x.dashkoot_score),
    doshas,
  };
};

/** @param {object} raw { aggregate, ashtakoot } — provider responses or undefined */
const normalizeMatchmaking = (raw) => {
  const agg = normalizeAggregate(raw.aggregate);
  const ashtakoot = normalizeAshtakoot(raw.ashtakoot);
  return compact({
    overall: agg.overall,
    ashtakoot: ashtakoot || (agg.ashtakootScore ? { ...agg.ashtakootScore, koots: [] } : null),
    dashakoot: agg.dashakootScore,
    doshas: agg.doshas,
  });
};

module.exports = { normalizeMatchmaking };
