import React, { useState } from "react";
import { Modal, Text, BlockStack } from "@shopify/polaris";
import { useDispatch } from "react-redux";
import { useAppBridge } from "../createContext/AppBridgeContext";
import { completeWelcome } from "../Redux/slices/adminSlice";

export default function WelcomeModal({
  open,
  onClose,
  adminIdLocal,
  shopOwnerName,
  shopName,
}) {
  const dispatch = useDispatch();
  const app = useAppBridge();
  const [loading, setLoading] = useState(false);

  const trimmedOwnerName = shopOwnerName?.trim();
  const trimmedShopName = shopName?.trim();
  const modalTitle = trimmedOwnerName
    ? `🎉 Welcome ${trimmedOwnerName}!`
    : `Welcome to ${trimmedShopName || "Consultly"}`;

  const handleStartSetup = async () => {
    if (!adminIdLocal) return;

    setLoading(true);
    try {
      await dispatch(completeWelcome({ adminIdLocal, app })).unwrap();
      onClose?.();
    } catch (error) {
      console.error("Failed to complete welcome flow:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      primaryAction={{
        content: "Start Setup",
        onAction: handleStartSetup,
        loading,
      }}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">
            Welcome to Consultly.
          </Text>
          <Text as="p">
            Thanks for installing Consultly.
          </Text>
          <Text as="p">
            Let&apos;s set up your consultation business in just a few minutes.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
