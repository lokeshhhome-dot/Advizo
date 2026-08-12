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
    proxyShopifyChatSection,
    proxyProfileSection,
    proxyShopifyCallAccepted
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
shopifyRoute.get('/consultly/chats-c', verifyAppProxy, proxyShopifyChatSection); 
shopifyRoute.get('/consultly/profile', verifyAppProxy, proxyProfileSection);
shopifyRoute.get('/consultly/video-calling-page', verifyAppProxy, proxyShopifyCallAccepted);

module.exports = shopifyRoute;
