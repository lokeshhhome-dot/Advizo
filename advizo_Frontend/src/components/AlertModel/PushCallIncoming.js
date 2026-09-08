import React, { useEffect } from "react";

const PushCallIncoming = ({
  callerName = "Incoming Call",
  callerId,
  channelName,
  callType,
  shop,
}) => {
  console.log("callerId", callerId);
  console.log("channelName", channelName);
  console.log("callType", callType);
  console.log("shop", shop);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = `https://${shop}/apps/advizo/consultant-dashboard`;
    }
  }, [shop]);

  const handleAccept = () => {
    console.log("Accept");
  };
  const handleReject = () => {
    console.log("Reject");
  };
  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <div
        className="card shadow-lg text-center p-4"
        style={{ width: "400px" }}
      >
        <h4 className="mb-3">{callerName}</h4>
        <p className="text-muted">Someone is calling you...</p>

        <div className="d-flex justify-content-center gap-3 mt-4">
          <button className="btn btn-success px-4" onClick={handleAccept}>
            Accept
          </button>

          <button className="btn btn-danger px-4">Reject</button>
        </div>
      </div>
    </div>
  );
};

export default PushCallIncoming;
