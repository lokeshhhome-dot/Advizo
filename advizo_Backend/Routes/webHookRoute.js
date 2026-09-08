// router
const express = require('express');
const webHookRoute = express.Router();
const {  webhooksAppUninstalled, webhooksCustomerDataRequest, webhooksCustomerRedact, webhooksShopRedact, paymentSucessController, webhooksThemeChanged } = require('../Controller/webHookController');
const { verifyWebhook } = require('../MiddleWare/ShopifyMiddleware/verifyWebHook');

// Shopify webhooks must use raw body
// express.raw() must be first to preserve the raw body for HMAC verification
// webHookRoute.post('/webhooks/orders-created', express.raw({ type: "application/json" }), verifyWebhook, webhooksOrdersCreated);
// webHookRoute.post('/webhooks/orders-deleted', express.raw({ type: "application/json" }), verifyWebhook, webhooksOrdersDeleted);
webHookRoute.post('/app-uninstalled', express.raw({ type: "application/json" }), verifyWebhook, webhooksAppUninstalled);
webHookRoute.post("/shop/webhooks", express.raw({ type: "application/json" }), verifyWebhook, paymentSucessController)
// themes/publish + themes/update → invalidate the scraped theme-asset cache.
webHookRoute.post("/theme/webhooks", express.raw({ type: "application/json" }), verifyWebhook, webhooksThemeChanged)
webHookRoute.post('/webhooks', verifyWebhook, (req, res) => {
    const topic = req.headers['x-shopify-topic'];
    console.log('topic', topic);
    switch (topic) {
        case 'customers/data_request':
            return webhooksCustomerDataRequest(req, res);
        case 'customers/redact':
            return webhooksCustomerRedact(req, res);
        case 'shop/redact':
            return webhooksShopRedact(req, res);
        default:
            console.log('Unhandled webhook topic:', topic);
            return res.status(200).send('OK');
    }
});


module.exports = { webHookRoute };
