import React, { useCallback, useEffect, useState } from "react";
import { Badge, BlockStack, Text, Banner } from "@shopify/polaris";
import ConsultantPageLayout from "./common/ConsultantPageLayout";
import ConsultantSupportModal from "./ConsultantSupportModal";
import PortalModal from "../middle-ware/PortalModal";
import axios from "axios";
import { getConsultantToken } from "../../utils/consultantAuth";
import { isDummyConsultant } from "../../utils/isDummyConsultant";
import { useSelector } from "react-redux";

const statusTone = (status) => {
  if (status === "replied") return "success";
  if (status === "closed") return "subdued";
  return "attention";
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
    localStorage.getItem("shop_o_Identity") ||
    localStorage.getItem("shop_o_Identity__");
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

  // Lock background scroll while the request-detail modal is open.
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
    <>
      <ConsultantPageLayout
        title="Support center"
        subtitle="Send queries to admin and read replies here."
        loading={loading}
        error={error}
        isEmpty={!loading && !error && requests.length === 0}
        emptyHeading="No support requests yet"
        emptyDescription="Create your first support request and the shop admin will reply here."
        emptyAction={{
          content: "Contact admin",
          onAction: () => setShowNewModal(true),
        }}
        primaryAction={{
          content: "New support request",
          onAction: () => setShowNewModal(true),
        }}
        flush={false}
      >
        <BlockStack gap="300">
          {isDummyAccount ? (
            <Banner tone="info">
              <p>
                Demo consultant account: use support requests to reach the shop
                admin for activation or setup help.
              </p>
            </Banner>
          ) : null}

          {requests.map((request) => (
            <button
              key={request._id}
              type="button"
              onClick={() => openRequest(request)}
              style={{
                width: "100%",
                textAlign: "left",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                background: "#fff",
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <BlockStack gap="200">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {request.subject}
                  </Text>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {request.consultantHasUnreadReply ? (
                      <Badge tone="attention">New reply</Badge>
                    ) : null}
                    <Badge tone={statusTone(request.status)}>
                      {request.status}
                    </Badge>
                  </div>
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  {request.message}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {request.createdAt
                    ? new Date(request.createdAt).toLocaleString()
                    : ""}
                </Text>
              </BlockStack>
            </button>
          ))}
        </BlockStack>
      </ConsultantPageLayout>

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
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setSelectedRequest(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "640px",
              background: "#fff",
              borderRadius: "14px",
              padding: "20px",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.3)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <BlockStack gap="400">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <Text as="h2" variant="headingMd">
                  {selectedRequest.subject}
                </Text>
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontSize: "22px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Your message
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
              </BlockStack>

              {selectedRequest.replies?.length ? (
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Admin replies
                  </Text>
                  {selectedRequest.replies.map((reply, index) => (
                    <div
                      key={`${reply.repliedAt}-${index}`}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#ecfdf5",
                        border: "1px solid #86efac",
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
              ) : (
                <Banner tone="info">
                  <p>Waiting for admin reply. Check back here later.</p>
                </Banner>
              )}
            </BlockStack>
          </div>
        </div>
        </PortalModal>
      ) : null}
    </>
  );
}
