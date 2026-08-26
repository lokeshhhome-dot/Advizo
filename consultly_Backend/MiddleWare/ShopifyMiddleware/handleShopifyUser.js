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

// TEMPORARY TESTING FLAG — do not treat this as the production auth path.
// While the installed shop's token is missing read_customers (ACCESS_DENIED
// even on a bare `customer(id){ id }` query — see verifyShopifyCustomer's
// own comment), this lets Theme Extension / New Customer Accounts testing
// continue by trusting App-Proxy-verified logged_in_customer_id directly,
// skipping the Shopify Admin GraphQL existence check. The real
// verifyShopifyCustomer/fetchShopifyCustomerProfile implementations are left
// completely intact below and are exactly what runs again the moment this
// flag is unset — this is a bypass of ONE step, not a second auth system.
const TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL =
  String(process.env.TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL || "").toLowerCase() === "true";

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
    const httpStatus = err.response?.status || null;
    console.log("[SHOPIFY CUSTOMER DEBUG] API request success =", false);
    console.log("[SHOPIFY CUSTOMER DEBUG] HTTP status =", httpStatus);
    console.log("[SHOPIFY IDENTITY] GraphQL request success =", false);
    return {
      customer: null,
      httpFailed: true,
      graphqlErrors: false,
      httpStatus,
      errorCodes: [],
    };
  }

  console.log("[SHOPIFY CUSTOMER DEBUG] API request success =", true);
  console.log("[SHOPIFY IDENTITY] GraphQL request success =", true);

  const errors = Array.isArray(response.data?.errors) ? response.data.errors : [];
  const errorCodes = errors.map((e) => e.extensions?.code || "UNKNOWN");
  console.log("[SHOPIFY CUSTOMER DEBUG] GraphQL error present =", errors.length > 0);
  console.log("[SHOPIFY IDENTITY] GraphQL error present =", errors.length > 0);
  if (errors.length) {
    // Safe only — error message/code, never the customer payload itself.
    errorCodes.forEach((code) => {
      console.log("[SHOPIFY CUSTOMER DEBUG] GraphQL error code =", code);
      console.log("[SHOPIFY IDENTITY] GraphQL error code =", code);
    });
  }

  return {
    customer: response.data?.data?.customer || null,
    httpFailed: false,
    graphqlErrors: errors.length > 0,
    httpStatus: response.status,
    errorCodes,
  };
};

/**
 * ONE clean, minimal identity-verification query — no retries, no fallback
 * tiers. Earlier versions of this file retried with progressively fewer
 * fields on a GraphQL error, on the theory that only Protected Customer Data
 * fields (name/email/phone) could be denied. Confirmed-in-production logs
 * showed even this bare `{ id }` query getting ACCESS_DENIED, which retrying
 * with fewer fields can never fix — `id` is not protected data, so a denial
 * on it means the installed app's token doesn't have `read_customers`
 * granted AT ALL for this shop (see verifyAppInstallationScopes below),
 * which is a re-authorization problem, not a query-shape problem.
 *
 * Result shape: { customer, verified, reason, httpStatus, errorCodes }
 *   reason: "verified" | "not_found" | "http_failed" | "graphql_error"
 * Callers must branch on `reason`, never on `customer` truthiness alone.
 */
const verifyShopifyCustomer = async (shop, accessToken, customerId) => {
  const result = await runShopifyCustomerQuery(
    shop,
    accessToken,
    `{
      customer(id: "gid://shopify/Customer/${customerId}") {
        id
      }
    }`,
  );

  if (result.customer) {
    console.log("[SHOPIFY IDENTITY] GraphQL customer exists =", true);
    return { customer: result.customer, verified: true, reason: "verified" };
  }

  if (result.httpFailed) {
    return {
      customer: null,
      verified: false,
      reason: "http_failed",
      httpStatus: result.httpStatus,
    };
  }

  if (result.graphqlErrors) {
    // A permission/installation problem, unrelated to protected customer
    // data (id is never protected) — never silently treated as "not found".
    return {
      customer: null,
      verified: false,
      reason: "graphql_error",
      errorCodes: result.errorCodes,
    };
  }

  console.log("[SHOPIFY IDENTITY] GraphQL customer exists =", false);
  return { customer: null, verified: false, reason: "not_found" };
};

/**
 * Best-effort ONLY, called after verifyShopifyCustomer already succeeded —
 * never part of verification itself, never retried. name/email/firstName/
 * lastName are Shopify "protected customer data": querying them requires the
 * app to have completed Shopify's separate Protected Customer Data approval
 * (a Partner Dashboard review, independent of the read_customers/
 * write_customers OAuth scopes). A shop without that approval gets
 * ACCESS_DENIED here specifically; this function swallows that and returns
 * null so the caller falls back to its existing "Shopify Customer"
 * placeholder — it must never be able to fail identity verification.
 */
