import React, { useState, useEffect, Fragment } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import {
  Card,
  TextField,
  Button,
  BlockStack,
  Text,
  InlineStack,
} from "@shopify/polaris";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import { formatAmountHelper } from "../Helper/Helper";
import MoneyValue from "../Helper/MoneyValue";
import ReactToast from "../AlertModel/ReactToast";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import ConsultantPageLayout from "./common/ConsultantPageLayout";
import { getConsultantToken } from "../../utils/consultantAuth";

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
  console.log("balance", balance)
  return (
    <Fragment>
      <ReactToast
        show={showToast}
        message="Withdrawal request submitted successfully"
        onClose={() => setShowToast(false)}
        duration={3000}
      />
      <ConsultantPageLayout
        title="Request withdrawal"
        subtitle="Transfer available balance to your payout method."
        error={error}
      >
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                Available balance
              </Text>
              <Text as="p" variant="headingLg" tone="success">
                <MoneyValue currency={currency} amount={balance} />
              </Text>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <TextField
                label="Amount"
                type="number"
                value={amount}
                onChange={setAmount}
                autoComplete="off"
                placeholder="Enter withdrawal amount"
              />
              <TextField
                label="Note"
                value={note}
                onChange={setNote}
                multiline={3}
                autoComplete="off"
                placeholder="Optional message for the store admin"
              />
              <InlineStack align="end">
                <Button
                  variant="primary"
                  loading={loading}
                  onClick={handleSubmit}
                >
                  Request withdrawal
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </ConsultantPageLayout>
    </Fragment>
  );
};

export default WithdrawalRequestForm;
