import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowDownTray } from "react-icons/hi2";
import PageHeader from "./common/PageHeader";
import EarningsTabs from "./common/EarningsTabs";
import RecordList, { RecordRow } from "./common/RecordList";
import StatusPill from "./common/StatusPill";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import { getConsultantToken } from "../../utils/consultantAuth";
import MoneyValue from "../Helper/MoneyValue";
import styles from "./WithdrawalRequestTable.module.css";

// Real backend statuses are pending | paid | declined — never "rejected".
const statusTone = (status) => {
  if (status === "paid") return "success";
  if (status === "declined") return "danger";
  return "warning";
};

const WithdrawalRequestTable = () => {
  const navigate = useNavigate();
  const [withdrawalRequest, setWithdrawalRequest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const dispatch = useDispatch();
  const { voucherData } = useSelector((state) => state.users);
  const token = getConsultantToken();

  useEffect(() => {
    setUserId(localStorage.getItem("client_u_Identity"));
    setShopId(localStorage.getItem("shop_o_Identity"));
  }, []);

  useEffect(() => {
    if (shopId) {
      dispatch(fetchVoucherData(shopId));
    }
  }, [shopId, dispatch]);

  const fetchRequests = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/find/consultant/withdrawal/request/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setWithdrawalRequest(response.data.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load withdrawal requests. Please try again.",
      );
      setWithdrawalRequest([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  return (
    <div>
      <PageHeader
        title="Earnings"
        description="Balance, transactions, and withdrawal activity in one place."
        tabs={<EarningsTabs />}
        actions={
          <button
            type="button"
            className={styles.newRequestBtn}
            onClick={() => navigate("/consultant-dashboard/withdrawal-request")}
          >
            New withdrawal request
          </button>
        }
      />
      <RecordList
        items={withdrawalRequest}
        loading={loading}
        error={error}
        onRetry={fetchRequests}
        emptyIcon={<HiOutlineArrowDownTray />}
        emptyTitle="No withdrawal requests"
        emptyText="Submit a withdrawal request when you're ready to cash out."
        renderItem={(row) => (
          <RecordRow
            leading={
              <span className={styles.icon}>
                <HiOutlineArrowDownTray />
              </span>
            }
            title={
              <MoneyValue currency={voucherData?.shopCurrency}>
                {Number(row.amount || 0).toFixed(2)}
              </MoneyValue>
            }
            subtitle={`${row.note ? `${row.note} · ` : ""}${row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}`}
            trailing={<StatusPill tone={statusTone(row.status)}>{row.status || "—"}</StatusPill>}
          />
        )}
      />
    </div>
  );
};

export default WithdrawalRequestTable;
