import axios from "axios";
import React, { useEffect, useState } from "react";
import { IndexTable, Text, Badge } from "@shopify/polaris";
import ConsultantPageLayout from "./common/ConsultantPageLayout";
import ConsultantIndexTable from "./common/ConsultantIndexTable";
import { getDuration } from "../Helper/Helper";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useOutletContext } from "react-router-dom";
import { getConsultantToken } from "../../utils/consultantAuth";
import MoneyValue from "../Helper/MoneyValue";

const callLogsHeadings = [
  { title: "User name" },
  { title: "Amount" },
  { title: "Date & time" },
  { title: "Type" },
  { title: "Duration" },
  { title: "Status" },
];

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

  useEffect(() => {
    const getCallLogsConsultant = async () => {
      if (!userId || !shopId) return;

      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/find-user-chat-logs/${userId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setCallLogsConsultant(response.data.data || []);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Unable to load call history. Please try again.",
        );
        setCallLogsConsultant([]);
      } finally {
        setLoading(false);
      }
    };

    getCallLogsConsultant();
  }, [userId, shopId, token, shop]);

  const renderRow = (row, index) => (
    <IndexTable.Row id={row._id || index} key={row._id || index} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {row.user?.fullname || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          <MoneyValue currency={voucherData?.shopCurrency}>
            {Number(row.consultantAmount || 0).toFixed(2)}
          </MoneyValue>
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {row.type || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {getDuration(row.startTime, row.endTime)} min
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge
          tone={
            row.status === "completed" || row.status === "success"
              ? "success"
              : row.status === "pending"
                ? "attention"
                : undefined
          }
        >
          {row.status ?? "—"}
        </Badge>
      </IndexTable.Cell>
    </IndexTable.Row>
  );

  return (
    <ConsultantPageLayout
      title="Call history"
      subtitle="Review completed calls, durations, and earnings."
      loading={loading}
      error={error}
      isEmpty={!loading && !error && callLogsConsultant.length === 0}
      emptyHeading="No call history yet"
      emptyDescription="Completed audio and video calls will be listed here."
    >
      <ConsultantIndexTable
        headings={callLogsHeadings}
        resourceName={{ singular: "log", plural: "logs" }}
        data={callLogsConsultant}
        loading={loading}
        renderRow={renderRow}
      />
    </ConsultantPageLayout>
  );
};

export default CallLogsConsultant;
