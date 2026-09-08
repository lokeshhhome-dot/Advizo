/**
 * Consultly — Consultant Listing storefront bundle.
 *
 * Vanilla JS, no build step, no framework. Ported from
 * advizo_Frontend/src/components/ConsultantCards/ConsultantCards.js —
 * same fields, same card layout, same formatAmountHelper/MoneyValue logic —
 * without React/Redux/Bootstrap/react-router, none of which this file
 * imports or depends on.
 *
 * Data source: the App Proxy JSON endpoint added in Step 2
 * (/apps/advizo/consultants). That path is storefront-relative and is
 * intercepted by Shopify itself, which appends/verifies shop + signature —
 * this file never talks to a backend host directly.
 */
(function () {
  "use strict";

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
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    voice:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>',
    video:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M23 7L16 12L23 17V7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M14 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H14C15.1 19 16 18.1 16 17V7C16 5.9 15.1 5.1 14 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Star used for the real rating summary (see getProfileExtras). Plain
  // inline SVG, matching the rest of ICONS above — no emoji, no icon-font/
  // library dependency.
  var STAR_ICON_FILLED =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.7z"/></svg>';
  var STAR_ICON_EMPTY =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.7z" stroke-linejoin="round"/></svg>';

  // Social profile icons for the modal's "Connect" row (section 6). Only
  // rendered when the matching URL is present — see socialLinksMarkup.
  var SOCIAL_ICONS = {
    linkedin:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3.25 8.75h3.4V21h-3.4V8.75zM9.75 8.75h3.26v1.68h.05c.45-.86 1.56-1.77 3.22-1.77 3.44 0 4.07 2.27 4.07 5.22V21h-3.4v-6.4c0-1.53-.03-3.5-2.13-3.5-2.14 0-2.47 1.67-2.47 3.39V21h-3.4V8.75z"/></svg>',
    twitter:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M18.9 2H22l-7.6 8.7L23.3 22h-7.1l-5.6-6.9L4.2 22H1l8.1-9.3L1 2h7.3l5.1 6.4L18.9 2zm-1.2 18h1.9L7.4 4h-2l12.3 16z"/></svg>',
    instagram:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    youtube:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none"/></svg>',
    website:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.7 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.7-3.6-9s1.2-6.4 3.6-9z"/></svg>',
  };
  var SOCIAL_LABELS = {
    linkedin: "LinkedIn",
    twitter: "X (Twitter)",
    instagram: "Instagram",
    youtube: "YouTube",
    website: "Website",
  };

  var COMM_DISABLED_MESSAGE =
    "Communication unavailable. The store has exhausted its communication minutes.";
  var COMM_DISABLED_TOAST = "Communication is currently unavailable.";

  // ---------- Consultant Card admin customization ----------
  //
  // Every CSS rule this maps to already has the CURRENT hardcoded value as
  // its var() fallback (see consultant-card.css's own comment on this) — so
  // a shop that never saved a theme (data.consultantCardTheme is null/empty)
  // results in ZERO setProperty() calls below, and the card renders exactly
  // as it always has. Only fields the admin actually saved are ever set.
  var THEME_COLOR_VARS = {
    cardBackground: "--consultant-card-bg",
    cardBorderColor: "--consultant-card-border",
    headerBackground: "--consultant-card-header-bg",
    nameColor: "--consultant-card-name-color",
    categoryColor: "--consultant-card-category-color",
    supportingTextColor: "--consultant-card-supporting-color",
    priceColor: "--consultant-card-price-color",
    chatButtonBg: "--consultant-card-chat-bg",
    chatButtonText: "--consultant-card-chat-text",
    callButtonBg: "--consultant-card-call-bg",
    callButtonText: "--consultant-card-call-text",
    videoButtonBg: "--consultant-card-video-bg",
    videoButtonText: "--consultant-card-video-text",
    buttonBorderColor: "--consultant-card-button-border",
    buttonHoverColor: "--consultant-card-button-hover",
    onlineColor: "--consultant-card-online",
    busyColor: "--consultant-card-busy",
    offlineColor: "--consultant-card-offline",
  };

  // Fixed presets, not free-text CSS — matches the enum the backend
  // validates cardShadow against (updateConsultantCardTheme). "default" is
  // the exact same value the CSS fallback already uses.
  var SHADOW_PRESETS = {
    none: "none",
    soft: "0 1px 2px rgba(16,35,28,.05)",
    default: "0 1px 2px rgba(16,35,28,.05), 0 14px 34px -22px rgba(16,35,28,.3)",
    strong: "0 4px 10px rgba(16,35,28,.1), 0 24px 48px -20px rgba(16,35,28,.45)",
  };

  // Applied once to the shared container — every card inherits these
  // through normal CSS var() cascade, so this is O(1) regardless of how
  // many consultants are on the page.
  function applyConsultantCardTheme(container, theme) {
    if (!theme || typeof theme !== "object") return;

    Object.keys(THEME_COLOR_VARS).forEach(function (field) {
      var value = theme[field];
      if (typeof value === "string" && value) {
        container.style.setProperty(THEME_COLOR_VARS[field], value);
      }
    });

    if (typeof theme.cardBorderRadius === "number" && isFinite(theme.cardBorderRadius)) {
      container.style.setProperty("--consultant-card-radius", theme.cardBorderRadius + "px");
    }

    if (theme.cardShadow && SHADOW_PRESETS[theme.cardShadow]) {
      container.style.setProperty("--consultant-card-shadow", SHADOW_PRESETS[theme.cardShadow]);
    }
  }

  // Per-card override (profession -> header background) — set as an INLINE
  // custom property on that one card's root element, which CSS var()
  // cascade rules make take precedence over the container-wide
  // --consultant-card-header-bg for that card only, without touching any
  // other consultant's header color.
  function applyProfessionHeaderColor(cardEl, consultant, professionColors) {
    if (!professionColors || typeof professionColors !== "object") return;
    var profession = String(consultant.profession || "").trim().toLowerCase();
    if (!profession) return;
    var color = professionColors[profession];
    if (typeof color === "string" && color) {
      cardEl.style.setProperty("--consultant-card-header-bg", color);
    }
  }

  // Same rules as advizo_Frontend/src/components/Helper/Helper.js
  // formatAmountHelper — kept in sync by hand since this bundle can't import
  // from the CRA app.
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
        /* not JSON — fall through to default */
      }
    }
    return ["English"];
  }

  function mapConsultant(raw) {
    return {
      id: raw._id || raw.id,
      name: raw.displayName || raw.fullname || "Consultant",
      image: raw.profileImage || "",
      profession: raw.profession || "Consultant",
      experience: parseInt(raw.experience, 10) || 0,
      languages: parseLanguages(raw.language),
      isActive: Boolean(raw.isActive),
      isBusy: Boolean(raw.isBusy),
      consultantStatus: Boolean(raw.consultantStatus),
      chatPrice: Number(raw.chatPerMinute) || 0,
      audioPrice: Number(raw.voicePerMinute) || 0,
      videoPrice: Number(raw.videoPerMinute) || 0,
    };
  }

  function showToast(container, message) {
    var toast = document.createElement("div");
    toast.className = "advizo-consultant-card__toast";
    toast.textContent = message;
    container.appendChild(toast);
    window.requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () {
        toast.remove();
      }, 250);
    }, 3200);
  }

  function buildLoginUrl(shop) {
    return (
      "https://" + shop + "/account/login?return_to=" + encodeURIComponent("/apps/advizo")
    );
  }

  // TEMP (Chat modal UI test): App-Proxy-relative on purpose — Shopify's own
  // edge intercepts this and forwards it to our backend WITH
  // logged_in_customer_id + a verified signature attached, and the browser
  // also carries the session cookie the /apps/advizo/consultants fetch
  // already set (same shop origin). That's how the identity sync in
  // Step 1/2 actually reaches the chat overlay — see
  // proxyShopifyStorefrontChat in shopifyController.js. A direct cross-origin
  // request to the React app's own host would skip all of that.
  function buildChatOverlayUrl(shop, consultantId) {
    return (
      "https://" +
      shop +
      "/apps/advizo/chats?consultantId=" +
      encodeURIComponent(consultantId) +
      "&embedded=1"
    );
  }

  // Actually STARTING a voice/video call still lives in the React app's
  // OpenCallingPage.js + Agora-token / Socket.IO flow (identity resolved by
  // proxyShopifyViewProfile, same as the chat overlay's proxyShopifyStorefrontChat)
  // — this just points the call overlay iframe at it with autoStartCall set,
  // so ViewProfile.js triggers the call immediately instead of showing its
  // own profile UI. See openCallOverlay below.
  function buildCallOverlayUrl(shop, consultantId, callType) {
    return (
      "https://" +
      shop +
      "/apps/advizo/view-profile?consultantId=" +
      encodeURIComponent(consultantId) +
      "&autoStartCall=" +
      encodeURIComponent(callType)
    );
  }

  // Call/Video Call open in the SAME modal as the Consultant Profile
  // (ensureProfileModal's backdrop/panel/close-button/ESC/body-scroll-lock
  // below) — not a separate full-viewport iframe. That bespoke overlay had
  // no chrome (no backdrop, no rounded panel, no close button), so visually
  // it looked exactly like a page navigation even though the URL never
  // changed. Reusing the profile modal's own shell fixes that and matches
  // the explicit "same modal as Consultant Profile" requirement.
  //
  // VideoCallingPage.js (loaded inside once the call starts) posts
  // CONSULTLY_CALL_ENDED to window.top when the call ends instead of
  // navigating, which is what closeCallOverlay below listens for.
  var callOverlayCloseListenerBound = false;

  function closeCallOverlay() {
    closeProfileModal();
  }

  function ensureCallOverlayCloseListener() {
    if (callOverlayCloseListenerBound) return;
    callOverlayCloseListenerBound = true;
    window.addEventListener("message", function (event) {
      if (!event.data || event.data.type !== "CONSULTLY_CALL_ENDED") return;
      closeCallOverlay();
    });
  }

  function openCallOverlay(consultantId, shop, callType) {
    if (!shop) {
      console.error("[advizo] shop missing — cannot open call overlay");
      return;
    }
    console.log("[CALL FLOW] Existing profile modal pattern detected");
    console.log("[CALL FLOW] Opening call modal");
    console.log("[CALL FLOW] Call mode =", callType);

    ensureCallOverlayCloseListener();
    var els = ensureProfileModal();

    clearProfileModalChrome(els);
    els.panel.classList.add("advizo-profile-modal--call");
    els.body.innerHTML = "";
    var iframe = document.createElement("iframe");
    iframe.src = buildCallOverlayUrl(shop, consultantId, callType);
    iframe.className = "advizo-profile-modal__call-iframe";
    iframe.setAttribute("allow", "microphone; camera; autoplay");
    els.body.appendChild(iframe);

    showProfileModalShell(els);
  }
  // openCallOverlay above is kept working but unused by the button handlers
  // below — it's the previous iframe-based call modal, left in place as a
  // rollback path since the native widget below can't be tested end-to-end
  // from outside a live storefront.

  // ---------- Native call modal (no iframe) ----------
  //
  // Loads advizo-call-widget.js (built from advizo_CallWidget/, a
  // separate small bundle that reuses the React app's own callSlice.js/
  // SokectConfig.js/ringingTune.js verbatim — same Agora client, same
  // Socket.IO connection, not a second calling implementation) and asks it
  // to open the call UI directly on this page. No iframe, no navigation,
  // no Consultant Profile intermediate step.
  var callWidgetScriptPromise = null;
  function ensureCallWidgetScript(shop) {
    if (window.ConsultlyCallWidget) return Promise.resolve();
    if (callWidgetScriptPromise) return callWidgetScriptPromise;
    callWidgetScriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      // Redirects to the widget's real (React app) origin — see
      // proxyShopifyCallWidgetScript's comment. Never hardcode that origin
      // here directly.
      script.src = "https://" + shop + "/apps/advizo/call-widget.js";
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        callWidgetScriptPromise = null;
        reject(new Error("Failed to load call widget script"));
      };
      document.head.appendChild(script);
    });
    return callWidgetScriptPromise;
  }

  function openNativeCallModal(consultantId, shop, callType, consultantName, consultantAvatar) {
    console.log(
      "[CALL MODAL] Consultant card " + (callType === "video" ? "Video" : "Call") + " clicked",
    );
    if (!shop) {
      console.error("[CALL MODAL] shop missing — cannot open call modal");
      return;
    }
    ensureCallWidgetScript(shop)
      .then(function () {
        if (!window.ConsultlyCallWidget) {
          throw new Error("Call widget script loaded but did not register itself");
        }
        window.ConsultlyCallWidget.open({
          shop: shop,
          consultantId: consultantId,
          callType: callType,
          consultantName: consultantName,
          consultantAvatar: consultantAvatar,
        });
      })
      .catch(function (err) {
        console.error("[CALL MODAL] failed to open:", err);
      });
  }

  // Best-effort warm-up: once the browser is idle, load the (tiny) bootstrap
  // and let it start fetching the heavy engine chunk in the background, so
  // by the time the customer actually clicks Call/Video both are already
  // cached. Never runs before the browser is idle (requestIdleCallback, with
  // a delayed setTimeout fallback for Safari) and never blocks or retries
  // aggressively — a failed prefetch just means ensureEngineLoaded() inside
  // the widget does the real fetch when the button is actually clicked.
  function scheduleCallWidgetPrefetch(shop) {
    if (!shop) return;
    function run() {
      ensureCallWidgetScript(shop)
        .then(function () {
          if (window.ConsultlyCallWidget && typeof window.ConsultlyCallWidget.prefetchEngine === "function") {
            window.ConsultlyCallWidget.prefetchEngine(shop);
          }
        })
        .catch(function () {});
    }
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      window.setTimeout(run, 2000);
    }
  }

  var ACTION_LABELS = { chat: "Chat", voice: "Call", video: "Video" };

  // Each channel (chat/voice/video) has its own independent per-minute rate
  // in the real data — the button shows that channel's own real price, never
  // a shared/derived number. Same rates the Consultant Profile modal shows.
  function actionButtonMarkup(kind, icon, amount, currencySymbol, disabled) {
    return (
      '<button type="button" class="advizo-consultant-card__action advizo-consultant-card__action--' +
      kind +
      '" data-action="' +
      kind +
      '"' +
      (disabled
        ? ' aria-disabled="true" title="' + escapeHtml(COMM_DISABLED_MESSAGE) + '"'
        : "") +
      ">" +
      '<span class="advizo-consultant-card__action-row">' +
      '<span class="advizo-consultant-card__action-icon">' +
      icon +
      "</span>" +
      '<span class="advizo-consultant-card__action-label">' +
      ACTION_LABELS[kind] +
      "</span>" +
      "</span>" +
      '<span class="advizo-consultant-card__action-amount">' +
      escapeHtml(currencySymbol) +
      escapeHtml(formatAmount(amount)) +
      "/min</span>" +
      "</button>"
    );
  }

  // Real data has two independent booleans (isActive, isBusy) — the header
  // never had a single combined "online/busy/offline" state before. This
  // derives one from the same two existing fields (busy takes priority since
  // it's the more specific/urgent signal); nothing new is fetched or
  // fabricated, isActive/isBusy remain exactly what the API already sends.
  function availabilityMarkup(consultant) {
    var state = consultant.isBusy ? "busy" : consultant.isActive ? "online" : "offline";
    // "replies in ~1 min" is fixed copy, not a measured value — there is no
    // reply-time tracking anywhere in the data. Only added to the "online"
    // state, matching the reference; busy/offline keep their existing text.
    var label =
      state === "busy"
        ? "Busy · ~5 min"
        : state === "online"
          ? "Available now · replies in ~1 min"
          : "Offline";
    return (
      '<div class="advizo-consultant__availability advizo-consultant__availability--' +
      state +
      '">' +
      '<span class="advizo-consultant__availability-dot"></span>' +
      "<span>" +
      label +
      "</span>" +
      "</div>"
    );
  }

  // There is no rating/review/session-count field anywhere in the API
  // response — showing a specific number (like the reference's "4.9 · 2,140
  // sessions") would be a fabricated value on every card. Per explicit
  // product decision, this shows a neutral "New" placeholder instead of a
  // star rating, so the row isn't empty without inventing data. If a real
  // rating/session-count field is ever added to the API response, this is
  // the one place to switch on it.
  function ratingMarkup() {
    return '<span class="advizo-consultant__rating-badge">New</span>';
  }

  function cardMarkup(consultant, currencySymbol, communicationDisabled) {
    var imgSrc = consultant.image || DEFAULT_AVATAR;

    // Meta line: real fields only (experience, languages) — no
    // qualification/rating/offer fields exist in the API response, so those
    // reference-design sections are intentionally omitted rather than
    // invented. "0 yrs" isn't meaningful, so that segment is skipped when
    // experience is unset.
    var metaParts = [];
    if (consultant.experience > 0) metaParts.push(consultant.experience + "+ yrs");
    if (consultant.languages.length) metaParts.push(consultant.languages.join(", "));
    var metaText = escapeHtml(metaParts.join(" · "));

    return (
      '<div class="advizo-consultant-card__item">' +
      '<div class="advizo-consultant" data-consultant-id="' +
      escapeHtml(consultant.id) +
      '" role="button" tabindex="0">' +
      '<div class="advizo-consultant__header-band">' +
      '<span class="advizo-consultant__category">' +
      escapeHtml(consultant.profession) +
      "</span>" +
      // No favourite/secondary action exists anywhere in this app today —
      // left empty rather than adding a fake button (per design brief).
      "</div>" +
      '<div class="advizo-consultant__avatar-wrap">' +
      '<img class="advizo-consultant__avatar" src="' +
      escapeHtml(imgSrc) +
      '" alt="' +
      escapeHtml(consultant.name) +
      '" loading="lazy" />' +
      "</div>" +
      '<div class="advizo-consultant__body">' +
      '<h3 class="advizo-consultant__name">' +
      escapeHtml(consultant.name) +
      "</h3>" +
      (metaText
        ? '<p class="advizo-consultant__meta">' + metaText + "</p>"
        : "") +
      ratingMarkup() +
      availabilityMarkup(consultant) +
      '<div class="advizo-consultant__actions">' +
      actionButtonMarkup(
        "chat",
        ICONS.chat,
        consultant.chatPrice,
        currencySymbol,
        communicationDisabled,
      ) +
      actionButtonMarkup(
        "voice",
        ICONS.voice,
        consultant.audioPrice,
        currencySymbol,
        communicationDisabled,
      ) +
      actionButtonMarkup(
        "video",
        ICONS.video,
        consultant.videoPrice,
        currencySymbol,
        communicationDisabled,
      ) +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // Skeleton reuses the REAL card's own structural classes
  // (.advizo-consultant / __header-band / __avatar-wrap / __body /
  // __actions) and only swaps the inner content for neutral
  // .advizo-skeleton blocks — so its width/height/radius/gap is
  // guaranteed identical to the real card (same CSS controls both), instead
  // of maintaining a second, independent set of measurements that could
  // drift out of sync and cause layout shift when real cards replace it.
  function skeletonCardMarkup() {
    return (
      '<div class="advizo-consultant-card__item advizo-consultant-card__item--skeleton" aria-hidden="true">' +
      '<div class="advizo-consultant advizo-consultant--skeleton">' +
      '<div class="advizo-consultant__header-band">' +
      '<span class="advizo-skeleton advizo-skeleton--category"></span>' +
      "</div>" +
      '<div class="advizo-consultant__avatar-wrap">' +
      '<span class="advizo-skeleton advizo-skeleton--avatar"></span>' +
      "</div>" +
      '<div class="advizo-consultant__body">' +
      '<span class="advizo-skeleton advizo-skeleton--name"></span>' +
      '<span class="advizo-skeleton advizo-skeleton--meta"></span>' +
      '<span class="advizo-skeleton advizo-skeleton--badge"></span>' +
      '<span class="advizo-skeleton advizo-skeleton--availability"></span>' +
      '<div class="advizo-consultant__actions">' +
      '<span class="advizo-skeleton advizo-skeleton--action"></span>' +
      '<span class="advizo-skeleton advizo-skeleton--action"></span>' +
      '<span class="advizo-skeleton advizo-skeleton--action"></span>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // Shown immediately (before the consultants fetch even starts) so the
  // section reserves its real card-grid space from the first paint instead
  // of a bare loading line. Real cards' own loading state IS this function
  // having run — no separate timer, no fake progress.
  function renderSkeleton(root) {
    var html =
      '<span class="advizo-visually-hidden">Loading consultants…</span>' +
      '<div class="advizo-consultant-card__grid">';
    for (var i = 0; i < 3; i++) {
      html += skeletonCardMarkup();
    }
    html += "</div>";
    root.innerHTML = html;
  }

  function renderEmpty(root) {
    root.innerHTML =
      '<div class="advizo-consultant-card__empty">' +
      '<p class="advizo-consultant-card__empty-title">No consultants available yet</p>' +
      '<p class="advizo-consultant-card__empty-text">Our experts will appear here as soon as they are available. Please check back soon.</p>' +
      "</div>";
  }

  function renderError(root) {
    root.innerHTML =
      '<div class="advizo-consultant-card__error">' +
      "<p>We couldn’t load our consultants right now. Please refresh the page or try again shortly.</p>" +
      "</div>";
  }

  // TEMP (Chat modal UI test): no Consultly React iframe exists anywhere on
  // this storefront page (this card block is plain Liquid/vanilla JS, not
  // React) — so opening the EXISTING React chat modal (UserChat, normally
  // reached via ConsultantChatModal inside the CRA app) without navigating
  // this page away means creating that iframe on demand, right here, the
  // first time Chat is clicked. Reuses the CRA app's own /chats route (same
  // UserChat component ConsultantChatModal already wraps) — not a second
  // chat UI. ?embedded=1 tells UserChat.js to postMessage
  // CONSULTLY_CHAT_CLOSE instead of navigating when its own close/back
  // button is used — see UserChat.js closeOrGoBack/backToViewProfile.
  // Own dedicated backdrop/panel shell — deliberately NOT the same DOM
  // instance as ensureProfileModal() above (chat has no header/footer
  // regions to share; UserChat.js renders its own header/composer inside the
  // iframe). Mirrors that modal's proven backdrop/scroll-lock/ESC/focus
  // pattern so this gets the same fixes for free, without risking the
  // working profile/call modal by retrofitting it.
  var chatOverlayEls = null; // { backdrop, panel, iframe, spinner }
  var chatOverlayMessageListenerBound = false;
  var chatOverlayKeydownBound = false;
  var chatOverlayPreviouslyFocused = null;
  var chatOverlayBodyOverflow = "";
  var chatOverlayReadyTimer = null;

  function ensureChatOverlay() {
    if (chatOverlayEls) return chatOverlayEls;

    var backdrop = document.createElement("div");
    backdrop.className = "advizo-chat-overlay-backdrop";
    backdrop.setAttribute("hidden", "hidden");

    var panel = document.createElement("div");
    panel.className = "advizo-chat-overlay-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Chat");
    panel.setAttribute("tabindex", "-1");

    var spinner = document.createElement("div");
    spinner.className = "advizo-chat-overlay-spinner";
    spinner.setAttribute("role", "status");
    spinner.setAttribute("aria-label", "Loading chat");
    spinner.innerHTML = '<span class="advizo-chat-overlay-spinner-ring"></span>';

    var iframe = document.createElement("iframe");
    iframe.className = "advizo-chat-overlay-iframe";
    iframe.setAttribute("title", "Chat");

    panel.appendChild(spinner);
    panel.appendChild(iframe);
    backdrop.appendChild(panel);

    // Click on the backdrop itself (not bubbled from inside the panel)
    // closes the overlay — same convention as the profile modal.
    backdrop.addEventListener("click", function (evt) {
      if (evt.target === backdrop) closeChatOverlay();
    });

    document.body.appendChild(backdrop);
    chatOverlayEls = { backdrop: backdrop, panel: panel, iframe: iframe, spinner: spinner };
    return chatOverlayEls;
  }

  function isChatOverlayOpen() {
    return Boolean(chatOverlayEls) && !chatOverlayEls.backdrop.hasAttribute("hidden");
  }

  function handleChatOverlayKeydown(evt) {
    if (evt.key === "Escape" || evt.key === "Esc") closeChatOverlay();
  }

  function ensureChatOverlayMessageListener() {
    if (chatOverlayMessageListenerBound) return;
    chatOverlayMessageListenerBound = true;
    window.addEventListener("message", function (event) {
      if (!event.data || !event.data.type) return;
      if (event.data.type === "CONSULTLY_CHAT_CLOSE") {
        closeChatOverlay();
      } else if (event.data.type === "CONSULTLY_CHAT_UI_READY") {
        hideChatOverlaySpinner();
      }
    });
  }

  function hideChatOverlaySpinner() {
    if (chatOverlayReadyTimer) {
      clearTimeout(chatOverlayReadyTimer);
      chatOverlayReadyTimer = null;
    }
    if (chatOverlayEls) {
      chatOverlayEls.spinner.setAttribute("hidden", "hidden");
    }
  }

  function openChatOverlay(consultantId, shop) {
    if (!shop) {
      console.error("[advizo] shop missing — cannot open chat overlay");
      return;
    }
    ensureChatOverlayMessageListener();
    var els = ensureChatOverlay();

    // Reset to the loading state every time — the iframe is destroyed on
    // close (see closeChatOverlay), so each open is a fresh boot and should
    // show the spinner again, not a stale chat frame from a previous open.
    els.spinner.removeAttribute("hidden");
    els.iframe.src = buildChatOverlayUrl(shop, consultantId);

    // Safety net: if the React app never posts CONSULTLY_CHAT_UI_READY (a
    // slow network, an error before mount), don't leave the spinner
    // spinning forever — the boot-loader elsewhere in this app uses the same
    // "post a ready signal, fall back to a timer" pattern.
    if (chatOverlayReadyTimer) clearTimeout(chatOverlayReadyTimer);
    chatOverlayReadyTimer = setTimeout(hideChatOverlaySpinner, 8000);

    if (!isChatOverlayOpen()) {
      chatOverlayPreviouslyFocused = document.activeElement;
      chatOverlayBodyOverflow = document.body.style.overflow;
    }
    els.backdrop.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    if (!chatOverlayKeydownBound) {
      document.addEventListener("keydown", handleChatOverlayKeydown);
      chatOverlayKeydownBound = true;
    }
    els.panel.focus();
  }

  function closeChatOverlay() {
    if (!isChatOverlayOpen()) return;
    if (chatOverlayReadyTimer) {
      clearTimeout(chatOverlayReadyTimer);
      chatOverlayReadyTimer = null;
    }
    chatOverlayEls.backdrop.setAttribute("hidden", "hidden");
    document.body.style.overflow = chatOverlayBodyOverflow;
    if (chatOverlayKeydownBound) {
      document.removeEventListener("keydown", handleChatOverlayKeydown);
      chatOverlayKeydownBound = false;
    }
    // Tear the iframe down (not just hide it) — otherwise the chat's
    // Socket.IO connection would keep running invisibly in the background.
    chatOverlayEls.iframe.src = "about:blank";
    if (
      chatOverlayPreviouslyFocused &&
      typeof chatOverlayPreviouslyFocused.focus === "function"
    ) {
      chatOverlayPreviouslyFocused.focus();
    }
    chatOverlayPreviouslyFocused = null;
  }

  // ---------- Consultant Profile modal ----------
  //
  // Ported/adapted from consultant-profile.js's renderProfile: same fields
  // (name, image, profession, experience, languages, availability, bio,
  // specialization, chat/voice/video actions), same API endpoint
  // (/apps/advizo/consultant/<id> — zero backend change), same
  // action-button behavior (chat -> the existing overlay iframe above;
  // voice/video -> the same legacy call-bridge redirect the real profile
  // page's own buttons already use). Rendered into a modal on THIS page
  // instead of navigating to /pages/consultant-profile. consultant-profile.js
  // and its Liquid block are untouched and still work standalone — nothing
  // here removes them; this only changes where the card/action clicks below
  // send the shopper.
  var PROFILE_API_BASE = "/apps/advizo/consultant";
  var profileModalEls = null; // { backdrop, panel, body, closeBtn }
  var profileModalPreviouslyFocused = null;
  var profileModalKeydownBound = false;
  var profileModalBodyOverflow = "";

  function ensureProfileModal() {
    if (profileModalEls) return profileModalEls;

    var backdrop = document.createElement("div");
    backdrop.className = "advizo-profile-modal-backdrop";
    backdrop.setAttribute("hidden", "hidden");

    var panel = document.createElement("div");
    panel.className = "advizo-profile-modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Consultant profile");
    panel.setAttribute("tabindex", "-1");

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "advizo-profile-modal__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    closeBtn.addEventListener("click", closeProfileModal);

    // Three fixed-role regions inside the panel (not three separate
    // scrollers): header and footer are flex-shrink:0 and never scroll;
    // only .body flexes/scrolls. This — not overflow-y on the whole panel —
    // is what keeps the header/close button always visible and the modal's
    // own height fixed regardless of how much consultant content there is.
    var header = document.createElement("div");
    header.className = "advizo-profile-modal__header";

    var body = document.createElement("div");
    body.className = "advizo-profile-modal__body";

    var footer = document.createElement("div");
    footer.className = "advizo-profile-modal__footer";

    panel.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    backdrop.appendChild(panel);

    // Click on the backdrop itself (not bubbled from inside the panel)
    // closes the modal.
    backdrop.addEventListener("click", function (evt) {
      if (evt.target === backdrop) closeProfileModal();
    });

    document.body.appendChild(backdrop);
    profileModalEls = {
      backdrop: backdrop,
      panel: panel,
      header: header,
      body: body,
      footer: footer,
      closeBtn: closeBtn,
    };
    return profileModalEls;
  }

  function isProfileModalOpen() {
    return Boolean(profileModalEls) && !profileModalEls.backdrop.hasAttribute("hidden");
  }

  function handleProfileModalKeydown(evt) {
    if (evt.key === "Escape" || evt.key === "Esc") closeProfileModal();
  }

  // Shared "show the modal shell" step for both openProfileModal and
  // openCallOverlay — same backdrop/scroll-lock/ESC-binding/focus handling
  // either way. Only captures the pre-modal focus target the FIRST time
  // (i.e. when the modal isn't already open) — the profile modal's own
  // Call/Video buttons call this again to switch the SAME open modal from
  // profile content to a call, and re-capturing focus there would capture
  // the just-clicked button instead of whatever was focused before the
  // modal originally opened.
  function showProfileModalShell(els) {
    if (!isProfileModalOpen()) {
      profileModalPreviouslyFocused = document.activeElement;
      profileModalBodyOverflow = document.body.style.overflow;
    }
    els.backdrop.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    if (!profileModalKeydownBound) {
      document.addEventListener("keydown", handleProfileModalKeydown);
      profileModalKeydownBound = true;
    }
    els.closeBtn.focus();
  }

  function closeProfileModal() {
    if (!isProfileModalOpen()) return;
    profileModalEls.backdrop.setAttribute("hidden", "hidden");
    document.body.style.overflow = profileModalBodyOverflow;
    if (profileModalKeydownBound) {
      document.removeEventListener("keydown", handleProfileModalKeydown);
      profileModalKeydownBound = false;
    }
    if (
      profileModalPreviouslyFocused &&
      typeof profileModalPreviouslyFocused.focus === "function"
    ) {
      profileModalPreviouslyFocused.focus();
    }
    profileModalPreviouslyFocused = null;

    // If a call was showing, tear the iframe down too — merely hiding the
    // modal (via the close button, Escape, or a backdrop click) would leave
    // an active Agora/Socket.IO session running invisibly in the background
    // instead of actually ending the call.
    if (profileModalEls.panel.classList.contains("advizo-profile-modal--call")) {
      profileModalEls.panel.classList.remove("advizo-profile-modal--call");
      profileModalEls.body.innerHTML = "";
    }
  }

  // Clears header/footer too — without this, re-opening the modal for a
  // DIFFERENT consultant while it's still loading would briefly show the
  // PREVIOUS consultant's header/action buttons above the new loading state.
  function clearProfileModalChrome(els) {
    els.header.innerHTML = "";
    els.footer.innerHTML = "";
  }

  function renderProfileModalLoading(els) {
    clearProfileModalChrome(els);
    els.body.innerHTML =
      '<div class="advizo-profile-modal__state">Loading consultant profile…</div>';
  }

  function renderProfileModalNotFound(els) {
    clearProfileModalChrome(els);
    els.body.innerHTML =
      '<div class="advizo-profile-modal__state">Consultant not found.</div>';
  }

  function renderProfileModalError(els, onRetry) {
    clearProfileModalChrome(els);
    els.body.innerHTML =
      '<div class="advizo-profile-modal__state">' +
      "<p>We couldn’t load this consultant’s profile. Please try again shortly.</p>" +
      '<button type="button" class="advizo-profile-modal__retry">Try again</button>' +
      "</div>";
    var btn = els.body.querySelector(".advizo-profile-modal__retry");
    if (btn) btn.addEventListener("click", onRetry);
  }

  function profileActionButtonMarkup(kind, label, icon, amount, currencySymbol, disabled) {
    return (
      '<button type="button" class="advizo-profile-modal__action" data-action="' +
      kind +
      '"' +
      (disabled
        ? ' aria-disabled="true" title="' + escapeHtml(COMM_DISABLED_MESSAGE) + '"'
        : "") +
      ">" +
      '<span class="advizo-profile-modal__action-icon">' +
      icon +
      "</span>" +
      '<span class="advizo-profile-modal__action-label">' +
      escapeHtml(label) +
      "</span>" +
      '<span class="advizo-profile-modal__action-amount">' +
      escapeHtml(currencySymbol) +
      escapeHtml(formatAmount(amount)) +
      "/min</span>" +
      "</button>"
    );
  }

  function profileChipsMarkup(className, values) {
    return values
      .map(function (v) {
        return '<span class="' + className + '">' + escapeHtml(v) + "</span>";
      })
      .join("");
  }

  // ---- Profile modal "extras" ----
  //
  // Rating and consultation-count are REAL, database-backed fields now —
  // c.ratingSummary ({average, total, distribution}) and
  // c.totalConversations, both added to the /apps/advizo/consultant
  // response by proxyConsultantProfileJson (shopifyController.js), computed
  // by ratingController.js's getConsultantRatingSummary /
  // getConsultantTotalConversations from the Rating and TransactionHistroy
  // collections. No fallback/demo number is used for either — a consultant
  // with zero ratings shows "No ratings yet", never a fabricated average.
  //
  // socialLinks has no backend field yet (confirmed: no social-link column
  // on the consultant schema) — that piece stays demo data, isolated here
  // exactly as before. SHOW_DEMO_SOCIAL_LINKS is the kill switch: unlike a
  // rounded rating number, a social icon is a literal clickable link a real
  // shopper could open — set this to `false` before this reaches real
  // customers on a shop with no real Consultant Dashboard social-link data.
  var SHOW_DEMO_SOCIAL_LINKS = true;
  var SOCIAL_LINKS_DEMO_DEFAULT = {
    linkedin: "https://www.linkedin.com/",
    twitter: "https://x.com/",
    instagram: "https://www.instagram.com/",
    website: "",
  };

  function getProfileExtras(c) {
    var hasRealSocialLinks =
      c.socialLinks &&
      typeof c.socialLinks === "object" &&
      Object.keys(c.socialLinks).some(function (k) {
        return Boolean(c.socialLinks[k]);
      });

    var ratingSummary = c.ratingSummary || { average: null, total: 0, distribution: [0, 0, 0, 0, 0] };
    var hasRatings = Number(ratingSummary.total) > 0 && ratingSummary.average != null;

    return {
      hasRatings: hasRatings,
      rating: hasRatings ? Number(ratingSummary.average) : null,
      reviewCount: Number(ratingSummary.total) || 0,
      ratingBreakdown: Array.isArray(ratingSummary.distribution)
        ? ratingSummary.distribution
        : [0, 0, 0, 0, 0],
      consultationsCompleted: c.totalConversations != null ? Number(c.totalConversations) : 0,
      socialLinks: hasRealSocialLinks
        ? c.socialLinks
        : SHOW_DEMO_SOCIAL_LINKS
          ? SOCIAL_LINKS_DEMO_DEFAULT
          : {},
      isDemoSocialLinks: !hasRealSocialLinks,
    };
  }

  // Whole-star rounding only — a compact summary, not a review dashboard.
  function starRowMarkup(rating) {
    var filled = Math.max(0, Math.min(5, Math.round(rating)));
    var html = "";
    for (var i = 0; i < 5; i++) {
      html += i < filled ? STAR_ICON_FILLED : STAR_ICON_EMPTY;
    }
    return html;
  }

  // Five thin bars, longest-first — intentionally compact (max-width capped
  // in CSS), not a full analytics chart.
  function ratingBreakdownMarkup(breakdown) {
    var max = Math.max(1, breakdown.reduce(function (a, b) { return Math.max(a, b); }, 0));
    var labels = [5, 4, 3, 2, 1];
    return breakdown
      .map(function (value, i) {
        var pct = Math.round((value / max) * 100);
        return (
          '<div class="advizo-profile-modal__rating-bar-row">' +
          '<span class="advizo-profile-modal__rating-bar-label">' + labels[i] + "</span>" +
          '<span class="advizo-profile-modal__rating-bar-track">' +
          '<span class="advizo-profile-modal__rating-bar-fill" style="width:' + pct + '%"></span>' +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function statPairMarkup(value, label) {
    return (
      '<div class="advizo-profile-modal__stat">' +
      '<span class="advizo-profile-modal__stat-value">' + escapeHtml(value) + "</span>" +
      '<span class="advizo-profile-modal__stat-label">' + escapeHtml(label) + "</span>" +
      "</div>"
    );
  }

  function socialLinksMarkup(socialLinks) {
    var keys = ["linkedin", "twitter", "instagram", "youtube", "website"];
    var html = "";
    keys.forEach(function (key) {
      var url = socialLinks[key];
      if (!url) return;
      var label = SOCIAL_LABELS[key];
      html +=
        '<a class="advizo-profile-modal__social-icon" href="' +
        escapeHtml(url) +
        '" target="_blank" rel="noopener noreferrer" aria-label="' +
        escapeHtml(label) +
        '" title="' +
        escapeHtml(label) +
        '">' +
        SOCIAL_ICONS[key] +
        "</a>";
    });
    return html;
  }

  function renderProfileModalContent(els, data, shop) {
    var c = data.consultant || {};
    var name = c.displayName || c.fullname || "Consultant";
    var profession = c.profession || "Consultant";
    var experience = parseInt(c.experience, 10) || 0;
    var languages = parseLanguages(c.language);
    var imgSrc = c.profileImage || DEFAULT_AVATAR;
    var currencySymbol = data.shopCurrency || "$";

    var statusHtml = c.isBusy
      ? '<span class="advizo-profile-modal__status advizo-profile-modal__status--busy">Busy · ~5 min</span>'
      : c.isActive
        ? '<span class="advizo-profile-modal__status advizo-profile-modal__status--online">Available now</span>'
        : '<span class="advizo-profile-modal__status advizo-profile-modal__status--offline">Offline</span>';

    var extras = getProfileExtras(c);

    // ---- header (fixed, does not scroll) ----
    els.header.innerHTML =
      '<img class="advizo-profile-modal__avatar" src="' +
      escapeHtml(imgSrc) +
      '" alt="' +
      escapeHtml(name) +
      '" />' +
      '<div class="advizo-profile-modal__header-info">' +
      '<h1 class="advizo-profile-modal__name">' +
      escapeHtml(name) +
      "</h1>" +
      '<p class="advizo-profile-modal__profession">' +
      escapeHtml(profession) +
      "</p>" +
      '<div class="advizo-profile-modal__header-row">' +
      statusHtml +
      '<span class="advizo-profile-modal__rating-inline">' +
      (extras.hasRatings
        ? '<span class="advizo-profile-modal__stars">' + starRowMarkup(extras.rating) + "</span>" +
          "<span>" + extras.rating.toFixed(1) + " · " + extras.reviewCount + " review" + (extras.reviewCount === 1 ? "" : "s") + "</span>"
        : "<span>No ratings yet</span>") +
      "</span>" +
      "</div>" +
      "</div>";

    var avatarEl = els.header.querySelector(".advizo-profile-modal__avatar");
    if (avatarEl) {
      avatarEl.addEventListener(
        "error",
        function () {
          avatarEl.src = DEFAULT_AVATAR;
        },
        { once: true },
      );
    }

    // ---- body (the ONLY scrolling region) ----

    var aboutHtml = c.bio
      ? '<section class="advizo-profile-modal__section advizo-profile-modal__section--intro">' +
        '<h2 class="advizo-profile-modal__section-title">About</h2>' +
        '<p class="advizo-profile-modal__about">' +
        escapeHtml(c.bio) +
        "</p>" +
        "</section>"
      : "";

    // specialization is a single free-text schema field, but merchants can
    // (and do) enter several, comma-separated — splitting it into chips is
    // a display change of that same real field, never an invented list.
    var specialties = c.specialization
      ? String(c.specialization)
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean)
      : [];
    var expertiseHtml = specialties.length
      ? '<section class="advizo-profile-modal__section' + (aboutHtml ? "" : " advizo-profile-modal__section--intro") + '">' +
        '<h2 class="advizo-profile-modal__section-title">Expertise</h2>' +
        '<div class="advizo-profile-modal__chip-row">' +
        profileChipsMarkup("advizo-profile-modal__expertise-tag", specialties) +
        "</div>" +
        "</section>"
      : "";

    // Consultation info — real experience/languages fields (same ones the
    // old "intro" meta line showed) plus the demo consultations-completed
    // count, grouped as one section instead of a separate meta strip.
    var statsHtml = "";
    if (experience > 0) statsHtml += statPairMarkup(experience + "+ yrs", "Experience");
    statsHtml += statPairMarkup(extras.consultationsCompleted.toLocaleString(), "Consultations");
    var consultationHtml =
      '<section class="advizo-profile-modal__section' +
      (aboutHtml || expertiseHtml ? "" : " advizo-profile-modal__section--intro") +
      '">' +
      '<h2 class="advizo-profile-modal__section-title">Consultation</h2>' +
      '<div class="advizo-profile-modal__stat-row">' + statsHtml + "</div>" +
      (languages.length
        ? '<div class="advizo-profile-modal__chip-row">' +
          '<span class="advizo-profile-modal__chip-row-label">Speaks</span>' +
          profileChipsMarkup("advizo-profile-modal__lang-chip", languages) +
          "</div>"
        : "") +
      "</section>";

    // Rating & Reviews — real, database-backed (see getProfileExtras()'s own
    // comment). A consultant with zero ratings gets an honest empty state,
    // never a fabricated average.
    var ratingHtml =
      '<section class="advizo-profile-modal__section">' +
      '<h2 class="advizo-profile-modal__section-title">Rating &amp; Reviews</h2>' +
      (extras.hasRatings
        ? '<div class="advizo-profile-modal__rating-summary">' +
          '<span class="advizo-profile-modal__rating-number">' + extras.rating.toFixed(1) + "</span>" +
          "<div>" +
          '<span class="advizo-profile-modal__stars">' + starRowMarkup(extras.rating) + "</span>" +
          '<p class="advizo-profile-modal__rating-count">' + extras.reviewCount + " review" + (extras.reviewCount === 1 ? "" : "s") + "</p>" +
          "</div>" +
          "</div>" +
          '<div class="advizo-profile-modal__rating-bars">' + ratingBreakdownMarkup(extras.ratingBreakdown) + "</div>"
        : '<p class="advizo-profile-modal__rating-empty">No ratings yet.</p>') +
      "</section>";

    var socialHtml = "";
    var socialIcons = socialLinksMarkup(extras.socialLinks);
    if (socialIcons) {
      socialHtml =
        '<section class="advizo-profile-modal__section">' +
        '<h2 class="advizo-profile-modal__section-title">Connect</h2>' +
        '<div class="advizo-profile-modal__social-row">' + socialIcons + "</div>" +
        "</section>";
    }

    els.body.innerHTML = aboutHtml + expertiseHtml + consultationHtml + ratingHtml + socialHtml;

    // ---- footer (fixed, does not scroll) ----
    var buttons = "";
    if (c.chatPerMinute != null && Number(c.chatPerMinute) > 0) {
      buttons += profileActionButtonMarkup(
        "chat", "Chat", ICONS.chat, c.chatPerMinute, currencySymbol, data.communicationDisabled,
      );
    }
    if (c.voicePerMinute != null && Number(c.voicePerMinute) > 0) {
      buttons += profileActionButtonMarkup(
        "voice", "Call", ICONS.voice, c.voicePerMinute, currencySymbol, data.communicationDisabled,
      );
    }
    if (c.videoPerMinute != null && Number(c.videoPerMinute) > 0) {
      buttons += profileActionButtonMarkup(
        "video", "Video", ICONS.video, c.videoPerMinute, currencySymbol, data.communicationDisabled,
      );
    }
    els.footer.innerHTML = buttons
      ? '<div class="advizo-profile-modal__actions">' + buttons + "</div>"
      : "";

    els.footer.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = btn.getAttribute("data-action");
        if (data.communicationDisabled) return; // aria-disabled, but guard anyway

        if (action === "chat") {
          // Chat overlay is a fixed, full-viewport iframe (z-index far above
          // this modal) — closing the modal first avoids two stacked
          // overlays competing for body-scroll-lock/ESC handling.
          closeProfileModal();
          openChatOverlay(c.id, shop);
          return;
        }

        // Voice/video: close this modal and open the native call modal
        // directly — starting the call itself is unchanged, still the same
        // generate-token/socket flow, just presented without an iframe.
        if (!data.authenticated) {
          window.location.href = buildLoginUrl(shop);
          return;
        }
        closeProfileModal();
        openNativeCallModal(c.id, shop, action, name, imgSrc);
      });
    });
  }

  function openProfileModal(consultantId, shop) {
    if (!consultantId || !shop) return;

    var els = ensureProfileModal();
    // Defensive: if the shared modal was last showing a call, make sure its
    // call-sizing modifier doesn't leak into this normal profile view.
    els.panel.classList.remove("advizo-profile-modal--call");
    showProfileModalShell(els);

    var fetchUrl = PROFILE_API_BASE + "/" + encodeURIComponent(consultantId);

    function load() { 
      renderProfileModalLoading(els);
      fetch(fetchUrl, { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (res) {
          if (res.status === 400 || res.status === 404) {
            var notFoundErr = new Error("not_found");
            notFoundErr.notFound = true;
            throw notFoundErr; 
          }
          if (!res.ok) throw new Error("Request failed with status " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || data.success !== true || !data.consultant) {
            throw new Error("Unexpected response shape");
          }    
          // The shopper may have already closed the modal while this
          // request was in flight — don't paint into a closed/reused modal.
          if (!isProfileModalOpen()) return;
          renderProfileModalContent(els, data, shop);
        })
        .catch(function (err) {
          if (!isProfileModalOpen()) return;
          if (err && err.notFound) {
            renderProfileModalNotFound(els);
            return;
          }
          console.error("[advizo] failed to load consultant profile:", err);
          renderProfileModalError(els, load);
        });
    }

    load();
  }

  function renderConsultants(container, root, consultants, ctx) {
    if (!consultants.length) {
      renderEmpty(root);
      return;
    }

    // shopCurrency isn't in the API response yet — "$" matches the existing
    // React app's own MoneyValue fallback (currency || "$"), not a stand-in
    // for missing data. See Step 4 report.
    var currencySymbol = ctx.shopCurrency || "$";

    var html = '<div class="advizo-consultant-card__grid">';
    for (var i = 0; i < consultants.length; i++) {
      html += cardMarkup(consultants[i], currencySymbol, ctx.communicationDisabled);
    }
    html += "</div>";
    root.innerHTML = html;

    // Staggered entrance: the actual fade/translateY animation lives in CSS
    // (.advizo-consultant-card__item, keyed off insertion — see
    // consultant-card.css) and plays automatically once each item is
    // inserted into the DOM above. This only staggers WHEN each one starts,
    // capped after the first 8 so a long list doesn't make anyone wait
    // longer for a "smooth" effect than for the data itself.
    root.querySelectorAll(".advizo-consultant-card__item").forEach(function (item, i) {
      item.style.animationDelay = Math.min(i, 8) * 70 + "ms";
    });

    root.querySelectorAll(".advizo-consultant__avatar").forEach(function (img) {
      img.addEventListener(
        "error",
        function () {
          img.src = DEFAULT_AVATAR;
        },
        { once: true },
      );
    });

    var consultantsById = {};
    consultants.forEach(function (c) {
      consultantsById[c.id] = c;
    });

    root.querySelectorAll(".advizo-consultant").forEach(function (cardEl) {
      var consultantId = cardEl.getAttribute("data-consultant-id");
      var consultant = consultantsById[consultantId];
      if (consultant) {
        applyProfessionHeaderColor(cardEl, consultant, ctx.professionColors);
      }

      cardEl.addEventListener("click", function () {
        console.log("[CONSULTANT CARD] Card clicked");
        console.log("[CONSULTANT CARD] Consultant ID:", consultantId);
        console.log("[CONSULTANT CARD] Opening profile modal");
        openProfileModal(consultantId, ctx.shop);
      });

      cardEl.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function (evt) {
          // These are plain type="button" elements (never a submit/anchor),
          // so there is no default browser action to prevent — but calling
          // this defensively costs nothing and guards against any future
          // markup change. stopPropagation is the one doing real work here:
          // without it this click would bubble to the card's own "click"
          // listener above and open the profile too.
          evt.preventDefault();
          evt.stopPropagation();

          var action = btn.getAttribute("data-action");

          if (action === "chat") {
            console.log("[THEME CHAT TEST] REAL THEME EXTENSION CHAT CLICKED");
          }

          if (ctx.communicationDisabled) {
            showToast(container, COMM_DISABLED_TOAST);
            return;
          }

          // TODO(auth): Chat-modal UI test only — the "!ctx.authenticated"
          // redirect below is intentionally skipped for the "chat" action so
          // the existing React chat modal opens for an anonymous/unresolved
          // visitor too. Voice/video are NOT touched (do not touch calling)
          // and still redirect to login exactly as before. Restore an
          // equivalent gate for chat before this ships for real users.
          if (action !== "chat" && !ctx.authenticated) {
            window.location.href = buildLoginUrl(ctx.shop);
            return;
          }

          if (action === "chat") {
            openChatOverlay(consultantId, ctx.shop);
            return;
          }

          // Voice/video clicked directly on the card: open the native call
          // modal immediately — no intermediate Consultant Profile modal/
          // page, no navigation, no iframe. (Clicking the card itself still
          // opens the profile via openProfileModal — this only changes the
          // card's OWN action buttons.)
          console.log("[CALL FLOW] Navigation prevented");
          openNativeCallModal(
            consultantId,
            ctx.shop,
            action,
            consultant ? consultant.name : "",
            consultant ? consultant.image : "",
          );
        });
      });
    });
  }

  function initConsultantCard(container) {
    if (container.getAttribute("data-advizo-initialized") === "1") return;
    container.setAttribute("data-advizo-initialized", "1");

    var root = container.querySelector(".advizo-consultant-card__root");
    if (!root) return;

    // Replaces the static "loading…" text the Liquid block renders before
    // this script runs at all — occupies the real card-grid area immediately
    // instead of a large empty section while the fetch below is in flight.
    renderSkeleton(root);

    var apiUrl = container.getAttribute("data-api-url");
    var shop = container.getAttribute("data-shop");
    var limit = parseInt(container.getAttribute("data-limit"), 10) || 0;

    // TEMP (Theme Extension customer-ID debug test): read-only, printed to
    // the console for verification — not used for auth/DB/chat logic here.
    // Sourced from the `data-shopify-customer-id` attribute the Liquid block
    // renders from Shopify's own `customer` object (see that file's
    // comment) — a server-rendered, Shopify-session-derived value, never a
    // hardcoded or client-supplied one.
    var shopifyCustomerIdRaw = container.getAttribute("data-shopify-customer-id");
    var shopifyCustomerId = shopifyCustomerIdRaw ? Number(shopifyCustomerIdRaw) : null;

    console.log(
      "[THEME CUSTOMER DEBUG] Shopify logged-in customer ID =",
      shopifyCustomerId || null,
    );
    console.log(
      "[THEME CUSTOMER DEBUG] Shopify customer logged in =",
      Boolean(shopifyCustomerId),
    );

    if (!apiUrl) {
      renderError(root);
      return;
    }

    // "include" (not "same-origin") so the shopper's Shopify session cookies
    // are attached even in edge cases where the browser doesn't treat this
    // App-Proxy-forwarded request as strictly same-origin (some browsers'
    // cookie-partitioning heuristics can differ from a plain URL-origin
    // check) — this is the identity signal logged_in_customer_id depends on.
    function fetchConsultants() {
      return fetch(apiUrl, { credentials: "include", headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("Request failed with status " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || data.success !== true) throw new Error("Unexpected response shape");
          return data;
        });
    }

    // TEMP (New Customer Accounts identity-sync): a shopper who just
    // completed a Shop/New-Customer-Accounts login redirect back to the
    // storefront can hit this page before Shopify's edge has finished
    // propagating logged_in_customer_id for App Proxy purposes — a real
    // timing gap, not a code bug (see the identity-mechanism report). One
    // short, one-time retry gives that propagation a chance to catch up
    // before falling back to rendering as anonymous. Never retried more than
    // once, and never blocks anonymous visitors from seeing the cards.
    fetchConsultants()
      .then(function (data) {
        if (data.authenticated) return data;
        return new Promise(function (resolve) {
          setTimeout(function () {
            fetchConsultants().then(resolve).catch(function () {
              resolve(data); // retry failed — proceed with the first result
            });
          }, 700);
        });
      })
      .then(function (data) {
        var mapped = (Array.isArray(data.findConsultant) ? data.findConsultant : [])
          .map(mapConsultant)
          .filter(function (c) {
            return c.consultantStatus;
          });

        var limited = limit > 0 ? mapped.slice(0, limit) : mapped;

        // Admin-saved appearance (Admin Dashboard → Consultant Card
        // Appearance) — null/empty unless the admin explicitly saved one.
        // Shop-wide colors go on the container (inherited by every card via
        // CSS var() cascade); profession-specific header colors need to be
        // per-card, applied inside renderConsultants once each card element
        // exists — see applyProfessionHeaderColor.
        applyConsultantCardTheme(container, data.consultantCardTheme);

        renderConsultants(container, root, limited, {
          shop: shop,
          shopId: data.shopId,
          authenticated: Boolean(data.authenticated),
          communicationDisabled: Boolean(data.communicationDisabled),
          shopCurrency: data.shopCurrency,
          professionColors:
            (data.consultantCardTheme && data.consultantCardTheme.professionColors) || null,
          // TEMP (Theme Extension identity-sync test) — the app DB user id
          // for this shopper, already resolved server-side (see
          // proxyConsultantsJson / resolveStorefrontCustomer). Not used to
          // build any URL here — the chat overlay's own App Proxy request
          // resolves identity itself — this is only for the debug logs
          // below and any future Theme JS that needs it directly.
          customerId: data.customerId || null,
        });

        scheduleCallWidgetPrefetch(shop);

        // TEMPORARY debug (Theme Extension identity-sync test) — booleans
        // only, never the DB id value itself. This is the browser seeing
        // only what /apps/advizo/consultants decided server-side; whether
        // Shopify actually appended logged_in_customer_id on that request is
        // logged server-side (proxyConsultantsJson) instead, since this
        // bundle never sees that raw query param itself.
        console.log("[THEME AUTH DEBUG] authenticated =", Boolean(data.authenticated));
        console.log("[THEME AUTH DEBUG] DB user available =", Boolean(data.customerId));

        // TEMP (Shopify customer -> Mongo user -> socket identity flow):
        // data.customerId is the Mongo User._id already resolved and
        // Shopify-verified server-side (resolveStorefrontCustomer ->
        // manageShopifyUser -> fetchShopifyCustomer's GraphQL check) — never
        // a raw Shopify customer id, never client-computed. "client_u_Identity"
        // is the SAME key advizo_Frontend/src/utils/browserSession.js's
        // getSocketUserIdForActiveSession() already reads for Socket.IO, and
        // the same key ConsultantCards.js already writes on its own
        // (React-hosted) storefront pages — this only fills that in for the
        // vanilla Theme Extension entry point too. Only ever SET, never
        // cleared, on purpose: this mirrors ConsultantCards.js's own
        // behavior, since browserSession.js's activateSession/session-role
        // system (not this bundle) is what's responsible for clearing
        // identity keys on a genuine role switch — duplicating that here
        // risks wiping an unrelated active session sharing this browser
        // (e.g. a consultant also browsing their own storefront). This
        // localStorage value is a client-side hint only; nothing here
        // treats it as authentication — the JWT/socket-auth check server
        // side is unchanged and is what actually gates any privileged
        // action.
        if (data.authenticated && data.customerId) {
          localStorage.setItem("client_u_Identity", String(data.customerId));
          console.log("[SHOPIFY IDENTITY] Socket identity stored =", true);
        } else {
          console.log("[SHOPIFY IDENTITY] Socket identity stored =", false);
        }
      })
      .catch(function (err) {
        console.error("[advizo] failed to load consultants:", err);
        renderError(root);
      });
  }

  function initAll() {
    document.querySelectorAll(".advizo-consultant-card").forEach(initConsultantCard);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  // Theme Editor can inject a freshly-rendered block instance without a full
  // page reload (e.g. after a settings change) — catch that case too.
  document.addEventListener("shopify:section:load", initAll);
})();
