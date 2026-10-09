import { Page } from "@shopify/polaris";
import { useState, useCallback, useEffect, Fragment } from "react";
import axios from "axios";
import { fetchAdminDetails } from "../components/Redux/slices/adminSlice";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { useDispatch, useSelector } from "react-redux";
import { usePolarisToast } from "../components/AlertModel/PolariesTostContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import styles from "./ConsultantCardTheme.module.css";
import { useMemo } from "react";
import { Redirect } from "@shopify/app-bridge/actions";

// Same values as the Theme Extension's own CSS fallbacks
// (consultant-card.css) — shown here ONLY so the live preview looks like
// the real default card when a field hasn't been customized. Never sent to
// the backend as if the admin had chosen them; an empty field is saved as
// null (meaning "use the storefront default"), not as this hex value.
const DEFAULTS = {
  cardBackground: "#ffffff",
  // Storefront uses rgba(16, 35, 28, 0.1) — this is that blended on white,
  // since <input type="color"> only takes 6-digit hex.
  cardBorderColor: "#e7ebe9",
  headerBackground: "#dcece3",
  nameColor: "#10231c",
  categoryColor: "#14563c",
  supportingTextColor: "#5c6b64",
  priceColor: "#7b8a83",
  chatButtonBg: "#ffffff",
  chatButtonText: "#10231c",
  callButtonBg: "#ffffff",
  callButtonText: "#10231c",
  videoButtonBg: "#ffffff",
  videoButtonText: "#10231c",
  // rgba(16, 35, 28, 0.12) blended on white
  buttonBorderColor: "#e3e6e5",
  buttonHoverColor: "#14563c",
  onlineColor: "#2f9e6a",
  busyColor: "#e0a30b",
  offlineColor: "#9aa5a0",
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Same placeholder avatar the storefront card falls back to
// (DEFAULT_AVATAR_SVG in consultant-card.js).
const DEFAULT_AVATAR =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="32" fill="#f3f4f6"/>' +
      '<circle cx="32" cy="24" r="12" fill="#c7cbd1"/>' +
      '<path d="M10 56c2-14 12-20 22-20s20 6 22 20" fill="#c7cbd1"/>' +
      "</svg>",
  );

const COLOR_FIELD_GROUPS = [
  {
    title: "Card style",
    subtitle: "Background, border, and edges of the whole card.",
    fields: [
      { key: "cardBackground", label: "Card background" },
      { key: "cardBorderColor", label: "Border color" },
    ],
  },
  {
    title: "Top category area",
    subtitle:
      "The light band behind the profession/category label at the top of the card.",
    fields: [{ key: "headerBackground", label: "Header background" }],
  },
  {
    title: "Typography",
    subtitle: "Text colors — sizes and fonts stay as-is.",
    fields: [
      { key: "nameColor", label: "Consultant name" },
      { key: "categoryColor", label: "Category / profession" },
      { key: "supportingTextColor", label: "Supporting text" },
      { key: "priceColor", label: "Price" },
    ],
  },
  {
    title: "Action buttons",
    subtitle: "Chat, Call, and Video keep their existing behavior — only color changes.",
    fields: [
      { key: "chatButtonBg", label: "Chat background" },
      { key: "chatButtonText", label: "Chat text" },
      { key: "callButtonBg", label: "Call background" },
      { key: "callButtonText", label: "Call text" },
      { key: "videoButtonBg", label: "Video background" },
      { key: "videoButtonText", label: "Video text" },
      { key: "buttonBorderColor", label: "Button border" },
      { key: "buttonHoverColor", label: "Button hover" },
    ],
  },
  {
    title: "Availability indicators",
    subtitle: "The small status dot only — the online/busy/offline logic itself is unchanged.",
    fields: [
      { key: "onlineColor", label: "Online" },
      { key: "busyColor", label: "Busy" },
      { key: "offlineColor", label: "Offline" },
    ],
  },
];

