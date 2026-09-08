/**
 * React App HTML Fetcher with Absolute URL Conversion
 * 
 * Fetches React app HTML and converts all relative paths to absolute URLs
 * 
 * Usage:
 * const { fetchReactAppHTML } = require('./utils/reactAppFetcher');
 * const html = await fetchReactAppHTML('https://your-react-app.com');
 */

/**
 * Fetches React app HTML and converts all relative paths to absolute URLs
 * @param {string} reactAppBaseUrl - Base URL of React app (e.g., 'https://projectable-eely-minerva.ngrok-free.dev')
 * @returns {Promise<string>} HTML with all paths converted to absolute URLs
 */
async function fetchReactAppHTML(reactAppBaseUrl) {
    const baseUrl = reactAppBaseUrl.replace(/\/$/, '');
    
    try {
        // Fetch index.html from React app
        const indexResponse = await fetch(`${baseUrl}/index.html`);
        
        if (!indexResponse.ok) {
            throw new Error(`Failed to fetch React app: ${indexResponse.status} ${indexResponse.statusText}`);
        }
        
        let html = await indexResponse.text();
        console.log('✅ Fetched React app HTML');
        
        // Convert script tags with src="/static/..." to absolute URLs
        html = html.replace(
            /<script\s+([^>]*src=["'])(\/[^"']+)(["'][^>]*>)/gi,
            (match, prefix, src, suffix) => {
                // Skip if already absolute
                if (src.startsWith('http://') || src.startsWith('https://')) {
                    return match;
                }
                return `${prefix}${baseUrl}${src}${suffix}`;
            }
        );
        
        // Convert defer scripts specifically
        html = html.replace(
            /<script\s+defer=["']defer["']\s+src=["'](\/[^"']+)["']/gi,
            (match, src) => {
                if (src.startsWith('http://') || src.startsWith('https://')) {
                    return match;
                }
                return `<script defer="defer" src="${baseUrl}${src}"`;
            }
        );
        
        // Convert CSS link tags
        html = html.replace(
            /<link\s+([^>]*href=["'])(\/[^"']+)(["'][^>]*rel=["']stylesheet["'][^>]*>)/gi,
            (match, prefix, href, suffix) => {
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    return match;
                }
                return `${prefix}${baseUrl}${href}${suffix}`;
            }
        );
        
        // Convert other relative URLs (favicon, manifest, images, etc.)
        html = html.replace(
            /(href|src)=["'](\/[^"']+)["']/gi,
            (match, attr, url) => {
                // Skip if already absolute or data URLs
                if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('//')) {
                    return match;
                }
                return `${attr}="${baseUrl}${url}"`;
            }
        );
        
        console.log('✅ Converted all relative paths to absolute URLs');
        return html;
        
    } catch (error) {
        console.error('❌ Error fetching React app HTML:', error);
        throw error;
    }
}

module.exports = { fetchReactAppHTML };

