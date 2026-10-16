# Astrology tools (Kundli · Panchang · Match Making)

Vedic astrology utilities on the storefront, built on the same Theme App Extension + App Proxy architecture as the consultant cards and My Profile. There is no separate frontend and no second auth system.

## 1. Architecture

```
Storefront page (/pages/astrology)
  └─ Theme App Extension block "Astrology Experience" (astrology.liquid + astrology.js/.css)
       └─ fetch /apps/advizo/astrology/*            (same-origin, Shopify App Proxy)
            └─ /api/app/advizo/astrology/*          (verifyAppProxy → astrologyController)
                 └─ services/astrology/index.js     (feature registry, validation, cache)
                      └─ jyotishamProvider.js       (only module with provider URL + key)
                           └─ normalizers/*.js      (provider JSON → Advizo shape)
```

| Path | Role |
|---|---|
| `Controller/astrologyController.js` | App Proxy handlers: identity, rate limits, save/history, safe errors |
| `services/astrology/index.js` | Feature registry: input parsing, provider calls, cache TTL, normalizer per feature |
| `services/astrology/jyotishamProvider.js` | HTTP client: auth header, timeout, envelope/error mapping, SVG checks |
| `services/astrology/geocodingProvider.js` | Place search → lat/lon + IANA time zone |
| `services/astrology/astrologyInput.js` | Validation; derives Jyotisham's decimal `tz` from the IANA zone **at the birth date/time** (handles DST/history) |
| `services/astrology/astrologyCache.js` | Short-lived cache (Redis if up, else memory) + in-flight de-duplication |
| `services/astrology/astrologyErrors.js` | Fixed error codes → safe user messages |
| `Modal/astrologyResult.js` | Saved readings (opt-in, owner-scoped, 90-day TTL) |
| `Utils/ensureAstrologyPage.js` | Creates `/pages/astrology` on install |

## 2. Theme App Extension blocks

- **Astrology Tools** (`blocks/astrology-tools.liquid`, `assets/astrology-tools.css`) is the entry cards block, placeable on the Home page or any landing page. It's static Liquid with one ~5 KB stylesheet: **no JS and no API calls**. Cards link to `/pages/astrology?tool=kundli|panchang|matchmaking`. Settings: eyebrow, heading, subtitle, show/hide each tool, CTA labels, background.
- **Astrology Experience** (`blocks/astrology.liquid`, `assets/astrology.js`, `assets/astrology.css`) is the tool itself. It's page-guarded to handle `astrology` (same convention as My Profile), so its JS/CSS never load elsewhere. Settings: heading, show/hide tools, chart style (north/south/east), optional consultants-page link.

The URL state is `?tool=` plus, for a saved reading, `&reading=<id>`. Birth data never goes in the URL. The last result per tool is kept in `sessionStorage` (this tab only), so a refresh doesn't re-spend provider credits.

## 3. Backend routes (all `verifyAppProxy`)

| Storefront URL | Purpose |
|---|---|
| `GET  /apps/advizo/astrology/config` | Is the feature available? Is the visitor signed in? Are guests allowed? |
| `GET  /apps/advizo/astrology/places?q=` | Place search |
| `POST /apps/advizo/astrology/:feature` | Run `kundli` / `panchang` / `matchmaking`; `save: true` persists (signed-in only) |
| `GET  /apps/advizo/astrology/history` | Caller's saved readings |
| `GET  /apps/advizo/astrology/history/:id` | One saved reading (owner only) |
| `POST /apps/advizo/astrology/history/:id/delete` | Delete (owner only) |

Errors are always `{ success:false, code, message[, field] }`. Codes are listed in `astrologyErrors.js`. Raw provider, axios, and Mongo errors are logged server-side only.

## 4. Jyotisham integration

Contract source: the provider's Postman collection (https://documenter.getpostman.com/view/22952033/2sA3s4nWfA).

- Base `https://api.jyotishamastroapi.com`, header `key: <API key>`, GET + query params.
- `date` is sent as `dd/mm/yyyy`, `time` as `HH:MM`, plus `latitude`, `longitude`, `tz` (decimal hours) and `lang=en`.
- Envelope `{ status, response, callsRemaining }`. A low `callsRemaining` is logged as a warning.

