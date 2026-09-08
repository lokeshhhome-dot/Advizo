import React, { useEffect, useState } from "react";
import styles from "./chatAttachments.module.css";
import { fetchAttachmentViewUrl } from "./chatAttachmentApi";
import ImageLightbox from "./ImageLightbox";

/**
 * Image bubble content: skeleton -> image, reserving the aspect-ratio box
 * captured at upload time so the layout doesn't jump once it loads. Click
 * opens the shared lightbox. Handles both a fetch failure and a 410
 * (expired) response distinctly, per the spec's expired-attachment UX.
 */
const ChatImageMessage = ({ message, token }) => {
  const attachment = message.attachment || {};
  const [url, setUrl] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | loaded | error | expired
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setUrl(null);

    fetchAttachmentViewUrl({ messageId: message._id, token })
      .then(({ url: viewUrl }) => {
        if (cancelled) return;
        if (!viewUrl) {
          setStatus("error");
          return;
        }
        setUrl(viewUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error?.response?.status === 410 ? "expired" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [message._id, token]);

  if (status === "expired") {
    return (
      <div className={styles.imageFallback}>
        <span>Image expired</span>
        <span className={styles.imageFallbackSub}>This attachment is no longer available.</span>
      </div>
    );
  }

  if (status === "error") {
    return <div className={styles.imageFallback}>Image unavailable</div>;
  }

  const aspectRatio =
    attachment.width && attachment.height ? attachment.width / attachment.height : null;

  return (
    <>
      <div
        className={styles.imageBubble}
        style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
      >
        {status === "loading" && <div className={styles.imageSkeleton} aria-hidden="true" />}
        {url && (
          <img
            src={url}
            alt={attachment.originalName || "Image attachment"}
            className={styles.imageBubbleImg}
            style={status === "loading" ? { visibility: "hidden" } : undefined}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            onClick={() => setLightboxOpen(true)}
          />
        )}
      </div>

      {lightboxOpen && (
        <ImageLightbox
          url={url}
          name={attachment.originalName}
          onClose={() => setLightboxOpen(false)}
          onDownload={async () => {
            try {
              const { url: downloadUrl } = await fetchAttachmentViewUrl({
                messageId: message._id,
                token,
                download: true,
              });
              if (downloadUrl) window.open(downloadUrl, "_blank", "noopener,noreferrer");
            } catch (_) {
              // Download is a convenience action here — the lightbox stays open on failure.
            }
          }}
        />
      )}
    </>
  );
};

export default ChatImageMessage;
