/**
 * advizo — My Profile (Customer Profile) storefront bundle.
 *
 * Vanilla JS, no build step, no framework — same constraints as
 * consultant-profile.js. Small formatting helpers are intentionally
 * duplicated rather than shared — there's nothing to import from.
 *
 * Data sources, all App Proxy JSON endpoints resolved server-side from
 * Shopify's own signed customer identity (never a client-supplied id):
 *   GET  /apps/advizo/customer/me            — identity, balance,
 *                                                  wallet + consultation Activity-history
 *   GET  /apps/advizo/wallet/topup            — recharge catalog (lazy)
 *   POST /apps/advizo/wallet/recharge         — start a recharge
 *   GET  /apps/advizo/support/requests        — support requests (lazy)
 *   POST /apps/advizo/support/requests        — submit a new request
 *   PUT  /apps/advizo/support/requests/:id/read
 *
 * This file never reads a customer id from the URL, query string, or
 * localStorage, and never sends one to the backend.
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
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    voice:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>',
    video:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M23 7L16 12L23 17V7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M14 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H14C15.1 19 16 18.1 16 17V7C16 5.9 15.1 5.1 14 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  var CREDIT_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  var DEBIT_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

  // Communication has no filter UI — calls, video calls and chats always
  // render together as one chronological Activity-history (see renderCommTab).
  var COMM_TYPE_LABELS = { voice: "Voice call", video: "Video call", chat: "Chat" };

  // Both Activity-history lists (Wallet Activity, Communications) page in batches of
  // this size via infinite scroll — see loadMorePage/PAGE_SIZE below and the
  // matching PAGE_SIZE_DEFAULT in shopifyController.js.
  var PAGE_SIZE = 10;

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

  // Kept in sync by hand with advizo_Frontend/src/components/Helper/Helper.js
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

  function isSameCalendarDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatDayLabel(date) {
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (isSameCalendarDay(date, today)) return "Today";
    if (isSameCalendarDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  }

  function formatClockTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function formatFullDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function memberSinceYear(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.getFullYear();
  }

  // Buckets an already-sorted (newest first) list into { date, items[] }
  // groups by calendar day, so a "Today"/"Yesterday"/date heading only
  // appears where the data actually changes day.
  function groupByDay(list) {
    var groups = [];
    (list || []).forEach(function (item) {
      var d = item.createdAt ? new Date(item.createdAt) : null;
      var last = groups[groups.length - 1];
      if (d && last && isSameCalendarDay(last.date, d)) {
        last.items.push(item);
      } else {
        groups.push({ date: d || new Date(0), items: [item] });
      }
    });
    return groups;
  }

  function dayGroupedListMarkup(list, rowFn) {
    var groups = groupByDay(list);
    return groups
      .map(function (group) {
        var rows = group.items.map(rowFn).join("");
        return (
          (groups.length > 1
            ? '<p class="advizo-my-profile__day-label">' + escapeHtml(formatDayLabel(group.date)) + "</p>"
            : "") +
          '<ul class="advizo-my-profile__row-list">' + rows + "</ul>"
        );
      })
      .join("");
  }

  function emptyStateMarkup(title, text) {
    return (
      '<div class="advizo-my-profile__empty-block">' +
      '<p class="advizo-my-profile__empty-title">' + escapeHtml(title) + "</p>" +
      '<p class="advizo-my-profile__empty-text">' + escapeHtml(text) + "</p>" +
      "</div>"
    );
  }

  function errorStateMarkup(text, retryAction) {
    return (
      '<div class="advizo-my-profile__empty-block">' +
      '<p class="advizo-my-profile__empty-title">Something went wrong</p>' +
      '<p class="advizo-my-profile__empty-text">' + escapeHtml(text) + "</p>" +
      '<button type="button" class="advizo-my-profile__retry" data-action="' + retryAction + '">Try again</button>' +
      "</div>"
    );
  }

  function skeletonRowsMarkup(count) {
    var row =
      '<div class="advizo-my-profile__skeleton-row">' +
      '<span class="advizo-my-profile__skeleton-circle"></span>' +
      '<span class="advizo-my-profile__skeleton-line"></span>' +
      "</div>";
    return new Array(count || 3).fill(row).join("");
  }

  // ------------------------------------------------- infinite-scroll lists
  //
  // Shared by Wallet Activity and Communications: renders the accumulated
  // day-grouped rows plus, while more can still load, exactly one tail
  // element (inline loader / inline retry / nothing). Triggering the next
  // page is the scroll container's own "scroll" listener (see
  // attachScrollListener/handleSectionScroll in createController) checking
  // scrollHeight/scrollTop/clientHeight directly — no sentinel element is
  // needed for that. scrollListInnerMarkup is also used on its own to
  // update JUST the scroll container's content in place (loadMorePage/
  // renderScrollContainer below) without touching the rest of the page, so
  // the container's own scroll position survives a "load more".

  function scrollListInnerMarkup(sectionState, rowFn, sectionKey) {
    var tail;
    if (sectionState.loading) {
      tail =
        '<div class="advizo-my-profile__inline-loader" role="status" aria-live="polite">' +
        '<span class="advizo-my-profile__inline-loader-dot" aria-hidden="true"></span>Loading…' +
        "</div>";
    } else if (sectionState.error) {
      tail =
        '<div class="advizo-my-profile__inline-error-row">' +
        "<span>" + escapeHtml(sectionState.error) + "</span>" +
        '<button type="button" class="advizo-my-profile__retry" data-action="retry-' +
        sectionKey + '-page">Try again</button>' +
        "</div>";
    } else {
      tail = "";
    }
    return dayGroupedListMarkup(sectionState.items, rowFn) + tail;
  }

  function scrollListMarkup(sectionState, rowFn, emptyTitle, emptyText, sectionKey) {
    if (sectionState.items.length === 0) {
      // Zero records: no scroll container at all, so there is nothing to
      // scroll and no chance of a stray scrollbar — just the approved empty
      // state (sectionState.error can only be non-null here on a genuinely
      // failed FIRST load, since page-1 always comes from the already-
      // guarded customer/me response).
      return sectionState.error
        ? errorStateMarkup(sectionState.error, "retry-" + sectionKey + "-page")
        : emptyStateMarkup(emptyTitle, emptyText);
    }
    return (
      '<div class="advizo-my-profile__scroll-list" data-scroll="' + sectionKey + '" tabindex="0">' +
      scrollListInnerMarkup(sectionState, rowFn, sectionKey) +
      "</div>"
    );
  }

  // ---------------------------------------------------------------- header

  function renderHeader(customer) {
    var name = customer.fullname || "My Profile";
    var email = customer.email || "";
    var imgSrc = customer.profileImage || DEFAULT_AVATAR;
    var balance = customer.walletBalance != null ? customer.walletBalance : 0;
    var memberYear = memberSinceYear(customer.memberSince);

    return (
      '<div class="advizo-my-profile__header">' +
      '<div class="advizo-my-profile__identity">' +
      '<img class="advizo-my-profile__avatar" src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(name) + '" />' +
      '<div class="advizo-my-profile__identity-text">' +
      '<h1 class="advizo-my-profile__name">' + escapeHtml(name) + "</h1>" +
      (email ? '<p class="advizo-my-profile__email">' + escapeHtml(email) + "</p>" : "") +
      (memberYear
        ? '<p class="advizo-my-profile__member-since">Member since ' + memberYear + "</p>"
        : "") +
      "</div>" +
      "</div>" +
      '<div class="advizo-my-profile__header-divider" aria-hidden="true"></div>' +
      '<div class="advizo-my-profile__balance">' +
      '<span class="advizo-my-profile__balance-label">Available balance</span>' +
      '<span class="advizo-my-profile__balance-amount">' +
      escapeHtml(customer.walletCurrency || "") + escapeHtml(formatAmount(balance)) + "</span>" +
      '<button type="button" class="advizo-my-profile__add-money-link" data-action="goto-tab" data-tab="wallet" data-wallet-view="topup">Add money</button>' +
      "</div>" +
      "</div>"
    );
  }

  // ----------------------------------------------------------------- tabs

  function visibleTabs(options) {
    return [
      { key: "wallet", label: "Wallet" },
      { key: "comm", label: "Communications", hidden: !options.showConsultationHistory },
      { key: "support", label: "Support" },
    ].filter(function (t) { return !t.hidden; });
  }

  function renderTabs(activeTab, options) {
    return (
      '<nav class="advizo-my-profile__tabs" aria-label="Account sections">' +
      visibleTabs(options).map(function (t) {
        return (
          '<button type="button" class="advizo-my-profile__tab' +
          (t.key === activeTab ? " advizo-my-profile__tab--active" : "") +
          '" data-action="goto-tab" data-tab="' + t.key + '">' +
          escapeHtml(t.label) +
          "</button>"
        );
      }).join("") +
      "</nav>"
    );
  }

  // --------------------------------------------------------------- wallet

  function walletRowMarkup(entry) {
    var isCredit = entry.direction === "credit";
    var tone = isCredit ? "credit" : "debit";
    var title = (entry.description && entry.description.trim()) ||
      (entry.transactionType
        ? entry.transactionType.replace(/_/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); })
        : "Transaction");
    var tags = "";
    if (entry.referenceType) {
      tags += '<span class="advizo-my-profile__tag">' + escapeHtml(entry.referenceType) + "</span>";
    }
    if (entry.status && entry.status !== "success") {
      tags += '<span class="advizo-my-profile__tag">' + escapeHtml(entry.status) + "</span>";
    }
    return (
      '<li class="advizo-my-profile__row">' +
      '<span class="advizo-my-profile__row-icon" data-tone="' + tone + '">' +
      (isCredit ? CREDIT_ICON : DEBIT_ICON) +
      "</span>" +
      '<div class="advizo-my-profile__row-main">' +
      '<span class="advizo-my-profile__row-title">' + escapeHtml(title) + "</span>" +
      (tags ? '<span class="advizo-my-profile__row-meta">' + tags + "</span>" : "") +
      "</div>" +
      '<div class="advizo-my-profile__row-side">' +
      '<span class="advizo-my-profile__row-amount" data-tone="' + tone + '">' +
      (isCredit ? "+" : "−") +
      escapeHtml(entry.currency || "") +
      escapeHtml(formatAmount(entry.amount)) +
      "</span>" +
      '<span class="advizo-my-profile__row-time">' + escapeHtml(formatClockTime(entry.createdAt)) + "</span>" +
      "</div>" +
      "</li>"
    );
  }

  function renderWalletActivity(state) {
    return scrollListMarkup(
      state.wallet,
      walletRowMarkup,
      "No wallet activity yet",
      "Money you add, and amounts spent on calls or chats, will show up here.",
      "wallet",
    );
  }

  function renderTopupOption(option, currency) {
    var total = Number(option.totalCoin || 0) + Number(option.extraCoin || 0);
    var hasBonus = Number(option.extraCoin) > 0;
    return (
      '<button type="button" class="advizo-my-profile__topup-card" data-action="recharge" data-amount="' +
      escapeHtml(option.totalCoin) + '">' +
      '<span class="advizo-my-profile__topup-amount">' + escapeHtml(currency || "") + escapeHtml(formatAmount(option.totalCoin)) + "</span>" +
      (hasBonus
        ? '<span class="advizo-my-profile__topup-bonus">+' + escapeHtml(currency || "") + escapeHtml(formatAmount(option.extraCoin)) + " bonus</span>"
        : "") +
      '<span class="advizo-my-profile__topup-total">Get ' + escapeHtml(currency || "") + escapeHtml(formatAmount(total)) + " total</span>" +
      "</button>"
    );
  }

  function renderWalletTopup(state) {
    if (state.topupError) {
      return errorStateMarkup(state.topupError, "retry-topup");
    }
    if (state.topupLoading || !state.topupCatalog) {
      return '<div class="advizo-my-profile__topup-grid">' +
        '<span class="advizo-my-profile__topup-skeleton"></span>' +
        '<span class="advizo-my-profile__topup-skeleton"></span>' +
        '<span class="advizo-my-profile__topup-skeleton"></span>' +
        "</div>";
    }
    var options = state.topupCatalog.voucherCode || [];
    if (!options.length) {
      return emptyStateMarkup(
        "No top-up options available",
        "The store hasn't set up any recharge options yet. Check back later.",
      );
    }
    var currency = state.topupCatalog.shopCurrency;
    return (
      (state.rechargeError
        ? '<p class="advizo-my-profile__inline-error">' + escapeHtml(state.rechargeError) + "</p>"
        : "") +
      (state.recharging
        ? '<p class="advizo-my-profile__inline-status">Opening checkout…</p>'
        : "") +
      '<div class="advizo-my-profile__topup-grid">' +
      options.map(function (o) { return renderTopupOption(o, currency); }).join("") +
      "</div>"
    );
  }

  function renderWalletTab(state) {
    var showActivity = state.options.showWalletHistory;
    var subNav = showActivity
      ? '<div class="advizo-my-profile__sub-nav">' +
        '<button type="button" class="advizo-my-profile__sub-tab' +
        (state.walletView === "topup" ? " advizo-my-profile__sub-tab--active" : "") +
        '" data-action="wallet-view" data-wallet-view="topup">Add money</button>' +
        '<button type="button" class="advizo-my-profile__sub-tab' +
        (state.walletView === "activity" ? " advizo-my-profile__sub-tab--active" : "") +
        '" data-action="wallet-view" data-wallet-view="activity">Wallet activity</button>' +
        "</div>"
      : "";
    var effectiveView = showActivity ? state.walletView : "topup";
    return (
      '<section class="advizo-my-profile__section">' +
      subNav +
      (effectiveView === "topup"
        ? renderWalletTopup(state)
        : renderWalletActivity(state)) +
      "</section>"
    );
  }

  // ------------------------------------------------------------- comms

  function consultationRowMarkup(entry) {
    var icon = ICONS[entry.type] || ICONS.chat;
    var typeLabel = COMM_TYPE_LABELS[entry.type] || entry.type || "Consultation";
    var duration = formatDuration(entry.duration);
    return (
      '<li class="advizo-my-profile__row">' +
      '<span class="advizo-my-profile__row-icon">' + icon + "</span>" +
      '<div class="advizo-my-profile__row-main">' +
      '<span class="advizo-my-profile__row-title">' + escapeHtml(entry.consultantName) + "</span>" +
      '<span class="advizo-my-profile__row-meta">' + escapeHtml(typeLabel) + " · " + escapeHtml(duration) + "</span>" +
      "</div>" +
      '<div class="advizo-my-profile__row-side">' +
      '<span class="advizo-my-profile__row-amount" data-tone="debit">' +
      "−" + escapeHtml(formatAmount(entry.amount)) +
      "</span>" +
      '<span class="advizo-my-profile__row-time">' + escapeHtml(formatClockTime(entry.createdAt)) + "</span>" +
      "</div>" +
      "</li>"
    );
  }

  // No filter UI — Communication is always the unified chronological Activity-history
  // of every voice call, video call, and chat together (see PRIMARY
  // REQUIREMENT: filters removed).
  function renderCommTab(state) {
    return (
      '<section class="advizo-my-profile__section">' +
      '<div class="advizo-my-profile__section-head">' +
      '<h2 class="advizo-my-profile__section-title">Communications</h2>' +
      "</div>" +
      scrollListMarkup(
        state.comm,
        consultationRowMarkup,
        "No consultations yet",
        "Your calls and chats with consultants will show up here.",
        "comm",
      ) +
      "</section>"
    );
  }

  // ----------------------------------------------------------------- support

  function statusBadgeMarkup(status) {
    var cls = "advizo-my-profile__badge--attention";
    if (status === "replied") cls = "advizo-my-profile__badge--success";
    if (status === "closed") cls = "advizo-my-profile__badge--muted";
    return '<span class="advizo-my-profile__badge ' + cls + '">' + escapeHtml(status) + "</span>";
  }

  function supportRequestMarkup(request, isOpen) {
    var replies = request.replies || [];
    return (
      '<div class="advizo-my-profile__support-item">' +
      '<button type="button" class="advizo-my-profile__support-summary" data-action="toggle-request" data-request-id="' +
      escapeHtml(request._id) + '">' +
      '<span class="advizo-my-profile__support-subject">' + escapeHtml(request.subject) + "</span>" +
      '<span class="advizo-my-profile__support-badges">' +
      (request.consultantHasUnreadReply
        ? '<span class="advizo-my-profile__badge advizo-my-profile__badge--attention">New reply</span>'
        : "") +
      statusBadgeMarkup(request.status) +
      "</span>" +
      "</button>" +
      '<p class="advizo-my-profile__support-date">' + escapeHtml(formatFullDate(request.createdAt)) + "</p>" +
      (isOpen
        ? '<div class="advizo-my-profile__support-detail">' +
          '<p class="advizo-my-profile__support-detail-label">Your message</p>' +
          '<div class="advizo-my-profile__message-bubble">' + escapeHtml(request.message) + "</div>" +
          (replies.length
            ? '<p class="advizo-my-profile__support-detail-label">Store replies</p>' +
              replies.map(function (r) {
                return (
                  '<div class="advizo-my-profile__reply-bubble">' +
                  '<span class="advizo-my-profile__reply-meta">Store · ' + escapeHtml(formatFullDate(r.repliedAt)) + "</span>" +
                  '<p class="advizo-my-profile__reply-text">' + escapeHtml(r.message) + "</p>" +
                  "</div>"
                );
              }).join("")
            : '<p class="advizo-my-profile__empty-text">Waiting for the store to reply.</p>') +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function renderSupportForm(state) {
    if (!state.showSupportForm) return "";
    return (
      '<form class="advizo-my-profile__support-form" data-action="submit-support">' +
      (state.supportFormError
        ? '<div class="advizo-my-profile__alert-error">' + escapeHtml(state.supportFormError) + "</div>"
        : "") +
      (state.supportFormSuccess
        ? '<div class="advizo-my-profile__alert-success">' + escapeHtml(state.supportFormSuccess) + "</div>"
        : "") +
      '<label class="advizo-my-profile__field-label" for="advizo-my-profile-subject">Subject</label>' +
      '<input id="advizo-my-profile-subject" class="advizo-my-profile__field-input" type="text" name="subject" maxlength="200" placeholder="What is your query about?" />' +
      '<label class="advizo-my-profile__field-label" for="advizo-my-profile-message">Message</label>' +
      '<textarea id="advizo-my-profile-message" class="advizo-my-profile__field-input" name="message" rows="4" maxlength="5000" placeholder="Describe what you need help with..."></textarea>' +
      '<button type="submit" class="advizo-my-profile__login-button" ' +
      (state.supportSubmitting ? "disabled" : "") + ">" +
      (state.supportSubmitting ? "Sending…" : "Send to store") +
      "</button>" +
      "</form>"
    );
  }

  function renderSupportTab(state) {
    var body;
    if (state.supportError) {
      body = errorStateMarkup(state.supportError, "retry-support");
    } else if (state.supportLoading || state.supportRequests === null) {
      body = skeletonRowsMarkup(2);
    } else if (state.supportRequests.length === 0) {
      body = emptyStateMarkup("No support requests yet", 'Use "New request" to contact the store.');
    } else {
      body =
        '<div class="advizo-my-profile__support-list">' +
        state.supportRequests
          .map(function (r) { return supportRequestMarkup(r, state.openRequestId === r._id); })
          .join("") +
        "</div>";
    }

    return (
      '<section class="advizo-my-profile__section">' +
      '<div class="advizo-my-profile__section-head">' +
      '<h2 class="advizo-my-profile__section-title">Support</h2>' +
      '<button type="button" class="advizo-my-profile__filter-pill" data-action="toggle-support-form">' +
      (state.showSupportForm ? "Close" : "New request") +
      "</button>" +
      "</div>" +
      renderSupportForm(state) +
      body +
      "</section>"
    );
  }

  // --------------------------------------------------------------- root render

  function render(root, state) {
    var customer = state.data.customer || {};
    // A merchant may turn Communications off after it was already the
    // active tab in this session (or it's the first render) — fall back to
    // Wallet rather than rendering a tab that isn't in the nav at all.
    if (state.activeTab === "comm" && !state.options.showConsultationHistory) {
      state.activeTab = "wallet";
    }
    var body;
    if (state.activeTab === "wallet") body = renderWalletTab(state);
    else if (state.activeTab === "comm") body = renderCommTab(state);
    else body = renderSupportTab(state);

    root.innerHTML = renderHeader(customer) + renderTabs(state.activeTab, state.options) + body;

    var avatarEl = root.querySelector(".advizo-my-profile__avatar");
    if (avatarEl) {
      avatarEl.addEventListener(
        "error",
        function () { avatarEl.src = DEFAULT_AVATAR; },
        { once: true },
      );
    }
  }

  // ------------------------------------------------------------- controller

  function createController(root, apiBase, shop, options) {
    var state = {
      data: {},
      options: options,
      activeTab: "wallet",
      walletView: options.showWalletHistory ? "activity" : "topup",
      wallet: { items: [], hasMore: false, nextCursor: null, loading: false, error: null },
      comm: { items: [], hasMore: false, nextCursor: null, loading: false, error: null },
      topupCatalog: null,
      topupLoading: false,
      topupError: null,
      recharging: false,
      rechargeError: null,
      supportRequests: null,
      supportLoading: false,
      supportError: null,
      showSupportForm: false,
      supportSubmitting: false,
      supportFormError: null,
      supportFormSuccess: null,
      openRequestId: null,
    };

    // One scroll listener per infinite-scroll section, bound directly to
    // the container element (not a child sentinel) — a plain "scrollTop vs
    // scrollHeight" check on real scroll events, which is what section 7 of
    // this rebuild asked for after the IntersectionObserver/sentinel
    // approach proved unreliable inside a nested scroll container on some
    // browsers. The container element itself survives renderScrollContainer
    // (only its innerHTML is replaced), so the listener stays valid across
    // "load more" updates and only needs reattaching after a FULL rerender()
    // actually recreates the container node (tab switch, wallet-view switch).
    var scrollListeners = { wallet: null, comm: null };

    function rerender() {
      render(root, state);
      syncScrollListeners();
    }

    function scrollContainerEl(key) {
      return root.querySelector('.advizo-my-profile__scroll-list[data-scroll="' + key + '"]');
    }

    function detachScrollListener(key) {
      var existing = scrollListeners[key];
      if (existing) {
        existing.el.removeEventListener("scroll", existing.handler);
        scrollListeners[key] = null;
      }
    }

    function handleSectionScroll(key, containerEl) {
      var sectionState = key === "wallet" ? state.wallet : state.comm;
      if (sectionState.loading || !sectionState.hasMore) return;
      var distanceFromBottom =
        containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight;
      // Start the next fetch a little before the user hits the literal last
      // pixel, so it feels instant rather than snapping into place.
      if (distanceFromBottom < 120) {
        loadMorePage(key);
      }
    }

    function attachScrollListener(key, containerEl) {
      detachScrollListener(key);
      var ticking = false;
      var handler = function () {
        // rAF-throttled: at most one check per animation frame no matter how
        // many scroll events fire in between.
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          ticking = false;
          handleSectionScroll(key, containerEl);
        });
      };
      containerEl.addEventListener("scroll", handler, { passive: true });
      scrollListeners[key] = { el: containerEl, handler: handler };
      // A container shorter than its content but not yet scrolled (e.g. the
      // very first render, or after a page loads and still leaves room) gets
      // one immediate check so scrolling isn't required just to discover
      // more already fits on screen.
      handleSectionScroll(key, containerEl);
    }

    // Reconciles both sections' scroll listeners against whichever
    // container(s) actually exist after a FULL re-render (a tab switch may
    // have just removed one, or the active tab may not use one at all).
    function syncScrollListeners() {
      ["wallet", "comm"].forEach(function (key) {
        var containerEl = scrollContainerEl(key);
        if (containerEl) {
          attachScrollListener(key, containerEl);
        } else {
          detachScrollListener(key);
        }
      });
    }

    // Updates ONLY the given section's scroll container in place (not the
    // whole page) and restores its scrollTop afterward — a full rerender()
    // would reset that element's scroll position to 0 the instant its
    // innerHTML is replaced, which would look exactly like the just-loaded
    // records vanishing. The container node itself is untouched here, so
    // its scroll listener (attached in syncScrollListeners) is still valid
    // and does not need reattaching.
    function renderScrollContainer(key) {
      var containerEl = scrollContainerEl(key);
      if (!containerEl) return; // user navigated away from this tab/view mid-request
      var prevScrollTop = containerEl.scrollTop;
      var sectionState = key === "wallet" ? state.wallet : state.comm;
      var rowFn = key === "wallet" ? walletRowMarkup : consultationRowMarkup;
      containerEl.innerHTML = scrollListInnerMarkup(sectionState, rowFn, key);
      containerEl.scrollTop = prevScrollTop;
      // The just-appended batch may still leave the container short of a
      // full scrollbar's worth of content (e.g. short rows on a tall
      // screen) — check again immediately rather than waiting for a scroll
      // event that may never come.
      handleSectionScroll(key, containerEl);
    }

    function loadMorePage(key) {
      var sectionState = key === "wallet" ? state.wallet : state.comm;
      if (sectionState.loading || !sectionState.hasMore) return;
      sectionState.loading = true;
      sectionState.error = null;
      renderScrollContainer(key);

      var endpoint = key === "wallet" ? "/wallet/Activity-history" : "/communications/Activity-history";
      var url =
        apiBase.replace(/\/customer\/me$/, endpoint) +
        "?cursor=" + encodeURIComponent(sectionState.nextCursor) +
        "&limit=" + PAGE_SIZE;

      fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          sectionState.loading = false;
          if (!data || data.success !== true || !data.authenticated) {
            sectionState.error = "Unable to load more.";
          } else {
            // Belt-and-suspenders de-dup on top of the cursor's own
            // structural guarantee — a batch can never introduce a record
            // already present in this section.
            var seen = {};
            sectionState.items.forEach(function (item) { seen[item.id] = true; });
            var fresh = (data.data || []).filter(function (item) { return !seen[item.id]; });
            sectionState.items = sectionState.items.concat(fresh);
            sectionState.hasMore = Boolean(data.hasMore);
            sectionState.nextCursor = data.nextCursor || null;
          }
          renderScrollContainer(key);
        })
        .catch(function (err) {
          logErr(key + " page fetch failed:", err);
          sectionState.loading = false;
          sectionState.error = "Unable to load more.";
          renderScrollContainer(key);
        });
    }

    function fetchTopup(force) {
      if (state.topupLoading) return;
      if (state.topupCatalog && !force) return;
      state.topupLoading = true;
      state.topupError = null;
      rerender();
      fetch(apiBase.replace(/\/customer\/me$/, "/wallet/topup"), {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          state.topupLoading = false;
          if (!data || data.success !== true || !data.authenticated) {
            state.topupError = "Unable to load top-up options.";
          } else {
            state.topupCatalog = data;
          }
          rerender();
        })
        .catch(function (err) {
          logErr("topup fetch failed:", err);
          state.topupLoading = false;
          state.topupError = "Unable to load top-up options.";
          rerender();
        });
    }

    function recharge(amount) {
      if (state.recharging) return;
      state.recharging = true;
      state.rechargeError = null;
      rerender();
      var newWindow = window.open("", "_blank");
      fetch(apiBase.replace(/\/customer\/me$/, "/wallet/recharge"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ amount: amount }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          state.recharging = false;
          if (data && data.success && data.invoiceUrl) {
            if (newWindow) newWindow.location.href = data.invoiceUrl;
          } else {
            if (newWindow) newWindow.close();
            state.rechargeError = (data && data.message) || "Unable to start recharge. Please try again.";
          }
          rerender();
        })
        .catch(function (err) {
          logErr("recharge failed:", err);
          if (newWindow) newWindow.close();
          state.recharging = false;
          state.rechargeError = "Unable to start recharge. Please try again.";
          rerender();
        });
    }

    function fetchSupport(force) {
      if (state.supportLoading) return;
      if (state.supportRequests !== null && !force) return;
      state.supportLoading = true;
      state.supportError = null;
      rerender();
      fetch(apiBase.replace(/\/customer\/me$/, "/support/requests"), {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          state.supportLoading = false;
          if (!data || data.success !== true || !data.authenticated) {
            state.supportError = "Unable to load your support requests.";
          } else {
            state.supportRequests = data.data || [];
          }
          rerender();
        })
        .catch(function (err) {
          logErr("support fetch failed:", err);
          state.supportLoading = false;
          state.supportError = "Unable to load your support requests.";
          rerender();
        });
    }

    function submitSupport(subject, message) {
      state.supportSubmitting = true;
      state.supportFormError = null;
      state.supportFormSuccess = null;
      rerender();
      fetch(apiBase.replace(/\/customer\/me$/, "/support/requests"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ subject: subject, message: message }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          state.supportSubmitting = false;
          if (data && data.success) {
            state.supportFormSuccess = data.message || "Your query has been sent to the store.";
            fetchSupport(true);
          } else {
            state.supportFormError = (data && data.message) || "Unable to send your query. Please try again.";
          }
          rerender();
        })
        .catch(function (err) {
          logErr("support submit failed:", err);
          state.supportSubmitting = false;
          state.supportFormError = "Unable to send your query. Please try again.";
          rerender();
        });
    }

    function markRequestRead(requestId) {
      fetch(apiBase.replace(/\/customer\/me$/, "/support/requests/" + encodeURIComponent(requestId) + "/read"), {
        method: "PUT",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }).catch(function (err) { logErr("mark read failed:", err); });
      if (state.supportRequests) {
        state.supportRequests = state.supportRequests.map(function (r) {
          return r._id === requestId ? Object.assign({}, r, { consultantHasUnreadReply: false }) : r;
        });
      }
    }

    root.addEventListener("click", function (evt) {
      var el = evt.target.closest("[data-action]");
      if (!el) return;
      var action = el.getAttribute("data-action");

      if (action === "goto-tab") {
        state.activeTab = el.getAttribute("data-tab");
        if (el.getAttribute("data-wallet-view")) {
          state.walletView = el.getAttribute("data-wallet-view");
        }
        if (state.activeTab === "wallet" && state.walletView === "topup") fetchTopup(false);
        if (state.activeTab === "support") fetchSupport(false);
        rerender();
      } else if (action === "wallet-view") {
        state.walletView = el.getAttribute("data-wallet-view");
        if (state.walletView === "topup") fetchTopup(false);
        rerender();
      } else if (action === "recharge") {
        recharge(Number(el.getAttribute("data-amount")));
      } else if (action === "retry-topup") {
        fetchTopup(true);
      } else if (action === "retry-support") {
        fetchSupport(true);
      } else if (action === "retry-wallet-page") {
        loadMorePage("wallet");
      } else if (action === "retry-comm-page") {
        loadMorePage("comm");
      } else if (action === "toggle-support-form") {
        state.showSupportForm = !state.showSupportForm;
        state.supportFormError = null;
        state.supportFormSuccess = null;
        rerender();
      } else if (action === "toggle-request") {
        var id = el.getAttribute("data-request-id");
        state.openRequestId = state.openRequestId === id ? null : id;
        if (state.openRequestId) {
          var req = (state.supportRequests || []).find(function (r) { return r._id === id; });
          if (req && req.consultantHasUnreadReply) markRequestRead(id);
        }
        rerender();
      }
    });

    root.addEventListener("submit", function (evt) {
      var form = evt.target.closest('[data-action="submit-support"]');
      if (!form) return;
      evt.preventDefault();
      var subject = form.querySelector('[name="subject"]').value.trim();
      var message = form.querySelector('[name="message"]').value.trim();
      if (!subject || !message) {
        state.supportFormError = "Subject and message are required.";
        rerender();
        return;
      }
      submitSupport(subject, message);
    });

    return {
      setData: function (data) {
        state.data = data;
        state.wallet = {
          items: data.walletHistory || [],
          hasMore: Boolean(data.walletHistoryHasMore),
          nextCursor: data.walletHistoryNextCursor || null,
          loading: false,
          error: null,
        };
        state.comm = {
          items: data.consultationHistory || [],
          hasMore: Boolean(data.consultationHistoryHasMore),
          nextCursor: data.consultationHistoryNextCursor || null,
          loading: false,
          error: null,
        };
        rerender();
      },
    };
  }

  // ------------------------------------------------------------- bootstrap

  function buildLoginUrl(shop) {
    var returnTo = window.location.pathname + window.location.search;
    return "https://" + shop + "/account/login?return_to=" + encodeURIComponent(returnTo);
  }

  function renderLoginRequired(root, shop) {
    root.innerHTML =
      '<div class="advizo-my-profile__state">' +
      "<p>Sign in to view your profile, balance, and consultation Activity-history.</p>" +
      '<a class="advizo-my-profile__login-button" href="' +
      escapeHtml(buildLoginUrl(shop)) +
      '">Sign in</a>' +
      "</div>";
  }

  function renderError(root, onRetry) {
    root.innerHTML =
      '<div class="advizo-my-profile__state">' +
      "<p>We couldn’t load your profile. Please try again shortly.</p>" +
      '<button type="button" class="advizo-my-profile__retry">Try again</button>' +
      "</div>";
    var btn = root.querySelector(".advizo-my-profile__retry");
    if (btn) btn.addEventListener("click", onRetry);
  }

  function initMyProfile(container) {
    log("current page detected:", window.location.pathname);
    if (container.getAttribute("data-advizo-initialized") === "1") {
      log("skip: this block was already initialized");
      return;
    }
    container.setAttribute("data-advizo-initialized", "1");

    var root = container.querySelector(".advizo-my-profile__root");
    if (!root) {
      logErr("Block root (.advizo-my-profile__root) not found — cannot render");
      return;
    }

    var apiBase = container.getAttribute("data-api-base");
    var shop = container.getAttribute("data-shop");
    var options = {
      showWalletHistory: container.getAttribute("data-show-wallet-Activity-history") === "true",
      showConsultationHistory: container.getAttribute("data-show-consultation-Activity-history") === "true",
    };

    if (!apiBase || !shop) {
      logErr("API URL/shop could not be constructed — data-api-base or data-shop attribute missing");
      renderError(root, function () { initMyProfileLoad(); });
      return;
    }

    function initMyProfileLoad() {
      root.innerHTML =
        '<div class="advizo-my-profile__boot-spinner" role="status">' +
        '<span class="advizo-my-profile__boot-spinner-ring" aria-hidden="true"></span>' +
        '<span class="advizo-visually-hidden">Loading your profile…</span>' +
        "</div>";
      log("API request starting:", apiBase);

      fetch(apiBase, { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (res) {
          log("API response status:", res.status);
          if (res.status === 401 || res.status === 403) {
            var authErr = new Error("not_authenticated");
            authErr.notAuthenticated = true;
            throw authErr;
          }
          if (!res.ok) throw new Error("Request failed with status " + res.status);
          return res.json();
        })
        .then(function (data) {
          log("profile data received:", data);
          if (!data || data.success !== true) throw new Error("Unexpected response shape");

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

          try {
            var controller = createController(root, apiBase, shop, options);
            controller.setData(data);
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
    var blocks = document.querySelectorAll(".advizo-my-profile");
    log("initAll fired — found", blocks.length, "My Profile block(s) on page");
    blocks.forEach(initMyProfile);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  document.addEventListener("shopify:section:load", initAll);
})();
