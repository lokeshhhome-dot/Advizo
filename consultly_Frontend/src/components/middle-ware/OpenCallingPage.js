import axios from "axios";
import { openCallWindow, CALL_WINDOW_NAME } from "../../utils/callWindow";
import { buildCallPageUrl } from "../../utils/buildCallPageUrl";
import { checkMicPermission } from "../ConsultantCards/ConsultantCards";
import { checkUserStatus } from "./CheckUserStatus";

export const checkUserBalance = async ({
  userId,
  consultantId,
  type,
  shop,
  authToken = "",
}) => {
  // A missing id is a data problem, not an authentication problem. Throwing the
  // whole storefront tab at https://{shop}/account/login (which new customer
  // accounts turn into accounts.shopify.com/lookup) logged out shoppers who
  // were perfectly signed in. Report the failure and let the caller decide.
  if (!userId || !consultantId) {
    console.warn("[call] balance check skipped — missing identifier", {
      hasUserId: Boolean(userId),
      hasConsultantId: Boolean(consultantId),
    });
    return false;
  }
  try {
    const response = await axios.get(
      `${process.env.REACT_APP_BACKEND_HOST}/users/shopify/users/checked-balance/${userId}/${consultantId}`,
      {
        params: {
          callType: type,
        },
        headers: {
          Authorization: `Bearer ${authToken || localStorage.getItem("token") || ""}`,
        },
      },
    );
    return response.data.data;
  } catch (error) {
    return false;
  }
};

export const openCallPage = async ({
  receiverId,
  type,
  userId,
  shop,
  shopId,
  authToken = "",
  // True when this call was started from the in-page call overlay (theme
  // card → call modal) instead of the legacy full-page /view-profile flow.
  // Keeps the call UI navigating inside that same overlay iframe (direct
  // frontend URL, no shop app-proxy hop — which would otherwise wrap it in
  // ANOTHER Shopify theme shell nested inside the overlay) instead of
  // breaking out to the top-level tab like the legacy flow still does.
  embedded = false,
}) => {
  // Safari: window.open must run synchronously inside the click gesture —
  // after the awaits below it gets popup-blocked. Open the named window now
  // (blank) and navigate it once the Agora token is ready.
  // let callWin = null;
  // try {
  //   callWin = window.open("", CALL_WINDOW_NAME);
  // } catch (_) { }
  // let callWin = null;

  // try {
  //   callWin = window.open("", CALL_WINDOW_NAME);

  //   console.log("Popup created:", callWin);
  //   console.log("Current page:", window.location.href);
  // } catch (e) {
  //   console.error(e);
  // }
  // const closeCallWin = () => {
  //   try { callWin?.close(); } catch (_) { }
  // };
  try {
    // Fresh token handed by the caller page wins over possibly-stale storage.
    const resolvedAuthToken = String(
      authToken || localStorage.getItem("token") || "",
    ).trim();
    if (!userId || !receiverId) {
      // closeCallWin();
      console.warn("[call] cannot start — missing identifier", {
        hasUserId: Boolean(userId),
        hasReceiverId: Boolean(receiverId),
      });
      alert("Could not start the call. Please refresh the page and try again.");
      return;
    }
    const balance = await checkUserBalance({
      userId,
      consultantId: receiverId,
      type,
      shop,
      authToken: resolvedAuthToken,
    });
    if (!balance) {
      // closeCallWin();
      alert("You have insufficient balance");
      return;
    }
    const userStatus = await checkUserStatus(receiverId, shop);
    if (!userStatus?.success) {
      //closeCallWin();
      if (userStatus?.isBusy) {
        alert(userStatus?.message || "User is busy with another call");
      } else if (userStatus?.message) {
        alert(userStatus.message);
      } else {
        alert("This user is not available to talk with you");
      }
      return;
    }
    const hasMicPermission = await checkMicPermission();
    if (!hasMicPermission) {
      //closeCallWin();
      alert("Please grant microphone permission");
      return;
    }
    const channelName = `channel-${userId.slice(-6)}-${receiverId.slice(-6)}`;
    const uid = Math.floor(Math.random() * 1000000);

    const url = `${process.env.REACT_APP_BACKEND_HOST}/call/generate-token`;
    const res = await axios.post(
      url,
      {
        channelName,
        uid,
        receiverId,
        callType: type || "voice",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedAuthToken}`,
        },
      },
    );

    const data = res.data;
    if (!data.token) {
      throw new Error("Token missing from API");
    }

    // NOTE: "call-user" (the ring) is intentionally NOT emitted here anymore.
    // The call window emits it itself once it has loaded and its socket is
    // connected — so the receiver can never accept before the caller is ready
    // (that race made timers/billing fail on weak connections).

    const tokenEncoded = encodeURIComponent(data.token);
    const returnUrl = `https://${shop}/apps/consultly`;
    const resolvedShopId =
      shopId ||
      localStorage.getItem("shop_o_Identity")

    const callUrl = buildCallPageUrl({
      shop,
      shopId: resolvedShopId,
      callerId: userId,
      receiverId,
      callType: type || "voice",
      uid,
      channelName,
      agoraToken: data.token,
      appId: data.appId,
      userId,
      userType: "client",
      returnUrl,
      authToken: resolvedAuthToken,
      direct: embedded,
    });
    console.log("CALL URL =", callUrl);
    if (embedded) {
      // Stay inside the current (overlay) iframe instead of breaking out to
      // the top-level storefront tab.
      window.location.href = callUrl;
    } else {
      window.top.location.href = callUrl;
    }
    // console.log(callUrl);
    // if (callWin && !callWin.closed) {
    //   console.log("Navigating popup...");
    //   console.log(callUrl);
    //   // callWin.location.href = callUrl;

    //   try { callWin.focus(); } catch (_) { }
    // } else {
    //   // Popup was blocked or closed — fall back to the old path.
    //   openCallWindow(callUrl);
    // }
  } catch (error) {
    //closeCallWin();
    console.error("🔥 API ERROR:", error.message);
    alert("Call failed. Please try again.");
  }
};