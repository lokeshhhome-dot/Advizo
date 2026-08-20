import {
  clearSessionData,
  getActiveSession,
  isCallWindowSurface,
  isConsultantAppSurface,
  SESSION_TYPES,
} from "./browserSession";

export const CONSULTANT_TOKEN_KEY = "token";
export const CONSULTANT_USER_ID_KEY = "client_u_Identity";
export const CONSULTANT_SHOP_ID_KEY = "shop_o_Identity";
export const CONSULTANT_SHOP_DOMAIN_KEY = "shop";

export const getConsultantToken = () =>
  localStorage.getItem(CONSULTANT_TOKEN_KEY);

/**
 * Should THIS document run the consultant verify-token handshake?
 *
 * `token` is ONE localStorage key shared by customers and consultants. Running
 * the consultant-only verify on a customer surface always 401s, and the fallout
 * used to wipe the shopper's storefront keys — which is what later sent a
 * signed-in customer to accounts.shopify.com.
 */
export const isConsultantSurface = () => {
  try {
    const userType = new URLSearchParams(window.location.search).get(
      "userType",
    );
    // The call window states its role explicitly — trust it above all else.
    if (userType) return userType === "consultant";
    if (isConsultantAppSurface()) return true;
    return getActiveSession() === SESSION_TYPES.CONSULTANT;
  } catch (_) {
    return false;
  }
};

/**
 * The accept flow forwards the consultant JWT in the call URL precisely so a
 * freshly opened window can authenticate when its localStorage is cold,
 * partitioned, or was just cleared by a role switch. Adopt it BEFORE any guard
 * decides the consultant is logged out.
 */
export const adoptCallWindowToken = () => {
  try {
    const urlToken = (
      new URLSearchParams(window.location.search).get("authToken") || ""
    ).trim();
    if (!urlToken) return null;
    if (localStorage.getItem(CONSULTANT_TOKEN_KEY) !== urlToken) {
      localStorage.setItem(CONSULTANT_TOKEN_KEY, urlToken);
    }
    return urlToken;
  } catch (_) {
    return null;
  }
};

/**
 * An established call must never be interrupted by an auth bounce — the rule
 * every production calling app follows. Guards and interceptors check this
 * before navigating away.
 */
export const shouldPreserveSessionForCall = () => isCallWindowSurface();

export const getConsultantLoginUrl = () => {
  const shop =
    localStorage.getItem(CONSULTANT_SHOP_DOMAIN_KEY) ||
    new URLSearchParams(window.location.search).get("shop");

  if (shop) {
    return `https://${shop}/apps/consultly/login`;
  }
  return "/login";
};

export const getConsultantDashboardUrl = () => {
  const shop =
    localStorage.getItem(CONSULTANT_SHOP_DOMAIN_KEY) ||
    new URLSearchParams(window.location.search).get("shop");

  // Do NOT forward `host` — that marks Shopify admin and triggers ADMIN session wipe.
  if (shop) {
    return `https://${shop}/apps/consultly/consultant-dashboard`;
  }
  return `/consultant-dashboard`;
};

export const clearConsultantSession = () => {
  clearSessionData(SESSION_TYPES.CONSULTANT);
  localStorage.removeItem("consultly_active_session");
};

export const redirectToConsultantLogin = () => {
  const target = getConsultantLoginUrl();
  console.log(`[Consultly Frontend] redirecting to = ${target}`); // TEMPORARY, see index.js
  if (target.startsWith("http")) {
    window.top.location.href = target;
  } else {
    window.location.href = target;
  }
};

export const redirectToConsultantDashboard = () => {
  const target = getConsultantDashboardUrl();
  console.log(`[Consultly Frontend] redirecting to = ${target}`); // TEMPORARY, see index.js
  if (target.startsWith("http")) {
    window.top.location.href = target;
  } else {
    window.location.href = target;
  }
};
