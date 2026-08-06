import { Modal, TextContainer } from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";

export function WidthrawalReqDeclineAlert({
  isWidthrawalReqDeclineAlertVisible = true,
  setIsWidthrawalReqDeclineAlertVisible,
  handleDecline,
  withdrawalRequestId,
}) {
  const handleChange = () => {
    setIsWidthrawalReqDeclineAlertVisible(false);
  };

  return (
    <Modal
      activator={true}
      open={isWidthrawalReqDeclineAlertVisible}
      onClose={handleChange}
      title="Decline Withdrawal Request"
      primaryAction={{
        icon: DeleteIcon,
        variant: "primary",
        tone: "critical",
        content: "Decline",
        onAction: () => handleDecline(withdrawalRequestId),
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
          <p>Are you sure you want to decline this withdrawal request?</p>
        </TextContainer>
      </Modal.Section>
    </Modal>
  );
}
