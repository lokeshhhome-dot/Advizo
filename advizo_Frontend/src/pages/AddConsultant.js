import { Page, Spinner } from "@shopify/polaris";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  Fragment,
} from "react";
import {
  availableTags,
  genderOptions,
} from "../components/FallbackData/FallbackData";
import { useSearchParams } from "react-router-dom";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { Redirect } from "@shopify/app-bridge/actions";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import { usePolarisToast } from "../components/AlertModel/PolariesTostContext";
import {
  validateProfileImage,
  PROFILE_IMAGE_ACCEPT,
} from "../utils/validateProfileImage";
import styles from "./AddConsultant.module.css";
import { fetchAdminDetails } from "../components/Redux/slices/adminSlice";
import { useDispatch, useSelector } from "react-redux";

const validationOrder = [
  { key: "fullName", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "password", label: "Password" },
  { key: "phoneNumber", label: "Phone Number" },
  { key: "profession", label: "Profession" },
  { key: "specialization", label: "Specialization" },
  { key: "licenseIdNumber", label: "License / ID Number" },
  { key: "yearOfExperience", label: "Year of Experience" },
  { key: "chatPerMinute", label: "Chat per minute" },
  { key: "videoPerMinute", label: "Video per minute" },
  { key: "voicePerMinute", label: "Voice per minute" },
  { key: "languages", label: "Languages" },
  { key: "displayName", label: "Display Name" },
  { key: "gender", label: "Gender" },
  { key: "houseNumber", label: "House Number" },
  { key: "streetArea", label: "Street Area" },
  { key: "landmark", label: "Landmark" },
  { key: "address", label: "Address" },
  { key: "pincode", label: "Pincode" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "pancardNumber", label: "Pancard Number" },
];
const validationOrderUpdate = [
  { key: "fullName", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phoneNumber", label: "Phone Number" },
  { key: "profession", label: "Profession" },
  { key: "specialization", label: "Specialization" },
  { key: "licenseIdNumber", label: "License / ID Number" },
  { key: "yearOfExperience", label: "Year of Experience" },
  { key: "chatPerMinute", label: "Chat per minute" },
  { key: "videoPerMinute", label: "Video per minute" },
  { key: "voicePerMinute", label: "Voice per minute" },
  { key: "languages", label: "Languages" },
  { key: "displayName", label: "Display Name" },
  { key: "gender", label: "Gender" },
  { key: "houseNumber", label: "House Number" },
  { key: "streetArea", label: "Street Area" },
  { key: "landmark", label: "Landmark" },
  { key: "address", label: "Address" },
  { key: "pincode", label: "Pincode" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "pancardNumber", label: "Pancard Number" },
];

function Field({ label, optional, hint, error, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {children}
      {error ? (
        <span className={styles.fieldError}>{error}</span>
      ) : hint ? (
        <span className={styles.fieldHint}>{hint}</span>
      ) : null}
    </div>
  );
}

function AddConsultant() {
  const app = useAppBridge();
  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);

  const goToAddConsultant = () => {
    if (!redirect) return;
    redirect.dispatch(Redirect.Action.APP, "/consultant-list");
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [profileFile, setProfileFile] = useState(null);
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);
  const [consultantDetails, setConsultantDetails] = useState(null);
  const [updateIsTrue, setUpdateIsTrue] = useState(false);
  const fileInputRef = useRef(null);
  const { showToast } = usePolarisToast();
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    phoneNumber: "",
    profession: "",
    profileImage: "",
    specialization: "",
    licenseIdNumber: "",
    yearOfExperience: "",
    chargingPerMinute: "",
    languages: [],
    displayName: "",
    gender: "male",
    houseNumber: "",
    streetArea: "",
    landmark: "",
    address: "",
    pincode: "",
    dateOfBirth: "",
    pancardNumber: "",
    chatPerMinute: "",
    videoPerMinute: "",
    voicePerMinute: "",
  });
  // Storefront visibility. New consultants are always created with this off
  // (the backend hardcodes consultantStatus:false on create — a review gate
  // before a brand-new profile goes live) — the toggle only becomes
  // interactive once there's an existing consultant to flip, via the same
  // dedicated PUT /api-consultant-update-status/:id endpoint the consultant
  // list page already uses for this, not a new mechanism.
  const [consultantStatus, setConsultantStatus] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const { adminDetails_ } = useSelector((state) => state.admin);

  // Language tags
  const [textFieldValue, setTextFieldValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchParams] = useSearchParams();
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const consultantId = searchParams.get("id");
  useEffect(() => {
    const id = localStorage.getItem("advizo");
    setAdminIdLocal(id);
  }, []);

  useEffect(() => {
    if (adminIdLocal) {
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
  }, [adminIdLocal, app]);

  useEffect(() => {
    if (consultantId) {
      setUpdateIsTrue(true);
    }
  }, [consultantId]);

  const handleFieldChange = useCallback((fieldName) => {
    return (value) => {
      let updatedValue = value;
      if (fieldName === "pancardNumber") {
        updatedValue = value.toUpperCase().slice(0, 10);
      }

      setDirty(true);

      setErrors((prev) => ({
        ...prev,
        [fieldName]: "",
      }));

      setFormData((prev) => ({
        ...prev,
        [fieldName]: updatedValue,
      }));
    };
  }, []);

  const handleInputEvent = useCallback(
    (fieldName) => (event) => handleFieldChange(fieldName)(event.target.value),
    [handleFieldChange],
  );

  const handleFileInputChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const imageError = validateProfileImage(file);
      if (imageError) {
        showToast(imageError, true);
        event.target.value = "";
        return;
      }
      setProfileImageUrl(URL.createObjectURL(file));
      setProfileFile(file);
      setDirty(true);
    },
    [showToast],
  );

  const handleTextFieldChange = useCallback((value) => {
    setTextFieldValue(value);
    setShowDropdown(true);
  }, []);

  const handleTagSelect = useCallback(
    (tag) => {
      if (!formData.languages.includes(tag)) {
        setFormData((prev) => ({
          ...prev,
          languages: [...prev.languages, tag],
        }));
        setDirty(true);
      }
      setTextFieldValue("");
      setShowDropdown(false);
    },
    [formData.languages],
  );

  const handleRemoveTag = useCallback((tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.filter((tag) => tag !== tagToRemove),
    }));
    setDirty(true);
  }, []);

  const filteredTags = availableTags.filter((tag) => {
    const matchesSearch =
      textFieldValue.length === 0 ||
      tag.toLowerCase().includes(textFieldValue.toLowerCase());
    const notSelected = !formData.languages.includes(tag);
    return matchesSearch && notSelected;
  });

  //-------------------------- handle file button click -------------------

  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const validateForm = () => {
    let newErrors = {};

    for (let field of updateIsTrue ? validationOrderUpdate : validationOrder) {
      const value = formData[field.key];

      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);

      if (isEmpty) {
        newErrors[field.key] = `${field.label} is required`;
        setErrors(newErrors);
        return false; // stop at first invalid field
      }
    }

    setErrors({});
    return true;
  };

  //-------------------------- submit consultant data -------------------

  const submitConsultantData = useCallback(async () => {
    if (!validateForm()) return;
    const token = await getAppBridgeToken(app);
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess(false);
    const form = new FormData();

    if (profileFile) {
      form.append("profileImage", profileFile);
    }
    Object.keys(formData).forEach((key) => {
      const value = formData[key];
      if (
        value !== "" &&
        value !== null &&
        value !== undefined &&
        key !== "profileImage"
      ) {
        if (Array.isArray(value)) {
          form.append(key, JSON.stringify(value));
        } else {
          form.append(key, value);
        }
      }
    });

    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/add-consultant/${adminIdLocal}`,
        {
          method: "POST",
          body: form,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const responseData = await response.json();
      if (response.ok) {
        showToast(responseData?.message);
        setTextFieldValue("");
        setProfileFile(null);
        setProfileImageUrl(null);
        setDirty(false);
        goToAddConsultant();
      } else {
        if (responseData?.missingFields) {
          const fields = responseData?.missingFields || [];
          showToast(
            fields.length > 3
              ? `${fields.slice(0, 3).join(", ")} +${fields.length - 3} more`
              : fields.join(", "),
            true,
          );
        } else {
          showToast(responseData?.message, true);
        }
      }
    } catch (error) {
      console.log("error", error);
      showToast(
        error.message === "Invalid shop ID"
          ? "All fields are required"
          : "Failed to submit consultant data. Please try again.",
        true,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, profileFile]);

  //-------------------------- submit consultant data -------------------

  //-------------------------- update consultant data / edit consultant data-------------------

  const updateConsultantData = async () => {
    if (!validateForm()) return;

    const token = await getAppBridgeToken(app);
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess(false);
    const form = new FormData();
    if (profileFile) {
      form.append("profileImage", profileFile);
    }
    Object.keys(formData).forEach((key) => {
      const value = formData[key];
      if (
        value !== "" &&
        value !== null &&
        value !== undefined &&
        key !== "profileImage"
      ) {
        if (Array.isArray(value)) {
          form.append(key, JSON.stringify(value));
        } else {
          form.append(key, value);
        }
      }
    });
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/update-consultant/${consultantId}`,
        {
          method: "PUT",
          body: form,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const responseData = await response.json();
      if (response.ok) {
        showToast(responseData?.message);
        setDirty(false);
        goToAddConsultant();
      } else {
        if (responseData?.missingFields) {
          showToast(responseData?.missingFields, true);
        } else {
          showToast(responseData?.message, true);
        }
      }
    } catch (error) {
      console.error("Error updating consultant data:", error);
      setSubmitError(
        error.message || "Failed to update consultant data. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  //-------------------------- update consultant data / edit consultant data-------------------

  //-------------------------- toggle storefront visibility -------------------
  // Reuses the existing dedicated status-toggle endpoint (same one the
  // consultant list page already calls) rather than folding this into the
  // generic update-consultant submit — takes effect immediately, same as
  // everywhere else in the app this toggle already exists.
  const handleToggleStatus = useCallback(async () => {
    if (!updateIsTrue || !consultantId || isTogglingStatus) return;
    setIsTogglingStatus(true);
    try {
      const token = await getAppBridgeToken(app);
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/api-consultant-update-status/${consultantId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const responseData = await response.json();
      if (response.ok) {
        setConsultantStatus(Boolean(responseData?.status));
        showToast(
          responseData?.status
            ? "Consultant is now visible on your storefront"
            : "Consultant is hidden from your storefront",
        );
      } else {
        showToast(responseData?.message || "Failed to update visibility", true);
      }
    } catch (error) {
      console.error("Error toggling consultant status:", error);
      showToast("Failed to update visibility", true);
    } finally {
      setIsTogglingStatus(false);
    }
  }, [app, consultantId, updateIsTrue, isTogglingStatus, showToast]);
  //-------------------------- toggle storefront visibility -------------------

  //-------------------------- get consultant by id -------------------

  const getConsultantById = async () => {
    if (!consultantId) return;
    setIsLoading(true);
    const token = await getAppBridgeToken(app);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/consultantid/${consultantId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();
      if (response.ok && data.consultant) {
        setConsultantDetails(data.consultant);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error fetching consultant:", error);
    } finally {
      setIsLoading(false);
    }
  };
  //-------------------------- get consultant by id -------------------

  //-------------------------- use effect to get consultant by id -------------------
  useEffect(() => {
    if (consultantId) {
      getConsultantById();
    }
  }, [consultantId]);
  //-------------------------- use effect to get consultant by id -------------------

  useEffect(() => {
    if (consultantDetails && consultantDetails.email) {
      let formattedDateOfBirth = "";
      if (consultantDetails.dateOfBirth) {
        const date = new Date(consultantDetails.dateOfBirth);
        if (!isNaN(date.getTime())) {
          formattedDateOfBirth = date.toISOString().split("T")[0];
        } else {
          formattedDateOfBirth = consultantDetails.dateOfBirth;
        }
      }

      setFormData({
        fullName:
          consultantDetails.fullname || consultantDetails.fullName || "",
        email: consultantDetails.email || "",
        password: consultantDetails.password || "",
        phoneNumber:
          consultantDetails.phone ||
          consultantDetails.phoneNumber ||
          consultantDetails.contact ||
          "",
        profession: consultantDetails.profession || "",
        profileImage: consultantDetails.profileImage || "",
        specialization: consultantDetails.specialization || "",
        licenseIdNumber:
          consultantDetails.licenseNo ||
          consultantDetails.licenseIdNumber ||
          "",
        yearOfExperience:
          consultantDetails.experience ||
          consultantDetails.yearOfExperience ||
          "",
        chargingPerMinute:
          consultantDetails.fees || consultantDetails.chargingPerMinute || "",
        languages: Array.isArray(consultantDetails.language)
          ? consultantDetails.language
          : Array.isArray(consultantDetails.languages)
            ? consultantDetails.languages
            : [],
        displayName: consultantDetails.displayName || "",
        gender: consultantDetails.gender || "male",
        houseNumber: consultantDetails.houseNumber || "",
        streetArea: consultantDetails.streetArea || "",
        landmark: consultantDetails.landmark || "",
        address: consultantDetails.address || "",
        pincode: consultantDetails.pincode || "",
        dateOfBirth: formattedDateOfBirth,
        pancardNumber:
          consultantDetails.pan_cardNumber ||
          consultantDetails.pancardNumber ||
          "",
        chatPerMinute: consultantDetails.chatPerMinute || "",
        videoPerMinute: consultantDetails.videoPerMinute || "",
        voicePerMinute: consultantDetails.voicePerMinute || "",
      });
      setConsultantStatus(Boolean(consultantDetails.consultantStatus));

      if (consultantDetails.profileImage) {
        let imagePath = consultantDetails.profileImage.replace(/\\/g, "/");

        if (!imagePath.startsWith("http")) {
          const backendHost = process.env.REACT_APP_BACKEND_HOST;
          const baseUrl = backendHost.replace(/\/$/, "");
          imagePath = imagePath.replace(/^\//, "");
          imagePath = `${baseUrl}/${imagePath}`;
        }
        setProfileImageUrl(imagePath);
        setProfileImagePreview(imagePath);
      }
    }
  }, [consultantDetails]);

  //-------------------------- handle discard -------------------

  const handleDiscard = () => {
    setDirty(false);
    if (consultantDetails) {
      // Re-apply the loaded values so a discard on the edit form actually
      // reverts in-progress edits, not just the dirty flag.
      setConsultantDetails({ ...consultantDetails });
    }
  };

  const handleSave = () => {
    if (updateIsTrue) updateConsultantData();
    else submitConsultantData();
  };

  if (isLoading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Spinner accessibilityLabel="Loading" size="large" />
      </div>
    );
  }

  return (
    <Fragment>
      <Page fullWidth>
        <div className={styles.page}>
          <button
            type="button"
            className={styles.backLink}
            onClick={goToAddConsultant}
          >
            ‹ Consultants
          </button>

          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <h1 className={styles.title}>
                {updateIsTrue ? "Update consultant" : "Add consultant"}
              </h1>
              <p className={styles.subtitle}>
                This information appears on your storefront's consultant listing.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.discardButton}
                onClick={handleDiscard}
                disabled={!dirty || isSubmitting}
              >
                Discard
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <div className={styles.layout}>
            {/* Main column */}
            <div className={styles.mainCol}>
              {/* Basic information */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Basic information</h3>
                  <p className={styles.cardSubtitle}>
                    Login details and how they're identified.
                  </p>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 2 }}>
                  <Field label="Full name" error={errors.fullName}>
                    <input
                      className={`${styles.input} ${errors.fullName ? styles.inputError : ""}`}
                      value={formData.fullName}
                      onChange={handleInputEvent("fullName")}
                      placeholder="Dr. Anita Sharma"
                    />
                  </Field>
                  <Field
                    label="Display name"
                    hint="Leave blank to use full name"
                    error={errors.displayName}
                  >
                    <input
                      className={`${styles.input} ${errors.displayName ? styles.inputError : ""}`}
                      value={formData.displayName}
                      onChange={handleInputEvent("displayName")}
                      placeholder="Shown to customers"
                    />
                  </Field>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 2 }}>
                  <Field label="Email" error={errors.email}>
                    <input
                      type="email"
                      className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                      value={formData.email}
                      onChange={handleInputEvent("email")}
                      placeholder="name@example.com"
                    />
                  </Field>
                  <Field label="Phone number" error={errors.phoneNumber}>
                    <input
                      type="tel"
                      className={`${styles.input} ${errors.phoneNumber ? styles.inputError : ""}`}
                      value={formData.phoneNumber}
                      onChange={handleInputEvent("phoneNumber")}
                      placeholder="+91 98765 43210"
                    />
                  </Field>
                </div>
                {!updateIsTrue && (
                  <div className={styles.fieldRow} style={{ "--cols": 2 }}>
                    <Field label="Password" error={errors.password}>
                      <input
                        type="password"
                        className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                        value={formData.password}
                        onChange={handleInputEvent("password")}
                        placeholder="Set an initial password"
                        autoComplete="new-password"
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Professional details */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Professional details</h3>
                  <p className={styles.cardSubtitle}>
                    Helps customers know who they're booking.
                  </p>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 3 }}>
                  <Field label="Profession" error={errors.profession}>
                    <input
                      className={`${styles.input} ${errors.profession ? styles.inputError : ""}`}
                      value={formData.profession}
                      onChange={handleInputEvent("profession")}
                      placeholder="Nutritionist"
                    />
                  </Field>
                  <Field label="Specialization" error={errors.specialization}>
                    <input
                      className={`${styles.input} ${errors.specialization ? styles.inputError : ""}`}
                      value={formData.specialization}
                      onChange={handleInputEvent("specialization")}
                      placeholder="Weight management"
                    />
                  </Field>
                  <Field
                    label="Years of experience"
                    error={errors.yearOfExperience}
                  >
                    <input
                      type="number"
                      min="0"
                      className={`${styles.input} ${errors.yearOfExperience ? styles.inputError : ""}`}
                      value={formData.yearOfExperience}
                      onChange={handleInputEvent("yearOfExperience")}
                      placeholder="6"
                    />
                  </Field>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 2 }}>
                  <Field
                    label="License / ID number"
                    hint="Optional — for verified badge"
                    error={errors.licenseIdNumber}
                  >
                    <input
                      className={`${styles.input} ${errors.licenseIdNumber ? styles.inputError : ""}`}
                      value={formData.licenseIdNumber}
                      onChange={handleInputEvent("licenseIdNumber")}
                      placeholder="Optional — for verified badge"
                    />
                  </Field>
                  <Field label="Languages" error={errors.languages}>
                    <div className={styles.tagInputWrap}>
                      {formData.languages.length > 0 && (
                        <div className={styles.tagList}>
                          {formData.languages.map((tag) => (
                            <span key={tag} className={styles.tagPill}>
                              {tag}
                              <button
                                type="button"
                                className={styles.tagRemove}
                                onClick={() => handleRemoveTag(tag)}
                                aria-label={`Remove ${tag}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        className={styles.input}
                        value={textFieldValue}
                        onChange={(e) => handleTextFieldChange(e.target.value)}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() =>
                          setTimeout(() => setShowDropdown(false), 200)
                        }
                        placeholder="Search and add languages"
                      />
                      {showDropdown && filteredTags.length > 0 && (
                        <div className={styles.tagDropdown}>
                          {filteredTags.map((tag) => (
                            <div
                              key={tag}
                              className={styles.tagOption}
                              onClick={() => handleTagSelect(tag)}
                            >
                              {tag}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Field>
                </div>
              </div>

              {/* Consultation pricing */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Consultation pricing</h3>
                  <p className={styles.cardSubtitle}>
                    What customers pay per minute, by channel.
                  </p>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 3 }}>
                  <Field label="Chat — per min" error={errors.chatPerMinute}>
                    <div className={styles.amountField}>
                      <span className={styles.amountPrefix}>{adminDetails_?.currency}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${styles.input} ${errors.chatPerMinute ? styles.inputError : ""}`}
                        value={formData.chatPerMinute}
                        onChange={handleInputEvent("chatPerMinute")}
                        placeholder="0.00"
                      />
                    </div>
                  </Field>
                  <Field label="Voice — per min" error={errors.voicePerMinute}>
                    <div className={styles.amountField}>
                      <span className={styles.amountPrefix}>{adminDetails_?.currency}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${styles.input} ${errors.voicePerMinute ? styles.inputError : ""}`}
                        value={formData.voicePerMinute}
                        onChange={handleInputEvent("voicePerMinute")}
                        placeholder="0.00"
                      />
                    </div>
                  </Field>
                  <Field label="Video — per min" error={errors.videoPerMinute}>
                    <div className={styles.amountField}>
                      <span className={styles.amountPrefix}>{adminDetails_?.currency}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${styles.input} ${errors.videoPerMinute ? styles.inputError : ""}`}
                        value={formData.videoPerMinute}
                        onChange={handleInputEvent("videoPerMinute")}
                        placeholder="0.00"
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Address — not part of the storefront listing reference,
                  kept as its own section since these fields are still
                  required/collected by the existing backend. */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Address</h3>
                  <p className={styles.cardSubtitle}>
                    Not shown on the storefront — used for records only.
                  </p>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 3 }}>
                  <Field label="House number" error={errors.houseNumber}>
                    <input
                      className={`${styles.input} ${errors.houseNumber ? styles.inputError : ""}`}
                      value={formData.houseNumber}
                      onChange={handleInputEvent("houseNumber")}
                    />
                  </Field>
                  <Field label="Street area" error={errors.streetArea}>
                    <input
                      className={`${styles.input} ${errors.streetArea ? styles.inputError : ""}`}
                      value={formData.streetArea}
                      onChange={handleInputEvent("streetArea")}
                    />
                  </Field>
                  <Field label="Landmark" error={errors.landmark}>
                    <input
                      className={`${styles.input} ${errors.landmark ? styles.inputError : ""}`}
                      value={formData.landmark}
                      onChange={handleInputEvent("landmark")}
                    />
                  </Field>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 2 }}>
                  <Field label="Address" error={errors.address}>
                    <input
                      className={`${styles.input} ${errors.address ? styles.inputError : ""}`}
                      value={formData.address}
                      onChange={handleInputEvent("address")}
                    />
                  </Field>
                  <Field label="Pincode" error={errors.pincode}>
                    <input
                      type="number"
                      className={`${styles.input} ${errors.pincode ? styles.inputError : ""}`}
                      value={formData.pincode}
                      onChange={handleInputEvent("pincode")}
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* Side column */}
            <div className={styles.sideCol}>
              {/* Upload photo */}
              <div className={styles.card}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={PROFILE_IMAGE_ACCEPT}
                  onChange={handleFileInputChange}
                  className={styles.hiddenFileInput}
                />
                <div
                  className={styles.uploadBox}
                  onClick={handleFileButtonClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleFileButtonClick();
                  }}
                >
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt="Consultant"
                      className={styles.uploadPreview}
                    />
                  ) : (
                    <>
                      <span className={styles.uploadPlus}>+</span>
                      <span className={styles.uploadLabel}>Upload photo</span>
                    </>
                  )}
                  <span className={styles.uploadHint}>
                    JPG, PNG or WEBP — Max 2MB
                  </span>
                </div>
              </div>

              {/* Visibility */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Visibility</h3>
                </div>
                <div className={styles.visibilityRow}>
                  <div className={styles.visibilityText}>
                    <span className={styles.visibilityLabel}>
                      Show on storefront
                    </span>
                    <span className={styles.visibilityHint}>
                      {updateIsTrue
                        ? "Bookable by customers"
                        : "Bookable once saved"}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={consultantStatus}
                    className={`${styles.toggle} ${consultantStatus ? styles.toggleOn : ""}`}
                    onClick={handleToggleStatus}
                    disabled={!updateIsTrue || isTogglingStatus}
                    title={
                      updateIsTrue
                        ? "Toggle storefront visibility"
                        : "Available once this consultant is saved"
                    }
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>
              </div>

              {/* Personal details */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Personal details</h3>
                </div>
                <div className={styles.fieldRow} style={{ "--cols": 1 }}>
                  <Field label="Gender" error={errors.gender}>
                    <select
                      className={styles.select}
                      value={formData.gender}
                      onChange={handleInputEvent("gender")}
                    >
                      {genderOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Date of birth" error={errors.dateOfBirth}>
                    <input
                      type="date"
                      className={`${styles.input} ${errors.dateOfBirth ? styles.inputError : ""}`}
                      value={formData.dateOfBirth}
                      onChange={handleInputEvent("dateOfBirth")}
                    />
                  </Field>
                  <Field
                    label="PAN number"
                    hint="Used for payouts and verification only — never shown publicly."
                    error={errors.pancardNumber}
                  >
                    <input
                      className={`${styles.input} ${errors.pancardNumber ? styles.inputError : ""}`}
                      value={formData.pancardNumber}
                      onChange={handleInputEvent("pancardNumber")}
                      placeholder="ABCDE1234F"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Page>
    </Fragment>
  );
}

export default AddConsultant;
