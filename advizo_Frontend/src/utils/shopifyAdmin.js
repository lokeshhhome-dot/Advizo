import { Redirect } from "@shopify/app-bridge/actions";

export function getShopHandle(shop) {
  if (!shop) return "";
  return shop.includes(".myshopify.com")
    ? shop.replace(".myshopify.com", "")
    : shop;
}

export function getShopifyAdminMenusUrl(shop) {
  const handle = getShopHandle(shop);
  if (!handle) return null;
  return `https://admin.shopify.com/store/${handle}/content/menus/`;
}

export function openShopifyMenus(redirect, shop) {
  const url = getShopifyAdminMenusUrl(shop);
  if (!url || !redirect) return false;
  redirect.dispatch(Redirect.Action.REMOTE, url);
  return true;
}
