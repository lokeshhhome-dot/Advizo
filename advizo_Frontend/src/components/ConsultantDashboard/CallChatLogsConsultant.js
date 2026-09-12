import axios from "axios";
import React, { useEffect, useState } from "react";
import { HiOutlinePhone, HiOutlineVideoCamera, HiOutlineClipboardDocumentList } from "react-icons/hi2";
import PageHeader from "./common/PageHeader";
import RecordList, { RecordRow } from "./common/RecordList";
import StatusPill from "./common/StatusPill";
import { getDuration } from "../Helper/Helper";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useOutletContext } from "react-router-dom";
import { getConsultantToken } from "../../utils/consultantAuth";
import MoneyValue from "../Helper/MoneyValue";
import styles from "./CallChatLogsConsultant.module.css";

const statusTone = (status) => {
  if (status === "completed" || status === "success") return "success";
  if (status === "pending") return "warning";
  return "neutral";
};

const CallLogsConsultant = () => {
  const [callLogsConsultant, setCallLogsConsultant] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const dispatch = useDispatch();
  const { voucherData } = useSelector((state) => state.users);
  const { shop } = useOutletContext() || {};
  const location = useLocation();
  const token = getConsultantToken();

  useEffect(() => {
    setTimeout(() => {
      if (window.parentIFrame) {
        window.parentIFrame.size();
      }
    }, 300);
  }, [location.pathname, voucherData]);

  useEffect(() => {
    setUserId(localStorage.getItem("client_u_Identity"));
    setShopId(localStorage.getItem("shop_o_Identity"));
  }, []);

  useEffect(() => {
    if (shopId) {
      dispatch(fetchVoucherData(shopId));
    }
  }, [shopId, dispatch]);

  const fetchLogs = async () => {
    if (!userId || !shopId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/find-user-chat-logs/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setCallLogsConsultant(response.data.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load call Activity-history. Please try again.",
      );
      setCallLogsConsultant([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, shopId, token, shop]);

  return (
    <div>
      <PageHeader title="Sessions" description="Your consultation Activity-history — calls and their outcomes." />
      <RecordList
        items={callLogsConsultant}
        loading={loading}
        error={error}
        onRetry={fetchLogs}
        emptyIcon={<HiOutlineClipboardDocumentList />}
        emptyTitle="No sessions yet"
        emptyText="Completed audio and video calls will be listed here."
        renderItem={(row) => (
          <RecordRow
            leading={
              <span className={styles.typeIcon}>
                {row.type === "video" ? <HiOutlineVideoCamera /> : <HiOutlinePhone />}
              </span>
            }
            title={row.user?.fullname || "—"}
            subtitle={`${row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"} · ${getDuration(row.startTime, row.endTime)} min`}
            trailing={
              <>
                <span className={styles.amount}>
                  <MoneyValue currency={voucherData?.shopCurrency}>
                    {Number(row.consultantAmount || 0).toFixed(2)}
                  </MoneyValue>
                </span>
                <StatusPill tone={statusTone(row.status)}>{row.status || "—"}</StatusPill>
              </>
            }
          />
        )}
      />
    </div>
  );
};

export default CallLogsConsultant;
