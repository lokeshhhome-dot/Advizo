const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const { shopModel } = require("../../Modal/shopify");
const { User } = require("../../Modal/userSchema");
const {
  shopDocCache,
  storefrontSessionCache,
  userTokenCache,
} = require("../../Utils/ttlCache");
const { getShopAccessToken } = require("../../Utils/shopifyToken");
const axios = require("axios");

const SHOP_CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_TOKEN_CACHE_TTL_MS = 6 * 24 * 60 * 60 * 1000;
const JWT_EXPIRY = "7d";

const buildSessionResult = (user, token, message = "Customer already exists") => ({
  success: true,
  message,
  userId: user._id,
  shop_id: user.shop_id,
  token,
});

const cacheSession = (shop, customerId, result) => {
  if (result?.success) {
    storefrontSessionCache.set(
      `session:${shop}:${customerId}`,
      result,
      SESSION_CACHE_TTL_MS,
    );
  }
  return result;
};

const getOrCreateUserToken = (userId) => {
  const cacheKey = `jwt:${userId}`;
  const cached = userTokenCache.get(cacheKey);
  if (cached) return cached;

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET_KEY, {
    expiresIn: JWT_EXPIRY,
  });
  userTokenCache.set(cacheKey, token, USER_TOKEN_CACHE_TTL_MS);
  return token;
};

const verifyExistingToken = async (existingToken, customerId) => {
  if (!existingToken) return null;

  try {
    const payload = jwt.verify(existingToken, process.env.JWT_SECRET_KEY);
    const user = await User.findById(payload.id)
      .select("_id shop_id shopifyCustomerId")
      .lean();

    if (user && String(user.shopifyCustomerId) === String(customerId)) {
      return buildSessionResult(user, existingToken);
    }
  } catch (_) {
    // Token expired or invalid — fall through to normal resolution.
  }

  return null;
};

/**
 * Recover a storefront session from our OWN app JWT when Shopify did not put
 * `logged_in_customer_id` on this app-proxy request.
 *
 * Shopify omits that hint on some proxy hits even for a signed-in shopper (a
 * cached storefront document, a cookie the browser did not attach to a popup /
 * cross-site navigation). Treating a single missing hint as "this person is
 * logged out" is what redirected live customers to accounts.shopify.com in the
 * middle of starting a call. The token is verified and bound to the shop, so
 * this recovers the session without weakening authentication.
 */
const resolveUserFromAppToken = async (existingToken, shop) => {
  if (!existingToken) return null;

  try {
    const payload = jwt.verify(existingToken, process.env.JWT_SECRET_KEY);
    const user = await User.findById(payload.id)
      .select("_id shop_id shopifyCustomerId userType")
      .lean();
    if (!user) return null;

    // Storefront customers only. A consultant JWT must never be able to stand
    // in for a shopper on these pages.
    if (user.userType === "consultant") return null;

    // A token minted on one shop must never authenticate on another.
    if (shop) {
      const shopDoc = await getShopDoc(shop);
      if (!shopDoc?._id || String(shopDoc._id) !== String(user.shop_id)) {
        return null;
      }
    }

    return buildSessionResult(user, existingToken, "Session restored from token");
  } catch (_) {
    // Expired / tampered / wrong secret — caller falls back to anonymous.
    return null;
  }
};

const getShopDoc = async (shop) =>
  shopDocCache.getOrSet(`shop:${shop}`, SHOP_CACHE_TTL_MS, () =>
    shopModel.findOne({ shop }).lean(),
  );

const fetchShopifyCustomer = async (shop, accessToken, customerId) => {
  const graphqlQuery = {
    query: `{
      customer(id: "gid://shopify/Customer/${customerId}") {
        id
        firstName
        lastName
        email
        createdAt
        numberOfOrders
      }
    }`,
  };

  const response = await axios.post(
    `https://${shop}/admin/api/2024-10/graphql.json`,
    graphqlQuery,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
    },
  );

  return response.data?.data?.customer || null;
};

// const manageShopifyUser = async (shop, customerId, options = {}) => {
//   try {
//     const { existingToken } = options || {};


//     const fromExistingToken = await verifyExistingToken(existingToken, customerId);
//     if (fromExistingToken) {
//       return cacheSession(shop, customerId, fromExistingToken);
//     }

//     const shopDoc = await getShopDoc(shop);
//     if (!shopDoc?.accessToken) {
//       return null;
//     }

//     const existingUser = await User.findOne({
//       shopifyCustomerId: String(customerId),
//     })
//       .select("_id shop_id shopifyCustomerId")
//       .lean();

