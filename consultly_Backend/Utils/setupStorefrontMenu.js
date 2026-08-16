const axios = require("axios");
const { flattenMenuItems } = require("./menuPathUtils");

const SHOPIFY_API_VERSION = "2024-10";
const MAIN_MENU_HANDLE = "main-menu";
const CONSULTANT_LOGIN_TITLE = "Consultant Login";

const normalizeShopDomain = (shop) => {
  if (!shop || typeof shop !== "string") return "";
  return shop.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const getStorefrontMenuItems = (shop) => {
  const shopDomain = normalizeShopDomain(shop);
  const shopBaseUrl = shopDomain ? `https://${shopDomain}` : "";

  // "Our Consultant" (-> /apps/consultly/, the old iframe consultant-card
  // listing) intentionally dropped — superseded by the native
  // consultant-card.liquid block a merchant places on the Home page
  // directly. Existing shops' menus are left untouched; this only affects
  // what NEW installs get.
  //
  // "Profile" now points at the native /pages/my-profile Theme App
  // Extension block instead of the old /apps/consultly/profile iframe
  // (proxyProfileSection, removed from shopifyController.js) — matches
  // ensureMyProfilePage.js, which creates that page automatically.
  return [
    {
      title: "My Profile",
      type: "HTTP",
      url: shopBaseUrl
        ? `${shopBaseUrl}/pages/my-profile`
        : "/pages/my-profile",
    },
    {
      title: CONSULTANT_LOGIN_TITLE,
      type: "HTTP",
      url: shopBaseUrl
        ? `${shopBaseUrl}/apps/consultly/login`
        : "/apps/consultly/login",
    },
  ];
};

const MENUS_QUERY = `
  query StorefrontMenus {
    menus(first: 20) {
      edges {
        node {
          id
          handle
          title
          items {
            id
            title
            url
            type
            resourceId
            tags
            items {
              id
              title
              url
              type
              resourceId
              tags
              items {
                id
                title
                url
                type
                resourceId
                tags
              }
            }
          }
        }
      }
    }
  }
`;

const MENU_UPDATE_MUTATION = `
  mutation MenuUpdate($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
      menu {
        id
        handle
        items {
          id
          title
          url
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

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

const mapExistingMenuItem = (item) => {
  const mapped = {
    id: item.id,
    title: item.title,
    type: item.type,
  };

  if (item.url) mapped.url = item.url;
  if (item.resourceId) mapped.resourceId = item.resourceId;
  if (Array.isArray(item.tags) && item.tags.length) mapped.tags = item.tags;
  if (Array.isArray(item.items) && item.items.length) {
    mapped.items = item.items.map(mapExistingMenuItem);
  }

  return mapped;
};

const hasConsultantLoginItem = (items = [], shop) => {
  const shopDomain = normalizeShopDomain(shop);
  const loginPath = "/apps/consultly/login";

  return flattenMenuItems(items).some((item) => {
    const titleMatch =
      item.title?.trim().toLowerCase() ===
      CONSULTANT_LOGIN_TITLE.toLowerCase();
    const url = (item.url || "").toLowerCase();
    const urlMatch =
      url.includes(loginPath) ||
      (shopDomain && url.includes(`${shopDomain}${loginPath}`));

    return titleMatch || urlMatch;
  });
};

const setupStorefrontMenu = async (shop, accessToken) => {
  const shopDomain = normalizeShopDomain(shop);
  const logPrefix = `[setupStorefrontMenu][${shopDomain || "unknown-shop"}]`;

  try {
    if (!shopDomain || !accessToken) {
      console.warn(`${logPrefix} Missing shop or accessToken — skipping`);
      return { ok: false, reason: "missing_credentials" };
    }

    const storefrontMenuItems = getStorefrontMenuItems(shopDomain);
    console.log(`${logPrefix} Menu URLs:`, storefrontMenuItems.map((i) => i.url || i.type));

    const data = await shopifyGraphql(shopDomain, accessToken, MENUS_QUERY);
    const menus = data?.menus?.edges || [];
    const mainMenuEdge = menus.find(
      (edge) => edge?.node?.handle === MAIN_MENU_HANDLE,
    );
    const mainMenu = mainMenuEdge?.node;

    if (!mainMenu?.id) {
      console.warn(`${logPrefix} No "${MAIN_MENU_HANDLE}" menu found — skipping`);
      return { ok: false, reason: "main_menu_not_found" };
    }

    const existingItems = mainMenu.items || [];

    if (hasConsultantLoginItem(existingItems, shopDomain)) {
      console.log(`${logPrefix} Already configured — skipping`);
      return { ok: true, reason: "already_configured" };
    }

    const preservedItems = existingItems.map(mapExistingMenuItem);
    const updatedItems = [...preservedItems, ...storefrontMenuItems];

    const mutationData = await shopifyGraphql(
      shopDomain,
      accessToken,
      MENU_UPDATE_MUTATION,
      {
        id: mainMenu.id,
        title: mainMenu.title,
        handle: mainMenu.handle,
        items: updatedItems,
      },
    );

    const userErrors = mutationData?.menuUpdate?.userErrors || [];
    if (userErrors.length) {
      console.error(`${logPrefix} menuUpdate userErrors:`, userErrors);
      return { ok: false, reason: "user_errors", userErrors };
    }

    console.log(`${logPrefix} ✅ MENU ADDED for ${shopDomain}`);
    return { ok: true, reason: "menu_added", shop: shopDomain };
  } catch (error) {
    console.error(
      `${logPrefix} MENU SETUP ERROR:`,
      error.response?.data || error.message || error,
    );
    return { ok: false, reason: "exception", error: error.message };
  }
};

module.exports = { setupStorefrontMenu, getStorefrontMenuItems };
