import {
  Text,
  InlineStack,
  Box,
  Card,
  Button,
  Badge,
  BlockStack,
  useBreakpoints,
} from "@shopify/polaris";
import {
  TrendUpMinor,
  CustomersMajor,
  MoneyDollarMinor,
} from "@shopify/polaris-icons";

export function AppStatus({
  enabled,
  handleToggle,
  adminDetailsLoading,
  appStatus,
}) {
  const contentStatus = enabled ? "Deactivate App" : "Activate App";
  const toggleId = "app-status-toggle-uuid";
  const descriptionId = "app-status-description-uuid";

  const { mdDown } = useBreakpoints();
  const badgeStatus = enabled ? "success" : "secondary";
  const badgeContent = enabled ? "Active" : "Deactivated";

  const title = "App Status";
  const description =
    "Control whether your app is active and functioning. When disabled, the app will not process any requests or perform its intended functions.";

  const settingStatusMarkup = (
    <Badge
      tone={badgeStatus}
      toneAndProgressLabelOverride={`App is ${badgeContent}`}
    >
      {badgeContent}
    </Badge>
  );

  const settingTitle = title ? (
    <InlineStack gap="200" wrap={false}>
      <InlineStack gap="200" align="start" blockAlign="baseline">
        <label htmlFor={toggleId}>
          <Text variant="headingMd" as="h6">
            {title}
          </Text>
        </label>
        <InlineStack gap="200" align="center" blockAlign="center">
          {settingStatusMarkup}
          {/* {helpLink} */}
        </InlineStack>
      </InlineStack>
    </InlineStack>
  ) : null;

  const actionMarkup = (
    <Button
      role="switch"
      id={toggleId}
      ariaChecked={enabled ? "true" : "false"}
      onClick={handleToggle}
      size="slim"
      loading={adminDetailsLoading}
      disabled={adminDetailsLoading}
    >
      {contentStatus}
    </Button>
  );

  const headerMarkup = (
    <Box width="100%">
      <InlineStack
        gap="1200"
        align="space-between"
        blockAlign="start"
        wrap={false}
      >
        {settingTitle}
        {!mdDown ? (
          <Box minWidth="fit-content">
            <InlineStack align="end">{actionMarkup}</InlineStack>
          </Box>
        ) : null}
      </InlineStack>
    </Box>
  );

  const descriptionMarkup = (
    <BlockStack gap="400">
      <Text id={descriptionId} variant="bodyMd" as="p" tone="subdued">
        {description}
      </Text>
      {mdDown ? (
        <Box width="100%">
          <InlineStack align="start">{actionMarkup}</InlineStack>
        </Box>
      ) : null}
    </BlockStack>
  );

  return (
    <Card>
      <BlockStack gap={{ xs: "200", sm: "300" }}>
        <Box width="100%">
          <BlockStack gap={{ xs: "100", sm: "200" }}>
            {headerMarkup}
            {descriptionMarkup}
          </BlockStack>
        </Box>
        <Text variant="bodyMd" as="p">
          {enabled
            ? "Your app is currently active and processing requests."
            : "Your app is currently disabled and not processing any requests."}
        </Text>
      </BlockStack>
    </Card>
  );
}
