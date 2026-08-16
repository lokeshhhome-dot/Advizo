const axios = require("axios");

const SHOPIFY_API_VERSION = "2024-10";

const normalizeShopDomain = (shop) => {
  if (!shop || typeof shop !== "string") return "";
  return shop.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const shopifyGraphql = async (shop, accessToken, query, variables) => {
  const response = await axios.post(
    `https://${normalizeShopDomain(shop)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    { query, variables },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
    },
  );

  if (response.data?.errors?.length) {
    throw new Error(
      response.data.errors.map((error) => error.message).join("; "),
    );
  }

  return response.data?.data;
};

const FIND_PAGE_QUERY = `
  query FindShopifyPage($query: String!) {
    pages(first: 1, query: $query) {
      edges {
        node {
          id
          title
          handle
          isPublished
        }
      }
    }
  }
`;

const CREATE_PAGE_MUTATION = `
  mutation CreateShopifyPage($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page {
        id
        title
        handle
        isPublished
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Shopify's `pages(query:)` search can return near-matches (e.g. handle
// prefixes) — the `handle === handle` check below keeps this an exact-match
// lookup, which idempotency depends on.
const findPageByHandle = async (shopDomain, accessToken, handle) => {
  const data = await shopifyGraphql(shopDomain, accessToken, FIND_PAGE_QUERY, {
    query: `handle:${handle}`,
  });
  const node = data?.pages?.edges?.[0]?.node;
  return node && node.handle === handle ? node : null;
};

/**
 * Ensures a storefront Page with the given handle exists, creating it if
 * missing. Idempotent and safe to call on every install/OAuth callback: an
 * existing page (or one created by a concurrent call racing this one) is
 * reused rather than duplicated. Generic — callers pass the handle/title;
 * see ensureConsultantProfilePage.js and ensureMyProfilePage.js for the
 * specific pages this app needs.
 */
const ensureShopifyPage = async (shop, accessToken, { handle, title, logLabel }) => {
  const shopDomain = normalizeShopDomain(shop);
  const label = logLabel || handle;
  const logPrefix = `[Consultly][ensureShopifyPage:${label}][${shopDomain || "unknown-shop"}]`;

  try {
    if (!shopDomain || !accessToken) {
      console.warn(`${logPrefix} Missing shop or accessToken — skipping`);
      return { ok: false, reason: "missing_credentials" };
    }
    if (!handle || !title) {
      console.warn(`${logPrefix} Missing handle or title — skipping`);
      return { ok: false, reason: "missing_page_config" };
    }

    console.log(`${logPrefix} Checking ${title} page for shop: ${shopDomain}`);

    const existingPage = await findPageByHandle(shopDomain, accessToken, handle);
    if (existingPage) {
      console.log(
        `${logPrefix} ${title} page already exists: ${existingPage.id} (published: ${existingPage.isPublished})`,
      );
      if (!existingPage.isPublished) {
        console.warn(
          `${logPrefix} Existing page is not published — the storefront URL will 404 until it's published`,
        );
      }
      return { ok: true, reason: "already_exists", page: existingPage };
    }

    console.log(`${logPrefix} ${title} page does not exist. Creating...`);

    const mutationData = await shopifyGraphql(
      shopDomain,
      accessToken,
      CREATE_PAGE_MUTATION,
      {
        page: { title, handle, isPublished: true },
      },
    );

    const userErrors = mutationData?.pageCreate?.userErrors || [];
    if (userErrors.length) {
      // A concurrent install (or a second OAuth callback firing for the
      // same shop) may have created the page between our check and this
      // mutation — re-query once instead of failing/duplicating.
      const handleTaken = userErrors.some((e) =>
        (e.message || "").toLowerCase().includes("handle"),
      );
      if (handleTaken) {
        const racedPage = await findPageByHandle(shopDomain, accessToken, handle);
        if (racedPage) {
          console.log(
            `${logPrefix} Handle already taken by a concurrent create — reusing: ${racedPage.id}`,
          );
          return { ok: true, reason: "already_exists_race", page: racedPage };
        }
      }
      console.error(
        `${logPrefix} Failed to create ${title} page: pageCreate userErrors:`,
        userErrors,
      );
      return { ok: false, reason: "user_errors", userErrors };
    }

    const page = mutationData?.pageCreate?.page;
    console.log(`${logPrefix} ${title} page created: ${page?.id}`);
    return { ok: true, reason: "created", page };
  } catch (error) {
    console.error(
      `${logPrefix} Failed to create ${title} page:`,
      error.response?.data || error.message || error,
    );
    return { ok: false, reason: "exception", error: error.message };
  }
};

module.exports = { ensureShopifyPage };
