import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../components/ConsultantCards/ConsultantCards.css";
import { useDispatch, useSelector } from "react-redux";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import { checkUserBalance, openCallPage } from "../middle-ware/OpenCallingPage";
import { fetchVoucherData } from "../Redux/slices/UserSlices";
import defaultImage from "../../assets/avatar-or-person-sign-profile-picture-portrait-icon-user-profile-symbol.webp";
import { useAppStatus } from "../ProtectRoute/AppStatusProvider";
import { usePolarisToast } from "../AlertModel/PolariesTostContext";
import MoneyValue from "../Helper/MoneyValue";
import ConsultantChatModal from "./ConsultantChatModal";

const COMM_DISABLED_TOOLTIP =
  "Communication unavailable. The store has exhausted its communication minutes.";
const COMM_DISABLED_TOAST = "Communication is currently unavailable.";

function ViewProfile() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { shopId: contextShopId } = useAppStatus();
  const [userId, setUserId] = useState(null);
  const params = new URLSearchParams(window.location.search);
  const consultant_id = params.get("consultantId");
  // Fall back to the remembered domain: without it every navigation below
  // becomes "https://null/..." , which the browser drops silently so the button
  // looks dead.
  const shop = params.get("shop") || localStorage.getItem("shop") || "";
  const effectiveShopId =
    params.get("shopId") ||
    contextShopId ||
    localStorage.getItem("shop_o_Identity") ||
    localStorage.getItem("consultly");
  // The proxy now hands the signed-in shopper's id and JWT via the URL — that
  // is the authoritative source for THIS page load. localStorage is only a
  // fallback: another surface can have cleared it, and treating that as
  // "logged out" is what redirected the customer to Shopify accounts.
  const customerIdParam = params.get("customerId");
  const authTokenParam = params.get("authToken");
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    setUserId(customerIdParam || localStorage.getItem("client_u_Identity"));
  }, [customerIdParam]);

  const { consultantOverview, loading } = useSelector(
    (state) => state.consultants,
  );
  const { voucherData } = useSelector((state) => state.users);
  const toastCtx = usePolarisToast();
  // Shop-level flag from the vouchers bootstrap response; backend re-validates
  // every action, this only drives the disabled UI.
  const communicationDisabled = voucherData?.communicationDisabled === true;
  useEffect(() => {
    if (!effectiveShopId || !consultant_id) return;
    dispatch(fetchConsultantById({ shop_id: effectiveShopId, consultant_id }));
    dispatch(fetchVoucherData(effectiveShopId));
  }, [dispatch, effectiveShopId, consultant_id]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const consultantView = consultantOverview?.consultant;
  const imageUrl = `${process.env.REACT_APP_BACKEND_IMAGE_HOST}/${consultantView?.profileImage?.replace("\\", "/")}`;
  

  /**
   * Navigate the top-level storefront window, refusing to build an unusable
   * "https://null/..." URL that the browser would silently discard.
   */
  const goToStorefront = (path) => {
    if (!shop) {
      console.error("[storefront] navigation blocked — shop domain unknown", {
        path,
      });
      toastCtx?.showToast?.(
        "Could not open that page. Please reload the store page and try again.",
        true,
      );
      return false;
    }
    window.top.location.href = `https://${shop}${path}`;
    return true;
  };

  const redirectToLogin = () => {
    console.warn("[storefront] no customer identity resolved", {
      hasUrlCustomerId: Boolean(customerIdParam),
      hasStoredUserId: Boolean(localStorage.getItem("client_u_Identity")),
    });
    toastCtx?.showToast?.("Please log in to contact this consultant.", true);
    goToStorefront(
      `/account/login?return_to=${encodeURIComponent("/apps/consultly")}`,
    );
  };

  const startCall = async ({ receiverId, type }) => {
    if (communicationDisabled) {
      toastCtx?.showToast?.(COMM_DISABLED_TOAST, true);
      return;
    }
    if (!userId) {
      redirectToLogin();
      return;
    }
    await openCallPage({
      receiverId,
      type,
      userId,
      shop,
      shopId: effectiveShopId,
      // Fresh JWT minted by the proxy for this page load; the stored copy may be
      // stale, and a wrong token silently breaks the call window's auth.
      authToken: authTokenParam || localStorage.getItem("token") || "",
    });
  };

  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <>
        {Array.from({ length: fullStars }, (_, index) => (
          <span key={`full-${index}`} className="star-full">
            ★
          </span>
        ))}
        {hasHalfStar && <span className="star-half">★</span>}
        {Array.from({ length: emptyStars }, (_, index) => (
          <span key={`empty-${index}`} className="star-empty">
            ★
          </span>
        ))}
      </>
    );
  };

  const startChat = async (consultantView) => {
    if (communicationDisabled) {
      toastCtx?.showToast?.(COMM_DISABLED_TOAST, true);
      return;
    }
    if (!userId) {
      redirectToLogin();
      return;
    }
    const chatAuthToken = authTokenParam || localStorage.getItem("token") || "";
    const balance = await checkUserBalance({
      userId,
      consultantId: consultantView,
      type: "chat",
      shop,
      authToken: chatAuthToken,
    });
    if (!balance) {
      toastCtx?.showToast?.(
        "You do not have enough balance to chat with this consultant.",
        true,
      );
      goToStorefront("/apps/consultly/profile");
      return;
    }

    const chatParams = new URLSearchParams({
      consultantId: consultantView,
    });
    if (userId) chatParams.set("customerId", userId);
    if (effectiveShopId) chatParams.set("shopid", effectiveShopId);
    if (chatAuthToken) chatParams.set("authToken", chatAuthToken);
    goToStorefront(`/apps/consultly/chats-c?${chatParams.toString()}`);
  };

  // TODO(auth): testing-only entry point — intentionally skips the
  // communicationDisabled/userId/balance checks startChat above does, so
  // the Chat button opens the modal even for an anonymous visitor. Restore
  // an equivalent gate here before this ships for real users.
  const openChatModal = () => {
    setChatOpen(true);
  };

  const backToHome = () => {
    goToStorefront("/apps/consultly/");
  };

  return (
    <div className="view-profile-container">
      <div className="container py-4">
        {/* Back Button */}
        <button
          className="btn btn-link back-button mb-3"
          onClick={() => backToHome()}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: "8px", verticalAlign: "middle" }}
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Consultants
        </button>

        {/* Profile Header */}
        <div className="card shadow-sm border-0 mb-4 profile-header-card">
          <div className="card-body p-4">
            {/* Profile Section */}
            <div className="consultant-header consultant-header-large">
              {/* Profile Image */}
              <div className="position-relative flex-shrink-0">
                <img
                  src={consultantView?.profileImage ? imageUrl : defaultImage}
                  alt={consultantView?.fullname}
                  className="rounded-circle profile-image profile-image-large"
                />
                {consultantView?.isActive && (
                  <span className="active-status-dot active-status-dot-large"></span>
                )}
              </div>

              {/* Name and Details */}
              <div className="consultant-header-info">
                <h5 className="consultant-name consultant-name-large">
                  {consultantView?.fullname}
                </h5>
                <p className="consultant-profession consultant-profession-large">
                  {consultantView?.profession}
                  {consultantView?.specialization
                    ? ` - ${consultantView?.specialization}`
                    : ""}
                </p>
                <div className="consultant-meta">
                  <span className="experience-badge experience-badge-large">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z" />
                    </svg>
                    {consultantView?.experience}+ Years of Experience
                  </span>
                </div>
              </div>
            </div>

            <hr className="card-divider" />

            <div className="consultant-body">
              <p className="consultant-info">
                <strong>Speaks:</strong>{" "}
                {consultantView?.language?.join(", ")}
              </p>

              <span className="calling-options-title">
                Consultation Options
              </span>
              <div className="calling-options">
                <button
                  className="calling-option-btn chat-btn"
                  disabled={communicationDisabled}
                  title={communicationDisabled ? COMM_DISABLED_TOOLTIP : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    openChatModal();
                  }}
                >
                  <span className="calling-option-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {/* <span className="calling-option-label">Chat</span> */}
                  <span className="calling-option-price">
                    <MoneyValue currency={voucherData?.shopCurrency}>
                      {consultantView?.chatPerMinute}
                    </MoneyValue>
                    <span className="calling-option-unit">/min</span>

                  </span>
                </button>
                <button
                  className="calling-option-btn audio-btn"
                  disabled={communicationDisabled}
                  title={communicationDisabled ? COMM_DISABLED_TOOLTIP : undefined}
                  onClick={(e) => {
                    startCall({
                      receiverId: consultantView?._id,
                      type: "voice",
                    });
                  }}
                >
                  <span className="calling-option-icon">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-phone-icon lucide-phone"
                    >
                      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
                    </svg>
                  </span>
                  {/* <span className="calling-option-label">Voice</span> */}
                  <span className="calling-option-price">
                    <MoneyValue currency={voucherData?.shopCurrency}>
                      {consultantView?.voicePerMinute}
                    </MoneyValue>
                    <span className="calling-option-unit">/min</span>

                  </span>
                </button>
                <button
                  className="calling-option-btn video-btn"
                  disabled={communicationDisabled}
                  title={communicationDisabled ? COMM_DISABLED_TOOLTIP : undefined}
                  onClick={(e) => {
                    startCall({
                      receiverId: consultantView?._id,
                      type: "video",
                    });
                  }}
                >
                  <span className="calling-option-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M23 7L16 12L23 17V7Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H14C15.1 19 16 18.1 16 17V7C16 5.9 15.1 5 14 5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {/* <span className="calling-option-label">Video</span> */}
                  <span className="calling-option-price">
                    <MoneyValue currency={voucherData?.shopCurrency}>
                      {consultantView?.videoPerMinute}
                    </MoneyValue>
                    <span className="calling-option-unit">/min</span>

                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          {/* Left Column */}
          <div className="col-lg-8">
            {/* About Section */}
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-body p-4">
                <h3 className="section-title mb-3">About</h3>
                <p className="about-text">{consultantView?.bio
                }</p>
              </div>
            </div>

            {/* Education & Certifications */}
            {/* <div className="card shadow-sm border-0 mb-4">
                            <div className="card-body p-4">
                                <h3 className="section-title mb-3">Education & Certifications</h3>
                                <div className="mb-3">
                                    <h5 className="subsection-title">Education</h5>
                                    <p className="info-text">{consultant.education}</p>
                                </div>
                                <div>
                                    <h5 className="subsection-title">Certifications</h5>
                                    <ul className="certifications-list">
                                        {consultant.certifications.map((cert, index) => (
                                            <li key={index}>{cert}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div> */}
          </div>

          {/* Right Column */}
          <div className="col-lg-4">
            {/* Expertise Tags */}
            {/* <div className="card shadow-sm border-0 mb-4">
                            <div className="card-body p-4">
                                <h3 className="section-title mb-3">Expertise</h3>
                                <div className="expertise-tags">
                                    {consultant.expertise.map((tag, index) => (
                                        <span key={index} className="expertise-tag">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div> */}

            {/* Calling Options */}
            <div className="card shadow-sm border-0">
              <div className="card-body p-4">
                <h3 className="section-title mb-3">Calling Options</h3>
                <div className="calling-options-profile-sidebar">
                  <button
                    className="calling-option-btn chat-btn"
                    disabled={communicationDisabled}
                    title={communicationDisabled ? COMM_DISABLED_TOOLTIP : undefined}
                    onClick={() => openChatModal()}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    className="calling-option-btn audio-btn"
                    disabled={communicationDisabled}
                    title={communicationDisabled ? COMM_DISABLED_TOOLTIP : undefined}
                    onClick={() =>
                      startCall({
                        receiverId: consultantView?._id,
                        type: "voice",
                      })
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-phone-icon lucide-phone"
                    >
                      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
                    </svg>
                  </button>
                  <button
                    className="calling-option-btn video-btn"
                    disabled={communicationDisabled}
                    title={communicationDisabled ? COMM_DISABLED_TOOLTIP : undefined}
                    onClick={() =>
                      startCall({
                        receiverId: consultantView?._id,
                        type: "video",
                      })
                    }
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M23 7L16 12L23 17V7Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H14C15.1 19 16 18.1 16 17V7C16 5.9 15.1 5 14 5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConsultantChatModal
        show={chatOpen}
        onClose={() => setChatOpen(false)}
        consultant={consultantView}
        shop={shop}
      />
    </div>
  );
}

export default ViewProfile;
