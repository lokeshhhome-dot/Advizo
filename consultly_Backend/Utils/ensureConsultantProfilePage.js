const axios = require("axios");

const SHOPIFY_API_VERSION = "2024-10";
const CONSULTANT_PROFILE_PAGE_HANDLE = "consultant-profile";
const CONSULTANT_PROFILE_PAGE_TITLE = "Consultant Profile";

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
  query FindConsultantProfilePage($query: String!) {
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
  mutation CreateConsultantProfilePage($page: PageCreateInput!) {
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
// prefixes) — the `handle === CONSULTANT_PROFILE_PAGE_HANDLE` check below
// keeps this an exact-match lookup, which is what idempotency depends on.
const findConsultantProfilePage = async (shopDomain, accessToken) => {
  const data = await shopifyGraphql(shopDomain, accessToken, FIND_PAGE_QUERY, {
    query: `handle:${CONSULTANT_PROFILE_PAGE_HANDLE}`,
  });
  const node = data?.pages?.edges?.[0]?.node;
  return node && node.handle === CONSULTANT_PROFILE_PAGE_HANDLE ? node : null;
};

/**
 * Ensures the storefront Page that the Consultant Profile app block renders
 * on exists (handle "consultant-profile" — the exact handle
 * consultant-profile.liquid's `page.handle == 'consultant-profile'` guard
 * checks for), creating it if missing. Idempotent and safe to call on every
 * install/OAuth callback: an existing page (or one created by a concurrent
 * call) is reused rather than duplicated.
 */
const ensureConsultantProfilePage = async (shop, accessToken) => {
  const shopDomain = normalizeShopDomain(shop);
  const logPrefix = `[Consultly][ensureConsultantProfilePage][${shopDomain || "unknown-shop"}]`;

  try {
    if (!shopDomain || !accessToken) {
      console.warn(`${logPrefix} Missing shop or accessToken — skipping`);
      return { ok: false, reason: "missing_credentials" };
    }

    console.log(`${logPrefix} Checking Consultant Profile page for shop: ${shopDomain}`);

    const existingPage = await findConsultantProfilePage(shopDomain, accessToken);
    if (existingPage) {
      console.log(
        `${logPrefix} Consultant Profile page already exists: ${existingPage.id} (published: ${existingPage.isPublished})`,
      );
      if (!existingPage.isPublished) {
        console.warn(
          `${logPrefix} Existing page is not published — the storefront URL will 404 until it's published`,
        );
      }
      return { ok: true, reason: "already_exists", page: existingPage };
    }

    console.log(`${logPrefix} Consultant Profile page does not exist. Creating...`);

    const mutationData = await shopifyGraphql(
      shopDomain,
      accessToken,
      CREATE_PAGE_MUTATION,
      {
        page: {
          title: CONSULTANT_PROFILE_PAGE_TITLE,
          handle: CONSULTANT_PROFILE_PAGE_HANDLE,
          isPublished: true,
        },
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
        const racedPage = await findConsultantProfilePage(shopDomain, accessToken);
        if (racedPage) {
          console.log(
            `${logPrefix} Handle already taken by a concurrent create — reusing: ${racedPage.id}`,
          );
          return { ok: true, reason: "already_exists_race", page: racedPage };
        }
      }
      console.error(
        `${logPrefix} Failed to create Consultant Profile page: pageCreate userErrors:`,
        userErrors,
      );
      return { ok: false, reason: "user_errors", userErrors };
    }

    const page = mutationData?.pageCreate?.page;
    console.log(`${logPrefix} Consultant Profile page created: ${page?.id}`);
    return { ok: true, reason: "created", page };
  } catch (error) {
    console.error(
      `${logPrefix} Failed to create Consultant Profile page:`,
      error.response?.data || error.message || error,
    );
    return { ok: false, reason: "exception", error: error.message };
  }
};

module.exports = { ensureConsultantProfilePage };
