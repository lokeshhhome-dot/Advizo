import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IndexTable, Text, Badge } from "@shopify/polaris";
import ConsultantPageLayout from "./common/ConsultantPageLayout";
import ConsultantIndexTable from "./common/ConsultantIndexTable";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import { getConsultantToken } from "../../utils/consultantAuth";
import MoneyValue from "../Helper/MoneyValue";

const withdrawalHeadings = [
  { title: "Name" },
  { title: "Amount" },
  { title: "Status" },
  { title: "Description" },
  { title: "Date" },
];

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

  useEffect(() => {
    const getWithdrawalRequest = async () => {
      if (!userId) return;

      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/find/consultant/withdrawal/request/${userId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setWithdrawalRequest(response.data.data || []);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Unable to load withdrawal requests. Please try again.",
        );
        setWithdrawalRequest([]);
      } finally {
        setLoading(false);
      }
    };

    getWithdrawalRequest();
  }, [userId, token]);

  const renderRow = (row, index) => (
    <IndexTable.Row id={row._id || index} key={row._id || index} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {row.consultantId?.fullname || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          <MoneyValue currency={voucherData?.shopCurrency}>
            {Number(row.amount || 0).toFixed(2)}
          </MoneyValue>
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={row.status === "paid" ? "success" : "attention"}>
          {row.status || "—"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {row.note || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  );

  return (
    <ConsultantPageLayout
      title="Withdrawal requests"
      subtitle="View payout requests and their status."
      loading={loading}
      error={error}
      isEmpty={!loading && !error && withdrawalRequest.length === 0}
      emptyHeading="No withdrawal requests"
      emptyDescription="Submit a withdrawal request when you're ready to cash out."
      primaryAction={{
        content: "New withdrawal request",
        onAction: () => navigate("/consultant-dashboard/withdrawal-request"),
      }}
    >
      <ConsultantIndexTable
        headings={withdrawalHeadings}
        resourceName={{ singular: "request", plural: "requests" }}
        data={withdrawalRequest}
        loading={loading}
        renderRow={renderRow}
      />
    </ConsultantPageLayout>
  );
};

export default WithdrawalRequestTable;
