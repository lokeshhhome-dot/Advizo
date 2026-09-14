// src/setupProxy.js - UPDATED
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    // ✅ Shopify auth callback - CLEAN PATH
    app.use(
        '/app/callback',
        createProxyMiddleware({
            target: 'https://advizo.fossilapps.com',
            changeOrigin: true,
            secure: false,
            logLevel: 'debug', // Debug ke liye
            onProxyReq: (proxyReq, req, res) => {
                console.log('🔄 Proxying to:', proxyReq.path);
            },
            onError: (err, req, res) => {
                console.error('❌ Proxy error:', err);
                res.status(500).json({ error: 'Proxy failed' });
            }
        })
    );

    // ✅ All other API routes
    app.use(
        '/api',
        createProxyMiddleware({
            target: 'https://advizo.fossilapps.com',
            changeOrigin: true,
            secure: false,
            pathRewrite: { '^/api': '' },
        })
    );
};