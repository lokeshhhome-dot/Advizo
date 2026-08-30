import React, { useState, useEffect, Fragment } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import MoneyValue from "../Helper/MoneyValue";
import ReactToast from "../AlertModel/ReactToast";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import PageHeader from "./common/PageHeader";
import EarningsTabs from "./common/EarningsTabs";
import { getConsultantToken } from "../../utils/consultantAuth";
import styles from "./WithdrawalRequestForm.module.css";

const WithdrawalRequestForm = () => {
  const dispatch = useDispatch();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const consultantId = localStorage.getItem("client_u_Identity");
  const shopId = localStorage.getItem("shop_o_Identity");
  const { consultantOverview } = useSelector((state) => state.consultants);
  const { voucherData } = useSelector((state) => state.users);
  const token = getConsultantToken();
  const shop = localStorage.getItem("shop");

  useEffect(() => {
    if (shopId && consultantId) {
      dispatch(
        fetchConsultantById({
          shop_id: shopId,
          consultant_id: consultantId,
        }),
      );
    }
  }, [shopId, consultantId, showToast, dispatch]);

  useEffect(() => {
    if (shopId) {
      dispatch(fetchVoucherData(shopId, token, shop));
    }
  }, [shopId, dispatch, token, shop]);

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid withdrawal amount.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/submit/withdrawal/request/${consultantId}/${shopId}`,
        { amount, note },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.status === 201) {
        setShowToast(true);
        setAmount("");
        setNote("");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Failed to submit withdrawal request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const balance = consultantOverview?.consultant?.walletBalance || 0;
  const currency = voucherData?.shopCurrency || "";

  return (
    <Fragment>
      <ReactToast
        show={showToast}
        message="Withdrawal request submitted successfully"
        onClose={() => setShowToast(false)}
        duration={3000}
      />
      <PageHeader
        title="Earnings"
        description="Balance, transactions, and withdrawal activity in one place."
        tabs={<EarningsTabs />}
      />

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>Available balance</span>
        <div className={styles.balanceValue}>
          <MoneyValue currency={currency} amount={balance} />
        </div>
      </div>

      <div className={styles.formCard}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="wd-amount">Amount</label>
          <input
            id="wd-amount"
            className={styles.input}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter withdrawal amount"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="wd-note">Note</label>
          <textarea
            id="wd-note"
            className={`${styles.input} ${styles.textarea}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional message for the store admin"
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting…" : "Request withdrawal"}
          </button>
        </div>
      </div>
    </Fragment>
  );
};

export default WithdrawalRequestForm;
