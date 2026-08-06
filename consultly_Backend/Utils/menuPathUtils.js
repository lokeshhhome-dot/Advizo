const REQUIRED_MENU_PATHS = [
  "https://the-bhaisaab.myshopify.com/apps/consultly",
  "https://the-bhaisaab.myshopify.com/apps/consultly/login",
  "https://the-bhaisaab.myshopify.com/apps/consultly/profile",
];

function normalizeMenuPath(url) {
  if (!url || typeof url !== "string") return "";

  const raw = url.trim().split("?")[0].split("#")[0];

  try {
    const path = raw.startsWith("http") ? new URL(raw).pathname : raw;
    if (!path) return "";
    const normalized = path.replace(/\/+$/, "");
    return normalized || "/";
  } catch {
    const normalized = raw.replace(/\/+$/, "");
    return normalized || "/";
  }
}

function flattenMenuItems(items = []) {
  return items.flatMap((item) => [
    item,
    ...flattenMenuItems(item.items || []),
  ]);
}

function getMissingRequiredMenus(menuItems) {
  const menuPaths = flattenMenuItems(menuItems).map((item) =>
    normalizeMenuPath(item.url),
  );

  return REQUIRED_MENU_PATHS.filter(
    (required) =>
      !menuPaths.some(
        (path) =>
          path === normalizeMenuPath(required) ||
          path.endsWith(normalizeMenuPath(required)),
      ),
  );
}

module.exports = {
  REQUIRED_MENU_PATHS,
  normalizeMenuPath,
  flattenMenuItems,
  getMissingRequiredMenus,
};
