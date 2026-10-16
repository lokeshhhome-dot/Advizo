/**
 * Jyotisham Kundli responses -> Advizo Kundli shape.
 *
 * Input is the settled set of provider calls (any may be missing if that
 * call failed — its section is then listed in `unavailableSections` rather
 * than faked). Field names read here are exactly those in the provider's
 * documented sample responses for:
 *   extended_horoscope/extended_kundali, horoscope/planet-details,
 *   dasha/current-mahadasha, dosha/mangal_dosh, dosha/kaalsarp-dosh,
 *   chart_image/d1, chart_image/d9.
 */
const { val, bool, round, fact, facts, list, obj, titleCase, compact } = require("./shared");

const DASHA_LABELS = {
  mahadasha: "Mahadasha",
  antardasha: "Antardasha",
  paryantardasha: "Pratyantar dasha",
  shookshamadasha: "Sookshma dasha",
  pranadasha: "Prana dasha",
};

const normalizeSummary = (ext, planets) => {
  const e = obj(ext) || {};
  const p = obj(planets) || {};
  const cards = [
    val(e.ascendant_sign) && {
      key: "ascendant",
      label: "Ascendant (Lagna)",
      value: val(e.ascendant_sign),
      note: val(e.ascendant_nakshatra) ? `${val(e.ascendant_nakshatra)} nakshatra` : null,
    },
    val(e.rasi || p.rasi) && {
      key: "moon",
      label: "Moon sign (Rashi)",
      value: val(e.rasi || p.rasi),
      note: val(e.rasi_lord) ? `Lord: ${val(e.rasi_lord)}` : null,
    },
    val(e.sun_sign) && { key: "sun", label: "Sun sign", value: val(e.sun_sign), note: null },
    val(e.nakshatra || p.nakshatra) && {
      key: "nakshatra",
      label: "Birth nakshatra",
      value: val(e.nakshatra || p.nakshatra),
      note: [
        val(e.nakshatra_pada ?? p.nakshatra_pada) !== null ? `Pada ${val(e.nakshatra_pada ?? p.nakshatra_pada)}` : null,
        val(e.nakshatra_lord) ? `Lord: ${val(e.nakshatra_lord)}` : null,
      ].filter(Boolean).join(" · ") || null,
    },
  ];
  return cards.filter(Boolean).map(compact);
};

const normalizeAttributes = (ext) => {
  const e = obj(ext);
  if (!e) return [];
  return facts(
    fact("Gana", e.gana),
    fact("Yoni", e.yoni),
    fact("Vasya", e.vasya),
    fact("Nadi", e.nadi),
    fact("Varna", e.varna),
    fact("Paya", e.paya),
    fact("Tatva", e.tatva),
    fact("Tithi at birth", e.tithi),
    fact("Yoga at birth", e.yoga),
    fact("Karana at birth", e.karana),
    fact("Name syllables", e.name_start),
  );
};

const normalizeGemstones = (ext, planets) => {
  const e = obj(ext) || {};
  const p = obj(planets) || {};
  return facts(
    fact("Life stone", e.life_stone),
    fact("Lucky stone", e.lucky_stone),
    fact("Fortune stone", e.fortune_stone),
    fact("Lucky gem", list(p.lucky_gem).join(", ")),
    fact("Lucky numbers", list(p.lucky_num).join(", ")),
    fact("Lucky colours", list(p.lucky_colors).join(", ")),
    fact("Lucky letters", list(p.lucky_letters).join(", ")),
  );
};

const normalizePlanets = (planets) => {
  const p = obj(planets);
  if (!p) return [];
  return Object.keys(p)
    .filter((k) => /^\d+$/.test(k) && obj(p[k]) && val(p[k].full_name))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => {
      const x = p[k];
      return compact({
        name: val(x.full_name),
        abbr: val(x.name),
        sign: val(x.zodiac),
        signLord: val(x.zodiac_lord),
        degree: round(x.local_degree),
        house: val(x.house),
        nakshatra: val(x.nakshatra),
        nakshatraLord: val(x.nakshatra_lord),
        pada: val(x.nakshatra_pada),
        status: val(x.lord_status),
        avastha: val(x.basic_avastha),
        combust: bool(x.is_combust),
      });
    });
};

