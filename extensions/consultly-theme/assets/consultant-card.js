/**
 * Consultly — Consultant Listing storefront bundle.
 *
 * Vanilla JS, no build step, no framework. Ported from
 * consultly_Frontend/src/components/ConsultantCards/ConsultantCards.js —
 * same fields, same card layout, same formatAmountHelper/MoneyValue logic —
 * without React/Redux/Bootstrap/react-router, none of which this file
 * imports or depends on.
 *
 * Data source: the App Proxy JSON endpoint added in Step 2
 * (/apps/consultly/consultants). That path is storefront-relative and is
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
    experience:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>',
  };

  var COMM_DISABLED_MESSAGE =
    "Communication unavailable. The store has exhausted its communication minutes.";
  var COMM_DISABLED_TOAST = "Communication is currently unavailable.";

  // Same rules as consultly_Frontend/src/components/Helper/Helper.js
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
    toast.className = "consultly-consultant-card__toast";
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
      "https://" + shop + "/account/login?return_to=" + encodeURIComponent("/apps/consultly")
    );
  }

  // Native Consultant Profile page (Theme App Extension block), added
  // alongside this card. Relative + plain window.location — this bundle
  // runs directly in the theme now, not inside an iframe, so there's no
  // need to break out via window.top the way the old iframe-era code had
  // to. The merchant must have a Shopify Page at this handle with the
  // "Consultant Profile" app block added (Theme Editor) — see the block's
  // own comments for that one-time setup step.
  function buildProfileUrl(consultantId) {
    return "/pages/consultant-profile?id=" + encodeURIComponent(consultantId);
  }

  // TEMP (Chat modal UI test): App-Proxy-relative on purpose — Shopify's own
  // edge intercepts this and forwards it to our backend WITH
  // logged_in_customer_id + a verified signature attached, and the browser
  // also carries the session cookie the /apps/consultly/consultants fetch
  // already set (same shop origin). That's how the identity sync in
  // Step 1/2 actually reaches the chat overlay — see
  // proxyShopifyStorefrontChat in shopifyController.js. A direct cross-origin
  // request to the React app's own host would skip all of that.
  function buildChatOverlayUrl(shop, consultantId) {
    return (
      "https://" +
      shop +
      "/apps/consultly/chats?consultantId=" +
      encodeURIComponent(consultantId)
    );
  }

  function priceMarkup(currencySymbol, amount) {
    return (
      '<span class="consultly-consultant-card__action-price">' +
      '<span class="consultly-consultant-card__currency">' +
      escapeHtml(currencySymbol) +
      "</span>" +
      escapeHtml(formatAmount(amount)) +
      '<span class="consultly-consultant-card__action-unit">/min</span>' +
      "</span>"
    );
  }

  function actionButtonMarkup(kind, icon, amount, currencySymbol, disabled) {
    return (
      '<button type="button" class="consultly-consultant-card__action consultly-consultant-card__action--' +
      kind +
      '" data-action="' +
      kind +
      '"' +
      (disabled
        ? ' aria-disabled="true" title="' + escapeHtml(COMM_DISABLED_MESSAGE) + '"'
        : "") +
      ">" +
      '<span class="consultly-consultant-card__action-icon">' +
      icon +
      "</span>" +
      priceMarkup(currencySymbol, amount) +
      "</button>"
    );
  }

  function cardMarkup(consultant, currencySymbol, communicationDisabled) {
    var languagesText = escapeHtml(consultant.languages.join(", "));
    var busyBadge = consultant.isBusy
      ? '<span class="consultly-consultant-card__badge consultly-consultant-card__badge--busy">' +
        '<span class="consultly-consultant-card__busy-dot"></span>Busy · ~5 min</span>'
      : "";
    var statusDot = consultant.isActive
      ? '<span class="consultly-consultant-card__status-dot"></span>'
      : "";
    var imgSrc = consultant.image || DEFAULT_AVATAR;

    return (
      '<div class="consultly-consultant-card__item">' +
      '<div class="consultly-consultant" data-consultant-id="' +
      escapeHtml(consultant.id) +
      '" role="button" tabindex="0">' +
      '<div class="consultly-consultant__body">' +
      '<div class="consultly-consultant__header">' +
      '<div class="consultly-consultant__avatar-wrap">' +
      '<img class="consultly-consultant__avatar" src="' +
      escapeHtml(imgSrc) +
      '" alt="' +
      escapeHtml(consultant.name) +
      '" loading="lazy" />' +
      statusDot +
      "</div>" +
      '<div class="consultly-consultant__info">' +
      '<h3 class="consultly-consultant__name">' +
      escapeHtml(consultant.name) +
      "</h3>" +
      '<p class="consultly-consultant__profession">' +
      escapeHtml(consultant.profession) +
      "</p>" +
      '<div class="consultly-consultant__meta">' +
      '<span class="consultly-consultant-card__badge">' +
      ICONS.experience +
      consultant.experience +
      "+ Yrs Exp</span>" +
      busyBadge +
      "</div>" +
      "</div>" +
      "</div>" +
      '<hr class="consultly-consultant__divider" />' +
      '<p class="consultly-consultant__languages"><strong>Speaks:</strong> ' +
      languagesText +
      "</p>" +
      '<span class="consultly-consultant__actions-title">Consultation Options</span>' +
      '<div class="consultly-consultant__actions">' +
      actionButtonMarkup("chat", ICONS.chat, consultant.chatPrice, currencySymbol, communicationDisabled) +
      actionButtonMarkup("voice", ICONS.voice, consultant.audioPrice, currencySymbol, communicationDisabled) +
      actionButtonMarkup("video", ICONS.video, consultant.videoPrice, currencySymbol, communicationDisabled) +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderEmpty(root) {
    root.innerHTML =
      '<div class="consultly-consultant-card__empty">' +
      '<p class="consultly-consultant-card__empty-title">No consultants available yet</p>' +
      '<p class="consultly-consultant-card__empty-text">Our experts will appear here as soon as they are available. Please check back soon.</p>' +
      "</div>";
  }

  function renderError(root) {
    root.innerHTML =
      '<div class="consultly-consultant-card__error">' +
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
  var chatOverlayIframe = null;
  var chatOverlayCloseListenerBound = false;

  function closeChatOverlay() {
    if (chatOverlayIframe && chatOverlayIframe.parentNode) {
      chatOverlayIframe.parentNode.removeChild(chatOverlayIframe);
    }
    chatOverlayIframe = null;
  }

  function ensureChatOverlayCloseListener() {
    if (chatOverlayCloseListenerBound) return;
    chatOverlayCloseListenerBound = true;
    window.addEventListener("message", function (event) {
      if (!event.data || event.data.type !== "CONSULTLY_CHAT_CLOSE") return;
      console.log("[THEME CHAT TEST] CONSULTLY_CHAT_CLOSE received — closing overlay");
      closeChatOverlay();
    });
  }

  function openChatOverlay(consultantId, shop) {
    if (!shop) {
      console.error("[THEME CHAT TEST] shop missing — cannot open chat overlay");
      return;
    }
    ensureChatOverlayCloseListener();
    closeChatOverlay();

    // App-Proxy-relative — see buildChatOverlayUrl. The backend resolves the
    // Shopify customer -> DB user itself (resolveStorefrontCustomer) and
    // 302s into the React app with that identity already attached; this
    // bundle never needs to know or pass the DB user id itself.
    var src = buildChatOverlayUrl(shop, consultantId);

    console.log("[THEME CHAT TEST] opening chat overlay iframe:", src);

    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.setAttribute(
      "style",
      "position:fixed;top:0;left:0;width:100vw;height:100vh;" +
        "border:0;z-index:2147483000;background:#fff;",
    );
    iframe.setAttribute("allow", "microphone; camera");
    document.body.appendChild(iframe);
    chatOverlayIframe = iframe;
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

    var html = '<div class="consultly-consultant-card__grid">';
    for (var i = 0; i < consultants.length; i++) {
      html += cardMarkup(consultants[i], currencySymbol, ctx.communicationDisabled);
    }
    html += "</div>";
    root.innerHTML = html;

    root.querySelectorAll(".consultly-consultant__avatar").forEach(function (img) {
      img.addEventListener(
        "error",
        function () {
          img.src = DEFAULT_AVATAR;
        },
        { once: true },
      );
    });

    root.querySelectorAll(".consultly-consultant").forEach(function (cardEl) {
      var consultantId = cardEl.getAttribute("data-consultant-id");

      cardEl.addEventListener("click", function () {
        var profileUrl = buildProfileUrl(consultantId);
        console.log("[CONSULTANT CARD] Card clicked");
        console.log("[CONSULTANT CARD] Consultant ID:", consultantId);
        console.log("[CONSULTANT CARD] Profile URL:", profileUrl);
        console.log("[CONSULTANT CARD] Navigating to:", profileUrl);
        window.location.href = profileUrl;
      });

      cardEl.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function (evt) {
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

          // Voice/video: unchanged — actually starting the call still
          // happens on the profile page (it holds the same temporary
          // auth-bridge — see that block's consultant-profile.js comments).
          window.location.href = buildProfileUrl(consultantId);
        });
      });
    });
  }

  function initConsultantCard(container) {
    if (container.getAttribute("data-consultly-initialized") === "1") return;
    container.setAttribute("data-consultly-initialized", "1");

    var root = container.querySelector(".consultly-consultant-card__root");
    if (!root) return;

    var apiUrl = container.getAttribute("data-api-url");
    var shop = container.getAttribute("data-shop");
    var limit = parseInt(container.getAttribute("data-limit"), 10) || 0;

    if (!apiUrl) {
      renderError(root);
      return;
    }

    fetch(apiUrl, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed with status " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.success !== true) throw new Error("Unexpected response shape");

        var mapped = (Array.isArray(data.findConsultant) ? data.findConsultant : [])
          .map(mapConsultant)
          .filter(function (c) {
            return c.consultantStatus;
          });

        var limited = limit > 0 ? mapped.slice(0, limit) : mapped;

        renderConsultants(container, root, limited, {
          shop: shop,
          shopId: data.shopId,
          authenticated: Boolean(data.authenticated),
          communicationDisabled: Boolean(data.communicationDisabled),
          shopCurrency: data.shopCurrency,
          // TEMP (Theme Extension identity-sync test) — the app DB user id
          // for this shopper, already resolved server-side (see
          // proxyConsultantsJson / resolveStorefrontCustomer). Not used to
          // build any URL here — the chat overlay's own App Proxy request
          // resolves identity itself — this is only for the debug logs
          // below and any future Theme JS that needs it directly.
          customerId: data.customerId || null,
        });

        // TEMPORARY debug — Theme Extension identity-sync test.
        console.log("[THEME AUTH TEST] authenticated =", Boolean(data.authenticated));
        console.log("[THEME AUTH TEST] Shopify customer detected =", Boolean(data.authenticated));
        console.log("[THEME AUTH TEST] app userId =", data.customerId || null);
        console.log("[THEME AUTH TEST] DB user synced =", Boolean(data.customerId));
      })
      .catch(function (err) {
        console.error("[consultly] failed to load consultants:", err);
        renderError(root);
      });
  }

  function initAll() {
    document.querySelectorAll(".consultly-consultant-card").forEach(initConsultantCard);
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
