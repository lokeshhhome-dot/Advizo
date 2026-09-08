import axios from "axios";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const DEFAULT_MAX_SIZE_MB = 10;

/**
 * Same convention as utils/getProfileImageUrl.js — never hardcode a domain,
 * always resolve through the existing env-configured backend host. This is
 * the ONE place that reads these env vars for chat attachments; every
 * component below calls this instead of touching process.env directly.
 */
export function getBackendBaseUrl() {
  const host =
    process.env.REACT_APP_BACKEND_IMAGE_HOST ||
    process.env.REACT_APP_BACKEND_HOST ||
    "";
  return host.replace(/\/+$/, "");
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side pre-check only — the backend re-validates MIME/extension/
 * magic-bytes/size regardless, this just gives the user an instant error. */
export function validateAttachmentFile(file) {
  if (!file) return { valid: false, reason: "No file selected" };

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, reason: "Only JPG, PNG, WEBP images or PDF files are supported" };
  }

  const maxSizeMb =
    Number(process.env.REACT_APP_CHAT_ATTACHMENT_MAX_SIZE_MB) || DEFAULT_MAX_SIZE_MB;
  if (file.size > maxSizeMb * 1024 * 1024) {
    return { valid: false, reason: `File is too large. Max size is ${maxSizeMb}MB` };
  }

  return { valid: true, type: file.type === "application/pdf" ? "pdf" : "image" };
}

/** Uploads the file, returns the attachment metadata to relay in the
 * "sendMessage" socket payload — does NOT create a chat message itself. */
export async function uploadChatAttachment({
  shopId,
  userId,
  consultantId,
  file,
  token,
  onProgress,
  signal,
}) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post(
    `${getBackendBaseUrl()}/api/chat/upload-attachment/${shopId}/${userId}/${consultantId}`,
    formData,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
      onUploadProgress: (evt) => {
        if (!onProgress || !evt.total) return;
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      },
    },
  );

  return response.data?.attachment;
}

/** Mints a short-lived signed view/download path and resolves it against the
 * same backend host — the browser only ever sees the Advizo backend domain,
 * never a storage-provider or Shopify-storefront origin. */
export async function fetchAttachmentViewUrl({ messageId, token, download }) {
  const response = await axios.get(
    `${getBackendBaseUrl()}/api/chat/attachment-url/${messageId}${download ? "?download=1" : ""}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );

  const { path: relativePath, attachment } = response.data || {};
  return {
    url: relativePath ? `${getBackendBaseUrl()}${relativePath}` : null,
    attachment,
  };
}