| Feature | Endpoints (provider calls per reading) |
|---|---|
| Kundli (7) | `extended_horoscope/extended_kundali`, `horoscope/planet-details`, `chart_image/d1`, `chart_image/d9`, `dasha/current-mahadasha`, `dosha/mangal_dosh`, `dosha/kaalsarp-dosh` |
| Panchang (1) | `panchang/panchang` |
| Match Making (2) | `matching/aggregate-match`, `matching/ashtakoot-astro` |

Kundli calls run in parallel. If an optional call fails, that section is listed in `unavailableSections` (never faked) and the partial result is **not** cached. Charts are SVG strings, rendered via `<img src="data:image/svg+xml…">`, so they can't execute script.

## 5. Environment variables (backend only)

| Variable | Required | Default |
|---|---|---|
| `ASTROLOGY_API_KEY` | **yes**: without it `/config` reports unavailable | — |
| `ASTROLOGY_API_BASE_URL` | no | `https://api.jyotishamastroapi.com` |
| `ASTROLOGY_API_TIMEOUT_MS` | no | `15000` |
| `ASTROLOGY_ALLOW_GUESTS` | no: `false` requires sign-in for all tools | `true` |
| `ASTROLOGY_GEOCODER_URL` | no | Open-Meteo geocoding |
| `ASTROLOGY_GEOCODER_API_KEY` | for commercial use of Open-Meteo | — |

Never put these in Liquid, theme settings, or storefront JS.

## 6. Authentication / App Proxy flow

Every request is HMAC-verified by `verifyAppProxy`. Identity comes from the existing `resolveStorefrontCustomer` (Shopify `logged_in_customer_id` → `manageShopifyUser`, with the app-cookie fallback). Ids sent from the browser are ignored. Guests can run calculations (unless `ASTROLOGY_ALLOW_GUESTS=false`). Saving and history require a resolved customer.

**Rate limits** (in `astrologyController.js`) are keyed per shop + customer (or forwarded client IP for guests), plus a per-shop guest ceiling. App Proxy traffic comes from Shopify's IPs, so plain per-IP limiting would throttle everyone together.

## 7. Result persistence

- **Default:** nothing is stored server-side. The result lives in the tab's `sessionStorage`.
- **Opt-in save** (signed-in customers, Kundli/Match): `AstrologyResult` stores `shop_id` + `user_id` + feature + the normalized input/result. It doesn't store raw provider payloads or keys. Repeat saves of the same input reuse the record (`inputHash`). Records expire automatically after 90 days (TTL index).
- **Ownership:** every read/delete filters on `{ _id, shop_id, user_id }`, so another customer's id simply returns 404.

## 8. Privacy

- The form carries a privacy note. Birth details are used for the calculation, and are stored only if the customer ticks "Save".
- The shared cache holds only calculation output keyed by shop + feature + exact inputs. Names are never part of it.
- `customers/redact` deletes that customer's saved readings. Uninstall/`shop/redact` purge them with the rest of the shop's data.

## 9. Adding another tool (e.g. Horoscope)

1. Add a provider method in `jyotishamProvider.js` (check the endpoint in the Postman collection).
2. Add `normalizers/<tool>Normalizer.js`. Read only fields the provider returns.
3. Add an entry to `FEATURES` in `services/astrology/index.js` (`parseInput`, `cacheParams`, `title`, `compute`, `cacheTtlSeconds`). The route `POST /apps/advizo/astrology/<tool>` works automatically.
4. In `assets/astrology.js`: add to `TOOLS`/`TOOL_ORDER`, a form branch in `formMarkup`, and a renderer in `resultMarkup`. Optionally add a card + `show_<tool>` setting to both blocks.

## Merchant setup

New installs get the **Astrology** page automatically. For shops installed before this feature, create a page with handle `astrology`. Then, in Theme Editor:

1. Open the Astrology page → *Create template* (`page.astrology`) → Add block → Apps → **Astrology Experience**.
2. Home page (or any landing page) → Add block → Apps → **Astrology Tools**.
