import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import axios from "axios";
import styles from "./UserSupport.module.css";

const statusClass = (status) => {
  if (status === "replied") return styles.badgeSuccess;
  if (status === "closed") return styles.badgeMuted;
  return styles.badgeAttention;
};

const UserSupport = () => {
  const { userId } = useOutletContext() || {};
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);

  const shopId = localStorage.getItem("shop_o_Identity");

  const fetchRequests = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      setError("Please refresh the page to load your support requests.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/support-requests`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRequests(response.data?.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load your support requests.",
      );
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setFormError("Subject and message are required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    setFormSuccess("");
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/support-request`,
        {
          subject: subject.trim(),
          message: message.trim(),
          shopId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setFormSuccess(
        response.data?.message || "Your query has been sent to the store.",
      );
      setSubject("");
      setMessage("");
      fetchRequests();
    } catch (err) {
      setFormError(
        err.response?.data?.message ||
          "Unable to send your query. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openRequest = async (request) => {
    setSelectedRequest(request);
    if (!request.consultantHasUnreadReply) return;
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/support-requests/${request._id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRequests((prev) =>
        prev.map((item) =>
          item._id === request._id
            ? { ...item, consultantHasUnreadReply: false }
            : item,
        ),
      );
    } catch (_) {
      // Non-blocking
    }
  };

  return (
    <div className={styles.supportWrap}>
      <div className={styles.supportHead}>
        <div>
          <h2 className={styles.supportTitle}>Support</h2>
          <p className={styles.supportSubtitle}>
            Send a query to the store and read replies here.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setShowForm((prev) => !prev);
            setFormError("");
            setFormSuccess("");
          }}
        >
          {showForm ? "Close" : "New query"}
        </button>
      </div>

      {showForm ? (
        <form className={styles.formCard} onSubmit={handleSubmit}>
          {formError ? <div className={styles.alertError}>{formError}</div> : null}
          {formSuccess ? (
            <div className={styles.alertSuccess}>{formSuccess}</div>
          ) : null}
          <label className={styles.fieldLabel} htmlFor="us-subject">
            Subject
          </label>
          <input
            id="us-subject"
            className={styles.fieldInput}
            type="text"
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What is your query about?"
          />
          <label className={styles.fieldLabel} htmlFor="us-message">
            Message
          </label>
          <textarea
            id="us-message"
            className={styles.fieldInput}
            rows={4}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what you need help with..."
          />
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Send to store"}
          </button>
        </form>
      ) : null}

      {loading ? (
        <div className={styles.emptyState}>Loading your requests...</div>
      ) : error ? (
        <div className={styles.alertError}>{error}</div>
      ) : requests.length === 0 ? (
        <div className={styles.emptyState}>
          No queries yet. Use "New query" to contact the store.
        </div>
      ) : (
        <div className={styles.requestList}>
          {requests.map((request) => (
            <button
              key={request._id}
              type="button"
              className={styles.requestCard}
              onClick={() => openRequest(request)}
            >
              <div className={styles.requestTop}>
                <span className={styles.requestSubject}>{request.subject}</span>
                <span className={styles.requestBadges}>
                  {request.consultantHasUnreadReply ? (
                    <span className={styles.badgeAttention}>New reply</span>
                  ) : null}
                  <span className={statusClass(request.status)}>
                    {request.status}
                  </span>
                </span>
              </div>
              <p className={styles.requestMessage}>{request.message}</p>
              <span className={styles.requestDate}>
                {request.createdAt
                  ? new Date(request.createdAt).toLocaleString()
                  : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedRequest ? (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>{selectedRequest.subject}</h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedRequest(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalSectionLabel}>Your message</div>
            <div className={styles.messageBubble}>{selectedRequest.message}</div>

            {selectedRequest.replies?.length ? (
              <>
                <div className={styles.modalSectionLabel}>Store replies</div>
                {selectedRequest.replies.map((reply, index) => (
                  <div
                    key={`${reply.repliedAt}-${index}`}
                    className={styles.replyBubble}
                  >
                    <span className={styles.replyMeta}>
                      Store •{" "}
                      {reply.repliedAt
                        ? new Date(reply.repliedAt).toLocaleString()
                        : ""}
                    </span>
                    <p className={styles.replyText}>{reply.message}</p>
                  </div>
                ))}
              </>
            ) : (
              <div className={styles.emptyState}>
                Waiting for the store to reply. Check back here later.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default UserSupport;
