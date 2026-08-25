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

// 2024-10 (the version this file used previously) is long past Shopify's
// ~9-12 month API version support window as of now — matching
// shopifyDraftOrderController.js, the one call site in this codebase that
// was already kept current, rather than guessing a version.
const SHOPIFY_ADMIN_API_VERSION = "2026-07";

/**
 * Distinguishes three genuinely different failure modes that a naive
 * "customer is null so not found" check collapses into one:
 *   1. The HTTP request itself failed (bad/expired token, network error,
 *      shop unreachable) — never reaches Shopify's GraphQL layer at all.
 *   2. Shopify accepted the request but the GraphQL response carries
 *      `errors` (e.g. Protected Customer Data access denied) — customer
 *      may well exist, we're just not allowed to read these fields.
 *   3. A clean response with `data.customer: null` — Shopify genuinely has
 *      no customer with this id (wrong id, wrong shop, deleted customer).
 * Only case 3 should ever be treated as "not found".
 */
const runShopifyCustomerQuery = async (shop, accessToken, query) => {
  let response;
  try {
    response = await axios.post(
      `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
      { query },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );
  } catch (err) {
    // Safe only — HTTP status/shop, never the access token or full body.
    console.log("[SHOPIFY CUSTOMER DEBUG] API request success =", false);
    console.log(
      "[SHOPIFY CUSTOMER DEBUG] HTTP status =",
      err.response?.status || null,
    );
    return { customer: null, httpFailed: true, graphqlErrors: false };
  }

  console.log("[SHOPIFY CUSTOMER DEBUG] API request success =", true);

  const errors = Array.isArray(response.data?.errors) ? response.data.errors : [];
  console.log("[SHOPIFY CUSTOMER DEBUG] GraphQL error present =", errors.length > 0);
  if (errors.length) {
    // Safe only — error message/code, never the customer payload itself.
    errors.forEach((e) => {
      console.log("[SHOPIFY CUSTOMER DEBUG] GraphQL error code =", e.extensions?.code || "UNKNOWN");
    });
  }

  return {
    customer: response.data?.data?.customer || null,
    httpFailed: false,
    graphqlErrors: errors.length > 0,
  };
};

/**
 * name/email/firstName/lastName are Shopify "protected customer data" —
 * querying them requires the app to have completed Shopify's separate
 * Protected Customer Data approval (a Partner Dashboard review, independent
 * of the read_customers/write_customers OAuth scopes already granted). An
 * app without that approval gets an ACCESS_DENIED-style GraphQL error on
 * this field set specifically, with `customer` coming back null — which
 * previously surfaced here as an indistinguishable "Customer not found in
 * Shopify", even though the id was completely valid and the customer is
 * genuinely logged in. id/createdAt/numberOfOrders are NOT protected fields,
 * so the fallback query below still succeeds in that case; fullname/email
 * simply fall back to their existing "Shopify Customer" placeholder
 * (unchanged behavior already present in manageShopifyUser for that case).
 */
const fetchShopifyCustomer = async (shop, accessToken, customerId) => {
  console.log("[SHOPIFY CUSTOMER DEBUG] customer lookup attempted =", true);

  const full = await runShopifyCustomerQuery(
    shop,
    accessToken,
    `{
      customer(id: "gid://shopify/Customer/${customerId}") {
        id
        firstName
        lastName
        email
        createdAt
        numberOfOrders
      }
    }`,
  );

  if (full.customer) {
    console.log("[SHOPIFY CUSTOMER DEBUG] customer found =", true);
    return full.customer;
  }

  // HTTP-level failure (bad/expired token, network, shop unreachable) would
  // fail identically on a retry with different fields — no point trying
  // again, and doing so would just double-charge Shopify's rate limit for
  // no benefit.
  if (full.httpFailed) {
    console.log("[SHOPIFY CUSTOMER DEBUG] customer found =", false);
    return null;
  }

  // A clean response with no GraphQL errors and no customer really does
  // mean "no such customer" — retrying with fewer fields can't change that.
  if (!full.graphqlErrors) {
    console.log("[SHOPIFY CUSTOMER DEBUG] customer found =", false);
    return null;
  }

  console.warn(
    "[SHOPIFY CUSTOMER DEBUG] full customer query returned GraphQL errors — retrying with non-protected fields only (id/createdAt/numberOfOrders)",
  );

  const minimal = await runShopifyCustomerQuery(
    shop,
    accessToken,
    `{
      customer(id: "gid://shopify/Customer/${customerId}") {
        id
        createdAt
        numberOfOrders
      }
    }`,
  );

  console.log("[SHOPIFY CUSTOMER DEBUG] customer found =", Boolean(minimal.customer));
  return minimal.customer;
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
//       buildSessionResult(newUser, token, "Customer created successfully"), b
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

    // TEMPORARY debug — booleans/ids only, never email/name/tokens.
    console.log("[SHOPIFY CUSTOMER DEBUG] logged_in_customer_id present =", Boolean(customerId));

    // 3. Check existing user
    const existingUser = await User.findOne({
      shopifyCustomerId: String(customerId),
      shop_id: shopDoc._id,
    })
      .select("_id shop_id shopifyCustomerId fullname email")
      .lean();

    console.log("[SHOPIFY CUSTOMER DEBUG] DB user found =", Boolean(existingUser));

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

      console.log("[SHOPIFY CUSTOMER DEBUG] DB user created =", false);
      console.log("[SHOPIFY CUSTOMER DEBUG] identity resolved =", true);

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

    console.log("[SHOPIFY CUSTOMER DEBUG] customer found =", Boolean(customer));

    if (!customer) {
      console.log("[SHOPIFY CUSTOMER DEBUG] identity resolved =", false);
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

    // The userSchema `email` field is required+unique. When the Admin API
    // couldn't return the real email (fetchShopifyCustomer's protected-data
    // fallback — see that function's comment), a real email is genuinely
    // unavailable, not just unset — falling back to a shared placeholder
    // would collide on the schema's unique index for the second such
    // customer. This synthetic address is unique per (shop, Shopify
    // customer id) and is never used for actual communication.
    const email =
      customer.email ||
      `shopify-customer-${shopifyCustomerId}@${shop}.consultly-placeholder`;

    const newUser = new User({
      shopifyCustomerId,
      shop_id: shopDoc._id,
      userType: "customer",
      walletBalance: 0,
      email,
      fullname,
      isChatAccepted: "request",
      createdAt: customer.createdAt,
      numberOfOrders: customer.numberOfOrders,
      chatLock: true,
    });

    // Two near-simultaneous first-ever requests from the same brand-new
    // Shopify customer can both pass the findOne() check above and both
    // reach here — the userSchema partial unique index on
    // {shopifyCustomerId, shop_id} guarantees only one insert wins; this
    // catch reconciles the loser to that winner instead of failing its
    // request (and instead of ever producing a second User document).
    let createdUser = newUser;
    try {
      await newUser.save();
    } catch (saveErr) {
      if (saveErr?.code === 11000) {
        const winner = await User.findOne({
          shopifyCustomerId: String(customerId),
          shop_id: shopDoc._id,
        }).select("_id shop_id");
        if (!winner) throw saveErr; // genuinely unexpected — surface it
        createdUser = winner;
      } else {
        throw saveErr;
      }
    }

    const token = getOrCreateUserToken(createdUser._id);

    console.log("[SHOPIFY CUSTOMER DEBUG] DB user created =", createdUser === newUser);
    console.log("[SHOPIFY CUSTOMER DEBUG] identity resolved =", true);

    return cacheSession(
      shop,
      customerId,
      buildSessionResult(
        createdUser,
        token,
        createdUser === newUser
          ? "Customer created successfully"
          : "Customer already exists"
      )
    );
  } catch (error) {
    console.error(
      "Error fetching customer:",
      error.response?.data || error.message
    );
    console.log("[SHOPIFY CUSTOMER DEBUG] identity resolved =", false);

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
  getOrCreateUserToken,
};
