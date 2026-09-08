import {
  Card,
  Text,
  Button,
  Box,
  InlineStack,
  BlockStack,
  Page,
} from "@shopify/polaris";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { Redirect } from "@shopify/app-bridge/actions";
import { useMemo, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchAdminDetails,_PlanDetails } from "../components/Redux/slices/adminSlice";
import { getShopHandle } from "../utils/shopifyAdmin";

export default function AccountInformation() {
  const dispatch = useDispatch();
  const app = useAppBridge();
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const { adminDetails_, loading: adminDetailsLoading } = useSelector(
    (state) => state.admin,
  );
    const { planDetails } = useSelector(
    (state) => state.admin,
  );

  // The ?shop= param is often absent after in-app navigation, so fall back
  // to the admin details and the value stored at login (same as Dashboard).
  const shop =
    new URLSearchParams(window.location.search).get("shop") ||
    adminDetails_?.shop ||
    localStorage.getItem("shop") ||
    "";
  const displayDomain = getShopHandle(shop);
  useEffect(() => {
    const id = localStorage.getItem("advizo");
    setAdminIdLocal(id);
  }, []);
  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);

  useEffect(() => {
    if (adminIdLocal) {
      dispatch(_PlanDetails({ adminIdLocal, app }))
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
  }, [adminIdLocal]);

  return (
    <Page
      title="Billing"
      primaryAction={{
        content: "View Pricing",
        disabled: !displayDomain,
        onAction: () => {
          if (!redirect || !displayDomain) return;
          redirect.dispatch(
            Redirect.Action.REMOTE,
            `https://admin.shopify.com/store/${displayDomain}/charges/${process.env.REACT_APP_HANDLER}/pricing_plans`,
          );
        },
      }}
    >
      <Card>
        <Box>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text>Plan Name</Text>
              <Text fontWeight="bold">
                {planDetails?.data?.planName}
              </Text>
            </InlineStack>

            <InlineStack align="space-between">
              <Text>Plan Type</Text>
              <Text fontWeight="bold" style={{ textTransform: "lowercase" }}>
                {planDetails?.data?.billingCycle}
              </Text>
            </InlineStack>

            <InlineStack align="space-between">
              <Text>Plan Amount</Text>
              <Text fontWeight="bold">
                {planDetails?.data?.planPrice}
                <span style={{ fontSize: "0.65em", marginLeft: "2px", opacity: 0.85 }}>
                  {planDetails?.data?.currency}
                </span>
              </Text>
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
