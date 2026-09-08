/**
 * Build a call page URL on the shop app-proxy when possible so localStorage
 * and app-status checks stay on the same origin as the storefront / consultant UI.
 */
export const buildCallPageUrl = ({
  shop,
  shopId,
  callerId,
  receiverId,
  callType,
  uid,
  channelName,
  agoraToken,
  appId,
  userId,
  userType,
  returnUrl,
  authToken,
  // When true, always build the direct frontend URL even if `shop` is known
  // — used by the modal-based call flows (Consultant Dashboard's call modal,
  // the theme's in-page call overlay) so the call UI loads with no Shopify
  // theme chrome wrapped around it. Existing callers omit this and keep
  // getting the shop app-proxy URL exactly as before.
  direct = false,
}) => {
  const params = new URLSearchParams();
  params.set("callerId", callerId);
  params.set("receiverId", receiverId);
  params.set("callType", callType || "voice");
  params.set("uid", String(uid));
  params.set("channelName", channelName);
  params.set("token", agoraToken);
  // App JWT so the call window can authenticate its socket + API calls even
  // when localStorage was wiped by a role switch (URL is authoritative).
  if (authToken) params.set("authToken", authToken);
  if (appId) params.set("appId", appId);
  if (userId) params.set("userId", userId);
  if (userType) params.set("userType", userType);
  if (shop) params.set("shop", shop);
  if (shopId) params.set("shopId", shopId);
  if (returnUrl) params.set("returnUrl", returnUrl);

  const query = params.toString();

  if (shop && !direct) {
    return `https://${shop}/apps/advizo/video-calling-page?${query}`;
  }

  const frontendBase =
    process.env.REACT_APP_FRONTEND_URL || window.location.origin;
  return `${frontendBase.replace(/\/$/, "")}/video/calling/page?${query}`;
};
