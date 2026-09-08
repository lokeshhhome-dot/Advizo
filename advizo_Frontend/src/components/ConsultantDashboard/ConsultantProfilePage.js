import React, { useEffect, useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import {
  HiOutlineCamera,
  HiOutlineBriefcase,
  HiOutlineAcademicCap,
  HiOutlineLanguage,
  HiOutlineChatBubbleLeftRight,
  HiOutlinePhone,
  HiOutlineVideoCamera,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import { logout } from "../Redux/slices/authConsultantSlice";
import { getConsultantToken, redirectToConsultantLogin } from "../../utils/consultantAuth";
import { useConsultantIdentity } from "../../utils/useConsultantIdentity";
import { getProfileImageUrl, handleProfileImageError } from "../../utils/getProfileImageUrl";
import { validateProfileImage, PROFILE_IMAGE_ACCEPT } from "../../utils/validateProfileImage";
import ReactToast from "../AlertModel/ReactToast";
import PageHeader from "./common/PageHeader";
import styles from "./ConsultantProfilePage.module.css";

const formatRate = (value, currency) => {
  if (value === undefined || value === null || value === "") return null;
  return `${currency || ""}${Number(value).toFixed(2)} / min`;
};

export default function ConsultantProfilePage() {
  const dispatch = useDispatch();
  const identity = useConsultantIdentity();
  const { consultantOverview } = useSelector((state) => state.consultants);
  const isSocketConnected = useSelector((state) => state.socket.isConnected);
  const consultant = consultantOverview?.consultant;
  const token = getConsultantToken();
  const shop = localStorage.getItem("shop");

  const [selfDetails, setSelfDetails] = useState(null);
  const [currency, setCurrency] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", gender: "", bio: "", profileImage: null });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const loadSelfDetails = async () => {
    if (!identity.consultantId || !token) return;
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/me/overview/${identity.consultantId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data?.success) {
        setSelfDetails(response.data.data);
        if (response.data.data?.currency) setCurrency(response.data.data.currency);
      }
    } catch (error) {
      console.error("Failed to load consultant details:", error);
    }
  };

  useEffect(() => {
    loadSelfDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.consultantId, token]);

  // Own email/phone/bio only exist on the authenticated self endpoint — the
  // public consultant-overview endpoint strips PII.
  useEffect(() => {
    if (selfDetails || consultant) {
      setForm({
        name: selfDetails?.fullname || consultant?.fullname || "",
        email: selfDetails?.email || "",
        phone: selfDetails?.phone || "",
        gender: selfDetails?.gender || "",
        bio: selfDetails?.bio || consultant?.bio || "",
        profileImage: null,
      });
    }
  }, [selfDetails, consultant]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageError = validateProfileImage(file);
    if (imageError) {
      setToast(imageError);
      e.target.value = "";
      return;
    }
    setForm((prev) => ({ ...prev, profileImage: file }));
    setPreviewImage(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("consultantId", identity.consultantId);
      formData.append("shopId", identity.shopId);
      formData.append("name", form.name);
      formData.append("email", form.email);
      formData.append("phone", form.phone);
      formData.append("gender", form.gender);
      formData.append("bio", form.bio || "");
      if (form.profileImage instanceof File) {
        formData.append("profileImage", form.profileImage);
      }
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/update-profile`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.success) {
        dispatch(
          fetchConsultantById({ shop_id: identity.shopId, consultant_id: identity.consultantId, token, shop }),
        );
        await loadSelfDetails();
        setPreviewImage(null);
        setToast("Profile updated");
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        window.top.location.href = `https://${shop}/apps/advizo/login`;
        return;
      }
      setToast(error?.response?.data?.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    redirectToConsultantLogin();
  };

  const displayImage = previewImage || getProfileImageUrl(consultant?.profileImage);
  const languages = Array.isArray(consultant?.language)
    ? consultant.language.filter(Boolean)
    : consultant?.language
      ? [consultant.language]
      : [];

  const rates = [
    { label: "Chat", icon: <HiOutlineChatBubbleLeftRight />, value: formatRate(consultant?.chatPerMinute, currency) },
    { label: "Voice", icon: <HiOutlinePhone />, value: formatRate(consultant?.voicePerMinute, currency) },
    { label: "Video", icon: <HiOutlineVideoCamera />, value: formatRate(consultant?.videoPerMinute, currency) },
  ].filter((r) => r.value);

  return (
    <div className={styles.page}>
      <PageHeader title="My Profile" description="How clients see you, and your account details." />

      {/* ------------------------------- IDENTITY ------------------------------- */}
      <section className={styles.identity}>
        <div className={styles.identityAvatarWrap}>
          <img src={displayImage} alt="" className={styles.identityAvatar} onError={handleProfileImageError} />
          <label htmlFor="profile-image-input" className={styles.identityCameraBtn} title="Change photo">
            <HiOutlineCamera />
          </label>
          <input
            id="profile-image-input"
            type="file"
            accept={PROFILE_IMAGE_ACCEPT}
            onChange={handleImageChange}
            style={{ display: "none" }}
          />
        </div>
        <div className={styles.identityText}>
          <h2 className={styles.identityName}>{form.name || "Consultant"}</h2>
          {consultant?.profession ? <p className={styles.identityRole}>{consultant.profession}</p> : null}
          <div className={styles.identityStatusRow}>
            <span className={`${styles.statusDot} ${isSocketConnected ? styles.statusDotOnline : styles.statusDotOffline}`} />
            <span className={styles.identityStatusText}>
              {isSocketConnected ? (consultant?.isBusy ? "Busy" : "Available") : "Offline"}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.workspace}>
        {/* --------------------------------- MAIN --------------------------------- */}
        <div className={styles.mainCol}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>About</h3>
            <textarea
              className={styles.bioInput}
              name="bio"
              value={form.bio}
              onChange={handleChange}
              placeholder="Tell clients about yourself, your expertise and experience…"
              rows={4}
              maxLength={1000}
            />
            <div className={styles.charCount}>{(form.bio || "").length}/1000</div>
          </section>

          {(consultant?.specialization || consultant?.profession) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Expertise</h3>
              <div className={styles.chipRow}>
                {consultant?.profession ? (
                  <span className={styles.chip}>
                    <HiOutlineBriefcase /> {consultant.profession}
                  </span>
                ) : null}
                {consultant?.specialization ? (
                  <span className={styles.chip}>{consultant.specialization}</span>
                ) : null}
              </div>
              <p className={styles.mutedNote}>Managed by your shop admin.</p>
            </section>
          )}

          {consultant?.experience ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Experience</h3>
              <div className={styles.chipRow}>
                <span className={styles.chip}>
                  <HiOutlineAcademicCap /> {consultant.experience}
                </span>
              </div>
              <p className={styles.mutedNote}>Managed by your shop admin.</p>
            </section>
          ) : null}

          {languages.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Languages</h3>
              <div className={styles.chipRow}>
                {languages.map((lang) => (
                  <span className={styles.chip} key={lang}>
                    <HiOutlineLanguage /> {lang}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* ----------------------------- ACCOUNT SETTINGS ----------------------------- */}
          <section className={styles.section} id="account-settings">
            <h3 className={styles.sectionTitle}>Account settings</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pf-name">Name</label>
                <input id="pf-name" className={styles.input} name="name" value={form.name} onChange={handleChange} />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pf-email">Email</label>
                <input id="pf-email" className={styles.input} type="email" name="email" value={form.email} onChange={handleChange} />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pf-phone">Phone</label>
                <input id="pf-phone" className={styles.input} name="phone" value={form.phone} onChange={handleChange} />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pf-gender">Gender</label>
                <select id="pf-gender" className={styles.input} name="gender" value={form.gender} onChange={handleChange}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
                <HiOutlineArrowRightOnRectangle /> Log out
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </section>
        </div>

        {/* -------------------------------- SIDEBAR -------------------------------- */}
        <div className={styles.sideCol}>
          {rates.length > 0 ? (
            <section className={styles.sideCard}>
              <h3 className={styles.sectionTitle}>Consultation pricing</h3>
              <div className={styles.rateList}>
                {rates.map((r) => (
                  <div className={styles.rateRow} key={r.label}>
                    <span className={styles.rateIcon}>{r.icon}</span>
                    <span className={styles.rateLabel}>{r.label}</span>
                    <span className={styles.rateValue}>{r.value}</span>
                  </div>
                ))}
              </div>
              <p className={styles.mutedNote}>Managed by your shop admin.</p>
            </section>
          ) : null}
        </div>
      </div>

      <ReactToast show={!!toast} message={toast} onClose={() => setToast("")} />
    </div>
  );
}
