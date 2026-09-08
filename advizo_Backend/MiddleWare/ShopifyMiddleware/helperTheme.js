    // utils/shopifyProxy.js
    const axios = require("axios");
    const { wrapper } = require("axios-cookiejar-support");
    const { CookieJar } = require("tough-cookie");
    const { storefrontSectionCache } = require("../../Utils/ttlCache");
    const {
      cacheGetJSON,
      cacheSetJSON,
      cacheDelByPrefix,
    } = require("../../Utils/redis");

    const SECTION_CACHE_TTL_MS = 10 * 60 * 1000;
    // Stale copies live longer and are served only when a live Shopify fetch fails,
    // so a Shopify hiccup degrades to slightly-old markup instead of an error page.
    const STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    // De-duplicate concurrent fetches of the same asset: while one request is
    // downloading it, others await the same promise instead of re-fetching.
    const inFlightFetches = new Map();
    function dedupeFetch(key, factory) {
      const existing = inFlightFetches.get(key);
      if (existing) return existing;
      const promise = Promise.resolve()
        .then(factory)
        .finally(() => inFlightFetches.delete(key));
      inFlightFetches.set(key, promise);
      return promise;
    }

    function extractHeadHtml(html) {
      if (typeof html !== "string") return null;
      const match = html.match(/<head[\s\S]*?<\/head>/i);
      return match ? match[0] : null;
    }

    // ---------------------------------------------------------------------------
    // Two-level theme asset cache: L1 = process memory (storefrontSectionCache),
    // L2 = Redis (shared across PM2 instances / restarts). Redis keys are the
    // memory keys prefixed with "theme:". Fresh entries carry their absolute
    // expiry so an L1 promotion never extends the intended TTL.
    // ---------------------------------------------------------------------------

    /** Fresh copy: L1 → L2 (promoted into L1 with its remaining TTL). */
    const getFreshAsset = async (key) => {
      const fromMemory = storefrontSectionCache.get(key);
      if (fromMemory != null) return fromMemory;

      const wrapped = await cacheGetJSON(`theme:${key}`);
      if (wrapped && typeof wrapped.v === "string") {
        const remainingMs = Number(wrapped.exp) - Date.now();
        if (remainingMs > 1000) {
          storefrontSectionCache.set(key, wrapped.v, remainingMs);
          return wrapped.v;
        }
      }
      return null;
    };

    /** Stale copy: L1 → L2 (promoted into L1). */
    const getStaleAsset = async (key) => {
      const fromMemory = storefrontSectionCache.get(`${key}:stale`);
      if (fromMemory != null) return fromMemory;

      const wrapped = await cacheGetJSON(`theme:${key}:stale`);
      if (wrapped && typeof wrapped.v === "string") {
        storefrontSectionCache.set(`${key}:stale`, wrapped.v, STALE_CACHE_TTL_MS);
        return wrapped.v;
      }
      return null;
    };

    /** Write-through to both levels, fresh + stale copies. */
    const writeAsset = (key, value) => {
      storefrontSectionCache.set(key, value, SECTION_CACHE_TTL_MS);
      storefrontSectionCache.set(`${key}:stale`, value, STALE_CACHE_TTL_MS);
      // Redis writes are fire-and-forget: cacheSetJSON never throws, and a Redis
      // outage must never slow down or break a storefront response.
      cacheSetJSON(
        `theme:${key}`,
        { v: value, exp: Date.now() + SECTION_CACHE_TTL_MS },
        Math.ceil(SECTION_CACHE_TTL_MS / 1000),
      );
      cacheSetJSON(
        `theme:${key}:stale`,
        { v: value },
        Math.ceil(STALE_CACHE_TTL_MS / 1000),
      );
    };

    /**
     * Event-driven invalidation (theme webhooks): drop every cached theme asset
     * for a shop from memory AND Redis. The next request rebuilds the cache —
     * nothing is scraped eagerly.
     */
    const invalidateThemeAssets = async (shopDomain) => {
    console.log(`[webhook]  received for ${shopDomain}`);

      if (!shopDomain) return;
      const memDeleted = storefrontSectionCache.deleteByPrefix(
        `section:${shopDomain}:`,
      );
      const redisDeleted = await cacheDelByPrefix(`theme:section:${shopDomain}:`);
      console.log(
        `[themeCache] invalidated for ${shopDomain} (memory: ${memDeleted}, redis: ${redisDeleted})`,
      );
    };

    /**
     * Stale-while-revalidate refresher. Runs at most once per shop/theme at a
     * time (piggybacks on inFlightFetches) and rebuilds all three assets through
     * the normal fetch path, including the password-store unlock.
     */
    const scheduleBackgroundRevalidate = (shop, themeId) => {
      const jobKey = `revalidate:${shop}:${themeId || "default"}`;
      if (inFlightFetches.has(jobKey)) return;


      setTimeout(() => {
        const job = (async () => {
          let assets = await loadPageAssets(shop, themeId, "", "node", null, {
            forceFresh: true,
          });

          if (assets.needsPassword) {
            const client = await handleStorefrontPassword(shop, "node");
            if (client) {
              await loadPageAssets(shop, themeId, "", "node", client, {
                forceFresh: true,
              });
            }
          }
          console.log(`[themeCache] background revalidate completed for ${shop}`);
        })()
          .catch((err) =>
            console.error(
              `[themeCache] background revalidate failed for ${shop}:`,
              err.message,
            ),
          )
          .finally(() => inFlightFetches.delete(jobKey));

        inFlightFetches.set(jobKey, job);
      }, [10])
    };


    async function fetchWithCookies(url, cookieHeader, userAgent) {
      return fetch(url, {
        headers: { Cookie: cookieHeader, "User-Agent": userAgent },
        redirect: "manual",
      });
    }

    async function handleStorefrontPassword(shop, userAgent) {
      const storefrontPassword = process.env.STOREFRONT_PASSWORD || null;
      if (!storefrontPassword) return null;

      const jar = new CookieJar();
      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
          headers: { "User-Agent": userAgent },
        }),
      );

      try {
        await client.get(`https://${shop}/password`).catch(() => { });
        await client.post(
          `https://${shop}/password`,
          new URLSearchParams({ password: storefrontPassword }).toString(),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            maxRedirects: 0,
            validateStatus: () => true,
          },
        );
        return client;
      } catch {
        return null;
      }
    }

    function injectTheme(url, themeId) {
      return themeId ? `${url}${url.includes("?") ? "&" : "?"}theme_id=${themeId}` : url;
    }

    function sectionCacheKey(shop, themeId, section) {
      return `section:${shop}:${themeId || "default"}:${section}`;
    }

    async function fetchSectionHtml(url, cookieHeader, userAgent, client) {
      if (client) {
        return (await client.get(url)).data;
      }
      const response = await fetchWithCookies(url, cookieHeader, userAgent);
      return response.text();
    }

    async function loadPageAssets(shop, themeId, cookieHeader, userAgent, client, options = {}) {
      const { forceFresh = false } = options;
      // NEVER forward the visitor's cookies to the scrape. The result is cached
      // and served to EVERYONE, so it must be the anonymous published-theme
      // render — a merchant's theme-preview session cookie would otherwise pin
      // the scrape (and thus the shared cache) to an old/unpublished theme, and
      // a logged-in customer's cart state would leak into everyone's header.
      cookieHeader = "";
      const homeUrl = injectTheme(`https://${shop}/`, themeId);
      const headerUrl = injectTheme(`https://${shop}/?section_id=header`, themeId);
      const footerUrl = injectTheme(`https://${shop}/?section_id=footer`, themeId);

      const headKey = sectionCacheKey(shop, themeId, "head");
      const headerKey = sectionCacheKey(shop, themeId, "header");
      const footerKey = sectionCacheKey(shop, themeId, "footer");
      const cachedHead = forceFresh ? null : await getFreshAsset(headKey);
      const cachedHeader = forceFresh ? null : await getFreshAsset(headerKey);
      const cachedFooter = forceFresh ? null : await getFreshAsset(footerKey);

      // Stale-while-revalidate: if every piece that lost its fresh copy still has
      // a stale one, serve instantly from stale and refresh in the background —
      // the user never waits on a Shopify fetch after the first-ever load.
      if (!forceFresh && (cachedHead == null || cachedHeader == null || cachedFooter == null)) {
        const staleHead = cachedHead != null ? null : await getStaleAsset(headKey);
        const staleHeader = cachedHeader != null ? null : await getStaleAsset(headerKey);
        const staleFooter = cachedFooter != null ? null : await getStaleAsset(footerKey);

        const headOk = cachedHead != null || staleHead != null;
        const headerOk = cachedHeader != null || staleHeader != null;
        const footerOk = cachedFooter != null || staleFooter != null;

        if (headOk && headerOk && footerOk) {
          scheduleBackgroundRevalidate(shop, themeId);
          return {
            homeResp: null,
            headHtml: cachedHead != null ? cachedHead : staleHead,
            headerHtml: cachedHeader != null ? cachedHeader : staleHeader,
            footerHtml: cachedFooter != null ? cachedFooter : staleFooter,
            needsPassword: false,
            servedStale: true,
          };
        }
      }

      // The homepage is downloaded only to extract its <head>; skip it entirely
      // when a cached copy exists. The dedupe key includes the client flag so a
      // password-unlocked fetch is never shared with an anonymous one.
      const homePromise = cachedHead
        ? Promise.resolve(null)
        : dedupeFetch(`home:${headKey}:${client ? "auth" : "anon"}`, async () => {
          if (client) {
            const resp = await client.get(homeUrl);
            return {
              status: resp.status,
              html: typeof resp.data === "string" ? resp.data : "",
            };
          }
          const resp = await fetchWithCookies(homeUrl, cookieHeader, userAgent);
          return { status: resp.status, html: await resp.text() };
        });

      const headerPromise = cachedHeader
        ? Promise.resolve(cachedHeader)
        : dedupeFetch(headerKey, () =>
          fetchSectionHtml(headerUrl, cookieHeader, userAgent, client),
        );

      const footerPromise = cachedFooter
        ? Promise.resolve(cachedFooter)
        : dedupeFetch(footerKey, () =>
          fetchSectionHtml(footerUrl, cookieHeader, userAgent, client),
        );

      let homeErr, headerErr, footerErr;
      const [home, headerFetched, footerFetched] = await Promise.all([
        homePromise.catch((e) => ((homeErr = e), null)),
        headerPromise.catch((e) => ((headerErr = e), null)),
        footerPromise.catch((e) => ((footerErr = e), null)),
      ]);

      const needsPassword =
        !client &&
        home !== null &&
        home.status !== undefined &&
        home.status >= 300 &&
        home.status < 400;

      // Live fetch failed → serve the stale copy if one exists, otherwise rethrow
      // so callers keep their existing error handling.
      let headHtml = cachedHead || (home ? extractHeadHtml(home.html) : null);
      if (homeErr) {
        headHtml = await getStaleAsset(headKey);
        if (!headHtml) throw homeErr;
      }
      let headerHtml = headerFetched;
      if (headerErr) {
        headerHtml = await getStaleAsset(headerKey);
        if (headerHtml == null) throw headerErr;
      }
      let footerHtml = footerFetched;
      if (footerErr) {
        footerHtml = await getStaleAsset(footerKey);
        if (footerHtml == null) throw footerErr;
      }

      if (!needsPassword) {
        if (!cachedHead && !homeErr && headHtml) {
          writeAsset(headKey, headHtml);
        }
        if (!cachedHeader && !headerErr && typeof headerHtml === "string") {
          writeAsset(headerKey, headerHtml);
        }
        if (!cachedFooter && !footerErr && typeof footerHtml === "string") {
          writeAsset(footerKey, footerHtml);
        }
      }

      return { homeResp: home, headHtml, headerHtml, footerHtml, needsPassword };
    }

    async function resolvePageAssets(req) {
      const shop = req.query.shop;
      const themeId = req.query.theme_id;
      const cookieHeader = req.headers.cookie || "";
      const userAgent = req.headers["user-agent"] || "node";

      let assets = await loadPageAssets(shop, themeId, cookieHeader, userAgent, null);
      if (assets.needsPassword) {
        const client = await handleStorefrontPassword(shop, userAgent);
        if (!client) {
          return { error: "password" };
        }
        assets = await loadPageAssets(shop, themeId, cookieHeader, userAgent, client);
      }

      return assets;
    }

    /**
     * MAIN REUSABLE FUNCTION
     */
    async function renderShopifyPage(req, res, iframeUrl, chat = "", options = {}) {
      const shop = req.query.shop;
      const themeId = req.query.theme_id;
      const cookieHeader = req.headers.cookie || "";
      const userAgent = req.headers["user-agent"] || "node";

      try {
        let extractedHead;
        let headerHtml;
        let footerHtml;

        if (options.preloadedAssets) {
          ({ headHtml: extractedHead, headerHtml, footerHtml } = options.preloadedAssets);
        } else {
          let assets = await loadPageAssets(shop, themeId, cookieHeader, userAgent, null);

          if (assets.needsPassword) {
            const client = await handleStorefrontPassword(shop, userAgent);
            if (!client) return res.status(401).send("Storefront locked. Provide password.");
            assets = await loadPageAssets(shop, themeId, cookieHeader, userAgent, client);
          }

          ({ headHtml: extractedHead, headerHtml, footerHtml } = assets);
        }

        // const headHtml =
        //   extractedHead ||
        //   `
        //   <head>
        //     <meta charset="UTF-8" />
        //     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        //     <title>${options.title || "Shopify Embedded App"}</title>
        //   </head>`;


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

        // When fixedHeight is set, the iframe is locked to the viewport height and
        // scrolls internally (no iframe-resizer). This prevents the auto-resize
        // feedback loop where an inner "min-height:100vh" grows the iframe forever.
        const fixedHeight = Boolean(options.fixedHeight);
        // Non-fixed pages: NO viewport-height stretching. The iframe auto-resizes
        // to its content, so the page height = header + content + footer — the
        // footer hugs short content instead of being pushed a full viewport down.
        const bodyStyle = fixedHeight
          ? "margin:0;padding:0;display:flex;flex-direction:column;height:100vh;overflow:hidden;"
          : "margin:0;padding:0;display:flex;flex-direction:column;";
        // z-index on the call/chat main: if the iframe ever overflows on a short
        // viewport, it must paint (and receive clicks) ABOVE the theme footer —
        // otherwise the footer bleeds through the call card and eats the End
        // Call button's clicks.
        const mainStyle = fixedHeight
          ? "flex:1;position:relative;min-height:0;z-index:2;"
          : "position:relative;";
        const iframeHeight = fixedHeight ? "100%" : "auto";
        const iframeResizeScript = fixedHeight
          ? ""
          : `iFrameResize({
                  checkOrigin: false,
                  autoResize: true,
                  heightCalculationMethod: "bodyScroll",
                  minHeight: 200,
                }, "#agora-iframe");`;




        const pageHtml = `
          <!DOCTYPE html>
          <html>
            ${finalHead}
          <body style="${bodyStyle}">
              <!-- position:relative is load-bearing: the theme's mobile menu
                  drawer is absolutely positioned at top:100% of its nearest
                  positioned ancestor. On the real storefront that's the theme
                  layout's sticky header wrapper, which section rendering does
                  not include — without this the drawer opens below the entire
                  document, off-screen. -->
              <header style="flex-shrink:0;position:relative;z-index:20;">
                  ${chat === "chatSection" ? "" : headerHtml}

              </header>
              <main style="${mainStyle}">
              <iframe
                  id="agora-iframe"
                  src="${iframeUrl}"
                  allow="microphone; camera"
                  style="border:none;width:100%;height:${iframeHeight};min-height:${fixedHeight ? "76vh" : "200px"};display:block;"
                >
              </iframe>
              </main>
              <footer style="flex-shrink:0;">

                ${chat === "chatSection" ? "" : footerHtml}
              </footer>
              <!-- Parent script (MUST HAVE) -->
              <script src="https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.3.6/iframeResizer.min.js"></script>
              <script>
                    window.addEventListener("message", (event) => {

                        if (event.data.type === "SHOW_TOAST") {
                            console.log("Received postMessage:",  event.data);
                            console.log("Received postMessage:",  event.data.message);

                          showToast(event.data.message);
                        }

                        // ConsultantChatModal (inside the #agora-iframe iframe, e.g.
                        // on the view-profile page) posts these when the customer
                        // opens/closes the Chat modal. CSS inside that iframe's own
                        // document can never cover THIS page's real Shopify
                        // header/footer, so this parent document resizes the
                        // <iframe> ELEMENT itself to fullscreen instead — only
                        // these two exact message types are handled.
                        if (event.data.type === "CONSULTLY_CHAT_OPEN") {
                          var chatIframe = document.getElementById("agora-iframe");
                          if (chatIframe) {
                            chatIframe.dataset.advizoChatOpen = "true";
                            chatIframe.style.position = "fixed";
                            chatIframe.style.top = "0";
                            chatIframe.style.left = "0";
                            chatIframe.style.width = "100vw";
                            chatIframe.style.height = "100vh";
                            chatIframe.style.maxWidth = "100vw";
                            chatIframe.style.zIndex = "999999999";
                          }
                        }

                        if (event.data.type === "CONSULTLY_CHAT_CLOSE") {
                          var chatIframeClose = document.getElementById("agora-iframe");
                          if (chatIframeClose) {
                            chatIframeClose.dataset.advizoChatOpen = "false";
                            chatIframeClose.style.position = "";
                            chatIframeClose.style.top = "";
                            chatIframeClose.style.left = "";
                            chatIframeClose.style.width = "";
                            chatIframeClose.style.height = "";
                            chatIframeClose.style.maxWidth = "";
                            chatIframeClose.style.zIndex = "";
                          }
                        }
                      });

                        function showToast(message) {
                          const toast = document.createElement("div");

                          toast.innerHTML = \`
                            <div style="
                              display:flex;
                              gap:12px;
                              align-items:center;
                            ">

                              <div style="
                                width:40px;
                                height:40px;
                                border-radius:50%;
                                overflow:hidden;
                                background:#eee;
                                flex-shrink:0;
                              ">
                                <img 
                                  src="https://i.pinimg.com/736x/95/2a/ae/952aaea466ae9fb09f02889d33967cf6.jpg"
                                  style="width:100%;height:100%;object-fit:cover;"
                                />
                              </div>

                              <div style="flex:1;">
                                <div style="
                                  font-weight:600;
                                  font-size:15px;
                                  color:#202223;
                                ">
                                  New Message
                                </div>
                                <div style="
                                  font-size:14px;
                                  color:#4a4a4a;
                                ">
                                  \${message}
                                </div>
                              </div>

                              <div 
                                style="
                                  font-size:22px;
                                  cursor:pointer;
                                  color:#666;
                                  padding:4px;
                                "
                                onclick="this.parentNode.parentNode.remove()"
                              >
                                ×
                              </div>
                            </div>
                          \`;
                          

                    // MAIN CARD STYLE
                    toast.style.position = "fixed";
                    toast.style.top = "20px";
                    toast.style.right = "20px";
                    toast.style.background = "#fff";
                    toast.style.borderRadius = "12px";
                    toast.style.boxShadow = "0 4px 18px rgba(0,0,0,0.18)";
                    toast.style.padding = "14px 16px";
                    toast.style.minWidth = "280px";
                    toast.style.maxWidth = "340px";
                    toast.style.zIndex = "999999";
                    toast.style.opacity = "0";
                    toast.style.transform = "translateY(-10px)";
                    toast.style.transition = "all .3s ease";

                    document.body.appendChild(toast);

                    // Fade-in
                    setTimeout(() => {
                      toast.style.opacity = "1";
                      toast.style.transform = "translateY(0)";
                    }, 10);

                    // Auto Remove
                    setTimeout(() => {
                      toast.style.opacity = "0";
                      toast.style.transform = "translateY(-10px)";
                    }, 3500);

                    setTimeout(() => toast.remove(), 4000);
                  }

                ${iframeResizeScript}
              </script>

              <!-- Theme bridge: detect the store's accent color and hand it to the
                  call iframe so the call UI matches this storefront's theme. -->
              <script>
                (function () {
                  function toHex(color) {
                    if (!color) return null;
                    color = String(color).trim();
                    var hex = color.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
                    if (hex) {
                      var h = hex[1];
                      if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
                      return "#" + h.toLowerCase();
                    }
                    var rgb = color.match(/(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/);
                    if (rgb) {
                      return "#" + [rgb[1], rgb[2], rgb[3]].map(function (n) {
                        var x = parseInt(n, 10).toString(16);
                        return x.length === 1 ? "0" + x : x;
                      }).join("");
                    }
                    return null;
                  }

                  function detectAccent() {
                    try {
                      var meta = document.querySelector('meta[name="theme-color"]');
                      if (meta && meta.content) {
                        var m = toHex(meta.content);
                        if (m && m !== "#ffffff" && m !== "#000000") return m;
                      }
                      var rs = getComputedStyle(document.documentElement);
                      var vars = ["--color-button", "--color-base-accent-1", "--color-primary",
                                  "--colorAccent", "--color-accent", "--buttons-background",
                                  "--color-link", "--primary-color"];
                      for (var i = 0; i < vars.length; i++) {
                        var v = rs.getPropertyValue(vars[i]).trim();
                        var h = toHex(v);
                        if (h && h !== "#ffffff" && h !== "#000000") return h;
                      }
                      var btn = document.querySelector(
                        'button[type="submit"], .btn, .button, .shopify-payment-button__button, a.button'
                      );
                      if (btn) {
                        var bg = getComputedStyle(btn).backgroundColor;
                        var hb = toHex(bg);
                        if (hb && hb !== "#ffffff" && hb !== "#000000") return hb;
                      }
                    } catch (e) {}
                    return null;
                  }

                  function sendTheme() {
                    var accent = detectAccent();
                    if (!accent) return;
                    var frame = document.getElementById("agora-iframe");
                    if (frame && frame.contentWindow) {
                      frame.contentWindow.postMessage({ type: "CALL_THEME", accent: accent }, "*");
                    }
                  }

                  var frameEl = document.getElementById("agora-iframe");
                  if (frameEl) {
                    frameEl.addEventListener("load", function () { setTimeout(sendTheme, 300); });
                  }
                  setTimeout(sendTheme, 800);
                  // Resend whenever the call iframe asks (it may mount after we post).
                  window.addEventListener("message", function (ev) {
                    if (ev.data && ev.data.type === "CALL_THEME_REQUEST") sendTheme();
                  });
                })();
              </script>
            </body>
          </html>`;

        // Composed page is personalized (auth token cookie) and theme-dependent —
        // never let the browser or an intermediary cache it.
        res.set("Cache-Control", "no-store");
        return res.status(200).send(pageHtml);
      } catch (err) {
        console.error("Shopify proxy error:", err);
        return res.status(500).send("Failed to load Shopify page");
      }
    }

    module.exports = {
      renderShopifyPage,
      loadPageAssets,
      handleStorefrontPassword,
      resolvePageAssets,
      invalidateThemeAssets,
    };
