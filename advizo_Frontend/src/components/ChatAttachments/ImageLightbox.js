import React from "react";
import { Modal } from "react-bootstrap";
import PortalModal from "../middle-ware/PortalModal";
import styles from "./chatAttachments.module.css";

/**
 * Shared image viewer/lightbox for both chats — same PortalModal +
 * react-bootstrap Modal recipe already established by RatingModal.js /
 * ConsultantChatModal.js. react-bootstrap's Modal already closes on Escape
 * and on a backdrop click via onHide, so no extra key handling is needed.
 */
const ImageLightbox = ({ url, name, onClose, onDownload }) => {
  if (!url) return null;

  return (
    <PortalModal>
      <Modal
        show={Boolean(url)}
        onHide={onClose}
        centered
        size="xl"
        backdropClassName={styles.lightboxBackdrop}
        dialogClassName={styles.lightboxDialog}
        contentClassName={styles.lightboxContent}
      >
        <button
          type="button"
          className={styles.lightboxClose}
          onClick={onClose}
          aria-label="Close image viewer"
        >
          ×
        </button>
        <img src={url} alt={name || "Attachment"} className={styles.lightboxImage} />
        {onDownload && (
          <button type="button" className={styles.lightboxDownload} onClick={onDownload}>
            Download
          </button>
        )}
      </Modal>
    </PortalModal>
  );
};

export default ImageLightbox;
