import {
  Banner,
  Layout,
  Page,
  BlockStack,
  LegacyCard,
  FormLayout,
  TextField,
  Tag,
  DropZone,
  LegacyStack,
  Text,
  Select,
  Button,
  Spinner,
  Grid,
} from "@shopify/polaris";
import { ConfettiIcon, ExternalIcon } from "@shopify/polaris-icons";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  Fragment,
} from "react";
import axios from "axios";
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
import { ContextualSaveBar } from "@shopify/polaris";
import { Box } from "@shopify/polaris";

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
  // Language tags
  const [textFieldValue, setTextFieldValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchParams] = useSearchParams();
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const consultantId = searchParams.get("id");
  useEffect(() => {
    const id = localStorage.getItem("consultly");
    setAdminIdLocal(id);
  }, []);

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
  const handleDropZoneDrop = useCallback(
    (dropFiles, acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        showToast("Only JPG, PNG or WEBP images are allowed", true);
        return;
      }
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const imageError = validateProfileImage(file);
        if (imageError) {
          showToast(imageError, true);
          return;
        }
        setProfileImageUrl(URL.createObjectURL(file));
        setProfileFile(file);
        setDirty(true);
      }
    },
    [showToast],
  );

  const handleTextFieldChange = useCallback((value) => {
    setTextFieldValue(value);
    setShowDropdown(true);
  }, []);

  const handleTextFieldFocus = useCallback(() => {
    setShowDropdown(true);
  }, []);

  const handleTagSelect = useCallback(
    (tag) => {
      if (!formData.languages.includes(tag)) {
        setFormData((prev) => ({
          ...prev,
          languages: [...prev.languages, tag],
        }));
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
  }, []);

  const filteredTags = availableTags.filter((tag) => {
    const matchesSearch =
      textFieldValue.length === 0 ||
      tag.toLowerCase().includes(textFieldValue.toLowerCase());
    const notSelected = !formData.languages.includes(tag);
    return matchesSearch && notSelected;
  });

  const verticalContentMarkup = (
    <BlockStack gap="200">
      {formData.languages.length > 0 && (
        <BlockStack gap="100">
          <Text variant="bodySm" tone="subdued" fontWeight="medium">
            Selected Tags:
          </Text>
          <LegacyStack spacing="extraTight" alignment="center" wrap>
            {formData.languages.map((tag) => (
              <Tag key={tag} onRemove={() => handleRemoveTag(tag)}>
                {tag}
              </Tag>
            ))}
          </LegacyStack>
        </BlockStack>
      )}
    </BlockStack>
  );

  //-------------------------- dropdown markup -------------------

  const dropdownMarkup = showDropdown && filteredTags.length > 0 && (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        backgroundColor: "white",
        border: "1px solid #e1e3e5",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        zIndex: 1000,
        maxHeight: "200px",
        overflowY: "auto",
        marginTop: "4px",
      }}
    >
      {filteredTags.map((tag) => (
        <div
          key={tag}
          onClick={() => handleTagSelect(tag)}
          style={{
            padding: "8px 12px",
            cursor: "pointer",
            borderBottom: "1px solid #e1e3e5",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f6f6f7";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          <Text variant="bodyMd">{tag}</Text>
        </div>
      ))}
    </div>
  );

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

    for (let pair of form.entries()) {
    }

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

      if (consultantDetails.profileImage) {
        let imagePath = consultantDetails.profileImage.replace(/\\/g, "/");

        if (!imagePath.startsWith("http")) {
          const backendHost = process.env.REACT_APP_BACKEND_HOST;
          const breakpoint = backendHost.split("/").pop();
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
      <Box paddingBlockStart="400">
        <Page
          marginBlockStart="400"
          backAction={{
            disabled: true,
            content: "Consultant List",
            onAction: goToAddConsultant,
          }}
          title={
            updateIsTrue
              ? "Update Consultant settings"
              : "Add Consultant settings"
          }
        >
          {dirty && (
            <ContextualSaveBar
              message="Unsaved changes"
              saveAction={{
                content: updateIsTrue ? "Update" : "Submit",
                onAction: updateIsTrue
                  ? updateConsultantData
                  : submitConsultantData,
                loading: isSubmitting,
              }}
              discardAction={{
                onAction: handleDiscard,
              }}
            />
          )}

          <Layout>
            <Layout.Section>
              <LegacyCard title="Add Consultant settings" sectioned>
                <FormLayout>
                  <FormLayout.Group>
                    <Grid>
                      <Grid.Cell
                        columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}
                      >
                        <FormLayout>
                          <FormLayout.Group>
                            {/* Full Name */}
                            <TextField
                              label="Full Name"
                              value={formData.fullName}
                              onChange={handleFieldChange("fullName")}
                              autoComplete="off"
                              onBlur={() => setDirty(true)}
                              error={errors.fullName}
                            />
                          </FormLayout.Group>
                          <FormLayout.Group>
                            {/* Email */}
                            <TextField
                              label="Email"
                              type="email"
                              value={formData.email}
                              onChange={handleFieldChange("email")}
                              autoComplete="email"
                              onBlur={() => setDirty(true)}
                              error={errors.email}
                            />
                          </FormLayout.Group>
                          {!updateIsTrue && (
                            <FormLayout.Group>
                              <TextField
                                label="Password"
                                type="password"
                                value={formData.password}
                                onChange={handleFieldChange("password")}
                                autoComplete="off"
                                onBlur={() => setDirty(true)}
                                error={errors.password}
                              />
                            </FormLayout.Group>
                          )}
                        </FormLayout>
                      </Grid.Cell>
                      {/* Profile Image */}
                      <Grid.Cell
                        columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}
                      >
                        <div
                          style={{ width: 200, height: "auto", margin: "auto" }}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={PROFILE_IMAGE_ACCEPT}
                            onChange={handleFileInputChange}
                            style={{ display: "none" }}
                            onBlur={() => setDirty(true)}
                          />
                          <DropZone
                            onDrop={handleDropZoneDrop}
                            accept={PROFILE_IMAGE_ACCEPT}
                            type="image"
                            allowMultiple={false}
                            onBlur={() => setDirty(true)}
                          >
                            {profileImageUrl ? (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  textAlign: "center",
                                  padding: "10px",
                                  display: "flex",
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <img
                                  src={
                                    profileImageUrl ||
                                    "./images/teamdefault.png"
                                  }
                                  alt="Profile Preview"
                                  style={{
                                    width: 90,
                                    height: 90,
                                    borderRadius: "8px",
                                    objectFit: "cover",
                                  }}
                                />
                              </div>
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  textAlign: "center",
                                  padding: "10px",
                                  display: "flex",
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <img
                                  src="https://imgs.search.brave.com/yOFX1qSEMWIswSBYLiK9GC4cJjj0gZbFzr7-sfcycHQ/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/dmVjdG9yc3RvY2su/Y29tL2kvNTAwcC80/Mi8wOC9hdmF0YXIt/ZGVmYXVsdC11c2Vy/LXByb2ZpbGUtaWNv/bi1zb2NpYWwtbWVk/aWEtdmVjdG9yLTU3/MjM0MjA4LmpwZw"
                                  alt="Default Profile"
                                  style={{
                                    width: 90,
                                    height: 90,
                                    borderRadius: "8px",
                                    objectFit: "cover",
                                  }}
                                />
                              </div>
                            )}
                          </DropZone>
                          <div
                            style={{ marginTop: "8px", textAlign: "center" }}
                          >
                            <Button size="slim" onClick={handleFileButtonClick}>
                              Upload Image
                            </Button>
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "12px",
                                color: "#6d7175",
                              }}
                            >
                              Max 2MB. JPG, PNG or WEBP
                            </div>
                          </div>
                        </div>
                      </Grid.Cell>
                    </Grid>
                  </FormLayout.Group>
                  <div style={{ marginTop: updateIsTrue ? "20px" : "0px" }}>
                    <FormLayout.Group>
                      {/* Phone Number */}
                      <TextField
                        label="Phone Number"
                        type="number"
                        value={formData.phoneNumber}
                        onChange={handleFieldChange("phoneNumber")}
                        autoComplete="off"
                        onBlur={() => setDirty(true)}
                        error={errors.phoneNumber}
                      />

                      {/* Profession */}
                      <TextField
                        label="Profession"
                        value={formData.profession}
                        onChange={handleFieldChange("profession")}
                        autoComplete="off"
                        onBlur={() => setDirty(true)}
                        error={errors.profession}
                      />

                      {/* Specialization */}
                      <TextField
                        label="Specialization"
                        value={formData.specialization}
                        onChange={handleFieldChange("specialization")}
                        autoComplete="off"
                        onBlur={() => setDirty(true)}
                        error={errors.specialization}
                      />
                    </FormLayout.Group>
                  </div>
                  <FormLayout.Group>
                    {/* License / ID Number */}
                    <TextField
                      label="License / ID Number"
                      value={formData.licenseIdNumber}
                      onChange={handleFieldChange("licenseIdNumber")}
                      autoComplete="off"
                      onBlur={() => setDirty(true)}
                      error={errors.licenseIdNumber}
                    />

                    {/* Year of Experience */}
                    <TextField
                      label="Year of Experience"
                      type="number"
                      value={formData.yearOfExperience}
                      onChange={handleFieldChange("yearOfExperience")}
                      autoComplete="off"
                      onBlur={() => setDirty(true)}
                      error={errors.yearOfExperience}
                    />
                  </FormLayout.Group>
                </FormLayout>
              </LegacyCard>
            </Layout.Section>

            <Layout.Section>
              <LegacyCard title="Add your consultant charges" sectioned>
                <FormLayout>
                  <FormLayout.Group>
                    {/* Display Name */}
                    <TextField
                      type="number"
                      label="Chat per minute"
                      value={formData.chatPerMinute}
                      onChange={handleFieldChange("chatPerMinute")}
                      autoComplete="off"
                      onBlur={() => setDirty(true)}
                      error={errors.chatPerMinute}
                    />
                    {/* Voice per minute */}
                    <TextField
                      type="number"
                      label="Voice per minute"
                      value={formData.voicePerMinute}
                      onChange={handleFieldChange("voicePerMinute")}
                      autoComplete="off"
                      onBlur={() => setDirty(true)}
                      error={errors.voicePerMinute}
                    />
                    {/* Audio per minute */}
                    {/* Video per minute */}

                    <TextField
                      type="number"
                      label="Video per minute"
                      value={formData.videoPerMinute}
                      onChange={handleFieldChange("videoPerMinute")}
                      autoComplete="off"
                      onBlur={() => setDirty(true)}
                      error={errors.videoPerMinute}
                    />

                  </FormLayout.Group>
                </FormLayout>
              </LegacyCard>
            </Layout.Section>

            {/* add your consultant Language */}
            <Layout.Section>
              <div className="language-card-wrapper">
                <LegacyCard title="Add your consultant Language" sectioned>
                  <FormLayout>
                    <FormLayout.Group>
                      <div style={{ position: "relative", width: "100%" }}>
                        <TextField
                          label="Tags"
                          paddingBlockEnd="0"
                          value={textFieldValue}
                          onChange={handleTextFieldChange}
                          onFocus={handleTextFieldFocus}
                          onBlur={() => {
                            setTimeout(() => setShowDropdown(false), 200);
                          }}
                          placeholder="Search tags"
                          autoComplete="off"
                          verticalContent={verticalContentMarkup}
                          error={errors.languages}
                        />
                        {dropdownMarkup}
                      </div>
                    </FormLayout.Group>
                  </FormLayout>
                </LegacyCard>
              </div>
            </Layout.Section>

            {/* Add your consultant details */}
            <Layout.Section>
              <LegacyCard title="Add your consultant details" sectioned>
                <div className="consultant-details-grid">
                  {/* Display Name */}
                  <TextField
                    label="Display Name"
                    value={formData.displayName}
                    onChange={handleFieldChange("displayName")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.displayName}
                  />
                  {/* Gender */}
                  <Select
                    label="Gender"
                    options={genderOptions}
                    onChange={handleFieldChange("gender")}
                    value={formData.gender}
                    onBlur={() => setDirty(true)}
                    error={errors.gender}
                  />
                  {/* House Number */}
                  <TextField
                    label="House Number"
                    value={formData.houseNumber}
                    onChange={handleFieldChange("houseNumber")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.houseNumber}
                  />
                </div>
                <div className="consultant-details-grid">
                  {/* Street Area */}
                  <TextField
                    label="Street Area"
                    value={formData.streetArea}
                    onChange={handleFieldChange("streetArea")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.streetArea}
                  />

                  {/* Landmark */}
                  <TextField
                    label="Landmark"
                    value={formData.landmark}
                    onChange={handleFieldChange("landmark")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.landmark}
                  />

                  {/* Address */}
                  <TextField
                    label="Address"
                    value={formData.address}
                    onChange={handleFieldChange("address")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.address}
                  />
                </div>
                <div className="consultant-details-grid">
                  {/* Pincode */}
                  <TextField
                    label="Pincode"
                    value={formData.pincode}
                    type="number"
                    onChange={handleFieldChange("pincode")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.pincode}
                  />

                  {/* Date of Birth */}
                  <TextField
                    label="Date of Birth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={handleFieldChange("dateOfBirth")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.dateOfBirth}
                  />

                  {/* Pancard Number */}
                  <TextField
                    label="Pancard Number"
                    value={formData.pancardNumber}
                    onChange={handleFieldChange("pancardNumber")}
                    autoComplete="off"
                    onBlur={() => setDirty(true)}
                    error={errors.pancardNumber}
                  />
                </div>
              </LegacyCard>
            </Layout.Section>
          </Layout>
          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "10px",
              justifyContent: "flex-end",
            }}
          >
            {updateIsTrue ? (
              <Button
                variant="primary"
                onClick={updateConsultantData}
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Update"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={submitConsultantData}
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            )}
          </div>
        </Page>
      </Box>
    </Fragment>
  );
}

export default AddConsultant;
