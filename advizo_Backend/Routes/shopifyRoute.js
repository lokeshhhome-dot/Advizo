const express = require('express');
const shopifyRoute = express.Router();
const { installShopifyApp,
    beginOAuth,
    authCallback,
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
    exchangeChatSession
} = require('../Controller/shopifyController');

const {
    proxyAstrologyConfig,
    proxyAstrologyPlaces,
    proxyAstrologyRun,
    proxyAstrologyHistory,
    proxyAstrologyReading,
    proxyAstrologyDeleteReading,
} = require('../Controller/astrologyController');

const { verifyShopifyToken } = require('../MiddleWare/ShopifyMiddleware/verifyShopifyToken');
const { verifyAppProxy } = require('../MiddleWare/ShopifyMiddleware/verifyAppProxy');

// Top-level OAuth entry — MUST be registered before '/install/:shop' or the
// param route would swallow it. No session token: it is a plain browser
// navigation (App Bridge REMOTE redirect), which cannot carry a Bearer
// header; the shop param is strictly validated and the flow is protected by
// the signed state + first-party cookie it establishes.
shopifyRoute.get('/install/begin', beginOAuth);
// Alias: GET /install?shop=x.myshopify.com — same top-level OAuth entry.
shopifyRoute.get('/install', beginOAuth);
shopifyRoute.get('/install/:shop', verifyShopifyToken, installShopifyApp);
shopifyRoute.get('/callback', authCallback);

