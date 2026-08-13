/**
 * Consultly — Consultant Profile storefront bundle.
 *
 * Vanilla JS, no build step, no framework — same constraints as
 * consultant-card.js (no React/Redux/Bootstrap/react-router). Each
 * extension asset file is independent (no bundler/module system across
 * them), so the small formatting helpers below are intentionally
 * duplicated from consultant-card.js rather than "shared" — there's
 * nothing to import from.
 *
 * Data source: the App Proxy JSON endpoint
 * (/apps/consultly/consultant/<id>) added alongside this block. The
 * consultant id itself comes from this page's own URL (?id=...), read
 * client-side — this file never talks to a backend host directly.
 */
(function () {
  "use strict";

  // TEMPORARY debug logging — remove once the profile page is confirmed
  // working. Filter the browser Console by "[consultly-profile]".
  var DEBUG = true;
  function log() {
    if (!DEBUG) return;
    var args = ["[consultly-profile]"].concat([].slice.call(arguments));
    console.log.apply(console, args);
  }
  log("script loaded, url =", window.location.href);

  var DEFAULT_AVATAR_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="32" fill="#f3f4f6"/>' +
    '<circle cx="32" cy="24" r="12" fill="#c7cbd1"/>' +
    '<path d="M10 56c2-14 12-20 22-20s20 6 22 20" fill="#c7cbd1"/>' +
    "</svg>";
  var DEFAULT_AVATAR =
    "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(DEFAULT_AVATAR_SVG);

  var ICONS = {
    chat:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    voice:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>',
    video:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M23 7L16 12L23 17V7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M14 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H14C15.1 19 16 18.1 16 17V7C16 5.9 15.1 5.1 14 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  var COMM_DISABLED_MESSAGE =
    "Communication unavailable. The store has exhausted its communication minutes.";
  var NOT_FOUND_MESSAGE = "Consultant not found.";

  // Kept in sync by hand with consultly_Frontend/src/components/Helper/Helper.js
  // formatAmountHelper — see consultant-card.js for the same note.
  function formatAmount(num) {
    if (num === null || num === undefined) return "0";
    var value = Number(num);
    if (isNaN(value)) return "0";
    if (value < 1000) return value % 1 === 0 ? String(value) : value.toFixed(2);
    if (value >= 1e9) return (value / 1e9).toFixed(1) + "B";
    if (value >= 1e6) return (value / 1e6).toFixed(1) + "M";
    return (value / 1e3).toFixed(1) + "K";
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? "" : str).replace(
      /[&<>"']/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      },
    );
  }

  function parseLanguages(raw) {
    if (Array.isArray(raw)) return raw.length ? raw : ["English"];
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (e) {
        /* not JSON — fall through */
      }
    }
    return ["English"];
  }

  function getConsultantId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  function buildLoginUrl(shop) {
    return (
      "https://" + shop + "/account/login?return_to=" + encodeURIComponent("/apps/consultly")
    );
  }

  // TEMPORARY bridge for actually STARTING a chat/call — same reasoning as
  // consultant-card.js: this storefront bundle has no auth token (App Proxy
  // deliberately doesn't hand one to the browser), and the balance-check /
  // Agora-token / Socket.IO flow all still live in the not-yet-migrated
  // OpenCallingPage.js + videoCallController.js + server-io.js. The old,
  // still-live iframe Profile page already has everything needed to
  // complete this today. Replace once that auth bridge is designed.
  function buildLegacyCallBridgeUrl(shop, consultantId) {
    return (
      "https://" +
      shop +
      "/apps/consultly/view-profile?consultantId=" +
      encodeURIComponent(consultantId)
    );
  }

  function priceMarkup(currencySymbol, amount) {
    return (
      '<span class="consultly-consultant-profile__action-price">' +
      '<span class="consultly-consultant-profile__currency">' +
      escapeHtml(currencySymbol) +
      "</span>" +
      escapeHtml(formatAmount(amount)) +
      '<span class="consultly-consultant-profile__action-unit">/min</span>' +
      "</span>"
    );
  }

  function actionButtonMarkup(kind, label, icon, amount, currencySymbol, disabled) {
    return (
      '<button type="button" class="consultly-consultant-profile__action" data-action="' +
      kind +
      '"' +
      (disabled
        ? ' aria-disabled="true" title="' + escapeHtml(COMM_DISABLED_MESSAGE) + '"'
        : "") +
      ">" +
      '<span class="consultly-consultant-profile__action-icon">' +
      icon +
      "</span>" +
      '<span class="consultly-consultant-profile__action-label">' +
      escapeHtml(label) +
      "</span>" +
      priceMarkup(currencySymbol, amount) +
      "</button>"
    );
  }

  function renderNotFound(root) {
    root.innerHTML =
      '<div class="consultly-consultant-profile__state">' +
      "<p>" +
      NOT_FOUND_MESSAGE +
      "</p>" +
      "</div>";
  }

  function renderError(root, onRetry) {
    root.innerHTML =
      '<div class="consultly-consultant-profile__state">' +
      "<p>We couldn’t load this consultant’s profile. Please try again shortly.</p>" +
      '<button type="button" class="consultly-consultant-profile__retry">Try again</button>' +
      "</div>";
    var btn = root.querySelector(".consultly-consultant-profile__retry");
    if (btn) btn.addEventListener("click", onRetry);
  }

  function renderProfile(container, root, data, options) {
    var c = data.consultant || {};
    var name = c.displayName || c.fullname || "Consultant";
    var profession = c.profession || "Consultant";
    var experience = parseInt(c.experience, 10) || 0;
    var languages = parseLanguages(c.language);
    var imgSrc = c.profileImage || DEFAULT_AVATAR;
    var currencySymbol = data.shopCurrency || "$";

    var statusBadge = c.isBusy
      ? '<span class="consultly-consultant-profile__status consultly-consultant-profile__status--busy">Busy · ~5 min</span>'
      : c.isActive
        ? '<span class="consultly-consultant-profile__status consultly-consultant-profile__status--active">Available now</span>'
        : "";

    var aboutHtml = "";
    if (options.showAbout && c.bio) {
      aboutHtml =
        '<section class="consultly-consultant-profile__section">' +
        '<h2 class="consultly-consultant-profile__section-title">About</h2>' +
        '<p class="consultly-consultant-profile__about">' +
        escapeHtml(c.bio) +
        "</p>" +
        "</section>";
    }

    var expertiseHtml = "";
    if (options.showExpertise && c.specialization) {
      expertiseHtml =
        '<section class="consultly-consultant-profile__section">' +
        '<h2 class="consultly-consultant-profile__section-title">Expertise</h2>' +
        '<span class="consultly-consultant-profile__expertise-tag">' +
        escapeHtml(c.specialization) +
        "</span>" +
        "</section>";
    }

    var consultationHtml = "";
    if (options.showConsultation) {
      var buttons = "";
      if (c.chatPerMinute != null && Number(c.chatPerMinute) > 0) {
        buttons += actionButtonMarkup(
          "chat", "Chat", ICONS.chat, c.chatPerMinute, currencySymbol, data.communicationDisabled,
        );
      }
      if (c.voicePerMinute != null && Number(c.voicePerMinute) > 0) {
        buttons += actionButtonMarkup(
          "voice", "Call", ICONS.voice, c.voicePerMinute, currencySymbol, data.communicationDisabled,
        );
      }
      if (c.videoPerMinute != null && Number(c.videoPerMinute) > 0) {
        buttons += actionButtonMarkup(
          "video", "Video", ICONS.video, c.videoPerMinute, currencySymbol, data.communicationDisabled,
        );
      }
      if (buttons) {
        consultationHtml =
          '<section class="consultly-consultant-profile__section">' +
          '<h2 class="consultly-consultant-profile__section-title">Consultation Options</h2>' +
          '<div class="consultly-consultant-profile__actions">' +
          buttons +
          "</div>" +
          "</section>";
      }
    }

    root.innerHTML =
      '<div class="consultly-consultant-profile__header">' +
      '<img class="consultly-consultant-profile__avatar" src="' +
      escapeHtml(imgSrc) +
      '" alt="' +
      escapeHtml(name) +
      '" />' +
      '<div class="consultly-consultant-profile__header-info">' +
      '<h1 class="consultly-consultant-profile__name">' +
      escapeHtml(name) +
      "</h1>" +
      '<p class="consultly-consultant-profile__profession">' +
      escapeHtml(profession) +
      "</p>" +
      '<div class="consultly-consultant-profile__meta">' +
      '<span class="consultly-consultant-profile__badge">' +
      experience +
      "+ Years of Experience</span>" +
      statusBadge +
      "</div>" +
      '<p class="consultly-consultant-profile__languages"><strong>Speaks:</strong> ' +
      escapeHtml(languages.join(", ")) +
      "</p>" +
      "</div>" +
      "</div>" +
      aboutHtml +
      expertiseHtml +
      consultationHtml;

    var avatarEl = root.querySelector(".consultly-consultant-profile__avatar");
    if (avatarEl) {
      avatarEl.addEventListener(
        "error",
        function () {
          avatarEl.src = DEFAULT_AVATAR;
        },
        { once: true },
      );
    }

    root.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (data.communicationDisabled) return; // aria-disabled, but guard anyway
        if (!data.authenticated) {
          window.location.href = buildLoginUrl(options.shop);
          return;
        }
        window.location.href = buildLegacyCallBridgeUrl(options.shop, c.id);
      });
    });
  }

  function initConsultantProfile(container) {
    if (container.getAttribute("data-consultly-initialized") === "1") return;
    container.setAttribute("data-consultly-initialized", "1");

    var root = container.querySelector(".consultly-consultant-profile__root");
    if (!root) {
      log("ABORT: .consultly-consultant-profile__root not found inside block");
      return;
    }

    var apiBase = container.getAttribute("data-api-base");
    var shop = container.getAttribute("data-shop");
    var showAbout = container.getAttribute("data-show-about") === "true";
    var showExpertise = container.getAttribute("data-show-expertise") === "true";
    var showConsultation = container.getAttribute("data-show-consultation") === "true";

    var consultantId = getConsultantId();
    log("apiBase =", apiBase, "| shop =", shop, "| consultantId =", consultantId);

    if (!consultantId) {
      log("ABORT: no ?id= in URL — rendering not-found");
      renderNotFound(root);
      return;
    }
    if (!apiBase) {
      log("ABORT: data-api-base attribute missing — rendering error");
      renderError(root, function () {
        initConsultantProfileLoad();
      });
      return;
    }

    function initConsultantProfileLoad() {
      root.innerHTML =
        '<p class="consultly-consultant-profile__placeholder">Loading consultant profile…</p>';

      var fetchUrl = apiBase + "/" + encodeURIComponent(consultantId);
      log("fetching:", fetchUrl);

      fetch(fetchUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          log("response status:", res.status, "content-type:", res.headers.get("content-type"));
          if (res.status === 400 || res.status === 404) {
            var notFoundErr = new Error("not_found");
            notFoundErr.notFound = true;
            throw notFoundErr;
          }
          if (!res.ok) throw new Error("Request failed with status " + res.status);
          return res.json();
        })
        .then(function (data) {
          log("parsed response body:", data);
          if (!data || data.success !== true || !data.consultant) {
            throw new Error("Unexpected response shape");
          }
          log("rendering profile for:", data.consultant && data.consultant.displayName);
          renderProfile(container, root, data, {
            shop: shop,
            showAbout: showAbout,
            showExpertise: showExpertise,
            showConsultation: showConsultation,
          });
        })
        .catch(function (err) {
          if (err && err.notFound) {
            log("endpoint returned 400/404 — rendering not-found");
            renderNotFound(root);
            return;
          }
          console.error("[consultly-profile] failed to load consultant profile:", err);
          renderError(root, initConsultantProfileLoad);
        });
    }

    initConsultantProfileLoad();
  }

  function initAll() {
    var blocks = document.querySelectorAll(".consultly-consultant-profile");
    log("initAll: found", blocks.length, "profile block(s)");
    blocks.forEach(initConsultantProfile);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  document.addEventListener("shopify:section:load", initAll);
})();
