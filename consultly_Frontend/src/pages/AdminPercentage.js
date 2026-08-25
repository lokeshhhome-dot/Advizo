import { Page } from "@shopify/polaris";
import { useState, useCallback, Fragment, useEffect } from "react";
import axios from "axios";
import { fetchAdminDetails } from "../components/Redux/slices/adminSlice";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { useDispatch, useSelector } from "react-redux";
import { usePolarisToast } from "../components/AlertModel/PolariesTostContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import MoneyValue from "../components/Helper/MoneyValue";
import styles from "./AdminPercentage.module.css";

// Purely illustrative — the actual split always runs on the real session
// total (chatPerMinute/voicePerMinute/videoPerMinute x duration), never a
// fixed amount. 100 is just a round number to make the percentage tangible.
const EXAMPLE_AMOUNT = 100;

function AdminPercentage() {
  const app = useAppBridge();
  const dispatch = useDispatch();
  const { showToast } = usePolarisToast();
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const { adminDetails_ } = useSelector((state) => state.admin);
  const [percentage, setPercentage] = useState("");
  const [loading, setLoading] = useState(false);
  const [percentageError, setPercentageError] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("consultly");
    setAdminIdLocal(id);
  }, []);

  useEffect(() => {
    if (adminIdLocal) {
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
  }, [adminIdLocal]);

  useEffect(() => {
    if (adminDetails_?.adminPersenTage) {
      setPercentage(adminDetails_.adminPersenTage.$numberDecimal || "");
    }
  }, [adminDetails_?.adminPersenTage]);

  const handleChange = useCallback((value) => {
    setPercentage(value);
    setPercentageError(null);
    setDirty(true);
  }, []);

  const handleDiscard = useCallback(() => {
    if (adminDetails_?.adminPersenTage) {
      setPercentage(adminDetails_.adminPersenTage.$numberDecimal || "");
    }
    setPercentageError(null);
    setDirty(false);
  }, [adminDetails_?.adminPersenTage]);

  const handleSubmit = async () => {
    const value = Number(percentage);
    if (percentage === "" || Number.isNaN(value) || value < 0 || value > 100) {
      setPercentageError("Enter a value between 0 and 100");
      return;
    }
    try {
      setLoading(true);
      const token = await getAppBridgeToken(app);
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/admin/update-percentage/${adminIdLocal}`,
        { adminPercentage: value },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.success === true) {
        showToast(response.data.message);
        setDirty(false);
      } else {
        showToast(response.data.message, true);
      }
    } catch (error) {
      showToast("Failed to update percentage", true);
    } finally {
      setLoading(false);
    }
  };

  const pct = Math.min(100, Math.max(0, Number(percentage) || 0));
  const adminEarns = (EXAMPLE_AMOUNT * pct) / 100;
  const consultantEarns = EXAMPLE_AMOUNT - adminEarns;
  const currency = adminDetails_?.currency;

  return (
    <Fragment>
      <Page fullWidth>
        <div className={styles.page}>
          <div className={styles.header}>
            <h1 className={styles.title}>Commission</h1>
            <p className={styles.subtitle}>
              Set the percentage you keep from every session. Consultants
              receive the remainder automatically.
            </p>
          </div>

          <div className={styles.layout}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Commission percentage</h3>
                <p className={styles.cardSubtitle}>Applies to all consultants.</p>
              </div>

              <div className={styles.sliderRow}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pct}
                  onChange={(e) => handleChange(e.target.value)}
                  className={styles.slider}
                />
              </div>

              <div className={styles.inputRow}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={percentage}
                  onChange={(e) => handleChange(e.target.value)}
                  className={`${styles.percentInput} ${percentageError ? styles.inputError : ""}`}
                />
                <span className={styles.percentSuffix}>%</span>
              </div>
              {percentageError ? (
                <p className={styles.errorText}>{percentageError}</p>
              ) : (
                <p className={styles.hint}>Enter a value between 0 and 100</p>
              )}

              <div className={styles.exampleBox}>
                <div className={styles.exampleText}>
                  <span className={styles.exampleTitle}>
                    On a{" "}
                    <MoneyValue currency={currency}>{EXAMPLE_AMOUNT}</MoneyValue>{" "}
                    session
                  </span>
                  <span>
                    You earn <MoneyValue currency={currency}>{adminEarns}</MoneyValue> ·
                    consultant earns{" "}
                    <MoneyValue currency={currency}>{consultantEarns}</MoneyValue>
                  </span>
                </div>
                <span className={styles.exampleValue}>{pct}%</span>
              </div>

              <div className={styles.saveRow}>
                <button
                  type="button"
                  className={styles.discardButton}
                  onClick={handleDiscard}
                  disabled={!dirty || loading}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>About commission</h3>
              </div>
              <p className={styles.aboutText}>
                Commission is calculated on each session's real cost the
                moment it ends, and settled to your store balance
                immediately. Changes apply going forward — a session already
                in progress settles at whatever rate is in effect when it
                ends.
              </p>
            </div>
          </div>
        </div>
      </Page>
    </Fragment>
  );
}

export default AdminPercentage;
