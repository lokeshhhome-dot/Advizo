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
          templateSuffix
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
        templateSuffix
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// pageUpdate takes the page id separately from the PageUpdateInput (unlike
// pageCreate, where handle/title/etc. all live inside PageCreateInput) —
// confirmed against Shopify's 2024-10 Admin GraphQL schema, the same
// version already in use for pageCreate above.
const UPDATE_PAGE_MUTATION = `
  mutation UpdateShopifyPage($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page {
        id
        title
        handle
        isPublished
        templateSuffix
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

const updatePageTemplateSuffix = async (shopDomain, accessToken, pageId, templateSuffix) => {
  const data = await shopifyGraphql(shopDomain, accessToken, UPDATE_PAGE_MUTATION, {
    id: pageId,
    page: { templateSuffix },
  });
  const userErrors = data?.pageUpdate?.userErrors || [];
  if (userErrors.length) {
    return { ok: false, userErrors };
  }
  return { ok: true, page: data?.pageUpdate?.page };
};

/**
 * Ensures a storefront Page with the given handle exists (creating it if
 * missing) and, when `templateSuffix` is provided, that the page is
 * actually assigned to it — fixing an existing page's templateSuffix via
 * pageUpdate if it's missing/different, not just setting it at creation
 * time. Idempotent and safe to call on every install/OAuth callback/re-auth:
 * an existing page (or one created by a concurrent call racing this one) is
 * reused and, if needed, migrated to the right template rather than
 * duplicated or left as-is. Generic — callers pass the handle/title/
 * templateSuffix; see ensureConsultantProfilePage.js and
 * ensureMyProfilePage.js for the specific pages this app needs.
 */
const ensureShopifyPage = async (
  shop,
  accessToken,
  { handle, title, templateSuffix, logLabel },
) => {
  const shopDomain = normalizeShopDomain(shop);
  const label = logLabel || handle;
  const logPrefix = `[advizo][ensureShopifyPage:${label}][${shopDomain || "unknown-shop"}]`;

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
      console.log(`${logPrefix} Found page id=${existingPage.id}`);
      if (!existingPage.isPublished) {
        console.warn(
          `${logPrefix} Existing page is not published — the storefront URL will 404 until it's published`,
        );
      }

      if (templateSuffix && existingPage.templateSuffix !== templateSuffix) {
        console.log(
          `${logPrefix} Updating templateSuffix from "${existingPage.templateSuffix || "null"}" to "${templateSuffix}"`,
        );
        const updateResult = await updatePageTemplateSuffix(
          shopDomain,
          accessToken,
          existingPage.id,
          templateSuffix,
        );
        if (!updateResult.ok) {
          // Page itself is untouched/still usable — only the template
          // assignment failed. Reported as ok:false (not silently ok:true)
          // so this doesn't get logged as success, but the existing page is
          // preserved rather than deleted/recreated.
          console.error(
            `${logPrefix} Failed to set templateSuffix on existing page: pageUpdate userErrors:`,
            updateResult.userErrors,
          );
          return {
            ok: false,
            reason: "template_update_failed",
            page: existingPage,
            userErrors: updateResult.userErrors,
          };
        }
        return { ok: true, reason: "already_exists_template_updated", page: updateResult.page };
      }

      if (templateSuffix) {
        console.log(`${logPrefix} templateSuffix already "${templateSuffix}" — skipping`);
      }
      return { ok: true, reason: "already_exists", page: existingPage };
    }

    console.log(`${logPrefix} ${title} page does not exist. Creating...`);

    const mutationData = await shopifyGraphql(
      shopDomain,
      accessToken,
      CREATE_PAGE_MUTATION,
      {
        page: {
          title,
          handle,
          isPublished: true,
          ...(templateSuffix ? { templateSuffix } : {}),
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
        const racedPage = await findPageByHandle(shopDomain, accessToken, handle);
        if (racedPage) {
          console.log(
            `${logPrefix} Handle already taken by a concurrent create — reusing: ${racedPage.id}`,
          );
          // The racing call may not have set templateSuffix (or set a
          // different one) — same fix-up path as an existing page.
          if (templateSuffix && racedPage.templateSuffix !== templateSuffix) {
            const updateResult = await updatePageTemplateSuffix(
              shopDomain,
              accessToken,
              racedPage.id,
              templateSuffix,
            );
            if (updateResult.ok) {
              return { ok: true, reason: "already_exists_race", page: updateResult.page };
            }
          }
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
    console.log(
      `${logPrefix} ${title} page created: ${page?.id}` +
        (templateSuffix ? ` (templateSuffix="${page?.templateSuffix}")` : ""),
    );
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
