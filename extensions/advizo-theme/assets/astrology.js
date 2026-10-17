/**
 * advizo — Astrology Experience storefront bundle (Kundli · Panchang ·
 * Match Making). Loaded ONLY on /pages/astrology (see astrology.liquid's
 * page guard) — the Home page entry block ships no JS at all.
 *
 * Vanilla JS, no build step, no framework — same constraints as
 * my-profile.js. All data comes from App Proxy JSON endpoints; the browser
 * never talks to the astrology provider and never holds its credentials:
 *   GET  /apps/advizo/astrology/config
 *   GET  /apps/advizo/astrology/places?q=
 *   POST /apps/advizo/astrology/{kundli|panchang|matchmaking}
 *   GET  /apps/advizo/astrology/history
 *   GET  /apps/advizo/astrology/history/:id
 *   POST /apps/advizo/astrology/history/:id/delete
 *
 * Identity is resolved server-side from Shopify's signed proxy request —
 * this file never reads or sends a customer id.
 *
 * Refresh survival: the last result per tool is kept in sessionStorage
 * (this tab only, cleared when it closes). A signed-in customer can also
 * save a reading; its id (never birth data) goes in the URL as &reading=.
 */
(function () {
  "use strict";

  function logErr() {
    console.error.apply(console, ["[Astrology]"].concat([].slice.call(arguments)));
  }

  var TOOLS = {
    kundli: {
      label: "Kundli",
      title: "Kundli",
      lede: "Your birth chart: Rashi and Navamsa charts, planetary positions, current dasha and doshas.",
      submit: "Generate Kundli",
      loadingTitle: "Preparing your birth chart",
      loadingText: "Calculating planetary positions and drawing your charts.",
    },
    panchang: {
      label: "Panchang",
      title: "Panchang",
      lede: "The Vedic calendar for a date and place: the five limbs, sun and moon timings, and the day's periods.",
      submit: "Get Panchang",
      loadingTitle: "Reading the day's Panchang",
      loadingText: "Working out tithi, nakshatra and timings for the selected place.",
    },
    matchmaking: {
      label: "Match Making",
      title: "Match Making",
      lede: "Compare two birth charts using Ashtakoot guna milan, alongside dosha checks for both partners.",
      submit: "Check compatibility",
      loadingTitle: "Comparing both charts",
      loadingText: "Calculating guna milan and checking doshas for both partners.",
    },
  };
  var TOOL_ORDER = ["kundli", "panchang", "matchmaking"];
  var SESSION_PREFIX = "advizo:astro:v1:";
  var REQUEST_TIMEOUT_MS = 45000;
  var SLOW_NOTICE_MS = 9000;

  var ICON = {
    kundli: '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="5" y="5" width="30" height="30" rx="1.5"/><path d="M5 5l30 30M35 5L5 35M20 5l15 15-15 15L5 20z"/></svg>',
    panchang: '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M4 27h32"/><path d="M11 27a9 9 0 0 1 18 0"/><path d="M20 9v4M9.4 13.4l2.8 2.8M30.6 13.4l-2.8 2.8"/><path d="M7 33h4M18 33h4M29 33h4"/></svg>',
    matchmaking: '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="15" cy="20" r="10"/><circle cx="25" cy="20" r="10"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };

  // ------------------------------------------------------------ utilities

  function escapeHtml(str) {
    return String(str === null || str === undefined ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function has(v) {
    return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /** "1990-06-15" -> "15 Jun 1990" (no timezone shifting). */
  function formatIsoDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return iso || "";
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  /** Provider "2024/08/21" -> "Wednesday, 21 August 2024". */
  function formatProviderDate(s) {
    var m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(s || ""));
    if (!m) return s || "";
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function formatTime(t) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(t || ""));
    if (!m) return t || "";
    var d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function formatOffset(tz) {
    var n = Number(tz);
    if (!isFinite(n)) return "";
    var sign = n < 0 ? "−" : "+";
    var abs = Math.abs(n);
    var h = Math.floor(abs);
    var mins = Math.round((abs - h) * 60);
    return "UTC" + sign + h + (mins ? ":" + pad(mins) : "");
  }

  function formatCreated(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function svgDataUri(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function sessionGet(key) {
    try {
      var raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function sessionSet(key, value) {
    try { window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(value)); } catch (e) { /* quota / private mode */ }
  }
  function sessionDel(key) {
    try { window.sessionStorage.removeItem(SESSION_PREFIX + key); } catch (e) { /* ignore */ }
  }

  /**
   * JSON request to the App Proxy. Resolves { ok, status, data }; never
   * rejects for HTTP errors — callers read the safe `code`/`message`.
   */
  function api(url, opts) {
    opts = opts || {};
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeout || REQUEST_TIMEOUT_MS) : null;
    var init = {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    };
    if (controller) init.signal = controller.signal;
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init)
      .then(function (res) {
        return res.json().then(
          function (data) { return { ok: res.ok && data && data.success === true, status: res.status, data: data || {} }; },
          function () { return { ok: false, status: res.status, data: { code: "BAD_RESPONSE" } }; }
        );
      })
      .catch(function (err) {
        var aborted = err && err.name === "AbortError";
        return { ok: false, status: 0, data: { code: aborted ? "CLIENT_TIMEOUT" : "NETWORK" } };
      })
      .then(function (out) {
        if (timer) clearTimeout(timer);
        return out;
      });
  }

  function errorMessage(data) {
    if (data && data.message) return data.message;
    if (data && data.code === "CLIENT_TIMEOUT") return "This is taking longer than expected. Please check your connection and try again.";
    if (data && data.code === "NETWORK") return "We couldn't reach the store. Please check your connection and try again.";
    return "Something went wrong. Please try again.";
  }

  // ------------------------------------------------------------ markup: forms

  function fieldError(id) {
    return '<p class="advizo-astro__field-error" id="' + id + '-err" hidden></p>';
  }

  function placeField(uid, field, label) {
    var id = uid + "-" + field.replace(/\./g, "-");
    return (
      '<div class="advizo-astro__field advizo-astro__field--place" data-picker="' + field + '">' +
      '<label class="advizo-astro__label" for="' + id + '">' + escapeHtml(label) + "</label>" +
      '<div class="advizo-astro__place">' +
      '<span class="advizo-astro__place-icon">' + ICON.pin + "</span>" +
      '<input class="advizo-astro__input advizo-astro__place-input" id="' + id + '" type="text" autocomplete="off" spellcheck="false"' +
      ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + '-list"' +
      ' aria-describedby="' + id + '-hint ' + id + '-err" placeholder="Start typing a city or town">' +
      '<ul class="advizo-astro__place-list" id="' + id + '-list" role="listbox" hidden></ul>' +
      "</div>" +
      '<p class="advizo-astro__hint" id="' + id + '-hint" data-place-hint>Choose a place from the list — we use its coordinates and time zone.</p>' +
      fieldError(id) +
      "</div>"
    );
  }

  function textField(uid, field, label, opts) {
    var id = uid + "-" + field.replace(/\./g, "-");
    opts = opts || {};
    return (
      '<div class="advizo-astro__field">' +
      '<label class="advizo-astro__label" for="' + id + '">' + escapeHtml(label) +
      (opts.optional ? ' <span class="advizo-astro__optional">Optional</span>' : "") + "</label>" +
      '<input class="advizo-astro__input" id="' + id + '" data-field="' + field + '" type="' + (opts.type || "text") + '"' +
      (opts.max ? ' max="' + opts.max + '"' : "") +
      (opts.min ? ' min="' + opts.min + '"' : "") +
      (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : "") +
      (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : "") +
      (opts.value ? ' value="' + escapeHtml(opts.value) + '"' : "") +
      ' aria-describedby="' + (opts.hint ? id + "-hint " : "") + id + '-err">' +
      (opts.hint ? '<p class="advizo-astro__hint" id="' + id + '-hint">' + escapeHtml(opts.hint) + "</p>" : "") +
      fieldError(id) +
      "</div>"
    );
  }

  var BIRTH_TIME_HINT = "Needed for an accurate chart — the ascendant and house positions change roughly every two hours.";

  function personFields(uid, prefix, nameLabel) {
    return (
      textField(uid, prefix + "name", nameLabel, { optional: true, maxlength: 60, autocomplete: "off" }) +
      '<div class="advizo-astro__row">' +
      textField(uid, prefix + "date", "Date of birth", { type: "date", max: todayIso(), min: "1900-01-01" }) +
      textField(uid, prefix + "time", "Time of birth", { type: "time", hint: BIRTH_TIME_HINT }) +
      "</div>" +
      placeField(uid, prefix + "place", "Place of birth")
    );
  }

  function privacyNote(app) {
    var saveText = app.config && app.config.authenticated
      ? " Readings are only stored if you choose to save them (kept for " + app.config.retentionDays + " days, deletable any time)."
      : " Nothing is stored on our side — results stay in this browser tab only.";
    return (
      '<p class="advizo-astro__privacy">' + ICON.lock +
      "<span>Your birth details are used only to calculate this reading." + escapeHtml(saveText) + "</span></p>"
    );
  }

  function saveToggle(app, uid, tool) {
    if (!app.config || !app.config.authenticated || tool === "panchang") return "";
    return (
      '<label class="advizo-astro__save" for="' + uid + '-save">' +
      '<input type="checkbox" id="' + uid + '-save" data-save>' +
      "<span>Save this reading to my account</span></label>"
    );
  }

  function formMarkup(app, tool) {
    var uid = app.uid + "-" + tool;
    var body = "";
    if (tool === "kundli") {
      body = '<fieldset class="advizo-astro__fieldset"><legend class="advizo-visually-hidden">Birth details</legend>' +
        personFields(uid, "person.", "Name") + "</fieldset>";
    } else if (tool === "panchang") {
      body =
        '<fieldset class="advizo-astro__fieldset"><legend class="advizo-visually-hidden">Date and place</legend>' +
        '<div class="advizo-astro__row">' +
        textField(uid, "date", "Date", { type: "date", value: todayIso(), min: "1900-01-01" }) +
        textField(uid, "time", "Time", { type: "time", value: nowTime(), hint: "Panchang is calculated for this moment at the chosen place." }) +
        "</div>" +
        placeField(uid, "place", "Place") +
        "</fieldset>";
    } else {
      body =
        '<p class="advizo-astro__note">Traditional Ashtakoot matching scores the two charts in fixed roles (boy and girl), so please enter each partner in the matching section.</p>' +
        '<div class="advizo-astro__pair">' +
        '<fieldset class="advizo-astro__fieldset advizo-astro__fieldset--card"><legend class="advizo-astro__legend">Boy\'s details</legend>' +
        personFields(uid, "boy.", "Name") + "</fieldset>" +
        '<fieldset class="advizo-astro__fieldset advizo-astro__fieldset--card"><legend class="advizo-astro__legend">Girl\'s details</legend>' +
        personFields(uid, "girl.", "Name") + "</fieldset>" +
        "</div>";
    }
    return (
      '<form class="advizo-astro__form" novalidate data-form="' + tool + '">' +
      '<div class="advizo-astro__form-error" role="alert" hidden></div>' +
      body +
      '<div class="advizo-astro__actions">' +
      saveToggle(app, uid, tool) +
      '<button type="submit" class="advizo-astro__btn advizo-astro__btn--primary" data-submit>' +
      escapeHtml(TOOLS[tool].submit) + "</button>" +
      "</div>" +
      privacyNote(app) +
      "</form>"
    );
  }

  function loadingMarkup(tool, placeName) {
    return (
      '<div class="advizo-astro__loading" role="status">' +
      '<span class="advizo-astro__orbit advizo-astro__orbit--lg" aria-hidden="true"><span></span></span>' +
      '<p class="advizo-astro__loading-title">' + escapeHtml(TOOLS[tool].loadingTitle) + "</p>" +
      '<p class="advizo-astro__loading-text">' + escapeHtml(TOOLS[tool].loadingText) + "</p>" +
      (placeName ? '<p class="advizo-astro__loading-place">' + ICON.pin + "<span>" + escapeHtml(placeName) + "</span></p>" : "") +
      '<p class="advizo-astro__loading-slow" data-slow hidden>Still working — the calculation service is taking a little longer than usual.</p>' +
      "</div>"
    );
  }

  // ------------------------------------------------------------ markup: results

  function factsGrid(items, mod) {
    if (!has(items)) return "";
    return (
      '<dl class="advizo-astro__facts' + (mod ? " advizo-astro__facts--" + mod : "") + '">' +
      items.map(function (f) {
        return '<div class="advizo-astro__fact"><dt>' + escapeHtml(f.label) + "</dt><dd>" + escapeHtml(f.value) + "</dd></div>";
      }).join("") +
      "</dl>"
    );
  }

  function section(title, inner, opts) {
    if (!inner) return "";
    opts = opts || {};
    return (
      '<details class="advizo-astro__section"' + (opts.closed ? "" : " open") + ">" +
      '<summary class="advizo-astro__section-title"><span>' + escapeHtml(title) + "</span>" +
      (opts.badge ? '<span class="advizo-astro__count">' + escapeHtml(opts.badge) + "</span>" : "") +
      '<span class="advizo-astro__chevron" aria-hidden="true"></span></summary>' +
      '<div class="advizo-astro__section-body">' + inner + "</div>" +
      "</details>"
    );
  }

  function unavailableNote(list, labels) {
    if (!has(list)) return "";
    var names = list.map(function (k) { return labels[k] || k; });
    return (
      '<p class="advizo-astro__partial" role="note">Some sections couldn\'t be calculated this time and are not shown: ' +
      escapeHtml(names.join(", ")) + ". Generating the reading again usually fixes this.</p>"
    );
  }

  function personMeta(p) {
    if (!p) return "";
    var bits = [formatIsoDate(p.date), formatTime(p.time), p.place && p.place.name, formatOffset(p.tz)].filter(has);
    return escapeHtml(bits.join(" · "));
  }

  function presenceBadge(present, partial) {
    if (present === true) {
      return '<span class="advizo-astro__badge advizo-astro__badge--warn">' + (partial ? "Partially present" : "Present") + "</span>";
    }
    if (present === false) return '<span class="advizo-astro__badge advizo-astro__badge--ok">Not present</span>';
    return "";
  }

  function renderKundli(r, input) {
    var html = "";
    var p = input && input.person;

    if (has(r.summary)) {
      html += '<div class="advizo-astro__signature">' + r.summary.map(function (c) {
        return '<div class="advizo-astro__sig"><p class="advizo-astro__sig-label">' + escapeHtml(c.label) + "</p>" +
          '<p class="advizo-astro__sig-value">' + escapeHtml(c.value) + "</p>" +
          (c.note ? '<p class="advizo-astro__sig-note">' + escapeHtml(c.note) + "</p>" : "") + "</div>";
      }).join("") + "</div>";
    }

    if (has(r.charts)) {
      html += section("Charts", '<div class="advizo-astro__charts">' + r.charts.map(function (c) {
        return '<figure class="advizo-astro__chart"><img src="' + svgDataUri(c.svg) + '" alt="' +
          escapeHtml(c.title + (p && p.name ? " for " + p.name : "")) + '" width="300" height="300" loading="lazy" decoding="async">' +
          '<figcaption><strong>' + escapeHtml(c.title) + "</strong>" + (c.caption ? "<span>" + escapeHtml(c.caption) + "</span>" : "") + "</figcaption></figure>";
      }).join("") + "</div>");
    }

    if (has(r.planets)) {
      var rows = r.planets.map(function (pl) {
        return "<tr>" +
          '<th scope="row" data-label="Planet">' + escapeHtml(pl.name) + (pl.combust === true ? ' <span class="advizo-astro__tag">Combust</span>' : "") + "</th>" +
          '<td data-label="Sign">' + escapeHtml(pl.sign || "—") + (pl.signLord ? '<span class="advizo-astro__sub">' + escapeHtml(pl.signLord) + "</span>" : "") + "</td>" +
          '<td data-label="Degree">' + (has(pl.degree) ? escapeHtml(pl.degree + "°") : "—") + "</td>" +
          '<td data-label="House">' + escapeHtml(has(pl.house) ? pl.house : "—") + "</td>" +
          '<td data-label="Nakshatra">' + escapeHtml(pl.nakshatra || "—") + (has(pl.pada) ? '<span class="advizo-astro__sub">Pada ' + escapeHtml(pl.pada) + (pl.nakshatraLord ? " · " + escapeHtml(pl.nakshatraLord) : "") + "</span>" : "") + "</td>" +
          '<td data-label="Status">' + escapeHtml(pl.status || "—") + (pl.avastha ? '<span class="advizo-astro__sub">' + escapeHtml(pl.avastha) + "</span>" : "") + "</td>" +
          "</tr>";
      }).join("");
      html += section("Planetary positions",
        '<div class="advizo-astro__table-wrap"><table class="advizo-astro__table advizo-astro__table--stack">' +
        '<thead><tr><th scope="col">Planet</th><th scope="col">Sign</th><th scope="col">Degree</th><th scope="col">House</th><th scope="col">Nakshatra</th><th scope="col">Status</th></tr></thead>' +
        "<tbody>" + rows + "</tbody></table></div>",
        { badge: String(r.planets.length) });
    }

    if (r.dasha && has(r.dasha.periods)) {
      var dashaHtml = '<ol class="advizo-astro__timeline">' + r.dasha.periods.map(function (d) {
        return '<li><span class="advizo-astro__timeline-level">' + escapeHtml(d.level) + "</span>" +
          '<span class="advizo-astro__timeline-planet">' + escapeHtml(d.planet) + "</span>" +
          (d.start || d.end ? '<span class="advizo-astro__timeline-dates">' + escapeHtml([d.start, d.end].filter(has).join(" → ")) + "</span>" : "") +
          "</li>";
      }).join("") + "</ol>";
      html += section("Current Vimshottari dasha", dashaHtml);
    }

    if (has(r.doshas)) {
      html += section("Doshas", '<div class="advizo-astro__cards">' + r.doshas.map(function (d) {
        return '<article class="advizo-astro__card">' +
          '<header class="advizo-astro__card-head"><h4>' + escapeHtml(d.title) + "</h4>" + presenceBadge(d.present, d.partial) + "</header>" +
          (d.summary ? '<p class="advizo-astro__card-text">' + escapeHtml(d.summary) + "</p>" : "") +
          (has(d.details) ? '<ul class="advizo-astro__bullets">' + d.details.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>" : "") +
          (has(d.cancellations) ? '<p class="advizo-astro__minor">Cancellation factors</p><ul class="advizo-astro__bullets">' + d.cancellations.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>" : "") +
          (has(d.remedies) ? '<details class="advizo-astro__more"><summary>Remedies listed by the calculation service (' + d.remedies.length + ")</summary>" +
            '<ul class="advizo-astro__bullets">' + d.remedies.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul></details>" : "") +
          "</article>";
      }).join("") + "</div>");
    }

    html += section("Birth Panchang", factsGrid(r.birthPanchang), { closed: true });
    html += section("Avakhada details", factsGrid(r.attributes), { closed: true });
    html += section("Gemstones & lucky factors", factsGrid(r.gemstones), { closed: true });
    return html;
  }

  function renderPanchang(r, input) {
    var html = "";
    if (has(r.limbs)) {
      html += '<div class="advizo-astro__limbs">' + r.limbs.map(function (l) {
        var meta = [l.deity ? "Deity: " + l.deity : null, l.lord ? "Lord: " + l.lord : null].filter(has);
        return '<article class="advizo-astro__limb">' +
          '<p class="advizo-astro__limb-label">' + escapeHtml(l.label) + "</p>" +
          '<p class="advizo-astro__limb-name">' + escapeHtml(l.name) + "</p>" +
          (has(l.tags) ? '<p class="advizo-astro__limb-tags">' + l.tags.map(function (t) { return '<span class="advizo-astro__tag">' + escapeHtml(t) + "</span>"; }).join("") + "</p>" : "") +
          (l.end ? '<p class="advizo-astro__limb-until">Until ' + escapeHtml(l.end) + "</p>" : "") +
          (l.meaning ? '<p class="advizo-astro__limb-text">' + escapeHtml(l.meaning) + "</p>" : "") +
          (has(meta) ? '<p class="advizo-astro__limb-meta">' + escapeHtml(meta.join(" · ")) + "</p>" : "") +
          (l.next ? '<p class="advizo-astro__limb-next">Next: ' + escapeHtml(l.next) + "</p>" : "") +
          "</article>";
      }).join("") + "</div>";
    }

    if (has(r.sunMoon)) {
      html += section("Sun & Moon", factsGrid(r.sunMoon, "row"));
    }

    if (has(r.inauspicious) || has(r.auspicious)) {
      html += section("Timings",
        '<div class="advizo-astro__timings">' +
        (has(r.auspicious) ? '<div class="advizo-astro__timing advizo-astro__timing--good"><h4>Favourable</h4>' + factsGrid(r.auspicious) + "</div>" : "") +
        (has(r.inauspicious) ? '<div class="advizo-astro__timing advizo-astro__timing--avoid"><h4>Generally avoided</h4>' + factsGrid(r.inauspicious) + "</div>" : "") +
        "</div>");
    }

    html += section("Hindu calendar", factsGrid(r.calendar));
    html += section("More details", factsGrid(r.other), { closed: true });
    return html;
  }

  function scoreRing(score, outOf) {
    var pct = Math.max(0, Math.min(1, Number(score) / Number(outOf || 1)));
    var c = 2 * Math.PI * 52;
    return (
      '<div class="advizo-astro__ring">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><circle cx="60" cy="60" r="52" class="advizo-astro__ring-track"/>' +
      '<circle cx="60" cy="60" r="52" class="advizo-astro__ring-value" stroke-dasharray="' + (pct * c).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>' +
      '<span class="advizo-astro__ring-label"><strong>' + escapeHtml(score) + "</strong>/" + escapeHtml(outOf) + "</span></div>"
    );
  }

  function personPill(v) {
    if (v === true) return '<span class="advizo-astro__badge advizo-astro__badge--warn">Yes</span>';
    if (v === false) return '<span class="advizo-astro__badge advizo-astro__badge--ok">No</span>';
    return '<span class="advizo-astro__badge">' + escapeHtml(v) + "</span>";
  }

  function renderMatchmaking(r, input) {
    var boyName = (input && input.boy && input.boy.name) || "Boy";
    var girlName = (input && input.girl && input.girl.name) || "Girl";
    var html = "";

    var tiles = [];
    if (r.ashtakoot && has(r.ashtakoot.score)) tiles.push({ label: "Ashtakoot (guna milan)", score: r.ashtakoot.score, outOf: r.ashtakoot.outOf });
    if (r.dashakoot) tiles.push({ label: "Dashakoot", score: r.dashakoot.score, outOf: r.dashakoot.outOf });

    if (r.overall || tiles.length) {
      html += '<div class="advizo-astro__score">' +
        (r.overall ? '<div class="advizo-astro__score-main">' + scoreRing(r.overall.score, r.overall.outOf) +
          '<p class="advizo-astro__score-caption">Overall compatibility</p></div>' : "") +
        '<div class="advizo-astro__score-side">' +
        tiles.map(function (t) {
          return '<div class="advizo-astro__score-tile"><p>' + escapeHtml(t.label) + "</p><strong>" + escapeHtml(t.score) + "<span>/" + escapeHtml(t.outOf) + "</span></strong></div>";
        }).join("") +
        (r.overall && r.overall.summary ? '<p class="advizo-astro__score-summary">' + escapeHtml(r.overall.summary) + "</p>" : "") +
        "</div></div>";
    }

    if (r.overall && r.overall.detail) {
      html += '<p class="advizo-astro__provider-note"><span>Summary from the calculation service</span>' + escapeHtml(r.overall.detail) + "</p>";
    }

    if (r.ashtakoot && has(r.ashtakoot.koots)) {
      var rows = r.ashtakoot.koots.map(function (k) {
        var pct = Math.max(0, Math.min(100, (Number(k.score) / Number(k.outOf || 1)) * 100));
        return "<tr>" +
          '<th scope="row" data-label="Koot">' + escapeHtml(k.name || k.key) + (k.description ? '<span class="advizo-astro__sub">' + escapeHtml(k.description) + "</span>" : "") + "</th>" +
          '<td data-label="' + escapeHtml(boyName) + '">' + escapeHtml(has(k.boy) ? k.boy : "—") + "</td>" +
          '<td data-label="' + escapeHtml(girlName) + '">' + escapeHtml(has(k.girl) ? k.girl : "—") + "</td>" +
          '<td data-label="Score"><span class="advizo-astro__bar" role="img" aria-label="' + escapeHtml(k.score + " of " + k.outOf) + '"><span style="width:' + pct.toFixed(0) + '%"></span></span>' +
          '<span class="advizo-astro__bar-num">' + escapeHtml(k.score) + "/" + escapeHtml(k.outOf) + "</span></td>" +
          "</tr>";
      }).join("");
      html += section("Guna milan (Ashtakoot)",
        (r.ashtakoot.summary ? '<p class="advizo-astro__card-text">' + escapeHtml(r.ashtakoot.summary) + "</p>" : "") +
        '<div class="advizo-astro__table-wrap"><table class="advizo-astro__table advizo-astro__table--stack">' +
        '<thead><tr><th scope="col">Koot</th><th scope="col">' + escapeHtml(boyName) + '</th><th scope="col">' + escapeHtml(girlName) + '</th><th scope="col">Score</th></tr></thead>' +
        "<tbody>" + rows + "</tbody></table></div>");
    }

    if (has(r.doshas)) {
      html += section("Dosha checks", '<div class="advizo-astro__cards">' + r.doshas.map(function (d) {
        var pts = d.points
          ? '<div class="advizo-astro__pair-pills">' +
            (has(d.points.boy) ? "<span>" + escapeHtml(boyName) + " " + personPill(d.points.boy) + "</span>" : "") +
            (has(d.points.girl) ? "<span>" + escapeHtml(girlName) + " " + personPill(d.points.girl) + "</span>" : "") +
            "</div>"
          : "";
        return '<article class="advizo-astro__card">' +
          '<header class="advizo-astro__card-head"><h4>' + escapeHtml(d.label) + "</h4>" + presenceBadge(d.present) + "</header>" +
          (d.summary ? '<p class="advizo-astro__card-text">' + escapeHtml(d.summary) + "</p>" : "") +
          pts + "</article>";
      }).join("") + "</div>");
    }
    return html;
  }

  var SECTION_LABELS = {
    kundli: { summary: "summary", planets: "planetary positions", charts: "charts", dasha: "dasha", doshas: "doshas" },
    panchang: {},
    matchmaking: { overall: "overall score and dosha checks", ashtakoot: "guna milan breakdown" },
  };

  function resultMarkup(app, tool, reading) {
    var r = reading.result || {};
    var input = reading.input || {};
    var heading, meta;

    if (tool === "kundli") {
      heading = input.person && input.person.name ? input.person.name + "'s Kundli" : "Your Kundli";
      meta = personMeta(input.person);
    } else if (tool === "panchang") {
      heading = r.date ? formatProviderDate(r.date) : "Panchang";
      meta = escapeHtml([input.place && input.place.name, formatTime(input.time), formatOffset(input.tz)].filter(has).join(" · "));
    } else {
      var b = (input.boy && input.boy.name) || "Boy";
      var g = (input.girl && input.girl.name) || "Girl";
      heading = b + " & " + g;
      meta = "";
    }

    var body = tool === "kundli" ? renderKundli(r, input) : tool === "panchang" ? renderPanchang(r, input) : renderMatchmaking(r, input);

    var savedNote = reading.savedId
      ? '<span class="advizo-astro__saved">Saved to your account</span>'
      : "";

    var consult = app.consultUrl
      ? '<a class="advizo-astro__consult" href="' + escapeHtml(app.consultUrl) + '">Talk this through with a consultant <span aria-hidden="true">→</span></a>'
      : "";

    return (
      '<div class="advizo-astro__result">' +
      '<header class="advizo-astro__result-head">' +
      '<div><p class="advizo-astro__result-kicker">' + escapeHtml(TOOLS[tool].label) + "</p>" +
      '<h2 class="advizo-astro__result-title" tabindex="-1">' + escapeHtml(heading) + "</h2>" +
      (meta ? '<p class="advizo-astro__result-meta">' + meta + "</p>" : "") +
      (tool === "matchmaking" ? '<p class="advizo-astro__result-meta">' + escapeHtml((input.boy && input.boy.name) || "Boy") + ": " + personMeta(input.boy) + "</p>" +
        '<p class="advizo-astro__result-meta">' + escapeHtml((input.girl && input.girl.name) || "Girl") + ": " + personMeta(input.girl) + "</p>" : "") +
      savedNote + "</div>" +
      '<div class="advizo-astro__result-actions">' +
      '<button type="button" class="advizo-astro__btn advizo-astro__btn--ghost" data-action="edit">Edit details</button>' +
      '<button type="button" class="advizo-astro__btn advizo-astro__btn--ghost" data-action="new">New reading</button>' +
      "</div></header>" +
      unavailableNote(reading.unavailableSections, SECTION_LABELS[tool]) +
      body +
      '<footer class="advizo-astro__result-foot">' +
      "<p>Calculations are provided by a third-party Vedic astrology service and are offered for guidance and reflection.</p>" +
      consult + "</footer>" +
      "</div>"
    );
  }

  // ------------------------------------------------------------ app

  function createApp(container) {
    var root = container.querySelector(".advizo-astro__root");
    var apiBase = container.getAttribute("data-api-base");
    var visible = TOOL_ORDER.filter(function (t) { return container.getAttribute("data-show-" + t) !== "false"; });
    if (!visible.length) visible = TOOL_ORDER.slice();

    var app = {
      uid: "astro-" + (container.getAttribute("data-block-id") || "x").replace(/[^a-zA-Z0-9_-]/g, ""),
      apiBase: apiBase,
      chartStyle: container.getAttribute("data-chart-style") || "north",
      consultUrl: container.getAttribute("data-consult-url") || "",
      loginUrl: container.getAttribute("data-login-url") || "/account/login",
      heading: container.getAttribute("data-heading") || "Astrology",
      config: null,
      tool: null,
      busy: {},
      view: {},
      readings: {},
      pickers: {},
    };

    // -------------------------------------------------- url state

    function readUrl() {
      var params = new URLSearchParams(window.location.search);
      var tool = params.get("tool");
      var reading = params.get("reading");
      return {
        tool: visible.indexOf(tool) !== -1 ? tool : visible[0],
        reading: reading && /^[a-f0-9]{24}$/i.test(reading) ? reading : null,
      };
    }

    function writeUrl(tool, readingId, replace) {
      var params = new URLSearchParams(window.location.search);
      params.set("tool", tool);
      if (readingId) params.set("reading", readingId); else params.delete("reading");
      var url = window.location.pathname + "?" + params.toString() + window.location.hash;
      if (url === window.location.pathname + window.location.search + window.location.hash) return;
      try {
        window.history[replace ? "replaceState" : "pushState"]({ advizoAstro: true }, "", url);
      } catch (e) { /* sandboxed */ }
    }

    // -------------------------------------------------- shell

    function shellMarkup() {
      var tabs = visible.map(function (t) {
        return '<button type="button" role="tab" class="advizo-astro__tab" id="' + app.uid + "-tab-" + t + '"' +
          ' aria-controls="' + app.uid + "-panel-" + t + '" aria-selected="false" tabindex="-1" data-tab="' + t + '">' +
          '<span class="advizo-astro__tab-icon">' + ICON[t] + "</span><span>" + escapeHtml(TOOLS[t].label) + "</span></button>";
      }).join("");

      var panels = visible.map(function (t) {
        return '<section class="advizo-astro__panel" role="tabpanel" id="' + app.uid + "-panel-" + t + '"' +
          ' aria-labelledby="' + app.uid + "-tab-" + t + '" data-panel="' + t + '" hidden>' +
          '<div class="advizo-astro__intro"><h2 class="advizo-astro__panel-title">' + escapeHtml(TOOLS[t].title) + "</h2>" +
          '<p class="advizo-astro__lede">' + escapeHtml(TOOLS[t].lede) + "</p></div>" +
          '<div data-view="form">' + formMarkup(app, t) + "</div>" +
          '<div data-view="loading" hidden></div>' +
          '<div data-view="result" hidden></div>' +
          "</section>";
      }).join("");

      var historyBtn = app.config.authenticated
        ? '<button type="button" class="advizo-astro__btn advizo-astro__btn--ghost advizo-astro__history-btn" data-action="history" aria-expanded="false" aria-controls="' + app.uid + '-history">Saved readings</button>'
        : "";

      return (
        '<div class="advizo-astro__shell">' +
        '<header class="advizo-astro__header">' +
        '<div><p class="advizo-astro__eyebrow">Vedic tools</p><h1 class="advizo-astro__title">' + escapeHtml(app.heading) + "</h1></div>" +
        historyBtn + "</header>" +
        '<div class="advizo-astro__history" id="' + app.uid + '-history" hidden></div>' +
        (visible.length > 1 ? '<div class="advizo-astro__tabs" role="tablist" aria-label="Astrology tools">' + tabs + "</div>" : "") +
        panels +
        "</div>"
      );
    }

    function panel(tool) { return root.querySelector('[data-panel="' + tool + '"]'); }

    function setView(tool, view) {
      app.view[tool] = view;
      var p = panel(tool);
      if (!p) return;
      ["form", "loading", "result"].forEach(function (v) {
        p.querySelector('[data-view="' + v + '"]').hidden = v !== view;
      });
      var intro = p.querySelector(".advizo-astro__intro");
      if (intro) intro.hidden = view === "result";
    }

    function selectTool(tool, opts) {
      opts = opts || {};
      if (visible.indexOf(tool) === -1) tool = visible[0];
      app.tool = tool;
      visible.forEach(function (t) {
        var tab = root.querySelector('[data-tab="' + t + '"]');
        if (tab) {
          tab.setAttribute("aria-selected", t === tool ? "true" : "false");
          tab.tabIndex = t === tool ? 0 : -1;
        }
        panel(t).hidden = t !== tool;
      });
      if (!opts.skipUrl) {
        var r = app.readings[tool];
        writeUrl(tool, r && r.savedId ? r.savedId : null, Boolean(opts.replace));
      }
      if (!app.view[tool]) {
        restoreFromSession(tool);
      }
    }

    // -------------------------------------------------- place picker

    function pickerState(tool, field) {
      var key = tool + ":" + field;
      if (!app.pickers[key]) app.pickers[key] = { place: null, results: [], active: -1, timer: null, seq: 0 };
      return app.pickers[key];
    }

    function pickerEls(wrap) {
      return {
        input: wrap.querySelector(".advizo-astro__place-input"),
        list: wrap.querySelector(".advizo-astro__place-list"),
        hint: wrap.querySelector("[data-place-hint]"),
      };
    }

    function closeList(wrap) {
      var els = pickerEls(wrap);
      els.list.hidden = true;
      els.input.setAttribute("aria-expanded", "false");
      els.input.removeAttribute("aria-activedescendant");
    }

    function renderList(wrap, st, message) {
      var els = pickerEls(wrap);
      var listId = els.list.id;
      if (message) {
        els.list.innerHTML = '<li class="advizo-astro__place-msg" role="option" aria-disabled="true">' + escapeHtml(message) + "</li>";
      } else {
        els.list.innerHTML = st.results.map(function (pl, i) {
          return '<li role="option" id="' + listId + "-" + i + '" class="advizo-astro__place-opt' + (i === st.active ? " is-active" : "") +
            '" aria-selected="' + (i === st.active ? "true" : "false") + '" data-index="' + i + '">' +
            "<span>" + escapeHtml(pl.name) + "</span><small>" + escapeHtml(pl.timezone) + "</small></li>";
        }).join("");
      }
      els.list.hidden = false;
      els.input.setAttribute("aria-expanded", "true");
      if (st.active >= 0) els.input.setAttribute("aria-activedescendant", listId + "-" + st.active);
      else els.input.removeAttribute("aria-activedescendant");
    }

    function choosePlace(wrap, st, place) {
      var els = pickerEls(wrap);
      st.place = place;
      els.input.value = place.name;
      els.hint.textContent = "Time zone: " + place.timezone;
      clearFieldError(wrap);
      closeList(wrap);
    }

    function searchPlaces(wrap, st, q) {
      var seq = ++st.seq;
      renderList(wrap, st, "Searching…");
      api(app.apiBase + "/places?q=" + encodeURIComponent(q), { timeout: 10000 }).then(function (out) {
        if (seq !== st.seq) return; // a newer keystroke superseded this search
        if (!out.ok) {
          st.results = [];
          renderList(wrap, st, out.data && out.data.message ? out.data.message : "Couldn't search places. Please try again.");
          return;
        }
        st.results = out.data.places || [];
        st.active = st.results.length ? 0 : -1;
        renderList(wrap, st, st.results.length ? null : "No matching places found. Try a nearby larger town.");
      });
    }

    function onPlaceInput(wrap, tool) {
      var st = pickerState(tool, wrap.getAttribute("data-picker"));
      var q = pickerEls(wrap).input.value.trim();
      st.place = null; // typing invalidates the previous choice
      pickerEls(wrap).hint.textContent = "Choose a place from the list — we use its coordinates and time zone.";
      clearTimeout(st.timer);
      if (q.length < 2) { st.seq++; closeList(wrap); return; }
      st.timer = setTimeout(function () { searchPlaces(wrap, st, q); }, 320);
    }

    function onPlaceKeydown(e, wrap, tool) {
      var st = pickerState(tool, wrap.getAttribute("data-picker"));
      var els = pickerEls(wrap);
      if (els.list.hidden || !st.results.length) {
        if (e.key === "Escape") closeList(wrap);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var n = st.results.length;
        st.active = (st.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        renderList(wrap, st);
      } else if (e.key === "Enter") {
        if (st.active >= 0) { e.preventDefault(); choosePlace(wrap, st, st.results[st.active]); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeList(wrap);
      }
    }

    // -------------------------------------------------- form state

    function setPath(obj, path, value) {
      var parts = path.split(".");
      var cur = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = cur[parts[i]] || {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    }

    function getPath(obj, path) {
      return path.split(".").reduce(function (o, k) { return o && o[k] !== undefined ? o[k] : undefined; }, obj);
    }

    function collect(tool) {
      var form = panel(tool).querySelector("form");
      var payload = {};
      form.querySelectorAll("[data-field]").forEach(function (el) {
        setPath(payload, el.getAttribute("data-field"), el.value.trim());
      });
      form.querySelectorAll("[data-picker]").forEach(function (wrap) {
        var field = wrap.getAttribute("data-picker");
        var st = pickerState(tool, field);
        setPath(payload, field, st.place ? {
          name: st.place.name, latitude: st.place.latitude, longitude: st.place.longitude, timezone: st.place.timezone,
        } : null);
      });
      var save = form.querySelector("[data-save]");
      payload.save = Boolean(save && save.checked);
      if (tool === "kundli") payload.options = { chartStyle: app.chartStyle };
      return payload;
    }

    function fillForm(tool, input) {
      if (!input) return;
      var form = panel(tool).querySelector("form");
      form.querySelectorAll("[data-field]").forEach(function (el) {
        var v = getPath(input, el.getAttribute("data-field"));
        if (v !== undefined && v !== null) el.value = v;
      });
      form.querySelectorAll("[data-picker]").forEach(function (wrap) {
        var place = getPath(input, wrap.getAttribute("data-picker"));
        if (place && place.name) choosePlace(wrap, pickerState(tool, wrap.getAttribute("data-picker")), place);
      });
    }

    function fieldWrapFor(form, field) {
      var el = form.querySelector('[data-field="' + field + '"]');
      if (el) return el.closest(".advizo-astro__field");
      return form.querySelector('[data-picker="' + field + '"]');
    }

    function setFieldError(wrap, message) {
      if (!wrap) return;
      var input = wrap.querySelector("input");
      var err = wrap.querySelector(".advizo-astro__field-error");
      input.setAttribute("aria-invalid", "true");
      err.textContent = message;
      err.hidden = false;
    }

    function clearFieldError(wrap) {
      if (!wrap) return;
      var input = wrap.querySelector("input");
      var err = wrap.querySelector(".advizo-astro__field-error");
      if (input) input.removeAttribute("aria-invalid");
      if (err) { err.hidden = true; err.textContent = ""; }
    }

    function clearErrors(form) {
      form.querySelectorAll(".advizo-astro__field, [data-picker]").forEach(clearFieldError);
      var banner = form.querySelector(".advizo-astro__form-error");
      banner.hidden = true;
      banner.innerHTML = "";
    }

    function showFormError(tool, message, opts) {
      var form = panel(tool).querySelector("form");
      var banner = form.querySelector(".advizo-astro__form-error");
      opts = opts || {};
      banner.innerHTML = "<p>" + escapeHtml(message) + "</p>" +
        (opts.login ? '<a class="advizo-astro__btn advizo-astro__btn--primary" href="' + escapeHtml(loginHref()) + '">Sign in</a>' : "");
      banner.hidden = false;
      banner.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function loginHref() {
      return app.loginUrl + (app.loginUrl.indexOf("?") === -1 ? "?" : "&") +
        "return_url=" + encodeURIComponent(window.location.pathname + window.location.search);
    }

    /** Client-side checks mirror the server's; the server stays the authority. */
    function validate(tool, payload) {
      var errors = {};
      var people = tool === "kundli" ? ["person."] : tool === "matchmaking" ? ["boy.", "girl."] : [];
      var today = todayIso();
      people.forEach(function (prefix) {
        var p = getPath(payload, prefix.slice(0, -1)) || {};
        if (!p.date) errors[prefix + "date"] = "Please enter the date of birth.";
        else if (p.date > today) errors[prefix + "date"] = "Date of birth can't be in the future.";
        else if (p.date < "1900-01-01") errors[prefix + "date"] = "Please enter a date from 1900 onwards.";
        if (!p.time) errors[prefix + "time"] = "Please enter the time of birth.";
        if (!p.place) errors[prefix + "place"] = "Please choose the place of birth from the suggestions.";
      });
      if (tool === "panchang") {
        if (!payload.date) errors.date = "Please choose a date.";
        if (!payload.time) errors.time = "Please choose a time.";
        if (!payload.place) errors.place = "Please choose a place from the suggestions.";
      }
      return errors;
    }

    // -------------------------------------------------- run / show

    function showReading(tool, reading, opts) {
      opts = opts || {};
      app.readings[tool] = reading;
      var p = panel(tool);
      p.querySelector('[data-view="result"]').innerHTML = resultMarkup(app, tool, reading);
      setView(tool, "result");
      if (!opts.fromSession) {
        sessionSet(tool, { input: reading.input, result: reading.result, unavailableSections: reading.unavailableSections, savedId: reading.savedId || null });
      }
      if (app.tool === tool && !opts.skipUrl) writeUrl(tool, reading.savedId || null, true);
      if (opts.focus) {
        var title = p.querySelector(".advizo-astro__result-title");
        if (title) title.focus({ preventScroll: true });
        container.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }

    function restoreFromSession(tool) {
      var saved = sessionGet(tool);
      if (saved && saved.result) {
        fillForm(tool, saved.input);
        showReading(tool, saved, { fromSession: true, skipUrl: true });
      } else {
        setView(tool, "form");
      }
    }

    function submit(tool) {
      if (app.busy[tool]) return; // request lock — second click is ignored
      var form = panel(tool).querySelector("form");
      clearErrors(form);
      var payload = collect(tool);
      var errors = validate(tool, payload);
      var keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach(function (f) { setFieldError(fieldWrapFor(form, f), errors[f]); });
        var first = fieldWrapFor(form, keys[0]);
        if (first) first.querySelector("input").focus();
        return;
      }

      app.busy[tool] = true;
      var btn = form.querySelector("[data-submit]");
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");

      var placeName = (getPath(payload, tool === "kundli" ? "person.place" : tool === "panchang" ? "place" : "boy.place") || {}).name;
      var loading = panel(tool).querySelector('[data-view="loading"]');
      loading.innerHTML = loadingMarkup(tool, tool === "matchmaking" ? "" : placeName || "");
      setView(tool, "loading");
      var slowTimer = setTimeout(function () {
        var slow = loading.querySelector("[data-slow]");
        if (slow) slow.hidden = false;
      }, SLOW_NOTICE_MS);

      api(app.apiBase + "/" + tool, { method: "POST", body: payload }).then(function (out) {
        clearTimeout(slowTimer);
        app.busy[tool] = false;
        btn.disabled = false;
        btn.removeAttribute("aria-busy");

        if (out.ok) {
          showReading(tool, out.data, { focus: true });
          if (out.data.savedId) refreshHistory();
          return;
        }

        setView(tool, "form");
        var data = out.data || {};
        if (data.code === "LOGIN_REQUIRED") {
          showFormError(tool, errorMessage(data), { login: true });
        } else if (data.code === "INVALID_INPUT" && data.field && fieldWrapFor(form, data.field)) {
          setFieldError(fieldWrapFor(form, data.field), errorMessage(data));
          fieldWrapFor(form, data.field).querySelector("input").focus();
        } else {
          if (out.status >= 500 || out.status === 0) logErr(tool + " request failed:", out.status, data.code);
          showFormError(tool, errorMessage(data));
        }
      });
    }

    function newReading(tool) {
      var form = panel(tool).querySelector("form");
      form.reset();
      form.querySelectorAll("[data-picker]").forEach(function (wrap) {
        var st = pickerState(tool, wrap.getAttribute("data-picker"));
        st.place = null;
        st.results = [];
        pickerEls(wrap).hint.textContent = "Choose a place from the list — we use its coordinates and time zone.";
      });
      clearErrors(form);
      if (tool === "panchang") {
        form.querySelector('[data-field="date"]').value = todayIso();
        form.querySelector('[data-field="time"]').value = nowTime();
      }
      app.readings[tool] = null;
      sessionDel(tool);
      setView(tool, "form");
      writeUrl(tool, null, true);
      var firstInput = form.querySelector("input");
      if (firstInput) firstInput.focus();
    }

    // -------------------------------------------------- saved readings

    var historyState = { items: null, loading: false, error: null, confirm: null };

    function historyMarkup() {
      var inner;
      if (historyState.loading && !historyState.items) inner = '<p class="advizo-astro__muted">Loading your saved readings…</p>';
      else if (historyState.error) inner = '<p class="advizo-astro__muted">' + escapeHtml(historyState.error) + "</p>";
      else if (!historyState.items || !historyState.items.length) {
        inner = '<p class="advizo-astro__muted">No saved readings yet. Tick “Save this reading to my account” when you generate a Kundli or match.</p>';
      } else {
        inner = '<ul class="advizo-astro__history-list">' + historyState.items.map(function (it) {
          var confirming = historyState.confirm === it.id;
          return '<li class="advizo-astro__history-item">' +
            '<button type="button" class="advizo-astro__history-open" data-open-reading="' + escapeHtml(it.id) + '" data-feature="' + escapeHtml(it.feature) + '">' +
            '<span class="advizo-astro__history-icon">' + (ICON[it.feature] || "") + "</span>" +
            "<span><strong>" + escapeHtml(it.title || (TOOLS[it.feature] && TOOLS[it.feature].label) || it.feature) + "</strong>" +
            "<small>Saved " + escapeHtml(formatCreated(it.createdAt)) + "</small></span></button>" +
            (confirming
              ? '<span class="advizo-astro__history-confirm">Delete? <button type="button" data-delete-yes="' + escapeHtml(it.id) + '">Delete</button><button type="button" data-delete-no>Keep</button></span>'
              : '<button type="button" class="advizo-astro__history-del" data-delete-reading="' + escapeHtml(it.id) + '" aria-label="Delete ' + escapeHtml(it.title || "reading") + '">Delete</button>') +
            "</li>";
        }).join("") + "</ul>";
      }
      return '<div class="advizo-astro__history-head"><h2>Saved readings</h2><p>Only visible to you. Each reading is deleted automatically after ' +
        escapeHtml(app.config.retentionDays) + " days.</p></div>" + inner;
    }

    function renderHistory() {
      var el = root.querySelector(".advizo-astro__history");
      if (el && !el.hidden) el.innerHTML = historyMarkup();
    }

    function refreshHistory() {
      if (!app.config.authenticated) return;
      historyState.loading = true;
      renderHistory();
      api(app.apiBase + "/history").then(function (out) {
        historyState.loading = false;
        if (out.ok) { historyState.items = out.data.items || []; historyState.error = null; }
        else historyState.error = errorMessage(out.data);
        renderHistory();
      });
    }

    function toggleHistory(btn) {
      var el = root.querySelector(".advizo-astro__history");
      el.hidden = !el.hidden;
      btn.setAttribute("aria-expanded", el.hidden ? "false" : "true");
      if (!el.hidden) {
        el.innerHTML = historyMarkup();
        if (!historyState.items) refreshHistory();
      }
    }

    function openReading(id, feature) {
      if (visible.indexOf(feature) === -1) return;
      var tool = feature;
      selectTool(tool, { skipUrl: true });
      var loading = panel(tool).querySelector('[data-view="loading"]');
      loading.innerHTML = loadingMarkup(tool, "");
      loading.querySelector(".advizo-astro__loading-title").textContent = "Opening your saved reading";
      loading.querySelector(".advizo-astro__loading-text").textContent = "";
      setView(tool, "loading");
      api(app.apiBase + "/history/" + encodeURIComponent(id)).then(function (out) {
        if (out.ok) {
          fillForm(tool, out.data.input);
          showReading(tool, out.data, { focus: true });
        } else {
          writeUrl(tool, null, true);
          restoreFromSession(tool);
          if (app.view[tool] === "form") showFormError(tool, out.data && out.data.code === "NOT_FOUND"
            ? "That saved reading is no longer available."
            : errorMessage(out.data), { login: out.data && out.data.code === "LOGIN_REQUIRED" });
        }
      });
    }

    function deleteReading(id) {
      api(app.apiBase + "/history/" + encodeURIComponent(id) + "/delete", { method: "POST", body: {} }).then(function (out) {
        historyState.confirm = null;
        if (out.ok || (out.data && out.data.code === "NOT_FOUND")) {
          historyState.items = (historyState.items || []).filter(function (it) { return it.id !== id; });
          TOOL_ORDER.forEach(function (t) {
            var r = app.readings[t];
            if (r && r.savedId === id) {
              r.savedId = null;
              sessionSet(t, { input: r.input, result: r.result, unavailableSections: r.unavailableSections, savedId: null });
              if (app.view[t] === "result") panel(t).querySelector('[data-view="result"]').innerHTML = resultMarkup(app, t, r);
              if (app.tool === t) writeUrl(t, null, true);
            }
          });
        } else {
          historyState.error = errorMessage(out.data);
        }
        renderHistory();
      });
    }

    // -------------------------------------------------- events

    function bind() {
      root.addEventListener("submit", function (e) {
        var form = e.target.closest("[data-form]");
        if (!form) return;
        e.preventDefault();
        submit(form.getAttribute("data-form"));
      });

      root.addEventListener("input", function (e) {
        var wrap = e.target.closest("[data-picker]");
        if (wrap && e.target.classList.contains("advizo-astro__place-input")) {
          onPlaceInput(wrap, wrap.closest("[data-panel]").getAttribute("data-panel"));
          return;
        }
        var fieldWrap = e.target.closest(".advizo-astro__field");
        if (fieldWrap && e.target.getAttribute("aria-invalid")) clearFieldError(fieldWrap);
      });

      root.addEventListener("keydown", function (e) {
        var tab = e.target.closest("[data-tab]");
        if (tab && (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End")) {
          e.preventDefault();
          var i = visible.indexOf(tab.getAttribute("data-tab"));
          var next = e.key === "Home" ? 0 : e.key === "End" ? visible.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + visible.length) % visible.length;
          selectTool(visible[next]);
          root.querySelector('[data-tab="' + visible[next] + '"]').focus();
          return;
        }
        var wrap = e.target.closest("[data-picker]");
        if (wrap && e.target.classList.contains("advizo-astro__place-input")) {
          onPlaceKeydown(e, wrap, wrap.closest("[data-panel]").getAttribute("data-panel"));
        }
      });

      // mousedown (not click) so the choice lands before the input's blur.
      root.addEventListener("mousedown", function (e) {
        var opt = e.target.closest(".advizo-astro__place-opt");
        if (!opt) return;
        e.preventDefault();
        var wrap = opt.closest("[data-picker]");
        var tool = wrap.closest("[data-panel]").getAttribute("data-panel");
        var st = pickerState(tool, wrap.getAttribute("data-picker"));
        var place = st.results[Number(opt.getAttribute("data-index"))];
        if (place) choosePlace(wrap, st, place);
      });

      root.addEventListener("focusout", function (e) {
        var wrap = e.target.closest && e.target.closest("[data-picker]");
        if (wrap && e.target.classList.contains("advizo-astro__place-input")) {
          setTimeout(function () { closeList(wrap); }, 120);
        }
      });

      root.addEventListener("click", function (e) {
        var tab = e.target.closest("[data-tab]");
        if (tab) { selectTool(tab.getAttribute("data-tab")); return; }

        var action = e.target.closest("[data-action]");
        if (action) {
          var a = action.getAttribute("data-action");
          if (a === "edit") {
            setView(app.tool, "form");
            var f = panel(app.tool).querySelector("form input");
            if (f) f.focus();
          } else if (a === "new") newReading(app.tool);
          else if (a === "history") toggleHistory(action);
          return;
        }

        var open = e.target.closest("[data-open-reading]");
        if (open) { openReading(open.getAttribute("data-open-reading"), open.getAttribute("data-feature")); return; }

        var del = e.target.closest("[data-delete-reading]");
        if (del) { historyState.confirm = del.getAttribute("data-delete-reading"); renderHistory(); return; }
        var yes = e.target.closest("[data-delete-yes]");
        if (yes) { deleteReading(yes.getAttribute("data-delete-yes")); return; }
        if (e.target.closest("[data-delete-no]")) { historyState.confirm = null; renderHistory(); }
      });

      window.addEventListener("popstate", function () {
        var u = readUrl();
        selectTool(u.tool, { skipUrl: true });
        var current = app.readings[u.tool];
        if (u.reading && app.config.authenticated && !(current && current.savedId === u.reading)) {
          openReading(u.reading, u.tool);
        }
      });
    }

    // -------------------------------------------------- boot

    /**
     * @param {string} message  shopper-facing text
     * @param {boolean} [login] show a Sign in button
     * @param {object} [opts]   { retry: show "Try again" (only useful for
     *                          transient failures), merchantHint: extra text
     *                          shown ONLY in the Theme Editor }
     */
    function renderUnavailable(message, login, opts) {
      opts = opts || {};
      var hint = opts.merchantHint && container.getAttribute("data-design-mode") === "true"
        ? '<p class="advizo-astro__merchant-hint"><strong>Merchant note (only visible in the Theme Editor):</strong> ' + escapeHtml(opts.merchantHint) + "</p>"
        : "";
      root.innerHTML =
        '<div class="advizo-astro__state">' +
        '<span class="advizo-astro__state-icon">' + ICON.kundli + "</span>" +
        "<p>" + escapeHtml(message) + "</p>" +
        (login ? '<a class="advizo-astro__btn advizo-astro__btn--primary" href="' + escapeHtml(loginHref()) + '">Sign in</a>' : "") +
        (opts.retry ? '<button type="button" class="advizo-astro__btn advizo-astro__btn--ghost" data-retry>Try again</button>' : "") +
        hint +
        "</div>";
      var retry = root.querySelector("[data-retry]");
      if (retry) retry.addEventListener("click", boot);
    }

    function boot() {
      api(app.apiBase + "/config", { timeout: 15000 }).then(function (out) {
        if (!out.ok) {
          logErr("config failed:", out.status, out.data && out.data.code);
          renderUnavailable("Astrology tools couldn't be loaded right now.", false, {
            retry: true,
            merchantHint: "The Advizo backend did not answer /apps/advizo/astrology/config (HTTP " + out.status +
              "). Check that the backend with the astrology routes is deployed and running, and that the app proxy points to it.",
          });
          return;
        }
        app.config = out.data;
        if (!app.config.available) {
          // Not transient (provider credentials missing) — retrying can't help.
          renderUnavailable("Astrology tools are not available on this store right now.", false, {
            merchantHint: "The astrology provider is not configured. Add ASTROLOGY_API_KEY (your Jyotisham Astro API key) to the Advizo backend environment and restart the backend.",
          });
          return;
        }
        if (!app.config.authenticated && !app.config.guestsAllowed) {
          renderUnavailable("Please sign in to use the astrology tools.", true);
          return;
        }

        root.innerHTML = shellMarkup();
        bind();

        var u = readUrl();
        selectTool(u.tool, { replace: true, skipUrl: Boolean(u.reading) });
        if (u.reading) {
          if (app.config.authenticated) openReading(u.reading, u.tool);
          else {
            writeUrl(u.tool, null, true);
            showFormError(u.tool, "Sign in to open your saved reading.", { login: true });
          }
        }
      });
    }

    return { boot: boot };
  }

  function init(container) {
    if (container.getAttribute("data-advizo-initialized") === "1") return;
    container.setAttribute("data-advizo-initialized", "1");
    if (!container.querySelector(".advizo-astro__root") || !container.getAttribute("data-api-base")) {
      logErr("block markup incomplete — cannot start");
      return;
    }
    if (typeof window.fetch !== "function" || typeof window.URLSearchParams !== "function") {
      container.querySelector(".advizo-astro__root").innerHTML =
        '<p class="advizo-astro__noscript">Please use an up-to-date browser to access the astrology tools.</p>';
      return;
    }
    createApp(container).boot();
  }

  function initAll() {
    document.querySelectorAll(".advizo-astro").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
  else initAll();
  document.addEventListener("shopify:section:load", initAll);
})();
