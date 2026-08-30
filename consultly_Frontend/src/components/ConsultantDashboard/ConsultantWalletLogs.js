import React, { useEffect, useState } from "react";
import { HiOutlineBanknotes } from "react-icons/hi2";
import PageHeader from "./common/PageHeader";
import EarningsTabs from "./common/EarningsTabs";
import RecordList, { RecordRow } from "./common/RecordList";
import StatusPill from "./common/StatusPill";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import { getConsultantToken } from "../../utils/consultantAuth";
import MoneyValue from "../Helper/MoneyValue";
import styles from "./ConsultantWalletLogs.module.css";

const directionTone = (direction) => (direction === "credit" ? "success" : "danger");
const statusTone = (status) => (status === "success" ? "success" : "warning");

const ConsultantWalletLogs = () => {
  const [walletLogs, setWalletLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const dispatch = useDispatch();
  const { voucherData } = useSelector((state) => state.users);
  const token = getConsultantToken();
  const shop = localStorage.getItem("shop");

  useEffect(() => {
    setUserId(localStorage.getItem("client_u_Identity"));
    setShopId(localStorage.getItem("shop_o_Identity"));
  }, []);

  useEffect(() => {
    if (shopId) {
      dispatch(fetchVoucherData(shopId, token, shop));
    }
  }, [shopId, dispatch, token, shop]);

  const fetchLogs = async () => {
    if (!userId || !shopId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/find-consultant/wallet/history/${userId}/${shopId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setWalletLogs(response.data.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load wallet history. Please try again.",
      );
      setWalletLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, shopId, token]);

  return (
    <div>
      <PageHeader
        title="Earnings"
        description="Balance, transactions, and withdrawal activity in one place."
        tabs={<EarningsTabs />}
      />
      <RecordList
        items={walletLogs}
        loading={loading}
        error={error}
        onRetry={fetchLogs}
        emptyIcon={<HiOutlineBanknotes />}
        emptyTitle="No transactions yet"
        emptyText="Wallet activity will appear here after your first consultation payment."
        renderItem={(row) => (
          <RecordRow
            leading={
              <span className={`${styles.dirIcon} ${row.direction === "credit" ? styles.dirIconCredit : styles.dirIconDebit}`}>
                {row.direction === "credit" ? "+" : "−"}
              </span>
            }
            title={row.userId?.fullname || row.transactionType || "Transaction"}
            subtitle={row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
            trailing={
              <>
                <span className={styles.amount}>
                  <MoneyValue currency={voucherData?.shopCurrency}>
                    {row.amount?.toFixed(2) || "0.00"}
                  </MoneyValue>
                </span>
                <StatusPill tone={directionTone(row.direction)}>{row.direction || "—"}</StatusPill>
                <StatusPill tone={statusTone(row.status)}>{row.status || "—"}</StatusPill>
              </>
            }
          />
        )}
      />
    </div>
  );
};

export default ConsultantWalletLogs;
