import React, { useEffect, useState } from "react";
import { IndexTable, Text, Badge } from "@shopify/polaris";
import ConsultantPageLayout from "./common/ConsultantPageLayout";
import ConsultantIndexTable from "./common/ConsultantIndexTable";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import { getConsultantToken } from "../../utils/consultantAuth";
import MoneyValue from "../Helper/MoneyValue";

const walletHeadings = [
  { title: "Name" },
  { title: "Amount" },
  { title: "Type" },
  { title: "Direction" },
  { title: "Status" },
  { title: "Date" },
];

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

  useEffect(() => {
    const getWalletLogs = async () => {
      if (!userId || !shopId) return;

      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/find-consultant/wallet/history/${userId}/${shopId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setWalletLogs(response.data.data || []);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Unable to load wallet history. Please try again.",
        );
        setWalletLogs([]);
      } finally {
        setLoading(false);
      }
    };

    getWalletLogs();
  }, [userId, shopId, token]);

  const renderRow = (row, index) => (
    <IndexTable.Row id={row._id || index} key={row._id || index} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {row.userId?.fullname || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          <MoneyValue currency={voucherData?.shopCurrency}>
            {row.amount?.toFixed(2) || "0.00"}
          </MoneyValue>
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {row.transactionType || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={row.direction === "credit" ? "success" : "critical"}>
          {row.direction || "—"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={row.status === "success" ? "success" : "attention"}>
          {row.status || "—"}
        </Badge>
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
      title="Earnings & billing"
      subtitle="Track credits, debits, and wallet activity."
      loading={loading}
      error={error}
      isEmpty={!loading && !error && walletLogs.length === 0}
      emptyHeading="No transactions yet"
      emptyDescription="Wallet activity will appear here after your first consultation payment."
    >
      <ConsultantIndexTable
        headings={walletHeadings}
        resourceName={{ singular: "transaction", plural: "transactions" }}
        data={walletLogs}
        loading={loading}
        renderRow={renderRow}
      />
    </ConsultantPageLayout>
  );
};

export default ConsultantWalletLogs;