const fetchShopifyCustomerProfile = async (shop, accessToken, customerId) => {
  const result = await runShopifyCustomerQuery(
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
  return result.customer || null;
};

/**
 * Diagnostic only — introspects THIS installation's own granted OAuth
 * scopes via Shopify Admin GraphQL. Unlike a customer lookup, querying your
 * own app's accessScopes needs no particular scope beyond being installed at
 * all, so it succeeds even when read_customers itself is missing — which is
 * exactly what makes it useful for telling "token is fine but read_customers
 * was never granted to this specific installation" apart from "token/shop
 * itself is broken". Scope handles are permission names, not secrets.
 */
const verifyAppInstallationScopes = async (shop, accessToken) => {
  try {
    const response = await axios.post(
      `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
      {
        query: `{
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    const scopes = (
      response.data?.data?.currentAppInstallation?.accessScopes || []
    ).map((s) => s.handle);

    console.log("[SHOPIFY IDENTITY] granted scopes =", scopes.join(","));
    console.log(
      "[SHOPIFY IDENTITY] read_customers granted =",
      scopes.includes("read_customers"),
    );
    return scopes;
  } catch (err) {
    console.log(
      "[SHOPIFY IDENTITY] accessScopes lookup failed, HTTP status =",
      err.response?.status || null,
    );
    return null;
  }
};

/**
 * Shared Mongo find-or-create for a verified Shopify customer — used by both
 * the real verified path and the TEMPORARY bypass path below, so there is
 * exactly one User-creation implementation regardless of which one supplied
 * `verifiedCustomerId`/`profile`. `profile` may be null (bypass path, or the
 * real path when Protected Customer Data enrichment failed) — the same
 * existing placeholder-email/fullname rule applies either way.
 */
const createShopifyCustomerUser = async ({
  shop,
  shopDoc,
  customerId,
  verifiedCustomerId,
  profile,
  testAuthLogging = false,
}) => {
  const shopifyCustomerId = verifiedCustomerId;

  const fullname =
    [profile?.firstName, profile?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "Shopify Customer";

  // The userSchema `email` field is required+unique. When the Admin API
  // couldn't return the real email (fetchShopifyCustomerProfile's
  // protected-data limitation — see that function's comment — or the
  // bypass path, which never calls it at all), a real email is genuinely
  // unavailable, not just unset — falling back to a shared placeholder
  // would collide on the schema's unique index for the second such
  // customer. This synthetic address is unique per (shop, Shopify
  // customer id) and is never used for actual communication.
  const email =
    profile?.email ||
    `shopify-customer-${shopifyCustomerId}@${shop}.consultly-placeholder`;

  const newUser = new User({
    shopifyCustomerId,
    shop_id: shopDoc._id,
    userType: "customer",
    walletBalance: 0,
    email,
    fullname,
    isChatAccepted: "request",
    createdAt: profile?.createdAt,
    numberOfOrders: profile?.numberOfOrders,
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
  const wasCreated = createdUser === newUser;

  console.log("[SHOPIFY CUSTOMER DEBUG] DB user created =", wasCreated);
  console.log("[SHOPIFY CUSTOMER DEBUG] identity resolved =", true);
  console.log("[SHOPIFY IDENTITY] Mongo user created =", wasCreated);
  console.log("[SHOPIFY IDENTITY] Mongo user ID available =", true);
  console.log("[SHOPIFY IDENTITY] Mongo identity resolved =", true);
  if (testAuthLogging) {
    console.log("[SHOPIFY TEST AUTH] Mongo user created =", wasCreated);
    console.log("[SHOPIFY TEST AUTH] Mongo user ID available =", true);
  }

  return cacheSession(
    shop,
    customerId,
    buildSessionResult(
      createdUser,
      token,
      wasCreated ? "Customer created successfully" : "Customer already exists",
    ),
  );
};

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

    console.log("[SHOPIFY IDENTITY] Mongo shop found =", Boolean(shopDoc?.accessToken));

    // TEMPORARY TEST AUTH diagnostics — see TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL
    // above. Reaching this function at all means verifyAppProxy's HMAC check
    // already passed (resolveStorefrontCustomer/manageShopifyUser are only
    // ever called after that middleware calls next()).
    console.log("[SHOPIFY TEST AUTH] App Proxy verified =", true);
    console.log("[SHOPIFY TEST AUTH] Shop available =", Boolean(shop));
    console.log("[SHOPIFY TEST AUTH] Shopify customer ID available =", Boolean(customerId));
    console.log("[SHOPIFY TEST AUTH] GraphQL bypass enabled =", TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL);

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
      // Already verified once, at creation — an already-known
      // (shopifyCustomerId, shop) pair is not re-verified against Shopify on
      // every request (see needsNameRefresh below), matching this flow's own
      // idempotency requirement. Re-querying Shopify's Admin API on every
      // page load for a customer we've already confirmed exists would be
      // pure added latency/rate-limit cost with no security benefit — the
      // JWT/socket auth path is what actually gates any privileged action.
      console.log("[SHOPIFY IDENTITY] Shopify customer verified =", true);
      console.log("[SHOPIFY IDENTITY] Mongo user found =", true);
      console.log("[SHOPIFY IDENTITY] Mongo user created =", false);
      console.log("[SHOPIFY TEST AUTH] Mongo user found =", true);
      console.log("[SHOPIFY TEST AUTH] Mongo user created =", false);
      // The Shopify Admin API refresh only ever backfills a missing/default
      // fullname, so skip the API call entirely when the name is already set.
      // Skipped outright under the bypass flag — the same ACCESS_DENIED that
      // blocks verification would also block this, so there's no point
      // spending the round trip while it's active.
      const needsNameRefresh =
        !TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL &&
        (!existingUser.fullname ||
          existingUser.fullname.trim() === "" ||
          existingUser.fullname === "Shopify Customer");

      if (needsNameRefresh) {
        try {
          // Best-effort enrichment only — this existing user is already
          // trusted, so no re-verification against Shopify happens here.
          const profile = await fetchShopifyCustomerProfile(
            shop,
            await getShopAccessToken(shopDoc),
            customerId
          );

          if (profile) {
            const fullname =
              [profile.firstName, profile.lastName]
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
      console.log("[SHOPIFY IDENTITY] Mongo user ID available =", true);
      console.log("[SHOPIFY IDENTITY] Mongo identity resolved =", true);
      console.log("[SHOPIFY TEST AUTH] Mongo user ID available =", true);

      return cacheSession(
        shop,
        customerId,
        buildSessionResult(existingUser, token)
      );
    }

    // ======================================================
    // NEW USER
    // ======================================================

    // TEMPORARY TEST AUTH BYPASS — see TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL's
    // own comment at the top of this file. Trusts App-Proxy-verified
    // logged_in_customer_id directly as shopifyCustomerId, skipping
    // verifyShopifyCustomer entirely, then falls into the EXACT SAME Mongo
    // create logic used by the real path below (same schema, same
    // placeholder-email rule, same E11000 race-reconciliation) — this is not
    // a second user-creation implementation, only a different source for
    // `verifiedCustomerId`/`profile`.
    if (TEMP_BYPASS_SHOPIFY_CUSTOMER_GRAPHQL) {
      console.log("[SHOPIFY TEST AUTH] Mongo user found =", false);
      return createShopifyCustomerUser({
        shop,
        shopDoc,
        customerId,
        verifiedCustomerId: String(customerId),
        profile: null,
        testAuthLogging: true,
      });
    }

    const accessToken = await getShopAccessToken(shopDoc);
    const lookupResult = await verifyShopifyCustomer(shop, accessToken, customerId);

    console.log("[SHOPIFY CUSTOMER DEBUG] customer found =", Boolean(lookupResult.customer));
    console.log("[SHOPIFY IDENTITY] Shopify customer verified =", lookupResult.verified);

    // CASE B/C/D — never collapsed into one message. Only a genuine
    // "not_found" means the Shopify customer doesn't exist; http_failed and
    // graphql_error mean verification itself could not be completed (bad/
    // expired shop token, network issue, or a real API/permission problem
    // unrelated to protected-data fields) — a Mongo User must not be created
    // or reused off the back of either, but the caller needs to be able to
    // tell "customer really doesn't exist" apart from "we couldn't check".
    if (!lookupResult.verified) {
      console.log("[SHOPIFY CUSTOMER DEBUG] identity resolved =", false);
      console.log("[SHOPIFY IDENTITY] Mongo user found =", false);
      console.log("[SHOPIFY IDENTITY] Mongo user created =", false);
      console.log("[SHOPIFY IDENTITY] Mongo user ID available =", false);
      console.log("[SHOPIFY IDENTITY] Mongo identity resolved =", false);

      if (lookupResult.reason === "http_failed") {
        console.log(
          "[SHOPIFY IDENTITY] verification failed reason = http_failed, status =",
          lookupResult.httpStatus || null,
        );
        return {
          success: false,
          message: "Shopify authentication failed while verifying customer",
        };
      }

      if (lookupResult.reason === "graphql_error") {
        console.log(
          "[SHOPIFY IDENTITY] verification failed reason = graphql_error, codes =",
          (lookupResult.errorCodes || []).join(","),
        );
        // ACCESS_DENIED on a bare `{ id }` query cannot be a protected-data
        // problem (id is never protected) — it means this installation's
        // token itself is missing a scope it should have. Diagnostic-only,
        // read-only, and needs no scope beyond being installed at all — see
        // verifyAppInstallationScopes's own comment.
        await verifyAppInstallationScopes(shop, accessToken);
        return {
          success: false,
          message: "Shopify permission error while verifying customer",
        };
      }

      // reason === "not_found"
      return {
        success: false,
        message: "Customer not found in Shopify",
      };
    }

    console.log("[SHOPIFY IDENTITY] Mongo user found =", false);

    const shopifyCustomerId = lookupResult.customer.id.split("/").pop();

    // Best-effort enrichment, separate from verification — never blocks user
    // creation. Returns null (falling back to placeholders below) exactly as
    // before when the shop lacks Protected Customer Data approval.
    const profile = await fetchShopifyCustomerProfile(shop, accessToken, customerId);

    return createShopifyCustomerUser({
      shop,
      shopDoc,
      customerId,
      verifiedCustomerId: shopifyCustomerId,
      profile,
    });
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
