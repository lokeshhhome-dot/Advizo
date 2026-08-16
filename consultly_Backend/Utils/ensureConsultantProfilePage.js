const { ensureShopifyPage } = require("./ensureShopifyPage");

const CONSULTANT_PROFILE_PAGE_HANDLE = "consultant-profile";
const CONSULTANT_PROFILE_PAGE_TITLE = "Consultant Profile";

/**
 * Ensures the storefront Page that the Consultant Profile app block renders
 * on exists (handle "consultant-profile" — the exact handle
 * consultant-profile.liquid's `page.handle == 'consultant-profile'` guard
 * checks for), creating it if missing. Thin wrapper around the generic
 * ensureShopifyPage — see that module for the idempotency/race-handling
 * logic. See also ensureMyProfilePage.js for the customer-facing sibling.
 */
const ensureConsultantProfilePage = (shop, accessToken) =>
  ensureShopifyPage(shop, accessToken, {
    handle: CONSULTANT_PROFILE_PAGE_HANDLE,
    title: CONSULTANT_PROFILE_PAGE_TITLE,
  });

module.exports = { ensureConsultantProfilePage };
