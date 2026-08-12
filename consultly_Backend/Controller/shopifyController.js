const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();
const { shopModel } = require("../Modal/shopify");
const {
  manageShopifyUser,
  resolveUserFromAppToken,
} = require("../MiddleWare/ShopifyMiddleware/handleShopifyUser");
const {
  renderShopifyPage,
  loadPageAssets,
  handleStorefrontPassword,
  resolvePageAssets,
} = require("../MiddleWare/ShopifyMiddleware/helperTheme");
const {
  registerAppUninstallWebhook,
} = require("../MiddleWare/ShopifyMiddleware/registerWebHook");
const { sendEmail } = require("../MiddleWare/ShopifyMiddleware/nodemailer");
const { resolveShopProfile } = require("../Utils/shopifyShopProfile");
const { setupStorefrontMenu } = require("../Utils/setupStorefrontMenu");
const { getConsultantsForShop } = require("./usersController");
const { getConsultantProfileForShop } = require("./consultantController");
const { getCommunicationStatus } = require("../services/subscriptionMinutes");
const mongoose = require("mongoose");
const {
  getAppBaseUrl,
  getOAuthRedirectUri,
  logOAuthRedirectUri,
  buildOAuthState,
  verifyOAuthState,
  logOAuthDebug,
} = require("../Utils/shopifyOAuth");
const { isValidShopDomain } = require("../Utils/shopValidator");
const {
  buildExpiringFields,
  rememberFreshInstallTokens,
} = require("../Utils/shopifyToken");
const { shopDocCache } = require("../Utils/ttlCache");

// Same key + shape as getShopDoc in handleShopifyUser, so both share entries.
const SHOP_DOC_CACHE_TTL_MS = 5 * 60 * 1000;
const getCachedShopDoc = (shop) =>
  shopDocCache.getOrSet(`shop:${shop}`, SHOP_DOC_CACHE_TTL_MS, () =>
    shopModel.findOne({ shop }).lean(),
  );

const APP_SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persist the app JWT so a later proxy hit can recover the shopper's session
 * even when Shopify leaves `logged_in_customer_id` off the request. Previously
 * only the chat page did this, so every other page had nothing to fall back to.
 */
const setAppSessionCookie = (res, token) => {
  if (!token) return;
  try {
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: APP_SESSION_COOKIE_MAX_AGE_MS,
    });
  } catch (err) {
    console.error("[proxy] could not set session cookie:", err.message);
  }
};

/**
 * Resolve the signed-in shopper for an app-proxy request.
 *
 * Shopify's `logged_in_customer_id` is the primary source, but it is missing on
 * a meaningful minority of proxy hits for customers who ARE logged in. When it
 * is absent we verify our own httpOnly app JWT before concluding the visitor is
 * anonymous — that single check is what stops a live customer being thrown to
 * accounts.shopify.com mid-call. Returns null only for a genuinely anonymous
 * visitor.
 */
const resolveStorefrontCustomer = async (req, shop) => {
  const customerId = req.query.logged_in_customer_id;
  const existingToken = req.cookies?.token;

  if (shop && customerId) {
    const result = await manageShopifyUser(shop, customerId, { existingToken });
    if (result?.success) return result;
    console.warn("[proxy] customer resolution failed:", result?.message);
    return null;
  }

  if (shop && !customerId) {
    const restored = await resolveUserFromAppToken(existingToken, shop);
    if (restored) {
      console.warn(
        "[proxy] logged_in_customer_id absent — session restored from app cookie",
      );
      return restored;
    }
  }

  return null;
};

/**
 * Storefront login URL that comes BACK to where the shopper was. Without
 * return_to they land on their account page and have to find the app again.
 */
const storefrontLoginUrl = (shop, returnPath = "/apps/consultly") =>
  `https://${shop}/account/login?return_to=${encodeURIComponent(returnPath)}`;

let axios, wrapper, CookieJar;
try {
  axios = require("axios");
  wrapper = require("axios-cookiejar-support").wrapper;
  CookieJar = require("tough-cookie").CookieJar;
} catch (e) { }

const frontendUrl = process.env.FRONTEND_URL;