const normalizeBirthPanchang = (planets) => {
  const bp = obj(obj(planets)?.panchang);
  if (!bp) return [];
  const ayanamsa = round(bp.ayanamsa, 4);
  return facts(
    fact("Day of birth", bp.day_of_birth),
    fact("Day lord", bp.day_lord),
    fact("Hora lord", bp.hora_lord),
    fact("Sunrise", bp.sunrise_at_birth),
    fact("Sunset", bp.sunset_at_birth),
    fact("Tithi", bp.tithi),
    fact("Yoga", bp.yoga),
    fact("Karana", bp.karana),
    fact(
      "Ayanamsa",
      ayanamsa !== null ? `${ayanamsa}°${val(bp.ayanamsa_name) ? ` (${val(bp.ayanamsa_name)})` : ""}` : null,
    ),
  );
};

const normalizeDasha = (dasha) => {
  const d = obj(dasha);
  if (!d) return null;
  const order = Array.isArray(d.order_names) ? d.order_names : Object.keys(DASHA_LABELS);
  const periods = order
    .map((key) => {
      const x = obj(d[key]);
      if (!x || !val(x.name)) return null;
      return compact({
        level: DASHA_LABELS[String(key).toLowerCase()] || titleCase(key),
        planet: val(x.name),
        start: val(x.start),
        end: val(x.end),
      });
    })
    .filter(Boolean);
  return periods.length ? { periods } : null;
};

const normalizeMangal = (m) => {
  const x = obj(m);
  if (!x || bool(x.is_dosha_present) === null) return null;
  const factors = obj(x.factors) ? Object.values(x.factors) : x.factors;
  const cancellation = obj(x.cancellation);
  return compact({
    key: "mangal",
    title: "Mangal Dosha",
    present: bool(x.is_dosha_present),
    partial: bool(x.is_anshik),
    summary: val(x.bot_response),
    score: val(x.score),
    details: list(factors),
    cancellations: list(cancellation?.cancellationReason),
  });
};

const normalizeKaalsarp = (k) => {
  const x = obj(k);
  if (!x || bool(x.is_dosha_present) === null) return null;
  return compact({
    key: "kaalsarp",
    title: "Kaal Sarp Dosha",
    present: bool(x.is_dosha_present),
    summary: val(x.bot_response),
    remedies: list(x.remedies),
  });
};

/**
 * @param {object} raw  { extended, planets, dasha, mangal, kaalsarp, d1, d9 }
 *                      — provider `response` objects / SVG strings, or undefined
 */
const normalizeKundli = (raw) => {
  const charts = [
    raw.d1 && { key: "d1", title: "Rashi chart (D1)", caption: "Lagna chart — sign placements at birth", svg: raw.d1 },
    raw.d9 && { key: "d9", title: "Navamsa chart (D9)", caption: "Divisional chart used for marriage and inner strength", svg: raw.d9 },
  ].filter(Boolean);

  const doshas = [normalizeMangal(raw.mangal), normalizeKaalsarp(raw.kaalsarp)].filter(Boolean);
  const planets = obj(raw.planets);

  const result = compact({
    summary: normalizeSummary(raw.extended, raw.planets),
    charts,
    planets: normalizePlanets(raw.planets),
    attributes: normalizeAttributes(raw.extended),
    birthPanchang: normalizeBirthPanchang(raw.planets),
    dasha: normalizeDasha(raw.dasha),
    dashaAtBirth: planets
      ? compact({
        birth: val(planets.birth_dasa),
        birthDate: val(planets.birth_dasa_time),
        current: val(planets.current_dasa),
        currentDate: val(planets.current_dasa_time),
      })
      : null,
    doshas,
    gemstones: normalizeGemstones(raw.extended, raw.planets),
  });
  return result;
};

module.exports = { normalizeKundli };
