class TtlCache {
  constructor({ maxEntries = 500 } = {}) {
    this.store = new Map();
    this.maxEntries = maxEntries;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async getOrSet(key, ttlMs, factory) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    const value = await factory();
    if (value !== null && value !== undefined) {
      this.set(key, value, ttlMs);
    }
    return value;
  }

  delete(key) {
    this.store.delete(key);
  }

  /** Delete every entry whose key starts with `prefix`. Returns count. */
  deleteByPrefix(prefix) {
    let deleted = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}

const shopDocCache = new TtlCache({ maxEntries: 200 });
const storefrontSessionCache = new TtlCache({ maxEntries: 1000 });
const storefrontSectionCache = new TtlCache({ maxEntries: 300 });
const userTokenCache = new TtlCache({ maxEntries: 1000 });
// One-time exchange codes for the Theme Extension chat overlay — see
// proxyShopifyStorefrontChat / exchangeChatSession in shopifyController.js.
// Short-lived (minted with a TTL well under its own maxEntries turnover) and
// deleted the moment they're redeemed, same get/set/delete this file already
// provides for every other short-lived server-side value.
const chatExchangeCache = new TtlCache({ maxEntries: 2000 });

module.exports = {
  TtlCache,
  shopDocCache,
  storefrontSessionCache,
  storefrontSectionCache,
  userTokenCache,
  chatExchangeCache,
};
