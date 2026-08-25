import React, { useState } from "react";
import {
  Modal,
  Text,
  ProgressBar,
  BlockStack,
  Box,
  Checkbox,
} from "@shopify/polaris";
import axios from "axios";
import { useAppBridge } from "../createContext/AppBridgeContext";
import { getAppBridgeToken } from "../../utils/getAppBridgeToken";

const STEPS = [
  {
    title: "Activate Your App",
    description:
      "Go to Dashboard and enable App Status to start using the system.",
    image:
      "https://via.placeholder.com/800x400?text=App+Status+Toggle+Button",
  },
  {
    title: "Setup Storefront",
    description:
      "Go to Shopify Admin → Content → Menus and add links like Consult Now, Login, Profile.",
    image:
      "https://chatgpt.com/backend-api/estuary/content?id=file_0000000025b8720886ebc90c3636cfd2&ts=493377&p=fs&cid=1&sig=33624fa1311353cfc4e06f90f1dc245b0a44e7b7557c565a88feafe1ea694b8f&v=0",
    optional: true,
  },
  {
    title: "Add Your First Consultant",
    description:
      "Go to Consultants and click 'Add Consultant'.",
    image:
      "https://via.placeholder.com/800x400?text=Add+Consultant+Form+Screen",
  },
];

const SetupGuideModal = ({ open, onClose }) => {
  const [step, setStep] = useState(0);
  const [skipStorefront, setSkipStorefront] = useState(false);
  const app = useAppBridge();

  if (!open) return null;

  // remove storefront step if skipped
  const filteredSteps = skipStorefront
    ? STEPS.filter((s) => s.title !== "Setup Storefront")
    : STEPS;

  const current = filteredSteps[step];

  const handleNext = () => {
    if (step < filteredSteps.length - 1) {
      setStep((prev) => prev + 1);
    } else {
      localStorage.setItem("setup_guide_done", "true");
      onClose();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((prev) => prev - 1);
  };

  const closedSetupGuide = async () => {
    try {
      const token = await getAppBridgeToken(app);
      const adminId = localStorage.getItem("consultly");

      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/close-setup-guide/${adminId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log("Setup guide closed:", response.data);
    } catch (error) {
      console.error("Error closing setup guide:", error);
    }
  };
  const handleClose = () => {
    onClose(); 
    closedSetupGuide(); 
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Quick Setup Guide"
      primaryAction={{
        content: step === filteredSteps.length - 1 ? "Finish" : "Next",
        onAction: handleNext,
      }}
      secondaryActions={
        step > 0
          ? [
            {
              content: "Back",
              onAction: handleBack,
            },
          ]
          : []
      }
    >
      <Modal.Section>
        <BlockStack gap="400">

          {/* Progress */}
          <ProgressBar
            progress={((step + 1) / filteredSteps.length) * 100}
          />

          <Text variant="bodySm" tone="subdued">
            Step {step + 1} of {filteredSteps.length}
          </Text>

          {/* Title + Description */}
          <BlockStack gap="200">
            <Text variant="headingMd">{current.title}</Text>
            <Text variant="bodyMd">{current.description}</Text>
          </BlockStack>

          {/* Screenshot */}
          {current.image && (
            <Box
              padding="200"
              borderWidth="025"
              borderRadius="200"
              background="bg-surface-secondary"
            >
              <img
                src={current.image}
                alt={current.title}
                style={{
                  width: "100%",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                onClick={() => window.open(current.image, "_blank")}
              />
            </Box>
          )}

          {/* Skip Option */}
          {current.optional && (
            <Checkbox
              label="Skip this step (I'll do it later)"
              checked={skipStorefront}
              onChange={(value) => setSkipStorefront(value)}
            />
          )}

        </BlockStack>
      </Modal.Section>
    </Modal>
  );
};

export default SetupGuideModal;