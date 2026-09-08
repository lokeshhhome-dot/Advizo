const axios = require("axios");
const { flattenMenuItems } = require("./menuPathUtils");

const SHOPIFY_API_VERSION = "2024-10";
const MAIN_MENU_HANDLE = "main-menu";
// Legacy label, kept only so findConsultantMenuItem can still recognize an
// item created before the "Become a Consultant" rename.
const CONSULTANT_LOGIN_TITLE = "Consultant Login";
const BECOME_A_CONSULTANT_TITLE = "Become a Consultant";
// Stable across the rename — the URL never changes, only the visible
// label does, so this is what identity/idempotency is anchored to.
const CONSULTANT_LOGIN_PATH = "/apps/advizo/login";

const normalizeShopDomain = (shop) => {
  if (!shop || typeof shop !== "string") return "";
  return shop.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const getStorefrontMenuItems = (shop) => {
  const shopDomain = normalizeShopDomain(shop);
  const shopBaseUrl = shopDomain ? `https://${shopDomain}` : "";

  // "Our Consultant" (-> /apps/advizo/, the old iframe consultant-card
  // listing) intentionally dropped — superseded by the native
  // consultant-card.liquid block a merchant places on the Home page
  // directly. Existing shops' menus are left untouched; this only affects
  // what NEW installs get.
  //
  // "Profile" now points at the native /pages/my-profile Theme App
  // Extension block instead of the old /apps/advizo/profile iframe
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
      title: BECOME_A_CONSULTANT_TITLE,
      type: "HTTP",
      url: shopBaseUrl
        ? `${shopBaseUrl}${CONSULTANT_LOGIN_PATH}`
        : CONSULTANT_LOGIN_PATH,
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

// Finds the consultant menu entry by URL first — the URL is stable across
// the "Consultant Login" -> "Become a Consultant" rename, so a re-run can
// detect and migrate an old-titled item instead of a title mismatch being
// mistaken for "menu not configured yet" (which would add a duplicate).
// Title is checked too, as a fallback for any item whose URL was hand-edited.
const findConsultantMenuItem = (items = [], shop) => {
  const shopDomain = normalizeShopDomain(shop);

  return (
    flattenMenuItems(items).find((item) => {
      const url = (item.url || "").toLowerCase();
      const urlMatch =
        url.includes(CONSULTANT_LOGIN_PATH) ||
        (shopDomain && url.includes(`${shopDomain}${CONSULTANT_LOGIN_PATH}`));
      const titleMatch =
        item.title?.trim().toLowerCase() === CONSULTANT_LOGIN_TITLE.toLowerCase() ||
        item.title?.trim().toLowerCase() === BECOME_A_CONSULTANT_TITLE.toLowerCase();

      return urlMatch || titleMatch;
    }) || null
  );
};

// Rebuilds the (possibly nested) items tree via mapExistingMenuItem,
// retitling only the one item matching targetId — everything else,
// including nested submenus, is preserved untouched.
const mapAndMaybeRenameItem = (item, targetId, newTitle) => {
  const mapped = mapExistingMenuItem(item);
  if (item.id === targetId) {
    mapped.title = newTitle;
  }
  if (Array.isArray(item.items) && item.items.length) {
    mapped.items = item.items.map((child) =>
      mapAndMaybeRenameItem(child, targetId, newTitle),
    );
  }
  return mapped;
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
    const existingConsultantItem = findConsultantMenuItem(existingItems, shopDomain);

    if (existingConsultantItem) {
      if (existingConsultantItem.title === BECOME_A_CONSULTANT_TITLE) {
        console.log(`${logPrefix} Already configured — skipping`);
        return { ok: true, reason: "already_configured" };
      }

      console.log(
        `${logPrefix} Migrating consultant menu item title from "${existingConsultantItem.title}" to "${BECOME_A_CONSULTANT_TITLE}"`,
      );
      const migratedItems = existingItems.map((item) =>
        mapAndMaybeRenameItem(item, existingConsultantItem.id, BECOME_A_CONSULTANT_TITLE),
      );

      const renameMutationData = await shopifyGraphql(
        shopDomain,
        accessToken,
        MENU_UPDATE_MUTATION,
        {
          id: mainMenu.id,
          title: mainMenu.title,
          handle: mainMenu.handle,
          items: migratedItems,
        },
      );

      const renameUserErrors = renameMutationData?.menuUpdate?.userErrors || [];
      if (renameUserErrors.length) {
        console.error(`${logPrefix} menuUpdate userErrors (rename):`, renameUserErrors);
        return { ok: false, reason: "user_errors", userErrors: renameUserErrors };
      }

      console.log(`${logPrefix} ✅ Consultant menu item migrated to "${BECOME_A_CONSULTANT_TITLE}"`);
      return { ok: true, reason: "menu_migrated", shop: shopDomain };
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
