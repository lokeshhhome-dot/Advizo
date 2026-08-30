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
    proxyShopifyCallAccepted,
    proxyShopifyStorefrontChat,
    proxyShopifyCallIdentity,
    proxyShopifyCallWidgetScript,
    proxyShopifyCallEngineScript,
    exchangeChatSession
} = require('../Controller/shopifyController');

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
shopifyRoute.get('/consultly', verifyAppProxy, proxyThemeAssetsController);
// New JSON endpoint for the Theme App Extension's Consultant Card block —
// the HTML/iframe route above is untouched and keeps working in parallel.
shopifyRoute.get('/consultly/consultants', verifyAppProxy, proxyConsultantsJson);
// Single-consultant JSON for the Theme App Extension's Consultant Profile
// block — /apps/consultly/consultant/:id
shopifyRoute.get('/consultly/consultant/:id', verifyAppProxy, proxyConsultantProfileJson);
shopifyRoute.get('/consultly/login', verifyAppProxy, proxyShopifyConsultantPage);
shopifyRoute.get('/consultly/consultant-dashboard', verifyAppProxy, proxyShopifyConsultantLoginPage);
shopifyRoute.get('/consultly/consultant-chats-section', verifyAppProxy, proxySHopifyConsultantChat);
shopifyRoute.get('/consultly/view-profile', verifyAppProxy, proxyShopifyViewProfile);
// /consultly/chats-c (proxyShopifyChatSection) removed — the storefront
// Chat button now opens ConsultantChatModal/UserChat as an in-page React
// modal, no App Proxy iframe route needed for it anymore.
// TEMP (Chat modal UI test): launcher for the Theme Extension card's
// dynamically-injected chat overlay iframe — resolves Shopify customer ->
// DB user the same way every other proxy route here does, then redirects
// into the React app's /chats route carrying only a short-lived, single-use
// exchange code (never the DB user id, never the JWT). See
// proxyShopifyStorefrontChat in shopifyController.js.
shopifyRoute.get('/consultly/chats', verifyAppProxy, proxyShopifyStorefrontChat);
// JSON endpoint for the Theme App Extension's My Profile block —
// /apps/consultly/customer/me, rendered on /pages/my-profile. Replaces the
// old /consultly/profile iframe launcher (proxyProfileSection, removed).
shopifyRoute.get('/consultly/customer/me', verifyAppProxy, proxyCustomerProfileJson);
shopifyRoute.get('/consultly/video-calling-page', verifyAppProxy, proxyShopifyCallAccepted);
// JSON identity endpoint for the Theme Extension's native call widget
// (consultly_CallWidget) — see proxyShopifyCallIdentity's own comment.
shopifyRoute.get('/consultly/call/identity', verifyAppProxy, proxyShopifyCallIdentity);
// Redirects to the built widget bundle's real (React app) origin — see
// proxyShopifyCallWidgetScript's own comment.
shopifyRoute.get('/consultly/call-widget.js', verifyAppProxy, proxyShopifyCallWidgetScript);
// Redirects to the engine chunk's real (React app) origin — see
// proxyShopifyCallEngineScript's own comment.
shopifyRoute.get('/consultly/call-engine.js', verifyAppProxy, proxyShopifyCallEngineScript);

// NOT an App Proxy route — called directly by the React app (UserChat.js)
// over plain HTTPS, from the CONSULTANT_APP_URL origin, not from a Shopify
// storefront page. verifyAppProxy would reject it (no Shopify HMAC signature
// on a direct browser->backend call). Its own security is the exchange code
// itself: short-lived, single-use, minted only inside proxyShopifyStorefrontChat
// above after a real verifyAppProxy-gated hit. See exchangeChatSession.
shopifyRoute.post('/consultly/chat-session/exchange', exchangeChatSession);

module.exports = shopifyRoute;
