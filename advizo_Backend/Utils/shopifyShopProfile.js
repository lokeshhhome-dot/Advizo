const axios = require("axios");

const SHOP_PROFILE_QUERY = `
  query ShopWelcomeProfile {
    shop {
      name
      shopOwnerName
      email
      myshopifyDomain
    }
  }
`;

const fetchShopProfileFromGraphQL = async (shop, accessToken) => {
  if (!shop || !accessToken) return null;

  try {
    const response = await axios.post(
      `https://${shop}/admin/api/2024-10/graphql.json`,
      { query: SHOP_PROFILE_QUERY },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    const shopData = response.data?.data?.shop;
    if (!shopData) return null;

    return {
      shopName: shopData.name || "",
      shopOwnerName: shopData.shopOwnerName || "",
      shopEmail: shopData.email || "",
      myshopifyDomain: shopData.myshopifyDomain || shop,
    };
  } catch (error) {
    console.error(
      "fetchShopProfileFromGraphQL error:",
      error.response?.data || error.message,
    );
    return null;
  }
};

const fetchShopProfileFromRest = async (shop, accessToken) => {
  if (!shop || !accessToken) return null;

  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-10/shop.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    const shopData = response.data?.shop;
    if (!shopData) return null;

    return {
      shopId: String(shopData.id || ""),
      shopName: shopData.name || "",
      shopOwnerName: shopData.shop_owner || "",
      shopEmail: shopData.email || "",
      myshopifyDomain: shopData.myshopify_domain || shop,
      currency: (shopData.money_format || "")
        .replace("{{amount}}", "")
        .trim(),
      currencyCode: shopData.currency || "",
    };
  } catch (error) {
    console.error(
      "fetchShopProfileFromRest error:",
      error.response?.data || error.message,
    );
    return null;
  }
};

const resolveShopProfile = async (shop, accessToken) => {
  const [graphqlProfile, restProfile] = await Promise.all([
    fetchShopProfileFromGraphQL(shop, accessToken),
    fetchShopProfileFromRest(shop, accessToken),
  ]);

  return {
    shopId: restProfile?.shopId || "",
    shopName: graphqlProfile?.shopName || restProfile?.shopName || "",
    shopOwnerName:
      graphqlProfile?.shopOwnerName || restProfile?.shopOwnerName || "",
    shopEmail: graphqlProfile?.shopEmail || restProfile?.shopEmail || "",
    myshopifyDomain:
      graphqlProfile?.myshopifyDomain || restProfile?.myshopifyDomain || shop,
    currency: restProfile?.currency || "",
    currencyCode: restProfile?.currencyCode || "",
  };
};

module.exports = {
  fetchShopProfileFromGraphQL,
  fetchShopProfileFromRest,
  resolveShopProfile,
};
