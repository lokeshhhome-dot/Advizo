import React from "react";
import {
  Banner,
  SkeletonBodyText,
  EmptyState,
  BlockStack,
  Text,
} from "@shopify/polaris";
import styles from "./ConsultantPageLayout.module.css";

export default function ConsultantPageLayout({
  title,
  subtitle,
  children,
  loading = false,
  error = null,
  isEmpty = false,
  emptyHeading = "No data yet",
  emptyDescription = "There is nothing to show here right now.",
  emptyAction,
  primaryAction,
  secondaryActions,
  flush = true,
}) {
  if (loading) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
        </div>
        <div className={styles.loadingCard}>
          <BlockStack gap="300">
            <SkeletonBodyText lines={2} />
            <SkeletonBodyText lines={6} />
          </BlockStack>
        </div>
      </div>
    );
  }

  const actionButtons = [primaryAction, ...(secondaryActions || [])].filter(
    Boolean,
  );

  return (
    <div className={styles.pageShell}>
      <div className={styles.pageHeader}>
        <div className={styles.headerActions}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
          </div>
          {actionButtons.length ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {actionButtons.map((action, index) => (
                <button
                  key={`${action.content}-${index}`}
                  type="button"
                  onClick={action.onAction}
                  disabled={action.disabled}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "10px",
                    border:
                      index === 0
                        ? "1px solid var(--ds-brand)"
                        : "1px solid var(--ds-border-strong)",
                    background:
                      index === 0 ? "var(--ds-brand)" : "var(--ds-surface)",
                    color: index === 0 ? "#ffffff" : "var(--ds-text)",
                    fontWeight: 650,
                    fontSize: "13px",
                    cursor: action.disabled ? "not-allowed" : "pointer",
                    opacity: action.disabled ? 0.6 : 1,
                  }}
                >
                  {action.content}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" title="Something went wrong">
            <p>{error}</p>
          </Banner>
        ) : null}

        {isEmpty ? (
          <div className={`${styles.pageBody} ${styles.pageBodyPadded}`}>
            <EmptyState
              heading={emptyHeading}
              action={emptyAction}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p" variant="bodyMd" tone="subdued">
                {emptyDescription}
              </Text>
            </EmptyState>
          </div>
        ) : (
          <div
            className={`${styles.pageBody} ${
              flush ? styles.pageBodyFlush : styles.pageBodyPadded
            }`}
          >
            {children}
          </div>
        )}
      </BlockStack>
    </div>
  );
}
