"use strict";

/**
 * Shop-domain validation — the single guard against SSRF and shop spoofing.
 *
 * Every place that builds an outbound URL from a `shop` value, or trusts a
 * `shop` param to identify a tenant, MUST pass it through isValidShopDomain
 * first. Only genuine "<store>.myshopify.com" hosts are allowed.
 */

const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const normalizeShop = (shop) =>
  String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

const isValidShopDomain = (shop) => {
  const host = normalizeShop(shop);
  return SHOP_REGEX.test(host) ? host : null;
};

module.exports = { isValidShopDomain, normalizeShop };