//     console.log("existingUser", existingUser)
//     if (existingUser) {
//       const token = getOrCreateUserToken(existingUser._id);
//       return cacheSession(
//         shop,
//         customerId,
//         buildSessionResult(existingUser, token),
//       );
//     }

//     const customer = await fetchShopifyCustomer(
//       shop,
//       shopDoc.accessToken,
//       customerId,
//     );
//     console.log("customer", customer)

//     if (!customer) {
//       return { success: false, message: "Customer not found in Shopify" };
//     }

//     const shopifyCustomerId = customer.id.split("/").pop();
//     const fullname =
//       [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
//       "Shopify Customer";

//     const newUser = new User({
//       shopifyCustomerId,
//       shop_id: shopDoc._id,
//       userType: "customer",
//       walletBalance: 0,
//       email: customer.email,
//       fullname,
//       isChatAccepted: "request",
//       createdAt: customer.createdAt,
//       numberOfOrders: customer.numberOfOrders,
//       chatLock: true,
//     });

//     await newUser.save();

//     const token = getOrCreateUserToken(newUser._id);
//     return cacheSession(
//       shop,
//       customerId,
//       buildSessionResult(newUser, token, "Customer created successfully"),
//     );
//   } catch (error) {
//     console.error(
//       "Error fetching customer:",
//       error.response?.data || error.message,
//     );
//     return {
//       success: false,
//       message: error.message || "Error registering customer",
//       error: error.response?.data || error.message,
//     };
//   }
// };
const manageShopifyUser = async (shop, customerId, options = {}) => {
  try {
    const { existingToken } = options || {};

    // 0. Recently resolved session — only success results are ever cached
    // (see cacheSession), TTL 5 minutes.
    const cachedSession = storefrontSessionCache.get(
      `session:${shop}:${customerId}`,
    );
    if (cachedSession) {
      return cachedSession;
    }

    // 1. Verify existing JWT
    const fromExistingToken = await verifyExistingToken(
      existingToken,
      customerId
    );

    if (fromExistingToken) {
      return cacheSession(shop, customerId, fromExistingToken);
    }

    // 2. Get shop
    const shopDoc = await getShopDoc(shop);

    if (!shopDoc?.accessToken) {
      return {
        success: false,
        message: "Shop not found",
      };
    }

    // 3. Check existing user
    const existingUser = await User.findOne({
      shopifyCustomerId: String(customerId),
      shop_id: shopDoc._id,
    })
      .select("_id shop_id shopifyCustomerId fullname email")
      .lean();

    // ======================================================
    // EXISTING USER
    // ======================================================
    if (existingUser) {
      // The Shopify Admin API refresh only ever backfills a missing/default
      // fullname, so skip the API call entirely when the name is already set.
      const needsNameRefresh =
        !existingUser.fullname ||
        existingUser.fullname.trim() === "" ||
        existingUser.fullname === "Shopify Customer";

      if (needsNameRefresh) {
        try {
          const customer = await fetchShopifyCustomer(
            shop,
            await getShopAccessToken(shopDoc),
            customerId
          );

          if (customer) {
            const fullname =
              [customer.firstName, customer.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "Shopify Customer";

            await User.updateOne(
              { _id: existingUser._id },
              { $set: { fullname } }
            );
          }
        } catch (err) {
          console.error(
            "Failed to refresh Shopify customer:",
            err.response?.data || err.message
          );
        }
      }

      const token = getOrCreateUserToken(existingUser._id);

      return cacheSession(
        shop,
        customerId,
        buildSessionResult(existingUser, token)
      );
    }

    // ======================================================
    // NEW USER
    // ======================================================

    const customer = await fetchShopifyCustomer(
      shop,
      await getShopAccessToken(shopDoc),
      customerId
    );

    if (!customer) {
      return {
        success: false,
        message: "Customer not found in Shopify",
      };
    }

    const shopifyCustomerId = customer.id.split("/").pop();

    const fullname =
      [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Shopify Customer";

    const newUser = new User({
      shopifyCustomerId,
      shop_id: shopDoc._id,
      userType: "customer",
      walletBalance: 0,
      email: customer.email,
      fullname,
      isChatAccepted: "request",
      createdAt: customer.createdAt,
      numberOfOrders: customer.numberOfOrders,
      chatLock: true,
    });

    await newUser.save();

    const token = getOrCreateUserToken(newUser._id);

    return cacheSession(
      shop,
      customerId,
      buildSessionResult(
        newUser,
        token,
        "Customer created successfully"
      )
    );
  } catch (error) {
    console.error(
      "Error fetching customer:",
      error.response?.data || error.message
    );

    return {
      success: false,
      message: error.message || "Error registering customer",
      error: error.response?.data || error.message,
    };
  }
};
module.exports = {
  manageShopifyUser,
  resolveUserFromAppToken,
};
