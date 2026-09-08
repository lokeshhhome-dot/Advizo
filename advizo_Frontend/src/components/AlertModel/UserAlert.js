import { Button, Frame, Modal, TextContainer } from "@shopify/polaris";
import { useState, useCallback } from "react";
import { DeleteIcon } from "@shopify/polaris-icons";

export function UserAlert({
  isUserAlertVisible,
  setIsUserAlertVisible,
  handleDelete,
  consultantId,
}) {
  const handleChange = () => {
    setIsUserAlertVisible(false);
  };

  return (
    <Modal
      activator={true}
      open={isUserAlertVisible}
      onClose={handleChange}
      title="Delete Consultant"
      primaryAction={{
        variant: "primary",
        tone: "critical",
        icon: DeleteIcon,
        content: "Delete ",
        onAction: () => handleDelete(consultantId),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: handleChange,
        },
      ]}
    >
      <Modal.Section>
        <TextContainer>
          <p>Are you sure you want to delete this consultant?</p>
        </TextContainer>
      </Modal.Section>
    </Modal>
  );
}
