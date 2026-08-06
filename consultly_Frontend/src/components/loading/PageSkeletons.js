import {
  BlockStack,
  Box,
  Card,
  Layout,
  Page,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonPage,
  SkeletonTabs,
} from "@shopify/polaris";

export function AdminPageSkeleton({ title = true }) {
  return (
    <SkeletonPage primaryAction>
      {title && <SkeletonDisplayText size="large" />}
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={6} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <SkeletonDisplayText size="large" />
      <Box paddingBlockStart="400">
        <Layout>
          <Layout.Section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <Box padding="400">
                    <SkeletonDisplayText size="small" />
                    <Box paddingBlockStart="200">
                      <SkeletonBodyText lines={1} />
                    </Box>
                  </Box>
                </Card>
              ))}
            </div>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={8} />
            </Card>
          </Layout.Section>
        </Layout>
      </Box>
    </SkeletonPage>
  );
}

export function TablePageSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <SkeletonDisplayText size="large" />
      <Box paddingBlockStart="400">
        <Card>
          <SkeletonTabs count={3} />
          <Box padding="400">
            <SkeletonBodyText lines={10} />
          </Box>
        </Card>
      </Box>
    </SkeletonPage>
  );
}

export function StorefrontSkeleton() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <BlockStack gap="400">
        <SkeletonDisplayText size="large" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <Box padding="400">
                <SkeletonDisplayText size="small" />
                <Box paddingBlockStart="300">
                  <SkeletonBodyText lines={3} />
                </Box>
              </Box>
            </Card>
          ))}
        </div>
      </BlockStack>
    </div>
  );
}

export function ConsultantDashboardSkeleton() {
  return (
    <div style={{ display: "flex", minHeight: "60vh" }}>
      <div
        style={{
          width: 240,
          padding: 16,
          borderRight: "1px solid #e1e3e5",
          flexShrink: 0,
        }}
      >
        <SkeletonDisplayText size="small" />
        <Box paddingBlockStart="400">
          <SkeletonBodyText lines={6} />
        </Box>
      </div>
      <div style={{ flex: 1, padding: 24 }}>
        <SkeletonDisplayText size="large" />
        <Box paddingBlockStart="400">
          <SkeletonBodyText lines={8} />
        </Box>
      </div>
    </div>
  );
}

export function RouteLoadingFallback() {
  return (
    <div className="route-loading-shell">
      <AdminPageSkeleton />
    </div>
  );
}
