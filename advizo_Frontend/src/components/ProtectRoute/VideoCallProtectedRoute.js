import ConsultantCallGuard from "./ConsultantCallGuard";

const VideoCallProtectedRoute = ({ children }) => {
  const params = new URLSearchParams(window.location.search);
  const userType = params.get("userType");
  const channelName = params.get("channelName");

  if (!channelName) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <p>Invalid call link. Missing channel information.</p>
      </div>
    );
  }

  if (userType === "consultant") {
    return <ConsultantCallGuard>{children}</ConsultantCallGuard>;
  }

  // Client call page — skip storefront app-status gate (call URL may not include shop)
  return children;
};

export default VideoCallProtectedRoute;
