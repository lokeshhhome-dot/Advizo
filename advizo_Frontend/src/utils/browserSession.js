export const SESSION_TYPES = {
  ADMIN: "admin",
  CONSULTANT: "consultant",
  USER: "user",
};

const ACTIVE_SESSION_KEY = "advizo_active_session";
const SESSION_BUMP_KEY = "advizo_session_bump";

const SESSION_STORAGE_KEYS = {
  [SESSION_TYPES.ADMIN]: ["advizo", "setup_guide_done"],
  [SESSION_TYPES.CONSULTANT]: [
    "token",
    "client_u_Identity",
    "shop_o_Identity",
    "shop",
    "consultant_u_Identity",
    "lastRoute",
  ],
  [SESSION_TYPES.USER]: [
    "token",
    "client_u_Identity",
    "shop_o_Identity",
    "shop",
    "___U-B",
    "activeChatUserId",
  ],
};

const SHARED_CALL_KEYS = [
  "callAccepted",
  "callSession",
  "callRejected",
  "endFromClient",
  "callStartTime",
  "chatTimer",
  "userId",
  "shopId",
];

export const getActiveSession = () =>
  localStorage.getItem(ACTIVE_SESSION_KEY);

const clearKeys = (keys = []) => {
  keys.forEach((key) => localStorage.removeItem(key));
};

export const clearSessionData = (sessionType) => {
  if (!sessionType) return;
  clearKeys(SESSION_STORAGE_KEYS[sessionType]);
};

export const clearOtherSessions = (keepType) => {
  Object.values(SESSION_TYPES).forEach((type) => {
    if (type !== keepType) {
      clearSessionData(type);
    }
  });
  clearKeys(SHARED_CALL_KEYS);
};

export const isConsultantAppSurface = (pathname = window.location.pathname) => {
  const path = pathname || "";
  return (
    path.includes("/consultant-dashboard") ||
    path.includes("/login") ||
    path.includes("/fcm-token") ||
    path.includes("/video-call") ||
    path.includes("/video/calling")
  );
};

/**
 * Activate one role in this browser. Clears other roles' storage first.
 */
export const activateSession = (sessionType) => {
  if (!sessionType || !SESSION_STORAGE_KEYS[sessionType]) return;

  const current = getActiveSession();
  if (current === sessionType) return;

  // Critical: never let a storefront/user init wipe consultant login
  // unless this page is actually a customer storefront surface.
  if (
    current === SESSION_TYPES.CONSULTANT &&
    sessionType === SESSION_TYPES.USER
  ) {
    const intended = detectIntendedSessionFromPage();
    if (intended !== SESSION_TYPES.USER || isConsultantAppSurface()) {
      console.warn(
        "[session] blocked USER activateSession — consultant session is active",
      );
      return;
    }
  }

  clearOtherSessions(sessionType);
  localStorage.setItem(ACTIVE_SESSION_KEY, sessionType);
  localStorage.setItem(SESSION_BUMP_KEY, String(Date.now()));
};
export const hasSessionConflict = () => {
  const intended = detectIntendedSessionFromPage();
  const active = getActiveSession();
  return Boolean(intended && active && intended !== active);
};

export const detectIntendedSessionFromPage = () => {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname || "";

  // Shopify admin embed only — never treat storefront consultant pages as admin
  if (
    params.get("host") &&
    !path.includes("/consultant-dashboard") &&
    !path.includes("/login")
  ) {
    return SESSION_TYPES.ADMIN;
  }

  if (isConsultantAppSurface(path)) {
    return SESSION_TYPES.CONSULTANT;
  }

  if (params.get("customerId")) {
    return SESSION_TYPES.USER;
  }

  if (
    path.includes("/consultant-cards") ||
    path.includes("/chats") ||
    path.includes("/profile") ||
    path.includes("/view-profile")
  ) {
    return SESSION_TYPES.USER;
  }

  return null;
};

// export const getSocketUserIdForActiveSession = () => {
//   const active = getActiveSession();
//   const storedUserId =
//     localStorage.getItem("client_u_Identity") ||
//     localStorage.getItem("consultant_u_Identity");

//   if (active === SESSION_TYPES.CONSULTANT) {
//     return storedUserId;
//   }

//   if (active === SESSION_TYPES.USER) {
//     return localStorage.getItem("client_u_Identity");
//   }

//   // Fallback before session flag is written (storefront chat bootstrap)
//   return storedUserId;
// };

