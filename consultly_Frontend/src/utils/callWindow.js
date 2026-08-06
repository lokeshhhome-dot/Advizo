export const CALL_WINDOW_NAME = "consultly_active_call";

export const openCallWindow = (url) => {
  const win = window.open(url, CALL_WINDOW_NAME);
  if (win) {
    win.focus();
    return win;
  }

  // Popup blocked. Safari refuses window.open once the click gesture has been
  // consumed by an await (token fetch, mic permission), so this is the normal
  // Safari path, not an edge case. Joining in the current tab is always better
  // than silently dropping an accepted call — the call page's own returnUrl
  // takes the user back where they came from when it ends.
  console.warn("[call] popup blocked — opening the call in this tab");
  try {
    window.top.location.href = url;
  } catch (_) {
    window.location.href = url;
  }
  return null;
};

export const closeCallWindow = (fallback) => {
  try {
    window.close();
  } catch (error) {
    console.warn("window.close failed:", error);
  }

  window.setTimeout(() => {
    if (!window.closed && typeof fallback === "function") {
      fallback();
    }
  }, 400);
};
