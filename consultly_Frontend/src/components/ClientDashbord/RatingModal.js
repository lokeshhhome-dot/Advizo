import React, { useState } from "react";
import { Modal } from "react-bootstrap";
import axios from "axios";
import PortalModal from "../middle-ware/PortalModal";
import { getProfileImageUrl, handleProfileImageError } from "../../utils/getProfileImageUrl";
import styles from "./RatingModal.module.css";

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

const CONSULTATION_TYPE_COPY = {
  chat: "chat",
  voice: "call",
  video: "video consultation",
};

const STAR_FILLED = (
  <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
    <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.6z" />
  </svg>
);

/**
 * Shared, self-contained Advizo rating modal — used after a completed Chat
 * (UserChat.js) and after a completed Audio/Video call (VideoCallingPage.js)
 * so there is exactly one rating UI/submission implementation, not one per
 * consultation type.
 *
 * `consultationId` is the TransactionHistroy _id the parent already has for
 * the just-ended session — the backend derives customer/consultant identity
 * from that record itself (POST /ratings), never trusting anything else this
 * component could send. Submitting or skipping both call onClose(rated) —
 * the parent owns what happens next (closing the page/window), this
 * component only owns the rating UI itself.
 */
const RatingModal = ({ show, consultationId, consultantName, consultantAvatar, consultationType, onClose }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  if (!show) return null;

  const displayRating = hoverRating || rating;
  const typeCopy = CONSULTATION_TYPE_COPY[consultationType] || "consultation";
  const avatarSrc = getProfileImageUrl(consultantAvatar);

  const handleSkip = () => {
    if (submitting) return;
    onClose(false);
  };

  const handleSubmit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/ratings`,
        { consultationId, rating, feedback: feedback.trim() },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(() => onClose(true), 900);
    } catch (err) {
      setSubmitting(false);
      // Already-rated (409) is not really an error the user needs to retry —
      // treat it the same as a successful close instead of showing a scary
      // inline error for something that already happened.
      if (err?.response?.status === 409) {
        onClose(true);
        return;
      }
      setError(
        err?.response?.data?.message || "Couldn't submit your rating. Please try again.",
      );
    }
  };

  return (
    <PortalModal>
      <Modal
        show={show}
        onHide={handleSkip}
        centered
        className={styles.ratingModalRoot}
        backdropClassName={styles.ratingModalBackdrop}
        dialogClassName={styles.ratingModalDialog}
        contentClassName={styles.ratingModalContent}
      >
        <div className={styles.panel}>
          {submitted ? (
            <div className={styles.successState}>
              <div className={styles.successIcon} aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <p className={styles.successText}>Thanks for your feedback!</p>
            </div>
          ) : (
            <>
              <h2 className={styles.title}>How was your {typeCopy}?</h2>

              <div className={styles.consultantRow}>
                <img
                  src={avatarSrc}
                  alt={consultantName || "Consultant"}
                  className={styles.avatar}
                  onError={handleProfileImageError}
                />
                <span className={styles.consultantName}>{consultantName || "Consultant"}</span>
              </div>

              <div className={styles.starRow} role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} star${star > 1 ? "s" : ""} — ${RATING_LABELS[star]}`}
                    className={`${styles.star} ${star <= displayRating ? styles.starActive : ""}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                  >
                    {STAR_FILLED}
                  </button>
                ))}
              </div>

              <p className={styles.ratingLabel} aria-live="polite">
                {displayRating ? `${displayRating} — ${RATING_LABELS[displayRating]}` : "Tap a star to rate"}
              </p>

              <label className={styles.feedbackLabel} htmlFor="rating-modal-feedback">
                Tell us more (optional)
              </label>
              <textarea
                id="rating-modal-feedback"
                className={styles.feedbackInput}
                rows={3}
                maxLength={2000}
                placeholder="What went well? What could be better?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={submitting}
              />

              {error && <div className={styles.errorText}>{error}</div>}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.skipBtn}
                  onClick={handleSkip}
                  disabled={submitting}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={!rating || submitting}
                >
                  {submitting ? "Submitting…" : "Submit Rating"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </PortalModal>
  );
};

export default RatingModal;
