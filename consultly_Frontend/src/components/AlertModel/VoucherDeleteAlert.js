import { Modal, TextContainer } from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";

export function VoucherDeleteAlert({ isUserAlertVisible, setIsUserAlertVisible, handleDelete, voucherId, adminIdLocal, loading }) {

    const handleClose = () => {
        setIsUserAlertVisible(false);
    };

    const handleConfirmDelete = () => {
        handleDelete(voucherId);
        handleClose();
    };

    return (
        <Modal
            open={isUserAlertVisible}
            onClose={handleClose}
            title="Delete Voucher"
            primaryAction={{
                variant: "primary",
                icon: DeleteIcon,
                tone: "critical",
                content: "Delete",
                loading: loading,
                onAction: handleConfirmDelete,
            }}
            secondaryActions={[
                {
                    variant: "tertiary",
                    // icon: CrossIcon,
                    content: "Cancel",
                    onAction: handleClose,
                },
            ]}
        >
            <Modal.Section>
                <TextContainer>
                    <p>Are you sure you want to delete this voucher?</p>
                </TextContainer>
            </Modal.Section>
        </Modal>
    );
}
