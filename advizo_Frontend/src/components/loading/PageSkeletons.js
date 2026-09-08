import {
  BlockStack,
  Box,
  Card,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
} from "@shopify/polaris";

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

// Shared centered full-viewport Polaris spinner — the ONE loading visual
// across every admin surface (RouteLoadingFallback, ProtectAdminRoute,
// SetupGuideProtectRoutes, BillingProtectedRoute, Dashboard, ConsultantList,
// ConsultantSupportInbox) so navigating between admin pages, or a hard
// refresh, always shows the same spinner instead of a skeleton. Not used by
// any storefront surface — those keep their own existing skeletons/spinners
// (StorefrontSkeleton, ChatOpeningSpinner) unchanged.
export function FullPageSpinner({ label = "Loading" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
      }}
    >
      <Spinner accessibilityLabel={label} size="large" />
    </div>
  );
}

// A skeleton implies "here's roughly what content will look like" — wrong
// for the chat opening moment, where the next screen (a request/accept
// state, or an active conversation) has no fixed shape to preview. A single
// centered spinner reads as "connecting", not "loading this specific
// layout", which is the more honest signal here. Used only by the /chats
// route via ProtectStoreFront's loadingVariant="spinner" — every other
// ProtectStoreFront-wrapped page keeps the default StorefrontSkeleton.
export function ChatOpeningSpinner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
      }}
    >
      <Spinner accessibilityLabel="Loading chat" size="large" />
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

// The ONE global "the whole app is booting" gate — App.js's single root
// Suspense boundary wraps its entire <Routes> tree (every surface: admin,
// consultant dashboard, storefront, login, chat, calls) in this fallback,
// so it's the true full-app/full-page initial load, not a section or
// route-specific skeleton. A skeleton here previews a page shape that
// doesn't exist yet (the route hasn't even been matched), so a spinner is
// the honest signal — "the app is starting," not "here's a preview of the
// page you're about to see." Storefront/ConsultantDashboard pages keep their
// own skeletons (StorefrontSkeleton, ConsultantDashboardSkeleton) since those
// preview a real, known page shape while their own data loads.
//
// On an Admin hard refresh, this fallback resolving is NOT the end of the
// loading sequence — ProtectAdminRoute's install check, SetupGuideProtectRoutes'
// setup-guide check, and BillingProtectedRoute's billing check all still have
// to resolve afterward, INSIDE the route tree this Suspense already handed
// control to. All three, plus every individual admin page's own data fetch
// (Dashboard, ConsultantList, ConsultantSupportInbox), render FullPageSpinner
// too, so the whole admin loading sequence — hard refresh or in-app
// navigation — is one continuous spinner rather than a skeleton flash.
export function RouteLoadingFallback() {
  return <FullPageSpinner label="Loading Advizo" />;
}
