import React, { useEffect, useMemo, useState } from "react";
import {
  getProfileImageUrl,
  defaultProfileImage,
  loadedImageUrls,
  preloadImage,
} from "../../utils/getProfileImageUrl";

/**
 * ProfileAvatar — a performance-focused avatar.
 *
 *  - URL is memoized, so re-renders never recompute or reassign `src`
 *    (an <img> whose src string is identical is never re-downloaded).
 *  - A placeholder stays visible until the image is fully loaded; the real
 *    image fades in on `onLoad` → no flicker, no layout shift.
 *  - If the URL was already loaded earlier this session, it renders instantly
 *    (no placeholder flash).
 *  - Above-the-fold avatars pass `eager` → loading="eager" + fetchPriority="high"
 *    and are preloaded immediately.
 *  - Errors fall back to the default avatar / custom fallback node.
 *
 * React.memo prevents parent re-renders from touching the avatar at all unless
 * its own props change.
 */
function ProfileAvatarBase({
  src,
  alt = "",
  size = 60,
  radius = 16,
  eager = false,
  fallback = null,
  className,
  style,
}) {
  const url = useMemo(() => getProfileImageUrl(src), [src]);
  const isRealImage = url && url !== defaultProfileImage;

  const [loaded, setLoaded] = useState(() => loadedImageUrls.has(url));
  const [errored, setErrored] = useState(false);

  // Reset load/error state ONLY when the resolved URL actually changes.
  useEffect(() => {
    setErrored(false);
    setLoaded(loadedImageUrls.has(url));
    if (eager && isRealImage) preloadImage(url);
  }, [url, eager, isRealImage]);

  const wrapperStyle = {
    position: "relative",
    display: "inline-block",
    width: size,
    height: size,
    borderRadius: radius,
    overflow: "hidden",
    background: "#e9edf2",
    flexShrink: 0,
    ...style,
  };

  if (!isRealImage || errored) {
    return (
      <span className={className} style={wrapperStyle}>
        {fallback || (
          <img
            src={defaultProfileImage}
            alt={alt}
            width={size}
            height={size}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </span>
    );
  }

  return (
    <span className={className} style={wrapperStyle}>
      {/* Placeholder shimmer until the image is decoded */}
      {!loaded && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg,#e9edf2 25%,#f3f6fa 37%,#e9edf2 63%)",
            backgroundSize: "400% 100%",
            animation: "pa-shimmer 1.2s ease-in-out infinite",
          }}
        />
      )}
      <img
        src={url}
        alt={alt}
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        draggable={false}
        onLoad={() => {
          loadedImageUrls.add(url);
          setLoaded(true);
        }}
        onError={() => setErrored(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          opacity: loaded ? 1 : 0,
          transition: "opacity .25s ease",
        }}
      />
      <style>{"@keyframes pa-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}"}</style>
    </span>
  );
}

const ProfileAvatar = React.memo(ProfileAvatarBase);
export default ProfileAvatar;
