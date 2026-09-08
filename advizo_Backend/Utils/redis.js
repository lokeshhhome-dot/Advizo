"use strict";



const redis = require("redis");

const REDIS_URL = process.env.REDIS_URL || "";
const CACHE_ENABLED = Boolean(REDIS_URL);

const COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 50);

let client = null;
let ready = false;
let loggedDown = false;


const withTimeout = (promise, fallback) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), COMMAND_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const initRedis = () => {
  if (!CACHE_ENABLED) {
    console.log("[redis] REDIS_URL not set — cache disabled, serving from MongoDB");
    return null;
  }
  if (client) return client;

  client = redis.createClient({
    url: REDIS_URL,
    socket: {
      // Back off on reconnect instead of hammering a dead server. Capped so a
      // recovered Redis is picked back up within a few seconds.
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
      connectTimeout: 5000,
    },
  });

  // MANDATORY: without this listener an emitted 'error' takes the process down.
  client.on("error", (err) => {
    ready = false;
    if (!loggedDown) {
      console.error("[redis] unavailable — falling back to MongoDB:", err.message);
      loggedDown = true; // log once per outage, don't flood the logs on retries
    }
  });

  client.on("ready", () => {
    ready = true;
    loggedDown = false;
    console.log("[redis] connected — consultant list cache active");
  });

  client.on("end", () => {
    ready = false;
  });

  // Fire-and-forget: never block server boot on the cache.
  client.connect().catch((err) => {
    console.error("[redis] initial connect failed — serving from MongoDB:", err.message);
  });

  return client;
};

const isReady = () => CACHE_ENABLED && ready && client?.isOpen;

/** @returns {Promise<any|null>} parsed value, or null on miss/any failure. */
const cacheGetJSON = async (key) => {
  if (!isReady()) return null;
  try {
    const raw = await withTimeout(client.get(key), null);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null; // treat every failure as a cache miss
  }
};

const cacheSetJSON = async (key, value, ttlSeconds) => {
  if (!isReady()) return false;
  try {
    await withTimeout(client.set(key, JSON.stringify(value), { EX: ttlSeconds }), false);
    return true;
  } catch (err) {
    return false;
  }
};

const cacheDel = async (key) => {
  if (!isReady()) return false;
  try {
    await withTimeout(client.del(key), false);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Delete every key starting with `prefix` (SCAN-based, non-blocking).
 * Used for event-driven invalidation (e.g. theme webhooks). Handles both
 * node-redis v4 (yields single keys) and v5 (yields batches).
 * @returns {Promise<number>} deleted count (0 on any failure).
 */
const cacheDelByPrefix = async (prefix) => {
  if (!isReady()) return 0;
  try {
    let deleted = 0;
    for await (const reply of client.scanIterator({
      MATCH: `${prefix}*`,
      COUNT: 100,
    })) {
      const keys = Array.isArray(reply) ? reply : [reply];
      if (keys.length) {
        await client.del(keys);
        deleted += keys.length;
      }
    }
    return deleted;
  } catch (err) {
    return 0;
  }
};

// ---- Consultant list cache ----
//
// `v1` is a schema version. If the shape of the cached payload ever changes,
// bump it to invalidate every existing entry at once — no manual FLUSH needed.
const consultantListKey = (shopId) => `consultants:v1:${String(shopId)}`;

/**
 * Drop the cached consultant list for a shop.
 *
 * Call this from EVERY write that changes a field getConsultant returns —
 * including presence (isActive) and busy (isBusy), which are the volatile ones.
 * Safe to call when Redis is down or disabled: it no-ops.
 */
const invalidateConsultantList = async (shopId) => {
  if (!shopId) return false;
  return cacheDel(consultantListKey(shopId));
};

module.exports = {
  initRedis,
  isReady,
  cacheGetJSON,
  cacheSetJSON,
  cacheDel,
  cacheDelByPrefix,
  consultantListKey,
  invalidateConsultantList,
};