const EMPTY_FORM = {
  cardBackground: "",
  cardBorderColor: "",
  cardBorderRadius: "",
  cardShadow: "",
  headerBackground: "",
  nameColor: "",
  categoryColor: "",
  supportingTextColor: "",
  priceColor: "",
  chatButtonBg: "",
  chatButtonText: "",
  callButtonBg: "",
  callButtonText: "",
  videoButtonBg: "",
  videoButtonText: "",
  buttonBorderColor: "",
  buttonHoverColor: "",
  onlineColor: "",
  busyColor: "",
  offlineColor: "",
};

function themeToForm(theme) {
  const form = { ...EMPTY_FORM };
  if (!theme) return form;
  Object.keys(EMPTY_FORM).forEach((key) => {
    if (key === "cardBorderRadius") {
      form[key] = theme[key] === null || theme[key] === undefined ? "" : String(theme[key]);
      return;
    }
    form[key] = theme[key] || "";
  });
  return form;
}

function mapToProfessionRows(professionColors) {
  if (!professionColors) return [];
  // Mongoose Map fields come back as plain objects once serialized to JSON.
  return Object.keys(professionColors).map((profession) => ({
    profession,
    color: professionColors[profession] || "",
  }));
}

function ColorField({ label, value, defaultValue, onChange }) {
  // An unset field shows the storefront default in the swatch, so the admin
  // sees the colour actually in use — it still saves as null until changed.
  const displayValue = HEX_RE.test(value) ? value : defaultValue || "#ffffff";
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.colorField}>
        <input
          type="color"
          className={styles.colorSwatch}
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className={styles.colorHexInput}
          value={value}
          placeholder={defaultValue ? `Default (${defaultValue})` : "Default"}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <button
            type="button"
            className={styles.colorClearButton}
            title="Use default"
            onClick={() => onChange("")}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ConsultantCardTheme() {
  const app = useAppBridge();
  const dispatch = useDispatch();
  const { showToast } = usePolarisToast();
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const { adminDetails_ } = useSelector((state) => state.admin);
  const [form, setForm] = useState(EMPTY_FORM);
  const [professionRows, setProfessionRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("advizo");
    setAdminIdLocal(id);
  }, []);

  useEffect(() => {
    if (adminIdLocal) {
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminIdLocal]);

  // Reuses the existing admin details fetch — no separate GET endpoint for
  // this page. Only seeds the form once (loadedOnce) so a save's own
  // optimistic state isn't clobbered by the next background refresh.
  useEffect(() => {
    if (!adminDetails_ || loadedOnce) return;
    setForm(themeToForm(adminDetails_.consultantCardTheme));
    setProfessionRows(mapToProfessionRows(adminDetails_.consultantCardTheme?.professionColors));
    setLoadedOnce(true);
  }, [adminDetails_, loadedOnce]);

  const handleFieldChange = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleProfessionChange = useCallback((index, field, value) => {
    setProfessionRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }, []);

  const handleAddProfession = useCallback(() => {
    setProfessionRows((prev) => [...prev, { profession: "", color: "#14563c" }]);
  }, []);

  const handleRemoveProfession = useCallback((index) => {
    setProfessionRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    // Client-side pre-check only — the backend independently validates
    // every value again before saving (never trusts this).
    const invalidField = Object.keys(form).find((key) => {
      if (key === "cardBorderRadius" || key === "cardShadow" || !form[key]) return false;
      return !HEX_RE.test(form[key]);
    });
    if (invalidField) {
      showToast(`${invalidField} must be a valid color`, true);
      return;
    }

    const professionColors = {};
    for (const row of professionRows) {
      const name = row.profession.trim();
      if (!name) continue;
      if (!HEX_RE.test(row.color)) {
        showToast(`Enter a valid color for "${name}"`, true);
        return;
      }
      professionColors[name.toLowerCase()] = row.color;
    }

    const payload = {
      ...form,
      cardBorderRadius: form.cardBorderRadius === "" ? null : Number(form.cardBorderRadius),
      cardShadow: form.cardShadow || null,
      professionColors,
    };
    // Convert remaining empty-string fields to null (explicit "reset this
    // one field to default") rather than sending "" to the backend, which
    // only accepts a real hex string or null.
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") payload[key] = null;
    });

    setLoading(true);
    try {
      const token = await getAppBridgeToken(app);
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/admin/consultant-card-theme/${adminIdLocal}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.success) {
        showToast(response.data.message || "Consultant card appearance saved");
        dispatch(fetchAdminDetails({ adminIdLocal, app }));
      } else {
        showToast(response.data.message || "Failed to save", true);
      }
    } catch (error) {
      showToast(
        error.response?.data?.message || "Failed to save consultant card appearance",
        true,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Reset the Consultant Card back to its default appearance? This clears every saved color/style.",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const token = await getAppBridgeToken(app);
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/admin/consultant-card-theme/${adminIdLocal}`,
        { reset: true },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.success) {
        showToast(response.data.message || "Reset to default");
        setForm(EMPTY_FORM);
        setProfessionRows([]);
        dispatch(fetchAdminDetails({ adminIdLocal, app }));
      } else {
        showToast(response.data.message || "Failed to reset", true);
      }
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to reset", true);
    } finally {
      setResetting(false);
    }
  };

  const isCustomized =
    Object.keys(EMPTY_FORM).some((key) => Boolean(form[key])) || professionRows.length > 0;

  const previewHeaderBg = form.headerBackground || DEFAULTS.headerBackground;
  const previewOnline = form.onlineColor || DEFAULTS.onlineColor;

  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);

  const goToAddConsultant = () => {
    if (!redirect) return;
    redirect.dispatch(Redirect.Action.APP, "/settings");
  };

  return (
    <Fragment>
      <Page fullWidth>
        <div className={styles.page}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <p
                className={styles.backLink}
                onClick={goToAddConsultant}
              >
                ‹ settings
              </p>
              <h1 className={styles.title}>Consultant Card Appearance</h1>
              <p className={styles.subtitle}>
                Customize how the Consultant Card looks on your storefront. Leave a
                field blank to keep the current default look.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.resetButton}
                onClick={handleReset}
                disabled={resetting || loading || !isCustomized}
              >
                {resetting ? "Resetting…" : "Reset to default"}
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={loading || resetting}
              >
                {loading ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          {!isCustomized ? (
            <div className={styles.banner}>
              Using the default Consultant Card design — nothing customized yet.
            </div>
          ) : null}

          <div className={styles.layout}>
            <div className={styles.mainCol}>
              {COLOR_FIELD_GROUPS.map((group) => (
                <div className={styles.card} key={group.title}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{group.title}</h3>
                    <p className={styles.cardSubtitle}>{group.subtitle}</p>
                  </div>
                  <div className={styles.fieldGrid}>
                    {group.fields.map((f) => (
                      <ColorField
                        key={f.key}
                        label={f.label}
                        value={form[f.key]}
                        defaultValue={DEFAULTS[f.key]}
                        onChange={(v) => handleFieldChange(f.key, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>General card style</h3>
                  <p className={styles.cardSubtitle}>Shape and depth of the card.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Border radius</label>
                    <input
                      type="number"
                      min={0}
                      max={32}
                      className={styles.numberInput}
                      value={form.cardBorderRadius}
                      placeholder="16 (default)"
                      onChange={(e) => handleFieldChange("cardBorderRadius", e.target.value)}
                    />
                    <span className={styles.fieldHint}>0–32px</span>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Shadow</label>
                    <select
                      className={styles.select}
                      value={form.cardShadow}
                      onChange={(e) => handleFieldChange("cardShadow", e.target.value)}
                    >
                      <option value="">Default</option>
                      <option value="none">None</option>
                      <option value="soft">Soft</option>
                      <option value="strong">Strong</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Profession header colors</h3>
                  <p className={styles.cardSubtitle}>
                    Optional — give a category its own header color (e.g. Astrologer =
                    yellow, Lawyer = blue). Any profession not listed here uses the top
                    category area color above.
                  </p>
                </div>
                {professionRows.length === 0 ? (
                  <p className={styles.emptyProfessions}>
                    No profession-specific colors yet — every card uses the same header
                    color.
                  </p>
                ) : (
                  <div className={styles.professionList}>
                    {professionRows.map((row, index) => (
                      <div className={styles.professionRow} key={index}>
                        <input
                          type="text"
                          className={styles.professionNameInput}
                          value={row.profession}
                          placeholder="e.g. Astrologer"
                          onChange={(e) =>
                            handleProfessionChange(index, "profession", e.target.value)
                          }
                        />
                        <input
                          type="color"
                          className={styles.colorSwatch}
                          value={HEX_RE.test(row.color) ? row.color : "#14563c"}
                          onChange={(e) => handleProfessionChange(index, "color", e.target.value)}
                        />
                        <button
                          type="button"
                          className={styles.professionRemoveButton}
                          onClick={() => handleRemoveProfession(index)}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className={styles.addProfessionButton}
                  onClick={handleAddProfession}
                >
                  + Add profession color
                </button>
              </div>
            </div>

            <div className={styles.sideCol}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Live preview</h3>
                  <p className={styles.cardSubtitle}>Approximate — updates as you edit.</p>
                </div>
                <div className={styles.previewWrap}>
                  <div
                    className={styles.previewCard}
                    style={{
                      background: form.cardBackground || DEFAULTS.cardBackground,
                      borderColor: form.cardBorderColor || DEFAULTS.cardBorderColor,
                      borderRadius:
                        form.cardBorderRadius !== "" ? `${form.cardBorderRadius}px` : undefined,
                    }}
                  >
                    <div
                      className={styles.previewHeaderBand}
                      style={{ background: previewHeaderBg }}
                    >
                      <span
                        className={styles.previewCategory}
                        style={{ color: form.categoryColor || DEFAULTS.categoryColor }}
                      >
                        Consultant
                      </span>
                    </div>
                    <div className={styles.previewAvatarWrap}>
                      <img className={styles.previewAvatar} src={DEFAULT_AVATAR} alt="Default profile" />
                    </div>
                    <div className={styles.previewBody}>
                      <h4
                        className={styles.previewName}
                        style={{ color: form.nameColor || DEFAULTS.nameColor }}
                      >
                        Jane Doe
                      </h4>
                      <p
                        className={styles.previewMeta}
                        style={{ color: form.supportingTextColor || DEFAULTS.supportingTextColor }}
                      >
                        5+ yrs · English
                      </p>
                      <span className={styles.previewAvailability}>
                        <span
                          className={styles.previewDot}
                          style={{ background: previewOnline }}
                        />
                        Online
                      </span>
                      <div className={styles.previewActions}>
                        <span
                          className={styles.previewAction}
                          style={{
                            background: form.chatButtonBg || DEFAULTS.chatButtonBg,
                            color: form.chatButtonText || DEFAULTS.chatButtonText,
                            borderColor: form.buttonBorderColor || DEFAULTS.buttonBorderColor,
                          }}
                        >
                          Chat
                          <span
                            className={styles.previewActionAmount}
                            style={{ color: form.priceColor || DEFAULTS.priceColor }}
                          >
                            $3/min
                          </span>
                        </span>
                        <span
                          className={styles.previewAction}
                          style={{
                            background: form.callButtonBg || DEFAULTS.callButtonBg,
                            color: form.callButtonText || DEFAULTS.callButtonText,
                            borderColor: form.buttonBorderColor || DEFAULTS.buttonBorderColor,
                          }}
                        >
                          Call
                          <span
                            className={styles.previewActionAmount}
                            style={{ color: form.priceColor || DEFAULTS.priceColor }}
                          >
                            $5/min
                          </span>
                        </span>
                        <span
                          className={styles.previewAction}
                          style={{
                            background: form.videoButtonBg || DEFAULTS.videoButtonBg,
                            color: form.videoButtonText || DEFAULTS.videoButtonText,
                            borderColor: form.buttonBorderColor || DEFAULTS.buttonBorderColor,
                          }}
                        >
                          Video
                          <span
                            className={styles.previewActionAmount}
                            style={{ color: form.priceColor || DEFAULTS.priceColor }}
                          >
                            $8/min
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>About this page</h3>
                </div>
                <p className={styles.aboutText}>
                  Blank fields keep the app's current default design. Changes apply to
                  every Consultant Card on your storefront the next time a shopper loads
                  the page — existing Chat, Call, and consultant data are never affected.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Page>
    </Fragment>
  );
}

export default ConsultantCardTheme;
