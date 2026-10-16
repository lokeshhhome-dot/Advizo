/**
 * Short-lived result cache + in-flight de-duplication for provider calls.
 *
 * Why this is safe to share: the cached value is a pure function of the
 * calculation inputs (date, time, coordinates, offset, options). It never
 * contains the person's name or any account data, and the key includes
 * shop + feature + every input, so a cache hit can only ever return what the
 * requester's own inputs would compute anyway.
 *
 * Redis (Utils/redis) when available, else an in-process TtlCache.
 * Concurrent identical requests (double click, two tabs) share ONE provider
 * call via the in-flight map instead of each spending credits.
 */
const crypto = require("crypto");
const { cacheGetJSON, cacheSetJSON } = require("../../Utils/redis");
const { TtlCache } = require("../../Utils/ttlCache");

const memory = new TtlCache({ maxEntries: 500 });
const inFlight = new Map();

const buildKey = (shop, feature, params) =>
  `astro:v1:${feature}:${crypto
    .createHash("sha256")
    .update(`${shop}|${feature}|${JSON.stringify(params)}`)
    .digest("hex")}`;

const read = async (key) => {
  const fromMemory = memory.get(key);
  if (fromMemory !== null) return fromMemory;
  const fromRedis = await cacheGetJSON(key);
  if (fromRedis !== null) memory.set(key, fromRedis, 60 * 1000);
  return fromRedis;
};

const write = async (key, value, ttlSeconds) => {
  memory.set(key, value, ttlSeconds * 1000);
  await cacheSetJSON(key, value, ttlSeconds);
};

/**
 * @param {(value:any) => boolean} [shouldCache] e.g. skip partial results
 * @returns {Promise<{ value: any, cached: boolean }>}
 */
const getOrCompute = async (key, ttlSeconds, compute, shouldCache = () => true) => {
  const hit = await read(key);
  if (hit !== null) return { value: hit, cached: true };

  if (inFlight.has(key)) return { value: await inFlight.get(key), cached: true };

  const promise = (async () => {
    const value = await compute();
    if (value && ttlSeconds > 0 && shouldCache(value)) await write(key, value, ttlSeconds);
    return value;
  })();
  inFlight.set(key, promise);
  try {
    return { value: await promise, cached: false };
  } finally {
    inFlight.delete(key);
  }
};

module.exports = { buildKey, getOrCompute };
