const { ensureShopifyPage } = require("./ensureShopifyPage");

const MY_PROFILE_PAGE_HANDLE = "my-profile";
const MY_PROFILE_PAGE_TITLE = "My Profile";
// Matches the dedicated `templates/page.my-profile.json` a merchant creates
// once via Theme Editor's "Create template for this page" action — this is
// what keeps the My Profile app block off the shared default page template
// (and therefore off any other page), without ever touching Header.
const MY_PROFILE_TEMPLATE_SUFFIX = "my-profile";

/**
 * Ensures the storefront Page the Customer Profile app block renders on
 * exists (handle "my-profile" — my-profile.liquid's
 * `page.handle == 'my-profile'` guard checks for this exact handle),
 * creating it if missing, and that it's assigned to the "my-profile"
 * template suffix — fixing this on existing pages too, not just new ones.
 * Thin wrapper around the generic ensureShopifyPage — see that module for
 * the idempotency/race-handling/template-migration logic. See also
 * ensureConsultantProfilePage.js for the consultant-facing sibling.
 */
const ensureMyProfilePage = (shop, accessToken) =>
  ensureShopifyPage(shop, accessToken, {
    handle: MY_PROFILE_PAGE_HANDLE,
    title: MY_PROFILE_PAGE_TITLE,
    templateSuffix: MY_PROFILE_TEMPLATE_SUFFIX,
  });

module.exports = { ensureMyProfilePage };
