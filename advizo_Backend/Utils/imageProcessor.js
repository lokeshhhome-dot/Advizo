"use strict";

/**
 * Image optimizer for uploaded avatars.
 *
 * Resizes large uploads down to a sane avatar size and re-encodes to WebP, so a
 * 4 MB phone photo becomes a ~20–40 KB file — dramatically faster first load.
 * A small square thumbnail is also produced for tiny avatar spots.
 *
 * sharp is loaded lazily and everything degrades gracefully: if sharp is
 * missing or a file can't be processed, the ORIGINAL bytes are stored, so an
 * upload never fails because of optimization.
 */

const fs = require("fs");
const path = require("path");

let sharp = null;
try {
  sharp = require("sharp");
} catch (_) {
  console.warn("[imageProcessor] sharp not installed — storing original images");
}

const AVATAR_MAX = Number(process.env.PROFILE_IMAGE_MAX || 512); // px, longest side
const THUMB_MAX = Number(process.env.PROFILE_THUMB_MAX || 128);
const WEBP_QUALITY = Number(process.env.PROFILE_IMAGE_QUALITY || 80);

/**
 * @param {Buffer} buffer                raw uploaded bytes (multer memoryStorage)
 * @param {object} opts
 * @param {string} opts.folder           relative folder, e.g. "uploads/consultants"
 * @param {string} opts.baseName         file name without extension, e.g. "consultant-1699..."
 * @param {string} [opts.originalExt]    used only for the non-sharp fallback
 * @returns {Promise<{ imageUrl:string, thumbUrl:string|null }>} DB-storable relative paths
 */
async function saveOptimizedImage(buffer, { folder, baseName, originalExt = ".jpg" }) {
  fs.mkdirSync(folder, { recursive: true });

  if (sharp && buffer?.length) {
    try {
      const webpName = `${baseName}.webp`;
      const thumbName = `${baseName}-thumb.webp`;

      // .rotate() with no args applies EXIF orientation so portraits aren't sideways.
      const base = sharp(buffer, { failOn: "none" }).rotate();

      await base
        .clone()
        .resize(AVATAR_MAX, AVATAR_MAX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(path.join(folder, webpName));

      await base
        .clone()
        .resize(THUMB_MAX, THUMB_MAX, { fit: "cover", position: "attention" })
        .webp({ quality: 70 })
        .toFile(path.join(folder, thumbName));

      return {
        imageUrl: `${folder}/${webpName}`.replace(/\\/g, "/"),
        thumbUrl: `${folder}/${thumbName}`.replace(/\\/g, "/"),
      };
    } catch (err) {
      console.error("[imageProcessor] optimization failed, storing original:", err.message);
    }
  }

  // Fallback: persist the original bytes unchanged.
  const name = `${baseName}${originalExt || ".jpg"}`;
  fs.writeFileSync(path.join(folder, name), buffer);
  return { imageUrl: `${folder}/${name}`.replace(/\\/g, "/"), thumbUrl: null };
}

module.exports = { saveOptimizedImage };
