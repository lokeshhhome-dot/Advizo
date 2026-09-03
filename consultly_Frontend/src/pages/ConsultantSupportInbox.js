import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Page,
  Modal,
  TextField,
  BlockStack,
  Banner,
  Text,
} from "@shopify/polaris";
import axios from "axios";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import { ToastContext } from "../components/AlertModel/PolariesTostContext";
import { FullPageSpinner } from "../components/loading/PageSkeletons";
import styles from "./ConsultantSupportInbox.module.css";

const PAGE_SIZE = 10;

const STATUS_LABEL = {
  open: "Open",
  replied: "Replied",
  closed: "Closed",
};

function statusBadgeClass(status) {
  if (status === "replied") return styles.statusReplied;
  if (status === "closed") return styles.statusClosed;
  return styles.statusOpen;
}

function ConsultantSupportInbox() {
  const app = useAppBridge();
  const { showToast } = useContext(ToastContext);
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [queryValue, setQueryValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setAdminIdLocal(localStorage.getItem("consultly"));
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!adminIdLocal) return;
    setLoading(true);
    try {
      const token = await getAppBridgeToken(app);
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/consultant-support/${adminIdLocal}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRequests(response.data?.data || []);
    } catch (error) {
      showToast(
        error.response?.data?.message || "Failed to load support requests",
        true,
      );
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [adminIdLocal, app, showToast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      const matchesStatus =
        statusFilter === "all" || request.status === statusFilter;

      let matchesQuery = true;
      if (queryValue.trim()) {
        const query = queryValue.toLowerCase();
        matchesQuery = [
          request.consultantName,
          request.consultantEmail,
          request.subject,
        ].some((value) => String(value ?? "").toLowerCase().includes(query));
      }

      return matchesStatus && matchesQuery;
    });
  }, [requests, statusFilter, queryValue]);

  // Reset to page 1 whenever the filtered set changes shape, so a search
  // that narrows the results doesn't leave the view on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [queryValue, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRequests = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const openRequest = async (request) => {
    setSelectedRequest(request);
    setReplyText("");

    if (!request.adminHasUnread || !adminIdLocal) return;

    try {
      const token = await getAppBridgeToken(app);
      await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/consultant-support/${adminIdLocal}/${request._id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRequests((prev) =>
        prev.map((item) =>
          item._id === request._id ? { ...item, adminHasUnread: false } : item,
        ),
      );
    } catch (_) {
      // Non-blocking
    }
  };

  const sendReply = async () => {
    if (!selectedRequest || !replyText.trim() || !adminIdLocal) return;

    setReplyLoading(true);
    try {
      const token = await getAppBridgeToken(app);
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/consultant-support/${adminIdLocal}/${selectedRequest._id}/reply`,
        { reply: replyText.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      showToast(response.data?.message || "Reply sent");
      setReplyText("");
      setSelectedRequest(null);
      fetchRequests();
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to send reply", true);
    } finally {
      setReplyLoading(false);
    }
  };

  if (adminIdLocal && loading && !requests.length) {
    return <FullPageSpinner label="Loading support requests" />;
  }

  return (
    <Page fullWidth>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Support Inbox</h1>
            <p className={styles.subtitle}>
              View consultant and customer queries and send replies from here.
            </p>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={fetchRequests}
          >
            Refresh
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                className={styles.searchInput}
                value={queryValue}
                onChange={(e) => setQueryValue(e.target.value)}
                placeholder="Search requests"
              />
            </div>
            <div className={styles.toolbarRight}>
              <select
                className={styles.statusSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="replied">Replied</option>
                <option value="closed">Closed</option>
              </select>
              <span className={styles.resultsCount}>
                {filteredRequests.length} result
                {filteredRequests.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {pagedRequests.length === 0 ? (
            <div className={styles.emptyState}>
              {requests.length === 0
                ? "No support requests yet."
                : "No requests match your search."}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sr. No.</th>
                    <th>Requester</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedRequests.map((request, index) => (
                    <tr key={request._id}>
                      <td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                      <td>
                        <div className={styles.requesterCell}>
                          <span className={styles.requesterName}>
                            {request.consultantName ||
                              (request.requesterType === "user"
                                ? "Customer"
                                : "Consultant")}
                          </span>
                          <span className={styles.requesterEmail}>
                            {request.consultantEmail || "—"}
                          </span>
                          <span
                            className={`${styles.typeBadge} ${
                              request.requesterType === "user"
                                ? styles.typeCustomer
                                : styles.typeConsultant
                            }`}
                          >
                            {request.requesterType === "user"
                              ? "Customer"
                              : "Consultant"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.subjectCell}>
                          <span>{request.subject}</span>
                          {request.adminHasUnread ? (
                            <span className={styles.newBadge}>New</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusBadgeClass(
                            request.status,
                          )}`}
                        >
                          {STATUS_LABEL[request.status] || request.status}
                        </span>
                      </td>
                      <td className={styles.dateText}>
                        {request.createdAt
                          ? new Date(request.createdAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.viewButton}
                          onClick={() => openRequest(request)}
                        >
                          View & Reply
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.footer}>
            <span className={styles.footerText}>
              Showing {pagedRequests.length} of {filteredRequests.length} requests
            </span>
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={styles.pagerButton}
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.pagerButton}
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        title={selectedRequest?.subject || "Support request"}
        primaryAction={{
          content: replyLoading ? "Sending..." : "Send reply",
          onAction: sendReply,
          loading: replyLoading,
          disabled: !replyText.trim(),
        }}
        secondaryActions={[
          { content: "Close", onAction: () => setSelectedRequest(null) },
        ]}
      >
        <Modal.Section>
          {selectedRequest ? (
            <BlockStack gap="400">
              <Banner tone="info">
                <p>
                  <strong>{selectedRequest.consultantName}</strong> (
                  {selectedRequest.consultantEmail})
                </p>
              </Banner>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Message
                </Text>
                <div className={styles.messageBox}>
                  {selectedRequest.message}
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  {selectedRequest.createdAt
                    ? new Date(selectedRequest.createdAt).toLocaleString()
                    : ""}
                </Text>
              </BlockStack>

              {selectedRequest.replies?.length ? (
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Replies
                  </Text>
                  {selectedRequest.replies.map((reply, index) => (
                    <div
                      key={`${reply.repliedAt}-${index}`}
                      className={styles.replyBox}
                    >
                      <Text as="p" variant="bodySm" tone="subdued">
                        Admin •{" "}
                        {reply.repliedAt
                          ? new Date(reply.repliedAt).toLocaleString()
                          : ""}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        {reply.message}
                      </Text>
                    </div>
                  ))}
                </BlockStack>
              ) : null}

              <TextField
                label="Your reply"
                value={replyText}
                onChange={setReplyText}
                multiline={4}
                autoComplete="off"
                placeholder="Type your reply..."
              />
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export default ConsultantSupportInbox;
