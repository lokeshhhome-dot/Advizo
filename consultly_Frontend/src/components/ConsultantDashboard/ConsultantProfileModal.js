import React, { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import PortalModal from "../middle-ware/PortalModal";
import {
  getProfileImageUrl,
  handleProfileImageError,
} from "../../utils/getProfileImageUrl";
import styles from "./ConsultantProfileModal.module.css";
import ReactToast from "../AlertModel/ReactToast";
import {
  validateProfileImage,
  PROFILE_IMAGE_ACCEPT,
} from "../../utils/validateProfileImage";

const ConsultantProfileModal = ({
  show,
  handleClose,
  onLogout,
  consultantOverview,
  selfDetails,
  profile,
  setProfile,
  updateProfileDeatailsHandler,
  loading,
}) => {
  const [previewImage, setPreviewImage] = useState(null);
  const [imageErrorToast, setImageErrorToast] = useState("");

  // email/phone/bio only exist on the authenticated selfDetails payload —
  // the public consultantOverview endpoint strips PII.
  useEffect(() => {
    if (selfDetails || consultantOverview?.consultant) {
      setProfile({
        name:
          selfDetails?.fullname ||
          consultantOverview?.consultant?.fullname ||
          "",
        email: selfDetails?.email || "",
        phone: selfDetails?.phone || "",
        gender:
          selfDetails?.gender || consultantOverview?.consultant?.gender || "",
        bio: selfDetails?.bio || "",
        profileImage: null,
      });
      setPreviewImage(null);
    }
  }, [consultantOverview, selfDetails, setProfile]);

  const displayImage =
    previewImage ||
    getProfileImageUrl(
      selfDetails?.profileImage ||
        consultantOverview?.consultant?.profileImage,
    );

  const handleChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value,
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageError = validateProfileImage(file);
    if (imageError) {
      setImageErrorToast(imageError);
      e.target.value = "";
      return;
    }

    setProfile({
      ...profile,
      profileImage: file,
    });
    setPreviewImage(URL.createObjectURL(file));
  };
  useEffect(() => {
    if (show) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [show]);

  if (!show) return null;

  return (
    <PortalModal>
      <Modal
        show={show}
        onHide={handleClose}
        centered
        dialogClassName={styles.dialog}
        contentClassName={styles.content}
      >
        <div data-theme="light">
          {/* Gradient header */}
          <div className={styles.header}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={handleClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Avatar */}
          <div className={styles.avatarBlock}>
            <div className={styles.avatarWrap}>
              <img
                src={displayImage}
                alt="Profile"
                className={styles.avatar}
                onError={handleProfileImageError}
              />
              <label
                htmlFor="consultant-profile-image"
                className={styles.cameraBtn}
                title="Change photo"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </label>
              <input
                id="consultant-profile-image"
                type="file"
                accept={PROFILE_IMAGE_ACCEPT}
                onChange={handleImageChange}
                style={{ display: "none" }}
              />
            </div>
            <div className={styles.avatarName}>
              {profile.name || "My Profile"}
            </div>
            <div className={styles.avatarHint}>
              JPG, PNG or WEBP · Max 2MB
            </div>
          </div>

          {/* Form */}
          <div className={styles.body}>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-name">
                  Name
                </label>
                <input
                  id="cp-name"
                  className={styles.input}
                  type="text"
                  name="name"
                  value={profile.name}
                  onChange={handleChange}
                  placeholder="Enter name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-email">
                  Email
                </label>
                <input
                  id="cp-email"
                  className={styles.input}
                  type="email"
                  name="email"
                  value={profile.email}
                  onChange={handleChange}
                  placeholder="Enter email"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-phone">
                  Phone
                </label>
                <input
                  id="cp-phone"
                  className={styles.input}
                  type="text"
                  name="phone"
                  value={profile.phone}
                  onChange={handleChange}
                  placeholder="Enter phone"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-gender">
                  Gender
                </label>
                <select
                  id="cp-gender"
                  className={styles.select}
                  name="gender"
                  value={profile.gender}
                  onChange={handleChange}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="cp-bio">
                  Bio
                </label>
                <textarea
                  id="cp-bio"
                  className={`${styles.input} ${styles.textarea}`}
                  name="bio"
                  value={profile.bio || ""}
                  onChange={handleChange}
                  placeholder="Tell clients about yourself, your expertise and experience…"
                  rows={3}
                  maxLength={1000}
                />
                <div className={styles.charCount}>
                  {(profile.bio || "").length}/1000
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={onLogout}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={updateProfileDeatailsHandler}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
      <ReactToast
        show={!!imageErrorToast}
        message={imageErrorToast}
        onClose={() => setImageErrorToast("")}
      />
    </PortalModal>
  );
};

export default ConsultantProfileModal;