const resolveFrontendUrl = (req) => {
  const envUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  const host = (req.get("host") || "").split(",")[0].trim();
  const isUsableHost =
    host &&
    host.includes(".") &&
    !host.includes("localhost") &&
    !host.startsWith("127.") &&
    !host.startsWith("0.0.0.0") &&
    !host.endsWith("myshopify.com");

  if (isUsableHost) {
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https")
      .split(",")[0]
      .trim();
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return envUrl;
};

const client_id = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES;

const appIsInstalled = async (req, res) => {
  const { shop } = req.params;
  if (!shop) return res.status(400).send("Missing shop param");
  const shopDoc = await shopModel.findOne({ shop: shop });
  if (shopDoc?.accessToken) {
    return res.status(200).send({
      installed: true,
    });
  } else {
    return res.status(200).send({
      installed: false,
    });
  }
};


const installShopifyApp = async (req, res) => {
  console.log("installShopifyApp is running ....");

  if (!client_id || !SHOPIFY_API_SECRET) {
    return res.status(500).send("client_id or SHOPIFY_API_SECRET is not set");
  }

  const shop = isValidShopDomain(req.params.shop);
  if (!shop) {
    return res.status(400).send("Invalid shop domain");
  }

  // The session token's `dest` (set by verifyShopifyToken) is the shop that
  // authenticated this request — it must be the shop being installed.
  if (req.shop && req.shop !== shop) {
    return res.status(403).send("Shop does not match session token");
  }

  const installUrl =
    `${process.env.BACKEND_HOST_DOMAIN}/api/app/install/begin?shop=${encodeURIComponent(shop)}`;

  const shopDoc = await shopModel.findOne({ shop });

  if (shopDoc?.accessToken) {
    return res.status(200).send({
      installed: true,
      adminId: shopDoc._id,
    });
  }

  return res.status(200).send({
    installed: false,
    installUrl,
  });
};

/**
 * Top-level OAuth entry point. The frontend navigates the WHOLE browser here
 * (App Bridge Redirect.REMOTE), so this response's Set-Cookie is first-party
 * for our domain and is reliably sent back on Shopify's top-level redirect
 * to /api/app/callback — in every browser, including Safari.
 */
const beginOAuth = async (req, res) => {
  if (!client_id || !SHOPIFY_API_SECRET) {
    return res.status(500).send("client_id or SHOPIFY_API_SECRET is not set");
  }

  const shop = isValidShopDomain(req.query.shop);
  if (!shop) {
    return res.status(400).send("Invalid shop domain");
  }

  // Cryptographically random nonce, HMAC-bound to this shop + timestamp.
  const state = buildOAuthState(shop);

  // First-party CSRF cookie. SameSite=Lax is correct here: Shopify's redirect
  // back to the callback is a cross-site TOP-LEVEL GET navigation, which Lax
  // cookies accompany — no need for the weaker SameSite=None.
  res.cookie("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  });

  const redirectUri = getOAuthRedirectUri(req);
  console.log("redirectUri", redirectUri)
  logOAuthRedirectUri(redirectUri, "beginOAuth");
  logOAuthDebug("beginOAuth", {
    shop,
    generatedState: state,
    redirectUri,
    timestamp: new Date().toISOString(),
  });

  const installUrl =
    `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(client_id)}` +
    `&scope=${encodeURIComponent(SCOPES || "")}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;
  console.log("installUrl", installUrl)

  return res.redirect(installUrl);
};

const saveInstalledShop = async (shop, accessToken, shopProfile, expiringFields = null) => {
  const shopPayload = {
    shop,
    accessToken,
    // Expiring-token lifecycle fields; null for legacy non-expiring installs.
    refreshToken: expiringFields?.refreshToken || null,
    accessTokenExpiresAt: expiringFields?.accessTokenExpiresAt || null,
    refreshTokenExpiresAt: expiringFields?.refreshTokenExpiresAt || null,
    shopId: shopProfile.shopId,
    email: shopProfile.shopEmail,
    shopName: shopProfile.shopName,
    shopOwnerName: shopProfile.shopOwnerName,
    shopEmail: shopProfile.shopEmail,
    myshopifyDomain: shopProfile.myshopifyDomain,
    installedAt: new Date(),
    currency: shopProfile.currency || "$",
    currencyCode: shopProfile.currencyCode || "",
  };

  const existingShop = await shopModel.findOne({ shop });

  if (existingShop) {
    Object.assign(existingShop, shopPayload);
    await existingShop.save();
    return existingShop;
  }

  return shopModel.create({
    ...shopPayload,
    menuSetupComplete: true,
    appEnabled: false,
    planStatus: "new",
    isWelcomeShown: false,
  });
};

const authCallback = async (req, res) => {
  try {
    const { shop, hmac, code, state, host, timestamp } = req.query;
    if (!shop || !hmac || !code) {
      return res.status(400).send("Missing required parameters");
    }

    if (!isValidShopDomain(shop)) {
      return res.status(400).send("Invalid shop domain");
    }

    const rawQuery = (req.originalUrl.split("?")[1] || "");
    const message = rawQuery
      .split("&")
      .filter((pair) => !pair.startsWith("hmac=") && !pair.startsWith("signature="))
      .sort()
      .join("&");

    const generatedHmac = crypto
      .createHmac("sha256", SHOPIFY_API_SECRET)
      .update(message)
      .digest("hex");

    const a = Buffer.from(generatedHmac, "utf8");
    const b = Buffer.from(String(hmac).toLowerCase(), "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).send("HMAC validation failed");
    }

    const cookieState = req.cookies?.shopify_oauth_state;
    const stateCheck = verifyOAuthState(state, shop);

    logOAuthDebug("authCallback", {
      shop,
      host,
      timestamp,
      queryState: state,
      cookieState: cookieState || "(no cookie)",
      signatureCheck: stateCheck.reason,
      cookieComparison: cookieState
        ? String(state) === String(cookieState)
          ? "match"
          : "MISMATCH"
        : "absent",
    });


    const restartUrl =
      `${process.env.BACKEND_HOST_DOMAIN}/api/app/install/begin?shop=${encodeURIComponent(shop)}`;

    if (!state || !stateCheck.valid) {
      logOAuthDebug("authCallback", {
        action: "restarting OAuth — invalid state",
        restartUrl,
      });
      return res.redirect(restartUrl);
    }
    if (cookieState && String(state) !== String(cookieState)) {
      logOAuthDebug("authCallback", {
        action: "restarting OAuth — cookie/state mismatch",
        restartUrl,
      });
      return res.redirect(restartUrl);
    }


    res.clearCookie("shopify_oauth_state", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    const redirectUri = getOAuthRedirectUri(req);
    console.log("redirectUri", redirectUri)
    logOAuthRedirectUri(redirectUri, "authCallback");

    // `expiring: 1` opts in to Shopify's expiring offline tokens (mandatory
    // for new public apps). Older apps that don't support it simply return a
    // legacy non-expiring token with no refresh_token — both are handled.
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: client_id,
        client_secret: SHOPIFY_API_SECRET,
        code,
        redirect_uri: redirectUri,
        expiring: 1,
      },
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(400).send("Failed to get access token");
    }

    const expiringFields = buildExpiringFields(tokenResponse.data);
    console.log(
      `[authCallback] OAuth completed for ${shop} (${expiringFields ? "expiring" : "legacy"} token)`,
    );

    const shopProfile = await resolveShopProfile(shop, accessToken);
    const existingShop = await shopModel
      .findOne({ shop })
      .select("_id accessToken");
    const wasInstalledBefore = Boolean(existingShop?.accessToken);

    const shopDoc = await saveInstalledShop(shop, accessToken, shopProfile, expiringFields);
    rememberFreshInstallTokens(shopDoc._id, accessToken, expiringFields);
    shopDocCache.delete(`shop:${shop}`);

    console.log(`[authCallback] Shop saved for ${shop}, adminId=${shopDoc._id}`);

    // Managed pricing: the merchant may have bought a plan from the App Store
    // BEFORE this (re)install — sync any already-active charge now so they
    // land on a working app instead of being bounced to the pricing page.
    try {
      const {
        syncActiveRecurringCharge,
      } = require("./adminPrincingController");
      await syncActiveRecurringCharge(shopDoc);
    } catch (error) {
      console.error(
        "[authCallback] charge sync failed:",
        error?.message || error,
      );
    }

    setupStorefrontMenu(shop, accessToken).catch((error) => {
      console.error(
        "[authCallback] setupStorefrontMenu error:",
        error?.message || error,
      );
    });
    console.log("shopProfile", shopProfile)
    if (!wasInstalledBefore) {
      sendEmail({ ownerEmail: shopProfile.shopEmail, userInstall: true });
    }

    const AdminUser = shopDoc;
    if (!AdminUser) {
      return res.status(400).send("Admin user not found");
    }
    /** Delete All App Uninstall Webhooks */
    // await deleteAllAppUninstallWebhooks(shop, accessToken);
    /** Register Order Paid Webhook */

    // await registerAppUninstallWebhook(shop, accessToken);
    const AdminiId = AdminUser._id;
    let finalHost = host;
    if (!finalHost || !finalHost.startsWith("YWRtaW4")) {
      const shopDomain = shop.replace(".myshopify.com", "");
      const hostString = `admin.shopify.com/store/${shopDomain}`;
      finalHost = Buffer.from(hostString).toString("base64");
    } else {
      console.log("✅ Using Shopify provided host");
    }

    const redirectUrl =
      `${frontendUrl}/?` +
      new URLSearchParams({
        shop: shop,
        host: finalHost,
        embedded: "1",
        adminId: AdminiId.toString(),
        source: "shopify_auth",
        timestamp: Date.now().toString(),
        session: require("crypto").randomBytes(16).toString("hex"),
      }).toString();

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ Auth callback error:", error.message || error);
    return res.status(500).send("Failed to complete authentication");
  }
};

/** Proxy for Shopify Theme Assets
 * 1. GET /apps/theme/header?shop=store.myshopify.com
 * 2. GET /apps/theme/footer?shop=store.myshopify.com
 */

const proxyThemeAssetsController = async (req, res) => {
  try {
    const shop = req.query.shop;
    const themeId = req.query.theme_id;
    const customerId = req.query.logged_in_customer_id;
    const cookieHeader = req.headers.cookie || "";
    const userAgent = req.headers["user-agent"] || "node";
    // Kicked off in parallel with the theme scrape, as before.
    const userPromise = resolveStorefrontCustomer(req, shop);

    let client = null;
    let { headHtml: extractedHead, headerHtml, footerHtml, needsPassword } =
      await loadPageAssets(shop, themeId, cookieHeader, userAgent, null);

    if (needsPassword) {
      client = await handleStorefrontPassword(shop, userAgent);
      if (!client) {
        return res
          .status(401)
          .send("Storefront locked. Enter password or use preview.");
      }
      ({ headHtml: extractedHead, headerHtml, footerHtml } = await loadPageAssets(
        shop,
        themeId,
        cookieHeader,
        userAgent,
        client,
      ));
    }

    const userResult = await userPromise;
    const token = userResult?.token;
    let shopDocId = userResult?.shop_id;
    if (!shopDocId && shop) {
      shopDocId = (await getCachedShopDoc(shop))?._id;
    }

    if (userResult && !userResult.success) {
      console.log("⚠️ Customer registration failed:", userResult.message);
    }

    // Refresh the session cookie on the landing page so every later proxy hit
    // (call window, profile, chat) can recover this identity if Shopify drops
    // logged_in_customer_id from that request.
    setAppSessionCookie(res, token);

    const headHtml =
      extractedHead || `<head><meta charset="UTF-8"><title>App</title></head>`;

    const finalHead = headHtml.replace(
      "</head>",
      `
        <style>
          header{
            position:relative;
            z-index:999;
            overflow:visible;
          }

          details[open].menu-opening>.menu-drawer, details[open].menu-opening>.menu-drawer__submenu {
              transform: translate(0);
              visibility: visible;
          }
          details[open]>.menu-drawer, details[open]>.menu-drawer__submenu {
              transition: transform var(--duration-default) ease, visibility var(--duration-default) ease;
          }

          .menu-drawer{
            z-index:999999!important;
            height: calc(100vh - 100%);
              height: calc(var(--viewport-height, 100vh) - (var(--header-bottom-position, 100%)));
          }


          details[open].menu-opening > .menu-drawer,
          details[open].menu-opening > .menu-drawer__submenu{
            transform:translate(0)!important;
            visibility:visible!important;
          }

          .menu-drawer{
            z-index:999999!important;
          }
        </style>
        </head>
      `
    );
    const pageHtml = `
          <!DOCTYPE html>
          <html>
            ${finalHead}
            <body style="margin:0;padding:0;">
                <script>
                    const customerId = ${JSON.stringify(String(customerId || ""))};
                </script>
              <!-- No min-height on main: the iframe auto-sizes to content, so
                   the footer sits right below short content instead of a full
                   viewport lower. -->
                 <main style="margin:0;">
                  <!-- Positioned wrapper: anchors the theme's absolute-
                       positioned mobile menu drawer (top:100%) to the header
                       instead of the bottom of the document. -->
                  <div style="position:relative;z-index:20;">
                 
                   ${headerHtml}
                  
                  </div>
                 
                  <iframe
                    id="agora-frame"
                    src="${resolveFrontendUrl(req)}/consultant-cards?customerId=${userResult?.userId || ""}&shopid=${shopDocId || ""}&shop=${shop}&authToken=${encodeURIComponent(token || "")}"
                    style="border:none;width:100%;min-height:200px;display:block;"
                  ></iframe>
                  ${footerHtml}
              </main>

              <!-- Parent script (MUST HAVE) -->
              <script src="https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.3.6/iframeResizer.min.js"></script>
              <script>
                iFrameResize({
                  checkOrigin: false,
                  autoResize: true,
                  heightCalculationMethod: "bodyScroll",
                  minHeight: 200,
                }, "#agora-frame");
              </script>
            </body>
          </html>
          `;
    if (token) {
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    res.set("Cache-Control", "no-store");
    return res.status(200).send(pageHtml);
  } catch (e) {
    console.error("/apps/agora error:", e);
    return res.status(500).send("Failed to compose Shopify header/footer");
  }
};

/**
 * JSON App Proxy endpoint for the Theme App Extension's Consultant Profile
 * block. Same identity resolution as proxyConsultantsJson below, and the
 * exact same consultant query as the existing
 * /api-consultant/consultant-by-shop-id-and-consultant-id/:shop_id/:consultant_id
 * REST route (getConsultantProfileForShop) — no second, slightly different
 * query. Unlike that REST route, this one deliberately strips
 * walletBalance before responding: that field is the consultant's own
 * financial data and has no business reaching an anonymous storefront
 * visitor, even though the shared query still selects it for the
 * admin/consultant-dashboard callers that need it.
 */
const proxyConsultantProfileJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    const consultantId = req.params.id;

    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid consultant id" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    const token = userResult?.token;

    let shopDocId = userResult?.shop_id;
    if (!shopDocId) {
      shopDocId = (await getCachedShopDoc(shop))?._id;
    }
    if (!shopDocId) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    setAppSessionCookie(res, token);

    // The query itself enforces shop ownership (shop_id filter) — a
    // consultant id from a different shop simply won't match, regardless of
    // what the caller passes in the URL.
    const consultant = await getConsultantProfileForShop(
      String(shopDocId),
      consultantId,
    );

    if (!consultant) {
      return res
        .status(404)
        .json({ success: false, message: "Consultant not found" });
    }

    // Same shop-level minute-pool flag the listing endpoint exposes — reused
    // via the existing service, not recomputed differently here.
    const commStatus = await getCommunicationStatus(String(shopDocId));

    const safeConsultant = {
      id: consultant._id,
      fullname: consultant.fullname,
      displayName: consultant.displayName,
      profileImage: consultant.profileImage
        ? `${process.env.APP_URL}/${String(consultant.profileImage).replace(/\\/g, "/")}`
        : null,
      profession: consultant.profession,
      specialization: consultant.specialization,
      experience: consultant.experience,
      language: consultant.language,
      voicePerMinute: consultant.voicePerMinute,
      videoPerMinute: consultant.videoPerMinute,
      chatPerMinute: consultant.chatPerMinute,
      isActive: consultant.isActive,
      isBusy: consultant.isBusy,
      bio: consultant.bio,
      // walletBalance intentionally omitted — see function comment above.
    };

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      authenticated: Boolean(userResult?.userId),
      customerId: userResult?.userId || null,
      shopId: String(shopDocId),
      communicationDisabled: !commStatus.allowed,
      consultant: safeConsultant,
    });
  } catch (err) {
    console.error("[app-proxy] /consultly/consultant/:id error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load consultant" });
  }
};

/**
 * JSON App Proxy endpoint for the Theme App Extension's Consultant Card
 * block. Same shopper-identity resolution and consultant data source as
 * proxyThemeAssetsController above — reuses resolveStorefrontCustomer
 * (logged_in_customer_id -> manageShopifyUser, else app-JWT-cookie fallback
 * via resolveUserFromAppToken) and getConsultantsForShop (same query +
 * cache as the existing /public/find-consultant/:shop_id REST route).
 * Unlike proxyThemeAssetsController, this does NOT scrape the theme
 * header/footer and does NOT render an iframe/HTML page — JSON only.
 */
const proxyConsultantsJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res
        .status(400)
        .json({ success: false, message: "Missing shop" });
    }

    // Anonymous shoppers are a valid case here (the listing is public) —
    // resolveStorefrontCustomer returns null rather than rejecting them.
    const userResult = await resolveStorefrontCustomer(req, shop);
    const token = userResult?.token;

    let shopDocId = userResult?.shop_id;
    if (!shopDocId) {
      shopDocId = (await getCachedShopDoc(shop))?._id;
    }
    if (!shopDocId) {
      return res
        .status(404)
        .json({ success: false, message: "Shop not found" });
    }

    // Same session-recovery cookie the HTML pages set today — lets a later
    // app-proxy hit (this endpoint or any other) recover identity on a
    // request where Shopify omits logged_in_customer_id. The JWT itself is
    // NOT put in the JSON body; this endpoint's job is the public listing,
    // not issuing bearer tokens to the storefront.
    setAppSessionCookie(res, token);

    const { consultants, communicationDisabled } = await getConsultantsForShop(
      String(shopDocId),
    );

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      authenticated: Boolean(userResult?.userId),
      customerId: userResult?.userId || null,
      shopId: String(shopDocId),
      findConsultant: consultants,
      communicationDisabled,
    });
  } catch (err) {
    console.error("[app-proxy] /consultly/consultants error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load consultants" });
  }
};

const proxyShopifyConsultantPage = async (req, res) => {
  try {
    const shop = req.query.shop;
    const themeId = req.query.theme_id;
    const cookieHeader = req.headers.cookie || "";
    const userAgent = req.headers["user-agent"] || "node";

    let client = null;
    let { headHtml: extractedHead, headerHtml, footerHtml, needsPassword } =
      await loadPageAssets(shop, themeId, cookieHeader, userAgent, null);

    if (needsPassword) {
      client = await handleStorefrontPassword(shop, userAgent);
      if (!client) {
        return res.status(401).send("Storefront locked. Provide password.");
      }
      ({ headHtml: extractedHead, headerHtml, footerHtml } = await loadPageAssets(
        shop,
        themeId,
        cookieHeader,
        userAgent,
        client,
      ));
    }

    const headHtml =
      extractedHead || `<head><meta charset="UTF-8"><title>App</title></head>`;

    const finalHead = headHtml.replace(
      "</head>",
      `
        <style>
          header{
            position:relative;
            z-index:999;
            overflow:visible;
          }

          details[open].menu-opening>.menu-drawer, details[open].menu-opening>.menu-drawer__submenu {
              transform: translate(0);
              visibility: visible;
          }
          details[open]>.menu-drawer, details[open]>.menu-drawer__submenu {
              transition: transform var(--duration-default) ease, visibility var(--duration-default) ease;
          }

          .menu-drawer{
            z-index:999999!important;
            height: calc(100vh - 100%);
              height: calc(var(--viewport-height, 100vh) - (var(--header-bottom-position, 100%)));
          }


          details[open].menu-opening > .menu-drawer,
          details[open].menu-opening > .menu-drawer__submenu{
            transform:translate(0)!important;
            visibility:visible!important;
          }

          .menu-drawer{
            z-index:999999!important;
          }
        </style>
        </head>
      `
    );
    const pageHtml = `
        <!DOCTYPE html>
        <html>
          ${finalHead}
          <body style="margin:0;padding:0;display:flex;flex-direction:column;">
            <header id="proxy-header"
              style="flex-shrink:0;position:relative;z-index:999;">
            ${headerHtml}
            </header>
             
            <main style="position:relative;">
              <iframe
                id="agora-iframe"
                src="${resolveFrontendUrl(req)}/login?shop=${shop}"
                style="border:none;width:100%;min-height:200px;display:block;"
              ></iframe>
            </main>
  
            <footer style="flex-shrink:0;">${footerHtml}</footer>
  
            <!-- Parent script (MUST HAVE) -->
            <script src="https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.3.6/iframeResizer.min.js"></script>
            <script>
              iFrameResize({
                checkOrigin: false,
                autoResize: true,
                heightCalculationMethod: "bodyScroll",
                minHeight: 200,
              }, "#agora-iframe");
            </script>
          </body>
        </html>
      `;

    res.set("Cache-Control", "no-store");
    res.status(200).send(pageHtml);
  } catch (e) {
    console.error("proxy error:", e);
    return res.status(500).send("Failed to compose Shopify header/footer");
  }
};

const proxyShopifyConsultantLoginPage = (req, res) => {
  const shop = req.query.shop;
  return renderShopifyPage(
    req,
    res,
    `${resolveFrontendUrl(req)}/consultant-dashboard?shop=${shop}`,
    (chat = "chatSection"),
    {
      title: "Consultant App",
      // Lock the dashboard iframe to the viewport height and let the dashboard
      // scroll internally, instead of auto-growing without limit.
      fixedHeight: true,
    },
  );
};

const proxySHopifyConsultantChat = (req, res) => {
  const shop = req.query.shop;
  // Chat surfaces are ALWAYS full viewport height with internal scrolling
  // (fixedHeight) — never content-sized like the cards/profile pages.
  return renderShopifyPage(
    req,
    res,
    `${resolveFrontendUrl(req)}/consulant-chats?shop=${shop}`,
    "",
    {
      title: "Consultant Chat",
      fixedHeight: true,
    },
  );
};

const proxyShopifyViewProfile = async (req, res) => {
  const shop = req.query.shop;
  const consultantId = req.query.consultantId || "";
  let shopId = req.query.shopId || "";
  if (!shopId && shop) {
    const shopDoc = await getCachedShopDoc(shop);
    shopId = shopDoc?._id?.toString() || "";
  }
  // Hand the shopper's identity to the page like the cards/chat/profile proxies
  // do. Without it this page could only read localStorage, so a cleared key made
  // a signed-in customer look anonymous and its call button redirected them to
  // the Shopify account login. Anonymous browsing still works — no redirect.
  let customerParams = "";
  const customerSession = await resolveStorefrontCustomer(req, shop);
  if (customerSession?.userId) {
    setAppSessionCookie(res, customerSession.token);
    customerParams =
      `&customerId=${encodeURIComponent(String(customerSession.userId))}` +
      `&authToken=${encodeURIComponent(customerSession.token || "")}`;
  }

  const iframeUrl = `${resolveFrontendUrl(req)}/view-profile?consultantId=${consultantId}&shopId=${shopId}&shop=${shop}${customerParams}`;

  return renderShopifyPage(req, res, iframeUrl, {
    title: "Consultant Profile",
  });
};

const proxyShopifyChatSection = async (req, res) => {
  const shop = req.query.shop;
  const consultantId = req.query.consultantId || "";

  const [result, assets, shopDoc] = await Promise.all([
    resolveStorefrontCustomer(req, shop),
    resolvePageAssets(req),
    shop ? getCachedShopDoc(shop) : Promise.resolve(null),
  ]);

  if (assets?.error === "password") {
    return res.status(401).send("Storefront locked. Provide password.");
  }

  // Only a genuinely anonymous visitor is sent to log in — and with return_to,
  // so they come back to the chat instead of being stranded on their account.
  if (!result?.userId) {
    console.warn("[chats-c] anonymous visitor — redirecting to storefront login");
    return res.redirect(
      storefrontLoginUrl(
        shop,
        `/apps/consultly/chats-c?consultantId=${encodeURIComponent(consultantId)}`,
      ),
    );
  }

  const authToken = result?.token || "";
  const mongoUserId = result?.userId ? String(result.userId) : "";
  const shopDocId = shopDoc?._id ? String(shopDoc._id) : "";

  // Pass customerId + shopid + authToken into the iframe so UserChat/socket can connect.
  const iframeUrl =
    `${resolveFrontendUrl(req)}/chats?consultantId=${encodeURIComponent(consultantId)}` +
    `&shop=${encodeURIComponent(shop || "")}` +
    `&customerId=${encodeURIComponent(mongoUserId)}` +
    `&shopid=${encodeURIComponent(shopDocId)}` +
    `&authToken=${encodeURIComponent(authToken)}`;

  if (authToken) {
    res.cookie("token", authToken, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  // Chat is ALWAYS full viewport height with internal scrolling.
  return renderShopifyPage(req, res, iframeUrl, "chatSection", {
    title: "Chat Section",
    preloadedAssets: assets,
    fixedHeight: true,
  });
};

const proxyProfileSection = async (req, res) => {
  const shop = req.query.shop;
  const customerId = req.query.logged_in_customer_id;

  const [userId, assets] = await Promise.all([
    resolveStorefrontCustomer(req, shop),
    resolvePageAssets(req),
  ]);

  if (assets?.error === "password") {
    return res.status(401).send("Storefront locked. Provide password.");
  }

  // Anonymous visitor: render the page anyway with a flag, so the app shows its
  // own "Sign in Required" panel inside the storefront. A 302 to /account/login
  // here is what threw shoppers straight to accounts.shopify.com before they
  // were told why — and on new customer accounts that page is a full auth flow.
  const anonymous = !userId?.userId;
  if (anonymous) {
    console.warn("[profile] anonymous visitor — rendering sign-in prompt");
  } else {
    setAppSessionCookie(res, userId.token);
  }

  const shopIdParams = userId?.shop_id?.toString() || "";
  const iframeUrl =
    `${resolveFrontendUrl(req)}/profile?&shop=${shop}` +
    `&logged_in_customer_Id=${customerId || ""}` +
    `&userId=${userId?.userId || ""}` +
    `&shopId=${shopIdParams}` +
    `&authToken=${encodeURIComponent(userId?.token || "")}` +
    (anonymous ? "&requiresLogin=1" : "");
  return renderShopifyPage(req, res, iframeUrl, {
    title: "Profile Section",
    preloadedAssets: assets,
  });
};
const proxyShopifyCallAccepted = (req, res) => {
  console.log("============== VIDEO PAGE HIT ==============");
  console.log("Original URL:", req.originalUrl);
  console.log("Query:", req.query);
  const shop = req.query.shop;
  const token = req.query.token;
  const callerId = req.query.callerId;
  const receiverId = req.query.receiverId;
  const channelName = req.query.channelName;
  const callType = req.query.callType;
  const uid = req.query.uid;
  const userId = req.query.userId;
  const userType = req.query.userType;
  const shopId = req.query.shopId;
  const returnUrl = req.query.returnUrl;
  const appId = req.query.appId;
  // App JWT — must be forwarded into the iframe or the call window cannot
  // authenticate its socket/API when localStorage is stale.
  const authToken = req.query.authToken;

  const params = new URLSearchParams();
  if (callerId) params.set("callerId", callerId);
  if (receiverId) params.set("receiverId", receiverId);
  if (callType) params.set("callType", callType);
  if (channelName) params.set("channelName", channelName);
  if (uid) params.set("uid", uid);
  if (token) params.set("token", token);
  if (userId) params.set("userId", userId);
  if (userType) params.set("userType", userType);
  if (shop) params.set("shop", shop);
  if (shopId) params.set("shopId", shopId);
  if (returnUrl) params.set("returnUrl", returnUrl);
  if (appId) params.set("appId", appId);
  if (authToken) params.set("authToken", authToken);

  // The call UI is ALWAYS full viewport height (fixedHeight) — a content-
  // sized iframe would squash the call screen.
  return renderShopifyPage(
    req,
    res,
    `${resolveFrontendUrl(req)}/video/calling/page?${params.toString()}`,
    "",
    {
      title: "Call Accepted",
      fixedHeight: true,
    },
  );
};

module.exports = {
  installShopifyApp,
  beginOAuth,
  authCallback,
  // shopifyLogin,
  appIsInstalled,
  proxyThemeAssetsController,
  proxyConsultantsJson,
  proxyConsultantProfileJson,
  proxyShopifyConsultantPage,
  proxyShopifyConsultantLoginPage,
  proxySHopifyConsultantChat,
  proxyShopifyViewProfile,
  proxyShopifyChatSection,
  proxyProfileSection,
  proxyShopifyCallAccepted,
};
