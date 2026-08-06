/**
 * BACKEND SE FRONTEND ROUTE FETCH KARNE KA COMPLETE EXAMPLE
 * 
 * Ye file dikhati hai ki:
 * 1. Backend me frontend ke route ko kaise fetch kare
 * 2. HTML response kaise extract kare
 * 3. Response kaise return kare (jese iframe se ho raha hai)
 */

const express = require('express');
const router = express.Router();
/**
 * EXAMPLE 1: Simple Route Fetch (Jese Iframe Se Ho Raha Hai)
 * 
 * Backend se frontend route fetch karke directly HTML return karta hai
 */
const fetchFrontendRoute = async (req, res) => {
    try {
        // Step 1: Frontend app ka base URL
        const frontendBaseUrl = process.env.REACT_APP_URL

        // Step 2: Konse route fetch karna hai (query params se ya hardcode)
        const routePath = req.query.route || "/consultant-cards"; // Default route
        const fullUrl = `${frontendBaseUrl}${routePath}`;

        // Step 3: Fetch API se frontend route ko fetch karo
        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        // Step 4: Response check karo
        if (!response.ok) {
            return res.status(response.status).send(`Error: ${response.statusText}`);
        }

        // Step 5: HTML text me convert karo
        const html = await response.text();

        // Step 6: Direct HTML return karo (jese iframe se ho raha hai)
        res.status(200).send(html);

    } catch (error) {
        console.error("Error fetching frontend route:", error);
        res.status(500).send("Error fetching frontend route");
    }
};

/**
 * EXAMPLE 2: Route Fetch with Query Parameters
 * 
 * Frontend route ko query parameters ke sath fetch karta hai
 */
const fetchFrontendRouteWithParams = async (req, res) => {
    try {
        const frontendBaseUrl = process.env.REACT_APP_URL || "https://projectable-eely-minerva.ngrok-free.dev";
        const routePath = req.query.route || "/consultant-cards";

        // Query parameters extract karo
        const customerId = req.query.customerId || '';
        const shopId = req.query.shopId || '';

        // Full URL with query parameters
        const fullUrl = `${frontendBaseUrl}${routePath}?customerId=${customerId}&shopId=${shopId}`;

        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html'
            }
        });

        if (!response.ok) {
            return res.status(response.status).send(`Error: ${response.statusText}`);
        }

        const html = await response.text();
        res.status(200).send(html);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error fetching frontend route");
    }
};

/**
 * EXAMPLE 3: HTML Extract Karke Custom Response (Advanced)
 * 
 * Frontend HTML se specific parts extract karke custom response banata hai
 */
const fetchAndExtractHTML = async (req, res) => {
    try {
        const frontendBaseUrl = process.env.REACT_APP_URL || "https://projectable-eely-minerva.ngrok-free.dev";
        const routePath = req.query.route || "/consultant-cards";
        const fullUrl = `${frontendBaseUrl}${routePath}`;

        // Fetch HTML
        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html'
            }
        });

        if (!response.ok) {
            return res.status(response.status).send(`Error: ${response.statusText}`);
        }

        const html = await response.text();

        // HTML se specific parts extract karo
        // Example: Head content
        const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
        const headContent = headMatch ? headMatch[1] : '';

        // Example: Body content
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : '';

        // Example: Scripts extract karo
        const scriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
        const scripts = scriptMatches.join('\n');

        // Example: Styles extract karo
        const styleMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
        const styles = styleMatches.join('\n');

        // Custom HTML response banayo
        const customHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    ${headContent}
                    ${styles}
                </head>
                <body>
                    ${bodyContent}
                    ${scripts}
                </body>
            </html>
        `;

        res.status(200).send(customHtml);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error processing frontend route");
    }
};

/**
 * EXAMPLE 4: Shopify Header/Footer Ke Sath Frontend Route
 * 
 * Shopify header/footer fetch karke frontend route ke sath combine karta hai
 */
const fetchWithShopifyHeaderFooter = async (req, res) => {
    try {
        const shop = req.query.shop;
        const frontendRoute = req.query.route || "/consultant-cards";

        if (!shop) {
            return res.status(400).send("Shop parameter required");
        }

        // Step 1: Shopify header/footer fetch karo
        const shopifyHeaderUrl = `https://${shop}/?section_id=header`;
        const shopifyFooterUrl = `https://${shop}/?section_id=footer`;

        const [headerResponse, footerResponse] = await Promise.all([
            fetch(shopifyHeaderUrl),
            fetch(shopifyFooterUrl)
        ]);

        const headerHtml = headerResponse.ok ? await headerResponse.text() : '';
        const footerHtml = footerResponse.ok ? await footerResponse.text() : '';

        // Step 2: Frontend route fetch karo
        const frontendBaseUrl = process.env.REACT_APP_URL
        const frontendFullUrl = `${frontendBaseUrl}${frontendRoute}`;

        const frontendResponse = await fetch(frontendFullUrl);
        const frontendHtml = frontendResponse.ok ? await frontendResponse.text() : '<div>Error loading content</div>';

        // Step 3: Combine karo
        const combinedHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Shopify App</title>
                </head>
                <body>
                <div class="shopify-section section-header">
                   ${headerHtml}
                  </div>
                    <main>
                        ${frontendHtml}
                    </main>
                    ${footerHtml}
                </body>
            </html>
        `;

        res.status(200).send(combinedHtml);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error combining Shopify and frontend content");
    }
};

/**
 * EXAMPLE 5: JSON Response (API Route)
 * 
 * Agar frontend route JSON return karta hai
 */
const fetchFrontendAPI = async (req, res) => {
    try {
        const frontendBaseUrl = process.env.REACT_APP_URL || "https://projectable-eely-minerva.ngrok-free.dev";
        const apiPath = req.query.path || "/api/data";
        const fullUrl = `${frontendBaseUrl}${apiPath}`;

        const response = await fetch(fullUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: response.statusText });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Error fetching frontend API" });
    }
};

// Routes
router.get('/fetch-route', fetchFrontendRoute);
router.get('/fetch-route-params', fetchFrontendRouteWithParams);
router.get('/fetch-extract', fetchAndExtractHTML);
router.get('/fetch-shopify', fetchWithShopifyHeaderFooter);
router.get('/fetch-api', fetchFrontendAPI);

module.exports = router;

/**
 * USAGE EXAMPLES:
 * 
 * 1. Simple fetch:
 *    GET /api/fetch-route?route=/consultant-cards
 * 
 * 2. With parameters:
 *    GET /api/fetch-route-params?route=/consultant-cards&customerId=123&shopId=456
 * 
 * 3. Extract HTML:
 *    GET /api/fetch-extract?route=/consultant-cards
 * 
 * 4. With Shopify:
 *    GET /api/fetch-shopify?shop=store.myshopify.com&route=/consultant-cards
 * 
 * 5. API route:
 *    GET /api/fetch-api?path=/api/data
 */

