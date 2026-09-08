import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  ProgressBar,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  Button,
  List,
  Spinner,
} from "@shopify/polaris";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import { ToastContext } from "../components/AlertModel/PolariesTostContext";

/**
 * Mid-trial upgrade screen. Shown when the shop's free trial consultation
 * minutes are used up (or opened directly). "Upgrade Now" creates a Shopify
 * recurring charge with trial_days=0 so billing activates immediately —
 * the paid plan always starts with its FULL minutes (trial usage is a
 * completely separate counter).
 */
function TrialUpgrade() {
  const app = useAppBridge();
  const navigate = useNavigate();
  const { showToast } = useContext(ToastContext);
  const adminId = localStorage.getItem("advizo");

  const [status, setStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const token = await getAppBridgeToken(app);
      const headers = { Authorization: `Bearer ${token}` };
      const [statusRes, plansRes] = await Promise.all([
        axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/admin/billing/trial-status/${adminId}`,
          { headers },
        ),
        axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/admin/billing/plans/${adminId}`,
          { headers },
        ),
      ]);
      setStatus(statusRes.data);
      const list = plansRes.data?.plans || [];
      setPlans(list);
      setSelectedPlan((prev) => prev || list[0]?.key || null);
    } catch (error) {
      showToast?.("Failed to load billing details", true);
    } finally {
      setLoading(false);
    }
  }, [adminId, app, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const upgradeNow = async () => {
    if (!selectedPlan || upgrading) return;
    setUpgrading(true);
    try {
      const token = await getAppBridgeToken(app);
      const res = await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/billing/subscribe/${adminId}`,
        { planKey: selectedPlan, immediate: true },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.confirmationUrl) {
        // Shopify approval screen → existing pricing callback activates the
        // paid subscription instantly (trial_days = 0).
        Redirect.create(app).dispatch(
          Redirect.Action.REMOTE,
          res.data.confirmationUrl,
        );
        return;
      }
      showToast?.(res.data?.message || "Could not start the upgrade", true);
      setUpgrading(false);
    } catch (error) {
      showToast?.(
        error.response?.data?.message || "Could not start the upgrade",
        true,
      );
      setUpgrading(false);
    }
  };

  const minutesLimit = status?.trialMinutesLimit ?? 40;
  const minutesUsed = status?.trialMinutesUsed ?? 0;
  const usagePercent =
    minutesLimit > 0 ? Math.min(100, (minutesUsed / minutesLimit) * 100) : 0;

  return (
    <Page
      title="Upgrade your plan"
      subtitle="Unlock full consultation minutes without waiting for your trial to end."
      backAction={{ content: "Dashboard", onAction: () => navigate("/") }}
    >
      <Layout>
        <Layout.Section>
          {loading ? (
            <LegacyCard sectioned>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "32px 0",
                }}
              >
                <Spinner accessibilityLabel="Loading billing details" size="large" />
              </div>
            </LegacyCard>
          ) : (
            <BlockStack gap="400">
              {status?.exhausted ? (
                <Banner
                  tone="warning"
                  title="Your free trial minutes have been used"
                >
                  <p>
                    You have used all {minutesLimit} free consultation minutes.
                    Upgrade now to continue instantly, or wait until your trial
                    ends.
                  </p>
                </Banner>
              ) : null}

              <LegacyCard title="Trial usage" sectioned>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">
                      Free consultation minutes
                    </Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {minutesUsed} / {minutesLimit} used
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={usagePercent}
                    tone={status?.exhausted ? "critical" : "primary"}
                    size="small"
                  />
                  <InlineStack gap="300" blockAlign="center">
                    {status?.inTrial ? (
                      <Badge tone="attention">
                        {`Trial: ${status?.trialDaysRemaining ?? 0} day${
                          (status?.trialDaysRemaining ?? 0) === 1 ? "" : "s"
                        } remaining`}
                      </Badge>
                    ) : (
                      <Badge tone="success">Paid plan active</Badge>
                    )}
                    {status?.planName ? (
                      <Badge>{`Current plan: ${status.planName}`}</Badge>
                    ) : null}
                  </InlineStack>
                </BlockStack>
              </LegacyCard>

              <LegacyCard title="Choose a plan" sectioned>
                <BlockStack gap="300">
                  {plans.map((plan) => (
                    <div
                      key={plan.key}
                      onClick={() => setSelectedPlan(plan.key)}
                      style={{
                        border:
                          selectedPlan === plan.key
                            ? "2px solid #1a1a1a"
                            : "1px solid #e3e3e3",
                        borderRadius: "12px",
                        padding: "16px",
                        cursor: "pointer",
                        background:
                          selectedPlan === plan.key ? "#f6f6f7" : "#ffffff",
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text as="p" variant="headingSm">
                            {plan.name}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {[
                              plan.totalMinutes
                                ? `${plan.totalMinutes} consultation minutes`
                                : null,
                              plan.maxConsultants
                                ? `${plan.maxConsultants} consultants`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </BlockStack>
                        <Text as="p" variant="headingMd">
                          ${plan.price}/mo
                        </Text>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </LegacyCard>

              <LegacyCard title="Why upgrade now" sectioned>
                <List type="bullet">
                  <List.Item>
                    Billing activates immediately — no waiting for the trial to
                    end.
                  </List.Item>
                  <List.Item>
                    Your paid plan starts with its FULL minutes — trial usage is
                    never deducted.
                  </List.Item>
                  <List.Item>
                    Customers can keep booking consultations without
                    interruption.
                  </List.Item>
                </List>
              </LegacyCard>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  size="large"
                  loading={upgrading}
                  disabled={!selectedPlan}
                  onClick={upgradeNow}
                >
                  Upgrade Now
                </Button>
                <Button size="large" onClick={() => navigate("/")}>
                  Continue After Trial
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default TrialUpgrade;
