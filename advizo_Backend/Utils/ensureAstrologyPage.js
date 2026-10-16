const { ensureShopifyPage } = require("./ensureShopifyPage");

const ASTROLOGY_PAGE_HANDLE = "astrology";
const ASTROLOGY_PAGE_TITLE = "Astrology";
// Dedicated `templates/page.astrology.json` (merchant creates it once via
// Theme Editor's "Create template") keeps the Astrology Experience block off
// the shared default page template — same convention as ensureMyProfilePage.
const ASTROLOGY_TEMPLATE_SUFFIX = "astrology";

/**
 * Ensures the storefront Page the Astrology Experience app block renders on
 * exists (handle "astrology" — astrology.liquid's
 * `page.handle == 'astrology'` guard checks for this exact handle). Thin
 * wrapper around the generic, idempotent ensureShopifyPage.
 */
const ensureAstrologyPage = (shop, accessToken) =>
  ensureShopifyPage(shop, accessToken, {
    handle: ASTROLOGY_PAGE_HANDLE,
    title: ASTROLOGY_PAGE_TITLE,
    templateSuffix: ASTROLOGY_TEMPLATE_SUFFIX,
  });

module.exports = { ensureAstrologyPage };
