/**
 * Jyotisham panchang/panchang response -> Advizo Panchang dashboard shape.
 * Field names are those in the provider's documented sample response.
 */
const { val, bool, fact, facts, obj, compact } = require("./shared");

const limb = (key, label, x, extra = {}) => {
  const o = obj(x);
  if (!o || !val(o.name)) return null;
  return compact({
    key,
    label,
    name: val(o.name),
    start: val(o.start),
    end: val(o.end),
    next: val(extra.next),
    meaning: val(o.meaning),
    deity: val(o.diety),
    lord: val(o.lord),
    note: val(o.special),
    tags: [extra.tag].map(val).filter(Boolean),
  });
};

const range = (a, b) => (val(a) && val(b) ? `${val(a)} – ${val(b)}` : null);

const normalizePanchang = (r) => {
  const x = obj(r) || {};
  const adv = obj(x.advanced_details) || {};
  const masa = obj(adv.masa) || {};
  const years = obj(adv.years) || {};
  const abhijit = obj(adv.abhijitMuhurta) || {};

  const tithi = obj(x.tithi) || {};
  const nak = obj(x.nakshatra) || {};

  const limbs = [
    limb("tithi", "Tithi", x.tithi, {
      next: tithi.next_tithi,
      tag: val(tithi.type) ? `${val(tithi.type)} paksha` : null,
    }),
    limb("nakshatra", "Nakshatra", x.nakshatra, {
      next: nak.next_nakshatra,
      tag: val(nak.pada) !== null ? `Pada ${val(nak.pada)}` : null,
    }),
    limb("yoga", "Yoga", x.yoga, { next: obj(x.yoga)?.next_yoga }),
    limb("karana", "Karana", x.karana, {
      next: obj(x.karana)?.next_karana,
      tag: obj(x.karana)?.type,
    }),
  ].filter(Boolean);

  const samvat = (num, name) =>
    val(num) !== null ? `${val(num)}${val(name) ? ` · ${val(name)}` : ""}` : null;

  return compact({
    date: val(x.date),
    weekday: val(obj(x.day)?.name),
    vaara: val(adv.vaara),
    limbs,
    sunMoon: facts(
      fact("Sunrise", adv.sun_rise),
      fact("Sunset", adv.sun_set),
      fact("Moonrise", adv.moon_rise),
      fact("Moonset", adv.moon_set),
      fact("Solar noon", adv.solar_noon),
    ),
    inauspicious: facts(
      fact("Rahu Kaal", x.rahukaal),
      fact("Gulika Kaal", x.gulika),
      fact("Yamaganda", x.yamakanta),
      fact("Bhadra", x.bhadrakaal),
    ),
    auspicious: facts(fact("Abhijit Muhurta", range(abhijit.start, abhijit.end))),
    calendar: facts(
      fact("Masa (Amanta)", masa.amanta_name),
      fact("Masa (Purnimanta)", masa.purnimanta_name),
      bool(masa.adhik_maasa) === true ? { label: "Adhik Maasa", value: "Yes" } : null,
      fact("Paksha", masa.paksha),
      fact("Ritu", masa.ritu),
      fact("Ayana", masa.ayana),
      fact("Moon phase", masa.moon_phase),
      fact("Vikram Samvat", samvat(years.vikram_samvaat, years.vikram_samvaat_name)),
      fact("Shaka Samvat", samvat(years.saka, years.saka_samvaat_name)),
      fact("Kali year", years.kali),
    ),
    other: facts(
      fact("Moon sign", obj(x.rasi)?.name),
      fact("Ayanamsa", obj(x.ayanamsa)?.name),
      fact("Disha Shool", adv.disha_shool),
      fact("Moon Yogini Nivas", adv.moon_yogini_nivas),
      fact("Next full moon", adv.next_full_moon),
      fact("Next new moon", adv.next_new_moon),
    ),
  });
};

module.exports = { normalizePanchang };
