import React, { useState } from "react";
import { Modal, TextField, FormLayout, Banner } from "@shopify/polaris";
import axios from "axios";
import { getConsultantToken } from "../../utils/consultantAuth";

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
        {
          subject: subject.trim(),
          message: message.trim(),
          shopId,
          isDummyAccount,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setSuccess(response.data?.message || "Support request sent to admin.");
      setSubject(isDummyAccount ? "Dummy consultant support request" : "");
      setMessage("");
      onSubmitted?.();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to send support request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError("");
    setSuccess("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Contact shop admin"
      primaryAction={{
        content: loading ? "Sending..." : "Send to admin",
        onAction: handleSubmit,
        loading,
        disabled: loading || Boolean(success),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: handleClose,
          disabled: loading,
        },
      ]}
    >
      <Modal.Section>
        <FormLayout>
          {isDummyAccount ? (
            <Banner tone="info">
              <p>
                You are on a demo consultant account. Use this form to reach the
                shop admin for setup help or account activation.
              </p>
            </Banner>
          ) : null}

          {error ? (
            <Banner tone="critical">
              <p>{error}</p>
            </Banner>
          ) : null}

          {success ? (
            <Banner tone="success">
              <p>{success}</p>
            </Banner>
          ) : null}

          <TextField
            label="Your name"
            value={consultant?.fullname || ""}
            disabled
            autoComplete="name"
          />
          <TextField
            label="Your email"
            value={consultant?.email || ""}
            disabled
            autoComplete="email"
          />
          <TextField
            label="Subject"
            value={subject}
            onChange={setSubject}
            autoComplete="off"
          />
          <TextField
            label="Message"
            value={message}
            onChange={setMessage}
            multiline={4}
            autoComplete="off"
            placeholder="Describe what you need help with..."
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}
