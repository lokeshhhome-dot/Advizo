import React, {
  useState,
  useCallback,
  useContext,
  useEffect,
  Fragment,
} from "react";
import axios from "axios";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { useMemo } from "react";
import { Redirect } from "@shopify/app-bridge/actions";
import { useSelector } from "react-redux";
import { ToastContext } from "../components/AlertModel/PolariesTostContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import MoneyValue from "../components/Helper/MoneyValue";
import styles from "./VoucherSettings.module.css";

function VoucherSettings() {
  const app = useAppBridge();
  const { showToast } = useContext(ToastContext);
  const { adminDetails_ } = useSelector((state) => state.admin);
  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);
  const backToVoucherManagement = useCallback(() => {
    if (!redirect) return;
    redirect.dispatch(Redirect.Action.APP, "/vouchers");
  }, [redirect]);
  const [formData, setFormData] = useState({
    voucherCode: "",
    totalCoin: "",
    extraCoin: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const voucherId = params.get("id");
  const totalCoinParam = params.get("totalCoin");
  const extraCoinParam = params.get("extraCoin");
  const userId = localStorage.getItem("advizo");

  useEffect(() => {
    if (totalCoinParam && extraCoinParam) {
      setFormData((prev) => ({
        ...prev,
        totalCoin: totalCoinParam,
        extraCoin: extraCoinParam,
      }));
    }
  }, [totalCoinParam, extraCoinParam]);

  const handleFieldChange = useCallback((fieldName) => (value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
    setErrors((prev) => ({ ...prev, [fieldName]: "" }));
    setDirty(true);
  }, []);

  const handleInputEvent = useCallback(
    (fieldName) => (event) => handleFieldChange(fieldName)(event.target.value),
    [handleFieldChange],
  );

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!formData.voucherCode.trim()) {
      newErrors.voucherCode = "Voucher code is required";
    }
    if (
      formData.totalCoin === "" ||
      isNaN(Number(formData.totalCoin)) ||
      Number(formData.totalCoin) < 0
    ) {
      newErrors.totalCoin = "Enter a valid amount";
    }
    if (
      formData.extraCoin !== "" &&
      (isNaN(Number(formData.extraCoin)) || Number(formData.extraCoin) < 0)
    ) {
      newErrors.extraCoin = "Enter a valid amount";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleDiscard = () => {
    setFormData({ voucherCode: "", totalCoin: "", extraCoin: "" });
    setErrors({});
    setDirty(false);
  };

  //-------------------------- create voucher -------------------

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const token = await getAppBridgeToken(app);
    setLoading(true);

    try {
      const payload = {
        voucherCode: formData.voucherCode.trim(),
        totalCoin: Number(formData.totalCoin),
        extraCoin: Number(formData.extraCoin) || 0,
      };

      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/admin/voucher/${userId}`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (response.status === 200) {
        showToast(
          response.data?.message || "Voucher created successfully.",
        );
        backToVoucherManagement();
      } else {
        showToast(
          response.data?.message || "Failed to create voucher.",
          true,
        );
      }
    } catch (error) {
      console.error("Error saving voucher settings:", error);
      showToast(
        error.response?.data?.message ||
          error.message ||
          "Failed to create voucher. Please try again.",
        true,
      );
    } finally {
      setLoading(false);
    }
  }, [formData, userId, validateForm, app, backToVoucherManagement, showToast]);

  //-------------------------- update voucher (edit-via-link fallback) -------------------
  // The consultant list's own edit button now opens a modal instead — this
  // stays only as a fallback for a direct ?id= link, unchanged behavior.

  const handleUpdate = async () => {
    if (!validateForm()) return;
    const token = await getAppBridgeToken(app);
    setLoading(true);
    try {
      const payload = {
        voucherCode: formData.voucherCode.trim(),
        totalCoin: Number(formData.totalCoin),
        extraCoin: Number(formData.extraCoin) || 0,
      };
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/admin/voucher-updates/${userId}/${voucherId}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 200) {
        showToast(
          response.data?.message || "Voucher updated successfully.",
        );
        backToVoucherManagement();
      } else {
        showToast(
          response.data?.message || "Failed to update voucher.",
          true,
        );
      }
    } catch (error) {
      console.error("Error updating voucher settings:", error);
      showToast(
        error.response?.data?.message || "Failed to update voucher.",
        true,
      );
    } finally {
      setLoading(false);
    }
  };

  const currency = adminDetails_?.currency;
  const pays = Number(formData.totalCoin) || 0;
  const bonus = Number(formData.extraCoin) || 0;

  return (
    <Fragment>
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={backToVoucherManagement}>
          ‹ Vouchers
        </button>

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>
              {voucherId ? "Update voucher" : "Add voucher"}
            </h1>
            <p className={styles.subtitle}>
              Codes that top up a shopper's wallet.
            </p>
          </div>
          <div className={styles.headerActions}>
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
              onClick={voucherId ? handleUpdate : handleSubmit}
              disabled={loading}
            >
              {loading
                ? "Saving…"
                : voucherId
                  ? "Update voucher"
                  : "Create voucher"}
            </button>
          </div>
        </div>

        <div className={styles.layout}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Voucher details</h3>
              <p className={styles.cardSubtitle}>
                Customers enter this code to top up their wallet.
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Voucher code *</label>
              <input
                className={`${styles.input} ${errors.voucherCode ? styles.inputError : ""}`}
                value={formData.voucherCode}
                onChange={handleInputEvent("voucherCode")}
                onBlur={(e) =>
                  handleFieldChange("voucherCode")(e.target.value.toUpperCase())
                }
                placeholder="WELCOME50"
              />
              {errors.voucherCode && (
                <span className={styles.fieldError}>{errors.voucherCode}</span>
              )}
            </div>

            <div className={styles.field}>
              <div className={styles.fieldRow}>
                <div>
                  <label className={styles.fieldLabel}>Customer pays</label>
                  <div className={styles.amountField}>
                    <span className={styles.amountPrefix}>{currency || "₹"}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${styles.input} ${errors.totalCoin ? styles.inputError : ""}`}
                      value={formData.totalCoin}
                      onChange={handleInputEvent("totalCoin")}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.totalCoin && (
                    <span className={styles.fieldError}>{errors.totalCoin}</span>
                  )}
                </div>
                <div>
                  <label className={styles.fieldLabel}>Bonus credit added</label>
                  <div className={styles.amountField}>
                    <span className={styles.amountPrefix}>{currency || "₹"}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${styles.input} ${errors.extraCoin ? styles.inputError : ""}`}
                      value={formData.extraCoin}
                      onChange={handleInputEvent("extraCoin")}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.extraCoin ? (
                    <span className={styles.fieldError}>{errors.extraCoin}</span>
                  ) : (
                    <span className={styles.fieldHint}>Extra wallet balance as a gift</span>
                  )}
                </div>
              </div>
            </div>

            {(pays > 0 || bonus > 0) && (
              <div className={styles.exampleBox}>
                A shopper who redeems this code gets{" "}
                <span className={styles.exampleValue}>
                  <MoneyValue currency={currency}>{pays + bonus}</MoneyValue>
                </span>{" "}
                added to their wallet.
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>About vouchers</h3>
            </div>
            <p className={styles.aboutText}>
              A shopper enters this code at checkout to top up their store
              wallet. They pay the "Customer pays" amount, and the "Bonus
              credit" is added on top for free.
            </p>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

export default VoucherSettings;
