import React, { useState } from "react";
import axios from "axios";
import PortalModal from "../middle-ware/PortalModal";
import { getConsultantToken } from "../../utils/consultantAuth";
import styles from "./ConsultantSupportModal.module.css";

export default function ConsultantSupportModal({
  open,
  onClose,
  consultant,
  shopId,
  isDummyAccount = false,
  onSubmitted,
}) {
  const [subject, setSubject] = useState(
    isDummyAccount ? "Dummy consultant support request" : "",
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      setError("Subject and message are required.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = getConsultantToken();
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/support-request`,
        { subject: subject.trim(), message: message.trim(), shopId, isDummyAccount },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setSuccess(response.data?.message || "Support request sent to admin.");
      setSubject(isDummyAccount ? "Dummy consultant support request" : "");
      setMessage("");
      onSubmitted?.();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to send support request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError("");
    setSuccess("");
    onClose();
  };

  if (!open) return null;

  return (
    <PortalModal>
      <div className={styles.overlay} onClick={handleClose}>
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <h2 className={styles.title}>Contact shop admin</h2>
            <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className={styles.body}>
            {isDummyAccount ? (
              <div className={styles.infoBanner}>
                You are on a demo consultant account. Use this form to reach the shop admin for setup help or
                account activation.
              </div>
            ) : null}
            {error ? <div className={styles.errorBanner}>{error}</div> : null}
            {success ? <div className={styles.successBanner}>{success}</div> : null}

            <div className={styles.field}>
              <label className={styles.label}>Your name</label>
              <input className={styles.input} value={consultant?.fullname || ""} disabled />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Your email</label>
              <input className={styles.input} value={consultant?.email || ""} disabled />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="support-subject">Subject</label>
              <input
                id="support-subject"
                className={styles.input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="support-message">Message</label>
              <textarea
                id="support-message"
                className={`${styles.input} ${styles.textarea}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Describe what you need help with..."
              />
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={loading || Boolean(success)}
            >
              {loading ? "Sending…" : "Send to admin"}
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}
