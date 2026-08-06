import defaultProfileImage from "../assets/avatar-or-person-sign-profile-picture-portrait-icon-user-profile-symbol.webp";

export { defaultProfileImage };

/** Resolve a stored profileImage value into a fully-qualified URL. */
export function getProfileImageUrl(profileImage) {
  if (!profileImage) return defaultProfileImage;

  const path = String(profileImage).replace(/\\/g, "/");

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const host =
    process.env.REACT_APP_BACKEND_IMAGE_HOST ||
    process.env.REACT_APP_BACKEND_HOST ||
    "";

  return path.startsWith("/") ? `${host}${path}` : `${host}/${path}`;
}

export function handleProfileImageError(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = defaultProfileImage;
}

/* ------------------------------------------------------------------ *
 * Preloading + a session-level "already loaded" cache.
 *
 * loadedImageUrls remembers every URL the browser has fully decoded this
 * session, so a component that mounts again can show the avatar INSTANTLY
 * (no placeholder flash) instead of waiting for onLoad again.
 * ------------------------------------------------------------------ */
export const loadedImageUrls = new Set();

/**
 * Warm the browser cache for an image as early as possible (e.g. the moment API
 * data arrives, before the <img> is even rendered). Safe to call repeatedly —
 * it no-ops for URLs already loaded/in-flight.
 */
const inFlight = new Set();
export function preloadImage(url) {
  if (!url || url === defaultProfileImage) return;
  if (loadedImageUrls.has(url) || inFlight.has(url)) return;
  inFlight.add(url);
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    loadedImageUrls.add(url);
    inFlight.delete(url);
  };
  img.onerror = () => inFlight.delete(url);
  img.src = url;
}

/** Convenience: resolve a raw profileImage path and preload it. */
export function preloadProfileImage(profileImage) {
  const url = getProfileImageUrl(profileImage);
  if (url && url !== defaultProfileImage) preloadImage(url);
  return url;
}
