const { ensureShopifyPage } = require("./ensureShopifyPage");

const MY_PROFILE_PAGE_HANDLE = "my-profile";
const MY_PROFILE_PAGE_TITLE = "My Profile";

/**
 * Ensures the storefront Page the Customer Profile app block renders on
 * exists (handle "my-profile" — my-profile.liquid's
 * `page.handle == 'my-profile'` guard checks for this exact handle),
 * creating it if missing. Thin wrapper around the generic ensureShopifyPage
 * — see that module for the idempotency/race-handling logic. See also
 * ensureConsultantProfilePage.js for the consultant-facing sibling.
 */
const ensureMyProfilePage = (shop, accessToken) =>
  ensureShopifyPage(shop, accessToken, {
    handle: MY_PROFILE_PAGE_HANDLE,
    title: MY_PROFILE_PAGE_TITLE,
  });

module.exports = { ensureMyProfilePage };
