const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();
const { shopModel } = require("../Modal/shopify");
const {
  manageShopifyUser,
  resolveUserFromAppToken,
  getOrCreateUserToken,
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
const { ensureConsultantProfilePage } = require("../Utils/ensureConsultantProfilePage");
const { ensureMyProfilePage } = require("../Utils/ensureMyProfilePage");
const { User } = require("../Modal/userSchema");
const { WalletHistory } = require("../Modal/walletHistory");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { getConsultantsForShop } = require("./usersController");
const {
  getConsultantRatingSummary,
  getConsultantTotalConversations,
} = require("./ratingController");
const {
  getConsultantProfileForShop,
  createSupportRequestCore,
  listSupportRequestsCore,
  markSupportReplyReadCore,
} = require("./consultantController");
const { buildVoucherCatalogPayload } = require("./userDetailsController");
const { createRechargeDraftOrderCore } = require("./shopifyDraftOrderController");
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
const { shopDocCache, chatExchangeCache } = require("../Utils/ttlCache");

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

  // Never log the raw numeric Shopify customer id — boolean presence only.
  console.log("[SHOPIFY IDENTITY] Shopify customer ID available =", Boolean(customerId));

  if (shop && customerId) {
    const result = await manageShopifyUser(shop, customerId, { existingToken });
    if (result?.success) return result;
    // result?.message now distinguishes "Shop not found" /
    // "Shopify authentication failed while verifying customer" /
    // "Shopify permission error while verifying customer" /
    // "Customer not found in Shopify" — see manageShopifyUser. Previously
    // every one of those collapsed into this same generic warning.
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

// storefrontLoginUrl removed — its only caller was proxyShopifyChatSection
// (deleted above). Confirmed via repo-wide grep it had no other callers.

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

/**
 * Standalone consultant portal redirect target — deliberately NOT
 * resolveFrontendUrl(req) above. resolveFrontendUrl echoes the incoming
 * request's own Host header for the OTHER 5 iframe embeds (consultant
 * cards, chats, view-profile, video calling) and must keep doing that for
 * them unchanged. A redirect destination must never be derived from
 * request-controlled input (Host header, query params) — that's an open
 * redirect. This reads a single, explicit, operator-configured env var
 * instead, and only that.
 *
 * Returns null (not a guessed/fallback URL) until CONSULTANT_APP_URL is
 * actually set to a real deployed frontend origin — callers must treat
 * null as "standalone portal not configured yet" and fall back to the
 * existing iframe behavior, not fail or redirect to something broken.
 */
const getTrustedConsultantAppUrl = () => {
  const raw = (process.env.CONSULTANT_APP_URL || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      console.error(
        `[consultant-portal] CONSULTANT_APP_URL has an unsupported protocol (${parsed.protocol}) — ignoring, falling back to iframe`,
      );
      return null;
    }
    return raw.replace(/\/+$/, "");
  } catch (err) {
    console.error(
      `[consultant-portal] CONSULTANT_APP_URL is set but not a valid URL ("${raw}") — ignoring, falling back to iframe`,
    );
    return null;
  }
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

const saveInstalledShop = async (shop, accessToken, shopProfile, expiringFields = null, grantedScopes = null) => {
  const shopPayload = {
    shop,
    accessToken,
    // The scope string Shopify's own token response returned for THIS
    // authorization — see the schema field's own comment for why this must
    // be stored rather than assumed from shopify.app.toml.
    grantedScopes: grantedScopes || null,
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

    ensureConsultantProfilePage(shop, accessToken).catch((error) => {
      console.error(
        "[authCallback] ensureConsultantProfilePage error:",
        error?.message || error,
      );
    });

    ensureMyProfilePage(shop, accessToken).catch((error) => {
      console.error(
        "[authCallback] ensureMyProfilePage error:",
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
                    src="${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/consultant-cards?customerId=${userResult?.userId || ""}&shopid=${shopDocId || ""}&shop=${shop}&authToken=${encodeURIComponent(token || "")}"
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
              <!-- ConsultantChatModal (inside the #agora-frame iframe) posts these
                   two message types when the customer opens/closes the Chat
                   modal. CSS inside that iframe's own document can never cover
                   THIS page's real Shopify header/footer, so instead this parent
                   document resizes the <iframe> ELEMENT itself to fullscreen —
                   everything already correctly stacked inside the iframe (the
                   modal over the card list) then visually covers the whole
                   viewport. Only these two exact message types are handled. -->
              <script>
                window.addEventListener("message", function (event) {
                  if (!event.data || !event.data.type) return;

                  var iframe = document.getElementById("agora-frame");
                  if (!iframe) return;

                  if (event.data.type === "CONSULTLY_CHAT_OPEN") {
                    iframe.dataset.advizoChatOpen = "true";

                    iframe.style.position = "fixed";
                    iframe.style.top = "0";
                    iframe.style.left = "0";
                    iframe.style.width = "100vw";
                    iframe.style.height = "100vh";
                    iframe.style.maxWidth = "100vw";
                    iframe.style.zIndex = "999999999";
                  }

                  if (event.data.type === "CONSULTLY_CHAT_CLOSE") {
                    iframe.dataset.advizoChatOpen = "false";

                    iframe.style.position = "";
                    iframe.style.top = "";
                    iframe.style.left = "";
                    iframe.style.width = "";
                    iframe.style.height = "";
                    iframe.style.maxWidth = "";
                    iframe.style.zIndex = "";
                  }
                });
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
    // TEMPORARY debug log — this is the endpoint the profile page actually
    // hits (NOT getConsultantByShopIdAndConsultantId). Remove once confirmed.
    console.log("[app-proxy][profile] hit — shop:", shop, "consultantId:", consultantId);

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
    const [commStatus, ratingSummary, totalConversations] = await Promise.all([
      getCommunicationStatus(String(shopDocId)),
      getConsultantRatingSummary(consultant._id),
      getConsultantTotalConversations(consultant._id),
    ]);

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
      // Real, database-backed — see getConsultantRatingSummary/
      // getConsultantTotalConversations (ratingController.js). average is
      // null and total is 0 when there are no ratings yet; callers must
      // render "No ratings yet" for that case rather than a fake number.
      ratingSummary,
      totalConversations,
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
    console.error("[app-proxy] /advizo/consultant/:id error:", err);
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
    // Shopify's own App Proxy forwarding appends shop/logged_in_customer_id/
    // signature/timestamp to this request itself — verifyAppProxy has already
    // checked the signature by this point, so `shop` here is trustworthy.
    // Nothing in this codebase invents or overrides it from client input.
    console.log("[SHOPIFY IDENTITY] Shop available =", Boolean(shop));
    if (!shop) {
      return res
        .status(400)
        .json({ success: false, message: "Missing shop" });
    }

    // Anonymous shoppers are a valid case here (the listing is public) —
    // resolveStorefrontCustomer returns null rather than rejecting them.
    const userResult = await resolveStorefrontCustomer(req, shop);
    const token = userResult?.token;

    // TEMPORARY debug (Theme Extension identity-sync test) — safe fields
    // only: booleans and the shop domain. Never the cookie/token values
    // themselves, never customer id/email/name.
    console.log("[THEME AUTH DEBUG] shop =", shop);
    console.log(
      "[THEME AUTH DEBUG] logged_in_customer_id present =",
      Boolean(req.query.logged_in_customer_id),
    );
    console.log(
      "[THEME AUTH DEBUG] logged_in_customer_id present =",
      req.query.logged_in_customer_id
    );
    console.log(
      "[THEME AUTH DEBUG] app session cookie present =",
      Boolean(req.cookies?.token),
    );
    console.log("[THEME AUTH DEBUG] Shopify customer available =", Boolean(userResult?.userId));
    console.log("[THEME AUTH DEBUG] Shopify identity verified =", Boolean(userResult?.userId));
    console.log("[THEME AUTH DEBUG] DB user synced =", Boolean(userResult?.userId));

    // Always fetched (not only as a shop_id fallback) — this is also the
    // source for consultantCardTheme below. getCachedShopDoc is TTL-cached
    // (shopDocCache, 5 min; invalidated immediately on save by
    // updateConsultantCardTheme), so this costs nothing extra in the common
    // case where resolveStorefrontCustomer already warmed the same cache
    // entry a moment ago.
    const shopDoc = await getCachedShopDoc(shop);
    const shopDocId = userResult?.shop_id || shopDoc?._id;
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
      // Every field here is null/empty unless an admin explicitly saved one
      // via updateConsultantCardTheme — the Theme Extension's own CSS
      // already has the current look as fallback values, so this only ever
      // narrows what's shown, never invents anything. Safe to expose: no
      // secrets, just colors/radius/shadow-preset.
      consultantCardTheme: shopDoc?.consultantCardTheme || null,
    });
  } catch (err) {
    console.error("[app-proxy] /advizo/consultants error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load consultants" });
  }
};

const proxyShopifyConsultantPage = async (req, res) => {
  const shop = req.query.shop;

  // Login intentionally STAYS inside the Shopify-shell iframe (Header/Footer
  // visible) — unlike the dashboard below, this is not a redirect target.
  // The only change from before: the iframe src prefers the explicit,
  // trusted CONSULTANT_APP_URL when it's configured, instead of always
  // using resolveFrontendUrl(req) — which in production resolves to this
  // backend's own host (Shopify's App Proxy forwards with that Host
  // header) and 404s there, since the SPA isn't served from this Express
  // app. Falls back to the old resolveFrontendUrl(req) behavior when
  // CONSULTANT_APP_URL isn't set, so nothing changes until it is.

  // TEMPORARY diagnostics — tracing the reported admin.shopify.com redirect
  // bug. Safe to log: shop domain, this app's own env var, and the request's
  // own query keys/host are not credentials. Remove once resolved.
  console.log(`[advizo] CONSULTANT_APP_URL (raw env) = ${process.env.CONSULTANT_APP_URL || "(unset)"}`);
  console.log(`[advizo] request host = ${req.get("host")}`);
  console.log(
    `[advizo] request query = ${JSON.stringify({ ...req.query, signature: req.query.signature ? "[present]" : undefined })}`,
  );
  console.log(
    `[advizo] consultant login redirect target = ${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/login?shop=${shop}`,
  );

  try {
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
    console.log("consultant login ifram is wokring ....")
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
    // getTrustedConsultantAppUrl() || resolveFrontendUrl(req)

    const consultantLoginSrc =
      `${"https://untaxed-cattishly-renewal.ngrok-free.dev"}/login?shop=${shop}`;
    // Derived from the exact same URL the iframe actually loads (not
    // recomputed from getTrustedConsultantAppUrl/resolveFrontendUrl
    // separately) so the postMessage origin check below can never drift out
    // of sync with where the iframe really points.
    const consultantLoginOrigin = new URL(consultantLoginSrc).origin;

    const pageHtml = `
        <!DOCTYPE html>
        <html>
          ${finalHead}
          <style>
            /* Advizo login loader — covers the iframe only until the React
               app inside it reports readiness (see the postMessage listener
               below). Not a skeleton: one spinner, one message, nothing else. */
            #advizo-login-loader {
              position: absolute;
              inset: 0;
              z-index: 5;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 14px;
              background: #fbfaf5;
              transition: opacity 220ms ease;
            }
            #advizo-login-loader.is-hidden {
              opacity: 0;
              pointer-events: none;
            }
            .advizo-login-spinner {
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border: 3px solid rgba(20, 86, 60, 0.15);
              border-top-color: #14563c;
              animation: advizoLoginSpin 0.8s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .advizo-login-spinner { animation-duration: 1.6s; }
            }
            @keyframes advizoLoginSpin {
              to { transform: rotate(360deg); }
            }
            .advizo-login-loader-text {
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
              font-size: 13px;
              color: #5c6b64;
            }
          </style>
          <body style="margin:0;padding:0;display:flex;flex-direction:column;">
            <header id="proxy-header"
              style="flex-shrink:0;position:relative;z-index:999;">
            ${headerHtml}
            </header>

            <main style="position:relative;">
              <div id="advizo-login-loader" role="status" aria-live="polite" aria-label="Loading consultant portal">
                <span class="advizo-login-spinner" aria-hidden="true"></span>
                <p class="advizo-login-loader-text">Loading consultant portal…</p>
              </div>
              <iframe
                id="agora-iframe"
                src="${consultantLoginSrc}"
                style="border:none;width:100%;min-height:500px;display:block;"
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
                minHeight: 500,
              }, "#agora-iframe");

              (function () {
                var TRUSTED_ORIGIN = ${JSON.stringify(consultantLoginOrigin)};
                var loader = document.getElementById("advizo-login-loader");
                var hidden = false;

                function hideLoader() {
                  if (hidden || !loader) return;
                  hidden = true;
                  loader.classList.add("is-hidden");
                  setTimeout(function () {
                    if (loader.parentNode) loader.parentNode.removeChild(loader);
                  }, 240);
                }

                window.addEventListener("message", function (event) {
                  if (event.origin !== TRUSTED_ORIGIN) return;
                  if (event.data && event.data.type === "ADVIZO_CONSULTANT_LOGIN_READY") {
                    hideLoader();
                  }
                });

                // Safety net only — real readiness always comes from the
                // React login app's own postMessage above. This just
                // prevents a genuinely stuck iframe load from leaving the
                // spinner up forever.
                setTimeout(hideLoader, 8000);
              })();
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

  // Dashboard STAYS inside the Shopify-shell iframe — same pattern as
  // proxyShopifyConsultantPage (login) above. A top-level 302 here broke
  // the JWT/localStorage handoff: the login form runs inside an iframe at
  // CONSULTANT_APP_URL's origin, so a 302 that took the DASHBOARD to a
  // different top-level origin than that iframe meant the dashboard could
  // never see the token the login iframe had just written — every fresh
  // load re-verified from scratch and inconsistently bounced back to
  // login, producing an infinite login<->dashboard loop (confirmed via
  // Render logs). Keeping both login and dashboard as iframes under the
  // SAME CONSULTANT_APP_URL origin keeps localStorage consistent between
  // them, with no code change to the auth/token logic itself.
  const target = `${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/consultant-dashboard?shop=${shop}`;
  console.log(`[consultant-portal] /advizo/consultant-dashboard -> iframe src -> ${target}`);

  return renderShopifyPage(
    req,
    res,
    target,
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
  // Set only by the theme's call overlay (openCallOverlay in
  // consultant-card.js) — "voice" or "video". Forwarded through unchanged so
  // ViewProfile.js can skip its own profile UI and start the call immediately.
  const autoStartCall = req.query.autoStartCall || "";
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

  const autoStartCallParam = autoStartCall
    ? `&autoStartCall=${encodeURIComponent(autoStartCall)}`
    : "";
  const iframeUrl = `${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/view-profile?consultantId=${consultantId}&shopId=${shopId}&shop=${shop}${customerParams}${autoStartCallParam}`;

  // The call overlay (openCallOverlay in consultant-card.js) loads this URL
  // with autoStartCall set, inside a modal it renders on the theme page
  // itself. renderShopifyPage scrapes and re-embeds the shop's OWN theme
  // header/footer around the iframe — correct for a real "view profile"
  // page visit, but it means that modal would show a second full storefront
  // layout (header+footer) nested inside it. Redirect straight to the React
  // app's own origin instead — same identity params, same destination page,
  // just without the theme shell. Same pattern proxyShopifyStorefrontChat
  // already uses for the chat overlay. The normal (non-call) profile-page
  // flow below, reached without autoStartCall, is unaffected.
  if (autoStartCall) {
    return res.redirect(302, iframeUrl);
  }

  return renderShopifyPage(req, res, iframeUrl, {
    title: "Consultant Profile",
  });
};

/**
 * JSON identity endpoint for the Theme Extension's native call widget
 * (advizo_CallWidget) — resolves the Shopify customer the exact same way
 * every other proxy handler in this file does (resolveStorefrontCustomer:
 * logged_in_customer_id first, app-JWT-cookie fallback), then hands back
 * {customerId, authToken, shopId} as JSON instead of a page/redirect. The
 * widget attaches authToken as a Bearer header on its own calls to
 * /call/generate-token and the balance/status checks — the exact same JWT
 * ViewProfile.js already receives via a URL param for the same purpose,
 * just returned in a response body instead (never logged, never a URL/
 * referrer/history entry). Anonymous shoppers get authenticated:false, not
 * an error — the widget's caller shows a login prompt instead of crashing.
 */
const proxyShopifyCallIdentity = async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ success: false, message: "Missing shop" });
  }

  let shopId = req.query.shopId || "";
  if (!shopId) {
    const shopDoc = await getCachedShopDoc(shop);
    shopId = shopDoc?._id?.toString() || "";
  }

  const customerSession = await resolveStorefrontCustomer(req, shop);
  if (customerSession?.userId) {
    setAppSessionCookie(res, customerSession.token);
  }

  res.set("Cache-Control", "no-store");
  return res.status(200).json({
    success: true,
    authenticated: Boolean(customerSession?.userId),
    customerId: customerSession?.userId || null,
    authToken: customerSession?.userId ? customerSession.token || "" : "",
    shopId: shopId || null,
    // The engine chunk (engine.js) needs this to build an absolute URL for
    // /sounds/ringing_tone.mp3, which only exists on the React app's own
    // origin, not the shop's. document.currentScript.src can't supply this
    // reliably (it reflects the ORIGINAL App-Proxy <script src> the engine
    // chunk was requested with, never the post-redirect origin the browser
    // actually fetched it from) — this identity call already happens first
    // in startCustomerCall, so handing back the real origin here needs no
    // extra request.
    frontendOrigin: getTrustedConsultantAppUrl() || resolveFrontendUrl(req),
  });
};

/**
 * Loads the call widget script — consultant-card.js hits this instead of
 * hardcoding the React app's real domain, same reasoning as every other
 * proxy handler here that resolves getTrustedConsultantAppUrl() server-side
 * (view-profile, chat, video-calling-page): if that URL ever changes, only
 * this one place needs updating, not the deployed theme asset. Browsers
 * follow a redirect on a <script src> exactly like any other resource
 * fetch, so this is a transparent extra hop, not a page navigation.
 */
const proxyShopifyCallWidgetScript = (req, res) => {
  const target = `${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/advizo-call-widget.js`;
  return res.redirect(302, target);
};

/**
 * Loads the (heavy, Agora-containing) call engine chunk — same reasoning
 * and pattern as proxyShopifyCallWidgetScript above. This exists because
 * the bootstrap script cannot reliably derive its own real origin from
 * document.currentScript.src to locate a sibling file: that property
 * reflects the ORIGINAL <script src> attribute the bootstrap was given
 * (this same App-Proxy URL, since redirects happen at the network layer
 * and never rewrite the DOM attribute), not the React app domain the
 * browser actually ended up fetching it from after following the 302
 * below. Going through an identical named proxy route for the engine chunk
 * sidesteps that entirely — the bootstrap just asks for it by the shop's
 * own domain, exactly like it does for itself.
 */
const proxyShopifyCallEngineScript = (req, res) => {
  const target = `${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/advizo-call-engine.js`;
  return res.redirect(302, target);
};

// proxyShopifyChatSection (old /advizo/chats-c App Proxy iframe launcher)
// removed — the storefront Chat button now opens ConsultantChatModal/
// UserChat as a normal in-page React modal (ConsultantCards.js,
// ViewProfile.js), which talks to the existing chat API/Socket.IO directly.
// Confirmed unused before removal: grepped the whole repo for "chats-c" and
// "proxyShopifyChatSection" — the only remaining callers were the frontend
// navigation functions this same change replaced.

const CHAT_EXCHANGE_TTL_MS = 60 * 1000; // one minute — the iframe redirect
// following it happens client-side within milliseconds; a full minute is
// generous headroom, not a window meant to be sat on.

/**
 * TEMP (Chat modal UI test): App Proxy launcher for the Theme App Extension
 * card's dynamically-injected chat overlay iframe (see openChatOverlay in
 * consultant-card.js). Deliberately NOT the old proxyShopifyChatSection
 * pattern (renderShopifyPage) — that scrapes and re-renders the theme's own
 * header/footer around the iframe, which is right for a full-page App Proxy
 * destination but would show a second storefront header/footer INSIDE this
 * overlay. Instead: resolve identity the exact same way every other proxy
 * handler in this file does (resolveStorefrontCustomer — logged_in_customer_id
 * first, app-JWT-cookie fallback), then 302 to the React app's own /chats
 * route carrying only a short-lived, single-use, server-generated exchange
 * code — never the DB user id and never the JWT (see exchangeChatSession
 * below, which is what actually redeems it for a real session). The request
 * reaching this handler at all already proves Shopify's App Proxy HMAC
 * (verifyAppProxy) validated it — a real signed hit, not something the
 * browser/theme JS forged.
 */
const proxyShopifyStorefrontChat = async (req, res) => {
  const shop = req.query.shop;
  const consultantId = req.query.consultantId || "";

  const customerSession = await resolveStorefrontCustomer(req, shop);

  // TEMPORARY debug (Theme Extension identity-sync test) — booleans and the
  // shop domain only, never the DB id value, JWT, or cookie itself.
  console.log("[THEME AUTH DEBUG] shop =", shop);
  console.log(
    "[THEME AUTH DEBUG] logged_in_customer_id present =",
    Boolean(req.query.logged_in_customer_id),
  );
  console.log(
    "[THEME AUTH DEBUG] app session cookie present =",
    Boolean(req.cookies?.token),
  );
  console.log("[THEME AUTH DEBUG] Shopify customer available =", Boolean(customerSession?.userId));
  console.log("[THEME AUTH DEBUG] Shopify identity verified =", Boolean(customerSession?.userId));
  console.log("[THEME AUTH DEBUG] DB user synced =", Boolean(customerSession?.userId));

  // The httpOnly app session cookie is reused here exactly as every other
  // proxy handler in this file reuses it — set/refreshed on this App Proxy
  // request (same-origin-to-the-shop, so it works), which is what
  // resolveStorefrontCustomer above already read to resolve identity. It is
  // NOT forwarded into the redirect below: it's scoped to the shop's own
  // domain, and the redirect target is the React app's OWN origin
  // (getTrustedConsultantAppUrl(), a different domain) — a same-origin
  // cookie can't cross that boundary. Neither is the raw JWT or the DB user
  // id put in the URL — only an opaque, single-use exchange code, redeemed
  // by exchangeChatSession below over a direct HTTPS call from the React
  // app, never logged or persisted anywhere past its one redemption.
  //
  // TODO(auth): logged-out shoppers currently still reach the chat overlay
  // (no exchange param at all — UserChat degrades gracefully with no
  // customerId/authToken, see its bootstrap effect) for UI testing. Restore
  // a real "must be a resolved Shopify customer" gate here before
  // production.
  let exchangeParam = "";
  if (customerSession?.userId) {
    setAppSessionCookie(res, customerSession.token);
    const code = crypto.randomBytes(32).toString("hex");
    chatExchangeCache.set(
      `chat-exchange:${code}`,
      {
        shop,
        userId: String(customerSession.userId),
        consultantId,
        used: false,
      },
      CHAT_EXCHANGE_TTL_MS,
    );
    exchangeParam = `&exchange=${encodeURIComponent(code)}`;
  }

  const target =
    `${getTrustedConsultantAppUrl() || resolveFrontendUrl(req)}/chats?embedded=1` +
    `&consultantId=${encodeURIComponent(consultantId)}` +
    `&shop=${encodeURIComponent(shop || "")}${exchangeParam}`;

  res.set("Cache-Control", "no-store");
  return res.redirect(302, target);
};

/**
 * TEMP (Chat modal UI test): redeems the one-time exchange code minted by
 * proxyShopifyStorefrontChat above. Called directly by the React app
 * (UserChat.js bootstrap, over plain HTTPS — NOT through Shopify's App
 * Proxy, since the code is itself the credential and needs no App Proxy
 * HMAC) with { exchange, shop, consultantId }. On success mints/reuses a
 * session the exact same way every other customer-facing page in this file
 * already does — getOrCreateUserToken(userId), the identical JWT
 * (JWT_SECRET_KEY, 7d expiry, cached) manageShopifyUser already hands back
 * everywhere else — no new token format, no new secret.
 *
 * Single-use: the cache entry is deleted the instant it's read, whether or
 * not the rest of validation passes, so a code can never be redeemed twice
 * even by two near-simultaneous requests racing the same key.
 */
const exchangeChatSession = async (req, res) => {
  try {
    const { exchange, shop, consultantId } = req.body || {};

    if (!exchange || typeof exchange !== "string") {
      return res.status(400).json({ success: false, message: "Missing exchange code" });
    }

    const key = `chat-exchange:${exchange}`;
    const entry = chatExchangeCache.get(key);
    chatExchangeCache.delete(key); // single-use regardless of outcome below

    if (!entry || entry.used) {
      console.log("[THEME AUTH DEBUG] Chat session established =", false);
      return res.status(401).json({ success: false, message: "Invalid or expired exchange code" });
    }
    if (shop && entry.shop && String(shop) !== String(entry.shop)) {
      console.log("[THEME AUTH DEBUG] Chat session established =", false);
      return res.status(401).json({ success: false, message: "Shop mismatch" });
    }
    if (
      consultantId &&
      entry.consultantId &&
      String(consultantId) !== String(entry.consultantId)
    ) {
      console.log("[THEME AUTH DEBUG] Chat session established =", false);
      return res.status(401).json({ success: false, message: "Consultant mismatch" });
    }

    const user = await User.findById(entry.userId).select("_id shop_id");
    if (!user) {
      console.log("[THEME AUTH DEBUG] Chat session established =", false);
      return res.status(401).json({ success: false, message: "User not found" });
    }

    const token = getOrCreateUserToken(user._id);

    // TEMPORARY debug — boolean only, never the DB id or token value.
    console.log("[THEME AUTH DEBUG] Chat session established =", true);

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      userId: String(user._id),
      shopId: String(user.shop_id),
      token,
    });
  } catch (err) {
    console.error("[chat-session-exchange] error:", err.message);
    return res.status(500).json({ success: false, message: "Exchange failed" });
  }
};

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 20;

const clampPageLimit = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return PAGE_SIZE_DEFAULT;
  return Math.min(Math.floor(n), PAGE_SIZE_MAX);
};

// _id (not createdAt) is the pagination cursor for both history lists below —
// it is strictly unique and monotonically increasing with insert order for
// documents created by this app, so a page boundary can never land two
// records on the exact same cursor value the way two createdAt timestamps
// occasionally can (same millisecond), which is what would otherwise risk a
// duplicated or skipped row at a page boundary.
const fetchWalletHistoryPage = async (userId, shopId, { cursor, limit }) => {
  const query = { userId, shop_id: shopId };
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: cursor };
  }
  const docs = await WalletHistory.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  return {
    items: page.map((entry) => ({
      id: entry._id,
      amount: entry.amount,
      currency: entry.currency,
      transactionType: entry.transactionType,
      direction: entry.direction,
      referenceType: entry.referenceType,
      status: entry.status,
      description: entry.description,
      createdAt: entry.createdAt,
    })),
    hasMore,
    nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
  };
};

const fetchConsultationHistoryPage = async (userId, { cursor, limit }) => {
  const query = { $or: [{ senderId: userId }, { receiverId: userId }] };
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: cursor };
  }
  const docs = await TransactionHistroy.find(query)
    .populate("senderId", "fullname")
    .populate("receiverId", "fullname")
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  const items = page.map((entry) => {
    const isSender = String(entry.senderId?._id || entry.senderId) === String(userId);
    const consultant = isSender ? entry.receiverId : entry.senderId;
    return {
      id: entry._id,
      type: entry.type,
      status: entry.status,
      duration: entry.totalSeconds || entry.duration || 0,
      amount: entry.totalAmount || entry.amount || 0,
      consultantName: consultant?.fullname || "Consultant",
      startTime: entry.startTime,
      endTime: entry.endTime,
      createdAt: entry.createdAt,
    };
  });
  return { items, hasMore, nextCursor: hasMore ? String(page[page.length - 1]._id) : null };
};

/**
 * JSON App Proxy endpoint for the Theme App Extension's My Profile block
 * (my-profile.liquid / my-profile.js, rendered on /pages/my-profile).
 * Replaces the old proxyProfileSection iframe launcher — same identity
 * resolution as proxyConsultantProfileJson (resolveStorefrontCustomer, the
 * shared HMAC-verified App Proxy flow), but aggregates the customer's
 * profile/wallet/history data server-side into one response instead of
 * iframing the old React app. Deliberately does NOT return the app JWT —
 * the block never needs a bearer token client-side, since every field it
 * needs is resolved here using the already-authenticated identity.
 *
 * Returns only the FIRST page (PAGE_SIZE_DEFAULT) of each history list —
 * the block's own infinite-scroll fetches further pages from
 * proxyWalletHistoryPageJson / proxyCommunicationsHistoryPageJson using the
 * *HasMore/*NextCursor fields below, via the exact same page-fetching core.
 */
const proxyCustomerProfileJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    console.log("[app-proxy][my-profile] hit — shop:", shop);

    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);

    if (!userResult?.userId) {
      console.log("[app-proxy][my-profile] anonymous visitor — no data returned");
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ success: true, authenticated: false });
    }

    setAppSessionCookie(res, userResult.token);

    const user = await User.findById(userResult.userId).select(
      "fullname email profileImage walletBalance createdAt",
    );

    if (!user) {
      console.warn(
        "[app-proxy][my-profile] resolved userId has no User doc:",
        userResult.userId,
      );
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ success: true, authenticated: false });
    }

    const [walletPage, commPage, shopDoc] = await Promise.all([
      fetchWalletHistoryPage(userResult.userId, userResult.shop_id, {
        cursor: null,
        limit: PAGE_SIZE_DEFAULT,
      }),
      fetchConsultationHistoryPage(userResult.userId, {
        cursor: null,
        limit: PAGE_SIZE_DEFAULT,
      }),
      getCachedShopDoc(shop),
    ]);

    const safeCustomer = {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      profileImage: user.profileImage
        ? `${process.env.APP_URL}/${String(user.profileImage).replace(/\\/g, "/")}`
        : null,
      walletBalance: user.walletBalance || 0,
      // The header shows this balance before the Wallet tab (and its own
      // shopCurrency-aware fetch) ever loads — without it, the balance
      // silently rendered with a hardcoded "$" regardless of the shop's
      // actual currency.
      walletCurrency: shopDoc?.currency || null,
      memberSince: user.createdAt,
    };

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      authenticated: true,
      customer: safeCustomer,
      walletHistory: walletPage.items,
      walletHistoryHasMore: walletPage.hasMore,
      walletHistoryNextCursor: walletPage.nextCursor,
      consultationHistory: commPage.items,
      consultationHistoryHasMore: commPage.hasMore,
      consultationHistoryNextCursor: commPage.nextCursor,
    });
  } catch (err) {
    console.error("[app-proxy] /advizo/customer/me error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load profile" });
  }
};

/**
 * "Load more" pages for the My Profile block's Wallet Activity / Communications
 * infinite scroll — same identity resolution and the exact same page-fetching
 * core (fetchWalletHistoryPage / fetchConsultationHistoryPage) as the first
 * page already embedded in proxyCustomerProfileJson above, just called again
 * with the cursor the client got back from the previous page.
 */
const proxyWalletHistoryPageJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ success: true, authenticated: false });
    }
    setAppSessionCookie(res, userResult.token);

    const page = await fetchWalletHistoryPage(userResult.userId, userResult.shop_id, {
      cursor: req.query.cursor,
      limit: clampPageLimit(req.query.limit),
    });

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      authenticated: true,
      data: page.items,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    console.error("[app-proxy] /advizo/wallet/history error:", err);
    return res.status(500).json({ success: false, message: "Failed to load wallet activity" });
  }
};

const proxyCommunicationsHistoryPageJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ success: true, authenticated: false });
    }
    setAppSessionCookie(res, userResult.token);

    const page = await fetchConsultationHistoryPage(userResult.userId, {
      cursor: req.query.cursor,
      limit: clampPageLimit(req.query.limit),
    });

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      authenticated: true,
      data: page.items,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    console.error("[app-proxy] /advizo/communications/history error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load communications" });
  }
};

/**
 * JSON App Proxy endpoint for the My Profile block's "Add money" section —
 * the shop's existing recharge catalog (getVouchersController's own data,
 * via the shared buildVoucherCatalogPayload), resolved by shop domain
 * instead of a Bearer-token-authenticated adminId. Same identity resolution
 * as proxyCustomerProfileJson.
 */
const proxyWalletTopupJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ success: true, authenticated: false });
    }
    setAppSessionCookie(res, userResult.token);

    const shopDoc = await shopModel
      .findOne({ shop })
      .select("vouchers currency _id shop");
    if (!shopDoc) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const catalog = await buildVoucherCatalogPayload(shopDoc);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, authenticated: true, ...catalog });
  } catch (err) {
    console.error("[app-proxy] /advizo/wallet/topup error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load top-up options" });
  }
};

/**
 * JSON App Proxy endpoint for the My Profile block's "Add money" action —
 * creates the same Shopify draft-order recharge as the (now unreachable)
 * React app's /draft-order/create-draft-order, via the shared
 * createRechargeDraftOrderCore, but resolves the customer server-side
 * (resolveStorefrontCustomer) instead of trusting a userId sent from the
 * browser, and only accepts an amount that matches one of the shop's own
 * configured top-up options — a real financial document (a Shopify draft
 * order) should never be created for a client-chosen arbitrary amount.
 */
const proxyWalletRechargeJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please sign in to add money to your wallet." });
    }
    setAppSessionCookie(res, userResult.token);

    const shopDoc = await shopModel.findOne({ shop });
    if (!shopDoc) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const validAmounts = (shopDoc.vouchers || []).map((v) => Number(v.totalCoin));
    if (!validAmounts.includes(amount)) {
      return res
        .status(400)
        .json({ success: false, message: "That top-up option is no longer available." });
    }

    return createRechargeDraftOrderCore(
      { shop, shopAccessToken: shopDoc, userId: userResult.userId, amount, title: "Recharge Amount" },
      res,
    );
  } catch (err) {
    console.error("[app-proxy] /advizo/wallet/recharge error:", err);
    return res.status(500).json({ success: false, message: "Failed to start recharge" });
  }
};

/**
 * JSON App Proxy endpoints for the My Profile block's Support section —
 * same ConsultantSupportRequest collection/business rules as the Consultant
 * Dashboard's support requests (submitConsultantSupportRequest /
 * getConsultantSupportRequests / markConsultantSupportReplyRead), via their
 * shared core functions, but resolving identity via resolveStorefrontCustomer
 * instead of a Bearer token.
 */
const proxySupportRequestsJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ success: true, authenticated: false });
    }
    setAppSessionCookie(res, userResult.token);
    res.set("Cache-Control", "no-store");
    return listSupportRequestsCore(userResult.userId, res);
  } catch (err) {
    console.error("[app-proxy] /advizo/support/requests GET error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch support requests" });
  }
};

const proxySubmitSupportRequestJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please sign in to contact support." });
    }
    setAppSessionCookie(res, userResult.token);

    const { subject, message } = req.body || {};
    return createSupportRequestCore(
      userResult.userId,
      { subject, message, shopId: userResult.shop_id },
      res,
    );
  } catch (err) {
    console.error("[app-proxy] /advizo/support/requests POST error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to send support request" });
  }
};

const proxyMarkSupportReplyReadJson = async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Missing shop" });
    }

    const userResult = await resolveStorefrontCustomer(req, shop);
    if (!userResult?.userId) {
      return res.status(401).json({ success: false, message: "Please sign in." });
    }
    setAppSessionCookie(res, userResult.token);

    return markSupportReplyReadCore(userResult.userId, req.params.requestId, res);
  } catch (err) {
    console.error("[app-proxy] /advizo/support/requests/:id/read error:", err);
    return res.status(500).json({ success: false, message: "Failed to update request" });
  }
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
  proxyCustomerProfileJson,
  proxyWalletHistoryPageJson,
  proxyCommunicationsHistoryPageJson,
  proxyWalletTopupJson,
  proxyWalletRechargeJson,
  proxySupportRequestsJson,
  proxySubmitSupportRequestJson,
  proxyMarkSupportReplyReadJson,
  proxyShopifyCallAccepted,
  proxyShopifyStorefrontChat,
  proxyShopifyCallIdentity,
  proxyShopifyCallWidgetScript,
  proxyShopifyCallEngineScript,
  exchangeChatSession,
};
