import React from "react";
import { Modal } from "react-bootstrap";
import PortalModal from "../middle-ware/PortalModal";
import UserChat from "../ClientDashbord/UserChat";
import styles from "./ConsultantChatModal.module.css";

/**
 * Reusable Chat modal shared by ConsultantCards (Home) and ViewProfile —
 * both render THIS component rather than each embedding UserChat directly,
 * so there's exactly one modal implementation to maintain.
 *
 * Wraps the existing UserChat component as-is (no second chat UI): react-
 * bootstrap's Modal already provides the overlay/backdrop, click-outside-
 * to-close, and Escape-key handling used elsewhere in this app
 * (ConsultantProfileModal), so none of that is reimplemented here.
 */
const ConsultantChatModal = ({ show, onClose, consultant, shop }) => {
  if (!show || !consultant) return null;

  const consultantId = consultant.id || consultant._id;

  return (
    <PortalModal>
      <Modal
        show={show}
        onHide={onClose}
        centered
        dialogClassName={styles.chatModalDialog}
        contentClassName={styles.chatModalContent}
      >
        <UserChat consultantId={consultantId} shop={shop} onClose={onClose} />
      </Modal>
    </PortalModal>
  );
};

export default ConsultantChatModal;
