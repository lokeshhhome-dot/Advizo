// Keep in sync with backend multer config (consultantRoute.js):
// 2MB cap, JPG/PNG/WEBP only.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export const PROFILE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

// Returns an error message string, or null if the file is valid.
export const validateProfileImage = (file) => {
    if (!file) return null;
    if (!ALLOWED_TYPES.includes(file.type)) {
        return "Only JPG, PNG or WEBP images are allowed";
    }
    if (file.size > MAX_SIZE_BYTES) {
        return "Image is too large. Maximum allowed size is 2MB";
    }
    return null;
};
