import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Page,
  Layout,
  Badge,
  Text,
  Modal,
  TextField,
  BlockStack,
  Banner,
} from "@shopify/polaris";
import { IndexTable } from "@shopify/polaris";
import IndexTableList from "../components/consultant-list/IndexTableList";
import axios from "axios";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import { ToastContext } from "../components/AlertModel/PolariesTostContext";

const headings = [
  { title: "Sr. No.", alignment: "start" },
  { title: "Requester", alignment: "start" },
  { title: "Subject", alignment: "start" },
  { title: "Status", alignment: "center" },
  { title: "Date", alignment: "center" },
  { title: "Action", alignment: "center" },
];

const statusTone = (status) => {
  if (status === "replied") return "success";
  if (status === "closed") return "subdued";
  return "attention";
};

const PAGE_LIMIT = 10;

function ConsultantSupportInbox() {
  const app = useAppBridge();
  const { showToast } = useContext(ToastContext);
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
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

  // Keep the current page valid when the data shrinks (e.g. after a refresh)
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_LIMIT));
    if (page > totalPages) setPage(totalPages);
  }, [requests, page]);

  const paginatedRequests = requests.slice(
    (page - 1) * PAGE_LIMIT,
    page * PAGE_LIMIT,
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

  const renderRow = (request, index) => (
    <IndexTable.Row id={request._id} key={request._id} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">
          {(page - 1) * PAGE_LIMIT + index + 1}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {request.consultantName ||
              (request.requesterType === "user" ? "Customer" : "Consultant")}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {request.consultantEmail || "—"}
          </Text>
          <span>
            <Badge tone={request.requesterType === "user" ? "info" : undefined}>
              {request.requesterType === "user" ? "Customer" : "Consultant"}
            </Badge>
          </span>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">
          {request.subject}
          {request.adminHasUnread ? (
            <Badge tone="attention">New</Badge>
          ) : null}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={statusTone(request.status)}>{request.status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {request.createdAt
            ? new Date(request.createdAt).toLocaleString()
            : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <button
          type="button"
          onClick={() => openRequest(request)}
          style={{
            border: "1px solid #2563eb",
            background: "#fff",
            color: "#2563eb",
            borderRadius: "8px",
            padding: "6px 12px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          View & Reply
        </button>
      </IndexTable.Cell>
    </IndexTable.Row>
  );

  return (
    <Page
      title="Support Inbox"
      subtitle="View consultant and customer queries and send replies from here."
      primaryAction={{ content: "Refresh", onAction: fetchRequests }}
    >
      <Layout>
        <Layout.Section>
          <IndexTableList
            headings={headings}
            data={paginatedRequests}
            loading={loading}
            renderRow={renderRow}
            resourceName={{ singular: "request", plural: "requests" }}
            hideFilters
            page={page}
            setPage={setPage}
            limit={PAGE_LIMIT}
            totalItems={requests.length}
          />
        </Layout.Section>
      </Layout>

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
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    whiteSpace: "pre-wrap",
                  }}
                >
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
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        whiteSpace: "pre-wrap",
                      }}
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