export const getSocketUserIdForActiveSession = () => {
  const active = getActiveSession();

  if (active === SESSION_TYPES.ADMIN) {
    return localStorage.getItem("advizo");
  }

  if (active === SESSION_TYPES.CONSULTANT) {
    // Consultant login stores its user id under CONSULTANT_USER_ID_KEY
    // ("client_u_Identity") — "consultant_u_Identity" is never written,
    // so it must only be a fallback, never the sole source.
    return (
      localStorage.getItem("client_u_Identity") ||
      localStorage.getItem("consultant_u_Identity")
    );
  }

  if (active === SESSION_TYPES.USER) {
    return localStorage.getItem("client_u_Identity");
  }

  return null;
};
const redirectForSession = (sessionType) => {
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop") || localStorage.getItem("shop");

  if (sessionType === SESSION_TYPES.CONSULTANT) {
    if (shop) {
      window.location.href = `https://${shop}/apps/advizo/login`;
    } else {
      window.location.href = "/login";
    }
    return;
  }

  if (sessionType === SESSION_TYPES.USER && shop) {
    window.location.href = `https://${shop}/apps/advizo`;
    return;
  }

  if (sessionType === SESSION_TYPES.ADMIN) {
    window.location.reload();
  }
};

/**
 * The dedicated call window (opened via window.open(url, "advizo_active_call"))
 * authenticates from its own URL params. It must be excluded from the shared
 * USER/CONSULTANT session tug-of-war: reloading it drops the live call, and its
 * activateSession() write would ping-pong reloads with the opener window
 * (the "call blinks/reloads repeatedly" bug).
 */
export const isCallWindowSurface = () => {
  if (typeof window === "undefined") return false;
  return (
    window.name === "advizo_active_call" ||
    (window.location.pathname || "").includes("/video/calling")
  );
};

/**
 * If another tab switched role, move this tab to the active role entry.
 *
 * "Adopt, don't fight": only the tab the user is actually looking at may
 * reload-and-claim. A hidden tab defers until the user returns to it.
 * Without this, a USER tab and a CONSULTANT tab reload each other forever
 * (each reload re-claims its role -> bump -> other tab reloads -> ...),
 * which showed up as endless page blinking on profile/chat/login pages.
 */
const CONFLICT_RELOAD_COOLDOWN_MS = 3000;
let deferredConflictReload = false;

const reloadForConflict = () => {
  try {
    const last = Number(
      sessionStorage.getItem("advizo_conflict_reload_at") || 0,
    );
    if (Date.now() - last < CONFLICT_RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem("advizo_conflict_reload_at", String(Date.now()));
  } catch (_) {
    // sessionStorage unavailable — still reload, just without the cooldown.
  }
  window.location.reload();
};

export const handleCrossTabSessionChange = () => {
  // Never reload the call window on a cross-tab session change — that is the
  // reload loop that made the call page blink during startup.
  if (isCallWindowSurface()) return;
  if (!hasSessionConflict()) return;

  if (document.visibilityState !== "visible") {
    // Background tab: wait until the user actually returns, then re-check.
    if (deferredConflictReload) return;
    deferredConflictReload = true;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      deferredConflictReload = false;
      if (hasSessionConflict()) reloadForConflict();
    };
    document.addEventListener("visibilitychange", onVisible);
    return;
  }

  reloadForConflict();
};

export const setupBrowserSessionSync = () => {
  if (typeof window === "undefined") return;

  window.addEventListener("storage", (event) => {
    if (event.key === ACTIVE_SESSION_KEY || event.key === SESSION_BUMP_KEY) {
      handleCrossTabSessionChange();
    }
  });
};

/**
 * Call on page load so only one role stays active per browser.
 */
export const enforcePageSession = () => {
  // The call window must not clobber the opener's active session (it would wipe
  // the storefront's login keys and trigger the cross-window reload loop). It
  // reads the session the opener already established and authenticates via URL.
  if (isCallWindowSurface()) return;

  const intended = detectIntendedSessionFromPage();
  const active = getActiveSession();

  if (!intended) return;
  if (!active) {
    activateSession(intended);
    return;
  }
  if (intended === active) return;

  // Page type wins: activate the role for this surface.
  // Never clearSessionData(intended) — that wiped freshly written login keys.
  activateSession(intended);
};

/**
 * Call before writing login keys for a role.
 */
export const prepareSessionLogin = (sessionType) => {
  activateSession(sessionType);
};