// App Proxy routes — every one is reached ONLY through Shopify's signed proxy,
// so the App Proxy HMAC (verifyAppProxy) is mandatory. It blocks forged
// shop/logged_in_customer_id requests that would otherwise mint an auth token
// for any customer (account takeover).
shopifyRoute.get('/advizo', verifyAppProxy, proxyThemeAssetsController);
// New JSON endpoint for the Theme App Extension's Consultant Card block —
// the HTML/iframe route above is untouched and keeps working in parallel.
shopifyRoute.get('/advizo/consultants', verifyAppProxy, proxyConsultantsJson);
// Single-consultant JSON for the Theme App Extension's Consultant Profile
// block — /apps/advizo/consultant/:id
shopifyRoute.get('/advizo/consultant/:id', verifyAppProxy, proxyConsultantProfileJson);
shopifyRoute.get('/advizo/login', verifyAppProxy, proxyShopifyConsultantPage);
shopifyRoute.get('/advizo/consultant-dashboard', verifyAppProxy, proxyShopifyConsultantLoginPage);
shopifyRoute.get('/advizo/consultant-chats-section', verifyAppProxy, proxySHopifyConsultantChat);
shopifyRoute.get('/advizo/view-profile', verifyAppProxy, proxyShopifyViewProfile);
// /advizo/chats-c (proxyShopifyChatSection) removed — the storefront
// Chat button now opens ConsultantChatModal/UserChat as an in-page React
// modal, no App Proxy iframe route needed for it anymore.
// TEMP (Chat modal UI test): launcher for the Theme Extension card's
// dynamically-injected chat overlay iframe — resolves Shopify customer ->
// DB user the same way every other proxy route here does, then redirects
// into the React app's /chats route carrying only a short-lived, single-use
// exchange code (never the DB user id, never the JWT). See
// proxyShopifyStorefrontChat in shopifyController.js.
shopifyRoute.get('/advizo/chats', verifyAppProxy, proxyShopifyStorefrontChat);
// JSON endpoint for the Theme App Extension's My Profile block —
// /apps/advizo/customer/me, rendered on /pages/my-profile. Replaces the
// old /advizo/profile iframe launcher (proxyProfileSection, removed).
shopifyRoute.get('/advizo/customer/me', verifyAppProxy, proxyCustomerProfileJson);
// My Profile block: infinite-scroll "load more" pages for Wallet Activity /
// Communications — same page-fetching core proxyCustomerProfileJson uses for
// its own first page. See proxyWalletHistoryPageJson /
// proxyCommunicationsHistoryPageJson in shopifyController.js.
shopifyRoute.get('/advizo/wallet/activity-history', verifyAppProxy, proxyWalletHistoryPageJson);
shopifyRoute.get('/advizo/communications/activity-history', verifyAppProxy, proxyCommunicationsHistoryPageJson);
// My Profile block: Add Money (wallet top-up catalog + recharge) — reuses
// the same recharge-catalog/draft-order logic as the (now unreachable)
// React app's endpoints, via shared core functions in
// userDetailsController.js / shopifyDraftOrderController.js. See
// proxyWalletTopupJson / proxyWalletRechargeJson in shopifyController.js.
shopifyRoute.get('/advizo/wallet/topup', verifyAppProxy, proxyWalletTopupJson);
shopifyRoute.post('/advizo/wallet/recharge', verifyAppProxy, proxyWalletRechargeJson);
// My Profile block: Support — reuses the same ConsultantSupportRequest
// collection/business rules as the Consultant Dashboard's support requests,
// via shared core functions in consultantController.js. See
// proxySupportRequestsJson / proxySubmitSupportRequestJson /
// proxyMarkSupportReplyReadJson in shopifyController.js.
shopifyRoute.get('/advizo/support/requests', verifyAppProxy, proxySupportRequestsJson);
shopifyRoute.post('/advizo/support/requests', verifyAppProxy, proxySubmitSupportRequestJson);
shopifyRoute.put('/advizo/support/requests/:requestId/read', verifyAppProxy, proxyMarkSupportReplyReadJson);
// Astrology Theme Extension blocks (/pages/astrology) — see
// astrologyController.js. Identity via resolveStorefrontCustomer like every
// route above; the Jyotisham key never leaves the backend. The literal
// /history paths are registered before the /:feature param route.
shopifyRoute.get('/advizo/astrology/config', verifyAppProxy, proxyAstrologyConfig);
shopifyRoute.get('/advizo/astrology/places', verifyAppProxy, proxyAstrologyPlaces);
shopifyRoute.get('/advizo/astrology/history', verifyAppProxy, proxyAstrologyHistory);
shopifyRoute.get('/advizo/astrology/history/:id', verifyAppProxy, proxyAstrologyReading);
shopifyRoute.post('/advizo/astrology/history/:id/delete', verifyAppProxy, proxyAstrologyDeleteReading);
shopifyRoute.post('/advizo/astrology/:feature', verifyAppProxy, proxyAstrologyRun);
shopifyRoute.get('/advizo/video-calling-page', verifyAppProxy, proxyShopifyCallAccepted);
// JSON identity endpoint for the Theme Extension's native call widget
// (advizo_CallWidget) — see proxyShopifyCallIdentity's own comment.
shopifyRoute.get('/advizo/call/identity', verifyAppProxy, proxyShopifyCallIdentity);
// Redirects to the built widget bundle's real (React app) origin — see
// proxyShopifyCallWidgetScript's own comment.
shopifyRoute.get('/advizo/call-widget.js', verifyAppProxy, proxyShopifyCallWidgetScript);
// Redirects to the engine chunk's real (React app) origin — see
// proxyShopifyCallEngineScript's own comment.
shopifyRoute.get('/advizo/call-engine.js', verifyAppProxy, proxyShopifyCallEngineScript);

// NOT an App Proxy route — called directly by the React app (UserChat.js)
// over plain HTTPS, from the APP_URL origin, not from a Shopify
// storefront page. verifyAppProxy would reject it (no Shopify HMAC signature
// on a direct browser->backend call). Its own security is the exchange code
// itself: short-lived, single-use, minted only inside proxyShopifyStorefrontChat
// above after a real verifyAppProxy-gated hit. See exchangeChatSession.
shopifyRoute.post('/advizo/chat-session/exchange', exchangeChatSession);

module.exports = shopifyRoute;
