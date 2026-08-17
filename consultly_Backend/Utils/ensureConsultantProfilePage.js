const { ensureShopifyPage } = require("./ensureShopifyPage");

const CONSULTANT_PROFILE_PAGE_HANDLE = "consultant-profile";
const CONSULTANT_PROFILE_PAGE_TITLE = "Consultant Profile";
// Matches the dedicated `templates/page.consultant-profile.json` a merchant
// creates once via Theme Editor's "Create template for this page" action —
// this is what keeps the Consultant Profile app block off the shared
// default page template (and therefore off any other page), without ever
// touching Header.
const CONSULTANT_PROFILE_TEMPLATE_SUFFIX = "consultant-profile";

/**
 * Ensures the storefront Page that the Consultant Profile app block renders
 * on exists (handle "consultant-profile" — the exact handle
 * consultant-profile.liquid's `page.handle == 'consultant-profile'` guard
 * checks for), creating it if missing, and that it's assigned to the
 * "consultant-profile" template suffix — fixing this on existing pages too,
 * not just new ones. Thin wrapper around the generic ensureShopifyPage —
 * see that module for the idempotency/race-handling/template-migration
 * logic. See also ensureMyProfilePage.js for the customer-facing sibling.
 */
const ensureConsultantProfilePage = (shop, accessToken) =>
  ensureShopifyPage(shop, accessToken, {
    handle: CONSULTANT_PROFILE_PAGE_HANDLE,
    title: CONSULTANT_PROFILE_PAGE_TITLE,
    templateSuffix: CONSULTANT_PROFILE_TEMPLATE_SUFFIX,
  });

module.exports = { ensureConsultantProfilePage };
