import React, { useEffect, useRef } from "react";
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
 *
 * This component (and the whole React app) runs INSIDE the App Proxy
 * iframe, so CSS here can never visually cover the parent Shopify page's
 * Header/Footer — that lives in a different document. Instead, tell the
 * PARENT document (the backend-composed HTML in proxyThemeAssetsController
 * / helperTheme.js's renderShopifyPage) to resize the <iframe> ELEMENT
 * itself to fullscreen via postMessage — see those files for the listener
 * that actually applies the styles. This component only sends the signal.
 */
const ConsultantChatModal = ({ show, onClose, consultant, shop }) => {
  // Tracks whether WE already told the parent the modal is open, so
  // re-renders while show stays true (or rapid toggles) don't post
  // duplicate OPEN/CLOSE messages. Must run before the early return below
  // (Rules of Hooks) — CLOSE has to fire even on the render where the
  // component is about to return null.
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (show && !wasOpenRef.current) {
      wasOpenRef.current = true;
      window.parent.postMessage({ type: "CONSULTLY_CHAT_OPEN" }, "*");
    } else if (!show && wasOpenRef.current) {
      wasOpenRef.current = false;
      window.parent.postMessage({ type: "CONSULTLY_CHAT_CLOSE" }, "*");
    }
  }, [show]);

  // Belt-and-suspenders: also fire CLOSE if this instance unmounts while
  // still marked open (e.g. the host page navigates away mid-chat).
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        window.parent.postMessage({ type: "CONSULTLY_CHAT_CLOSE" }, "*");
      }
    };
  }, []);

  if (!show || !consultant) return null;

  // TEMPORARY debug — remove once the redirect-on-click report is resolved.
  console.log("[CHAT TEST] MODAL MOUNTED");
  console.log("[CHAT TEST] CONSULTANT CHAT MODAL MOUNTED");

  const consultantId = consultant.id || consultant._id;

  return (
    <PortalModal>
      <Modal
        show={show}
        onHide={onClose}
        centered
        className={styles.chatModalRoot}
        backdropClassName={styles.chatModalBackdrop}
        dialogClassName={styles.chatModalDialog}
        contentClassName={styles.chatModalContent}
      >
        <UserChat consultantId={consultantId} shop={shop} onClose={onClose} />
      </Modal>
    </PortalModal>
  );
};

export default ConsultantChatModal;
