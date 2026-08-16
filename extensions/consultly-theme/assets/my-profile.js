/**
 * Consultly — My Profile (Customer Profile) storefront bundle.
 *
 * Vanilla JS, no build step, no framework — same constraints as
 * consultant-profile.js. Small formatting helpers are intentionally
 * duplicated rather than shared — there's nothing to import from.
 *
 * Data source: the App Proxy JSON endpoint (/apps/consultly/customer/me).
 * Unlike consultant-profile.js, there is no id read from this page's URL —
 * customer identity comes entirely from Shopify's App Proxy signal
 * (logged_in_customer_id), resolved server-side. This file never reads a
 * customer id from the URL, query string, or localStorage, and never sends
 * one to the backend — the fetch below carries no identifying parameter at
 * all beyond what Shopify's proxy already signs.
 */
(function () {
  "use strict";

  var DEBUG = true;
  function log() {
    if (!DEBUG) return;
    console.log.apply(console, ["[MyProfile]"].concat([].slice.call(arguments)));
  }
  function logErr() {
    console.error.apply(console, ["[MyProfile ERROR]"].concat([].slice.call(arguments)));
  }
  log("block loaded");

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

  var DEFAULT_AVATAR_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="32" fill="#f3f4f6"/>' +
    '<circle cx="32" cy="24" r="12" fill="#c7cbd1"/>' +
    '<path d="M10 56c2-14 12-20 22-20s20 6 22 20" fill="#c7cbd1"/>' +
    "</svg>";
  var DEFAULT_AVATAR =
    "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(DEFAULT_AVATAR_SVG);

  function escapeHtml(str) {
    return String(str === null || str === undefined ? "" : str).replace(
      /[&<>"']/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      },
    );
  }

  // Kept in sync by hand with consultly_Frontend/src/components/Helper/Helper.js
  // formatAmountHelper — see consultant-profile.js for the same note.
  function formatAmount(num) {
    if (num === null || num === undefined) return "0";
    var value = Number(num);
    if (isNaN(value)) return "0";
    if (value < 1000) return value % 1 === 0 ? String(value) : value.toFixed(2);
    if (value >= 1e9) return (value / 1e9).toFixed(1) + "B";
    if (value >= 1e6) return (value / 1e6).toFixed(1) + "M";
    return (value / 1e3).toFixed(1) + "K";
  }

  function formatDuration(seconds) {
    var s = Number(seconds) || 0;
    var mins = Math.floor(s / 60);
    var secs = s % 60;
    if (mins <= 0) return secs + "s";
    return mins + "m " + secs + "s";
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // Returns the shopper to THIS exact page after signing in — unlike
  // consultant-profile.js's buildLoginUrl (which returns to a generic
  // landing), My Profile's required UX is: not logged in -> Shopify login ->
  // back to /pages/my-profile.
  function buildLoginUrl(shop) {
    var returnTo = window.location.pathname + window.location.search;
    return "https://" + shop + "/account/login?return_to=" + encodeURIComponent(returnTo);
  }

  function renderLoginRequired(root, shop) {
    root.innerHTML =
      '<div class="consultly-my-profile__state">' +
      "<p>Sign in to view your profile, balance, and consultation history.</p>" +
      '<a class="consultly-my-profile__login-button" href="' +
      escapeHtml(buildLoginUrl(shop)) +
      '">Sign in</a>' +
      "</div>";
  }

  function renderError(root, onRetry) {
    root.innerHTML =
      '<div class="consultly-my-profile__state">' +
      "<p>We couldn’t load your profile. Please try again shortly.</p>" +
      '<button type="button" class="consultly-my-profile__retry">Try again</button>' +
      "</div>";
    var btn = root.querySelector(".consultly-my-profile__retry");
    if (btn) btn.addEventListener("click", onRetry);
  }

  function walletHistoryRowMarkup(entry) {
    var isCredit = entry.direction === "credit";
    var sign = isCredit ? "+" : "−";
    var amountClass = isCredit
      ? "consultly-my-profile__amount--credit"
      : "consultly-my-profile__amount--debit";
    return (
      '<li class="consultly-my-profile__history-row">' +
      '<div class="consultly-my-profile__history-main">' +
      '<span class="consultly-my-profile__history-title">' +
      escapeHtml(entry.description || entry.transactionType || "Transaction") +
      "</span>" +
      '<span class="consultly-my-profile__history-date">' +
      escapeHtml(formatDate(entry.createdAt)) +
      "</span>" +
      "</div>" +
      '<span class="consultly-my-profile__amount ' +
      amountClass +
      '">' +
      sign +
      escapeHtml(entry.currency || "") +
      escapeHtml(formatAmount(entry.amount)) +
      "</span>" +
      "</li>"
    );
  }

  function consultationHistoryRowMarkup(entry) {
    var icon = ICONS[entry.type] || ICONS.chat;
    var statusLabel = entry.status === "completed" || entry.status === "ended" ? "Completed" : entry.status;
    return (
      '<li class="consultly-my-profile__history-row">' +
      '<span class="consultly-my-profile__history-icon">' +
      icon +
      "</span>" +
      '<div class="consultly-my-profile__history-main">' +
      '<span class="consultly-my-profile__history-title">' +
      escapeHtml(entry.consultantName) +
      " · " +
      escapeHtml(entry.type) +
      "</span>" +
      '<span class="consultly-my-profile__history-date">' +
      escapeHtml(formatDate(entry.createdAt)) +
      " · " +
      escapeHtml(formatDuration(entry.duration)) +
      " · " +
      escapeHtml(statusLabel) +
      "</span>" +
      "</div>" +
      '<span class="consultly-my-profile__amount consultly-my-profile__amount--debit">' +
      "−" +
      escapeHtml(formatAmount(entry.amount)) +
      "</span>" +
      "</li>"
    );
  }

  function renderProfile(root, data, options) {
    var customer = data.customer || {};
    var name = customer.fullname || "My Profile";
    var email = customer.email || "";
    var imgSrc = customer.profileImage || DEFAULT_AVATAR;
    var balance = customer.walletBalance != null ? customer.walletBalance : 0;

    var walletHistoryHtml = "";
    if (options.showWalletHistory) {
      var walletRows = (data.walletHistory || []).map(walletHistoryRowMarkup).join("");
      walletHistoryHtml =
        '<section class="consultly-my-profile__section">' +
        '<h2 class="consultly-my-profile__section-title">Wallet History</h2>' +
        (walletRows
          ? '<ul class="consultly-my-profile__history-list">' + walletRows + "</ul>"
          : '<p class="consultly-my-profile__empty">No transactions yet.</p>') +
        "</section>";
    }

    var consultationHistoryHtml = "";
    if (options.showConsultationHistory) {
      var consultationRows = (data.consultationHistory || [])
        .map(consultationHistoryRowMarkup)
        .join("");
      consultationHistoryHtml =
        '<section class="consultly-my-profile__section">' +
        '<h2 class="consultly-my-profile__section-title">Consultation History</h2>' +
        (consultationRows
          ? '<ul class="consultly-my-profile__history-list">' + consultationRows + "</ul>"
          : '<p class="consultly-my-profile__empty">No consultations yet.</p>') +
        "</section>";
    }

    root.innerHTML =
      '<div class="consultly-my-profile__header">' +
      '<img class="consultly-my-profile__avatar" src="' +
      escapeHtml(imgSrc) +
      '" alt="' +
      escapeHtml(name) +
      '" />' +
      '<div class="consultly-my-profile__header-info">' +
      '<h1 class="consultly-my-profile__name">' +
      escapeHtml(name) +
      "</h1>" +
      (email
        ? '<p class="consultly-my-profile__email">' + escapeHtml(email) + "</p>"
        : "") +
      "</div>" +
      '<div class="consultly-my-profile__balance-card">' +
      '<span class="consultly-my-profile__balance-label">Balance</span>' +
      '<span class="consultly-my-profile__balance-amount">$' +
      escapeHtml(formatAmount(balance)) +
      "</span>" +
      "</div>" +
      "</div>" +
      walletHistoryHtml +
      consultationHistoryHtml;

    var avatarEl = root.querySelector(".consultly-my-profile__avatar");
    if (avatarEl) {
      avatarEl.addEventListener(
        "error",
        function () {
          avatarEl.src = DEFAULT_AVATAR;
        },
        { once: true },
      );
    }
  }

  function initMyProfile(container) {
    log("current page detected:", window.location.pathname);
    if (container.getAttribute("data-consultly-initialized") === "1") {
      log("skip: this block was already initialized");
      return;
    }
    container.setAttribute("data-consultly-initialized", "1");

    var root = container.querySelector(".consultly-my-profile__root");
    if (!root) {
      logErr("Block root (.consultly-my-profile__root) not found — cannot render");
      return;
    }

    var apiBase = container.getAttribute("data-api-base");
    var shop = container.getAttribute("data-shop");
    var showWalletHistory = container.getAttribute("data-show-wallet-history") === "true";
    var showConsultationHistory =
      container.getAttribute("data-show-consultation-history") === "true";

    if (!apiBase || !shop) {
      logErr("API URL/shop could not be constructed — data-api-base or data-shop attribute missing");
      renderError(root, function () {
        initMyProfileLoad();
      });
      return;
    }

    function initMyProfileLoad() {
      root.innerHTML =
        '<p class="consultly-my-profile__placeholder">Loading your profile…</p>';

      log("API request starting:", apiBase);

      fetch(apiBase, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          log("API response status:", res.status);
          if (res.status === 401 || res.status === 403) {
            logErr("Backend returned", res.status, "— treating as not authenticated");
            var authErr = new Error("not_authenticated");
            authErr.notAuthenticated = true;
            throw authErr;
          }
          if (!res.ok) throw new Error("Request failed with status " + res.status);
          return res.json();
        })
        .then(function (data) {
          log("profile data received:", data);
          if (!data || data.success !== true) {
            throw new Error("Unexpected response shape");
          }

          log("customer authentication state:", data.authenticated === true);
          if (!data.authenticated) {
            log("customer is not logged in — rendering sign-in prompt");
            renderLoginRequired(root, shop);
            return;
          }
          if (!data.customer) {
            logErr("authenticated=true but customer identity missing from response");
            renderError(root, initMyProfileLoad);
            return;
          }
          log("customer identity available:", data.customer.id);

          if (
            !(data.walletHistory && data.walletHistory.length) &&
            !(data.consultationHistory && data.consultationHistory.length)
          ) {
            log("profile data received but history is empty — rendering with empty states");
          }

          try {
            renderProfile(root, data, {
              showWalletHistory: showWalletHistory,
              showConsultationHistory: showConsultationHistory,
            });
            log("render complete");
          } catch (renderErr) {
            logErr("Rendering failed:", renderErr);
            renderError(root, initMyProfileLoad);
          }
        })
        .catch(function (err) {
          if (err && err.notAuthenticated) {
            renderLoginRequired(root, shop);
            return;
          }
          logErr("API request failed:", err);
          renderError(root, initMyProfileLoad);
        });
    }

    initMyProfileLoad();
  }

  function initAll() {
    var blocks = document.querySelectorAll(".consultly-my-profile");
    log("initAll fired — found", blocks.length, "My Profile block(s) on page");
    if (!blocks.length) {
      logErr("No .consultly-my-profile block found in the DOM on this page load");
    }
    blocks.forEach(initMyProfile);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  document.addEventListener("shopify:section:load", initAll);
})();
