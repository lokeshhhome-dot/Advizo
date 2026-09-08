import React, { useCallback, useEffect, useState } from "react";
import { HiOutlineLifebuoy, HiOutlineXMark } from "react-icons/hi2";
import PageHeader from "./common/PageHeader";
import RecordList, { RecordRow } from "./common/RecordList";
import StatusPill from "./common/StatusPill";
import ConsultantSupportModal from "./ConsultantSupportModal";
import PortalModal from "../middle-ware/PortalModal";
import axios from "axios";
import { getConsultantToken } from "../../utils/consultantAuth";
import { isDummyConsultant } from "../../utils/isDummyConsultant";
import { useSelector } from "react-redux";
import styles from "./ConsultantSupportPage.module.css";

const statusTone = (status) => {
  if (status === "replied") return "success";
  if (status === "closed") return "neutral";
  return "warning";
};

export default function ConsultantSupportPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const { consultantOverview } = useSelector((state) => state.consultants);
  const consultant = consultantOverview?.consultant;
  const shopId =
    localStorage.getItem("shop_o_Identity") || localStorage.getItem("shop_o_Identity__");
  const isDummyAccount = isDummyConsultant(consultant);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getConsultantToken();
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/support-requests`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRequests(response.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load your support requests.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (selectedRequest) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedRequest]);

  const openRequest = async (request) => {
    setSelectedRequest(request);
    if (!request.consultantHasUnreadReply) return;
    try {
      const token = getConsultantToken();
      await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/support-requests/${request._id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRequests((prev) =>
        prev.map((item) =>
          item._id === request._id ? { ...item, consultantHasUnreadReply: false } : item,
        ),
      );
    } catch (_) {
      // Non-blocking
    }
  };

  return (
    <div>
      <PageHeader
        title="Support"
        description="Send queries to your shop admin and read replies here."
        actions={
          <button type="button" className={styles.newRequestBtn} onClick={() => setShowNewModal(true)}>
            New support request
          </button>
        }
      />

      {isDummyAccount ? (
        <div className={styles.infoBanner}>
          Demo consultant account: use support requests to reach the shop admin for activation or setup help.
        </div>
      ) : null}

      <RecordList
        items={requests}
        loading={loading}
        error={error}
        onRetry={fetchRequests}
        emptyIcon={<HiOutlineLifebuoy />}
        emptyTitle="No support requests yet"
        emptyText="Create your first support request and the shop admin will reply here."
        renderItem={(request) => (
          <button type="button" className={styles.rowButton} onClick={() => openRequest(request)}>
            <RecordRow
              title={request.subject}
              subtitle={request.message}
              trailing={
                <>
                  {request.consultantHasUnreadReply ? <StatusPill tone="danger">New reply</StatusPill> : null}
                  <StatusPill tone={statusTone(request.status)}>{request.status}</StatusPill>
                </>
              }
            />
          </button>
        )}
      />

      <ConsultantSupportModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        consultant={consultant}
        shopId={shopId}
        isDummyAccount={isDummyAccount}
        onSubmitted={fetchRequests}
      />

      {selectedRequest ? (
        <PortalModal>
          <div className={styles.detailOverlay} onClick={() => setSelectedRequest(null)}>
            <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{selectedRequest.subject}</h2>
                <button
                  type="button"
                  className={styles.detailClose}
                  onClick={() => setSelectedRequest(null)}
                  aria-label="Close"
                >
                  <HiOutlineXMark />
                </button>
              </div>

              <div className={styles.detailBody}>
                <h3 className={styles.detailSubhead}>Your message</h3>
                <div className={styles.messageBox}>{selectedRequest.message}</div>

                {selectedRequest.replies?.length ? (
                  <>
                    <h3 className={styles.detailSubhead}>Admin replies</h3>
                    {selectedRequest.replies.map((reply, index) => (
                      <div className={styles.replyBox} key={`${reply.repliedAt}-${index}`}>
                        <div className={styles.replyMeta}>
                          Admin · {reply.repliedAt ? new Date(reply.repliedAt).toLocaleString() : ""}
                        </div>
                        <div className={styles.replyText}>{reply.message}</div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className={styles.waitingBanner}>Waiting for admin reply. Check back here later.</div>
                )}
              </div>
            </div>
          </div>
        </PortalModal>
      ) : null}
    </div>
  );
}
