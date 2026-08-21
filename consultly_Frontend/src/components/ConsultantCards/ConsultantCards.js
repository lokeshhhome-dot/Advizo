import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../components/ConsultantCards/ConsultantCards.css";
import { useDispatch, useSelector } from "react-redux";
import { connectSocket } from "../Redux/slices/sokectSlice";
import { checkUserBalance, openCallPage } from "../middle-ware/OpenCallingPage";
import { fetchStorefrontConsultants, fetchVoucherData } from "../Redux/slices/UserSlices";
import { StorefrontSkeleton } from "../loading/PageSkeletons";
import { useAppStatus } from "../ProtectRoute/AppStatusProvider";
import { usePolarisToast } from "../AlertModel/PolariesTostContext";
import MoneyValue from "../Helper/MoneyValue";
import { EmptyState } from "@shopify/polaris";
import ConsultantChatModal from "./ConsultantChatModal";

const COMM_DISABLED_TOOLTIP =
  "Communication unavailable. The store has exhausted its communication minutes.";
const COMM_DISABLED_TOAST = "Communication is currently unavailable.";
// The app JWT is signed as { id: <mongo user id> } — decode it (no verify,
// display-only) so the page can recover the logged-in user's id even when the
// customerId URL param is missing. The backend re-authenticates every action.
const decodeUserIdFromToken = (jwt) => {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const payload = JSON.parse(
      atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload?.id || null;
  } catch {
    return null;
  }
};

export const checkMicPermission = async () => {
  try {
    const result = await navigator.permissions.query({
      name: "microphone",
    });

    return result.state;
  } catch {
    return "prompt";
  }
};

function ConsultantCards() {
  const dispatch = useDispatch();
  const { shopId: contextShopId, loading: appStatusLoading } = useAppStatus();
  const [userId, setUserId] = useState(null);
  // fetchStorefrontConsultants now lives in UserSlices and writes to
  // state.users.consultants (not state.consultants).
  const { consultants, loading, voucherData } = useSelector(
    (state) => state.users,
  );
  const toastCtx = usePolarisToast();
  console.log("CODE IS UPDATED")
  // Shop-level flag delivered by both storefront bootstrap responses; the
  // backend re-validates every action, this only drives the disabled UI.
  const communicationDisabled =
    voucherData?.communicationDisabled === true ||
    consultants?.communicationDisabled === true;
  const params = new URLSearchParams(window.location.search);
  // Every storefront navigation is built as `https://${shop}/...`. When shop is
  // missing the URL becomes "https://null/..." and the browser silently refuses
  // to navigate — which looks exactly like a dead button. Fall back to the
  // remembered domain, and persist it whenever the proxy supplies one.
  const shop = params.get("shop") || localStorage.getItem("shop") || "";
  const user_id = params.get("customerId");
  const authToken = params.get("authToken");
  const [initialLoading, setInitialLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatConsultant, setChatConsultant] = useState(null);

  const effectiveShopId =
    contextShopId ||
    localStorage.getItem("shop_o_Identity") ||
    params.get("shopid")


  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fromUrl = params.get("shop");
    if (fromUrl) localStorage.setItem("shop", fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The proxy hands the logged-in customer's id via the URL (customerId) —
    // that is the authoritative source. localStorage may have just been wiped
    // by a role switch, and the provider that rewrites it runs AFTER this
    // child effect, so relying on storage alone showed a false "please login".
    const resolvedUserId =
      user_id ||
      localStorage.getItem("client_u_Identity") ||
      decodeUserIdFromToken(authToken || localStorage.getItem("token")) ||
      null;
    if (resolvedUserId) {
      localStorage.setItem("client_u_Identity", resolvedUserId);
    }
    if (authToken) {
      localStorage.setItem("token", authToken);
    }
    setUserId(resolvedUserId);
  }, [authToken, user_id]);

  useEffect(() => {
    if (!effectiveShopId) return;
    console.log("effectiveShopId is runing ;......")
    dispatch(fetchStorefrontConsultants({ adminIdLocal: effectiveShopId, authToken }));
  }, [dispatch, effectiveShopId]);

  useEffect(() => {
    if (effectiveShopId) {
      dispatch(fetchVoucherData(effectiveShopId));
    }
  }, [dispatch, effectiveShopId]);

  useEffect(() => {
    if (user_id) {
      dispatch(connectSocket(user_id));
    }
  }, [dispatch, user_id]);
  const consultantsList = Array.isArray(consultants?.findConsultant)
    ? consultants.findConsultant
    : [];

  const mappedConsultants =
    consultantsList &&
    consultantsList.map((consultant) => {
      let languages = [];

      try {
        if (typeof consultant.language === "string") {
          languages = JSON.parse(consultant.language);
        } else if (Array.isArray(consultant.language)) {
          languages = consultant.language;
        }

        if (!Array.isArray(languages)) {
          languages = ["English"];
        }
      } catch (e) {
        languages = ["English"];
      }
      return {
        id: consultant._id || consultant.id,
        name: consultant.displayName || consultant.fullname || "Consultant",
        image: consultant.profileImage || "",
        profession: consultant.profession || "Consultant",
        specialization: consultant.specialization || "",
        experience: parseInt(consultant.experience) || 0,
        languages: languages,
        rating: 4.5,
        testimonials: 0,
        isActive: consultant.isActive || false,
        // Number(), not parseInt() — per-minute rates are decimal (0.8, 1.6)
        // and parseInt truncates them to 0 and 1.
        chatPrice: Number(consultant?.chatPerMinute) || 0,
        audioPrice: Number(consultant?.voicePerMinute) || 0,
        videoPrice: Number(consultant?.videoPerMinute) || 0,
        isBusy: consultant?.isBusy,
        consultantStatus: consultant?.consultantStatus,
      };
    });

  useEffect(() => {
    if (!loading) {
      const sendHeight = () => {
        const height = document.documentElement.scrollHeight;
        if (window.parent) {
          window.parent.postMessage(
            { type: "AGORA_IFRAME_HEIGHT", height },
            "*",
          );
        }
      };
      const id = setTimeout(sendHeight, 300);
      return () => clearTimeout(id);
    }
  }, [loading, mappedConsultants.length]);



  /**
   * Start Voice Call and Video Call
   */

  /**
   * Navigate the top-level storefront window. Refuses to build a URL when the
   * shop domain is unknown — "https://null/..." is a navigation the browser
   * drops on the floor, so the click appears to do nothing at all.
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

  // Last resort only — the proxy now recovers the session from its own cookie
  // when Shopify omits logged_in_customer_id, so reaching here means the visitor
  // really is signed out. return_to brings them straight back to the app instead
  // of stranding them on their Shopify account page.
  const redirectToLogin = () => {
    console.warn("[storefront] no customer identity resolved", {
      hasUrlCustomerId: Boolean(user_id),
      hasStoredUserId: Boolean(localStorage.getItem("client_u_Identity")),
      hasToken: Boolean(authToken || localStorage.getItem("token")),
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
      // TEMPORARY debug — remove once the redirect-on-click report is resolved.
      console.log("[Consultly Chat] redirect attempt =", "/account/login (via redirectToLogin, from startCall — the Call handler, not Chat)");
      alert("user id not found redirect wrong url ")
      redirectToLogin();
      return;
    }
    console.log("user id not found redirect wrong url 11111")
    await openCallPage({
      receiverId,
      type,
      userId,
      
      shop,
      shopId: effectiveShopId,
      // Fresh customer JWT minted by the proxy for THIS page load — the
      // localStorage copy may be stale/overwritten by a role switch, and a
      // wrong token silently kills the call window's socket + API auth.
      authToken: authToken || localStorage.getItem("token") || "",
    });
  };

  if (initialLoading || loading || (shop && !effectiveShopId && appStatusLoading)) {
    return <StorefrontSkeleton />;
  }

  const viewProfile = (consultant_id) => {
    const hostQuery = "";
    window.top.location.href = `https://${shop}/apps/consultly/view-profile?consultantId=${consultant_id}&shopId=${effectiveShopId}${hostQuery}`;
  };

  // TODO(auth): testing-only entry point — intentionally skips the
  // communicationDisabled/userId/balance checks the old chats-c navigation
  // flow used to do, so the Chat button opens the modal even for an
  // anonymous visitor. Restore an equivalent gate here before this ships
  // for real users.
  const openChatModal = (consultant) => {
    // TEMPORARY debug — remove once the redirect-on-click report is resolved.
    console.log("[CONSULTLY TEST] opening ConsultantChatModal");
    console.log("[CONSULTLY Chat] consultantId =", consultant?.id || consultant?._id);
    console.log("[CONSULTLY Chat] shop =", shop);
    console.log("[CONSULTLY Chat] customerId =", userId);
    console.log("[CONSULTLY Chat] authToken exists =", Boolean(authToken || localStorage.getItem("token")));
    setChatConsultant(consultant);
    setChatOpen(true);
  };

  return (
    <>
      <div
        className="container "
        style={{ marginTop: "60px", paddingBottom: "40px" }}
      >
        <div className="row" style={{ gap: "1.5rem" }}>
          {mappedConsultants.filter((c) => c.consultantStatus).length === 0 ? (
            <div className="col-12">
              <div
                style={{
                  maxWidth: "560px",
                  margin: "24px auto",
                  background: "#ffffff",
                  border: "1px solid #eceef2",
                  borderRadius: "16px",
                  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
                  padding: "16px",
                }}
              >
                <EmptyState
                  heading="No consultants available yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Our experts will appear here as soon as they are available.
                    Please check back soon.
                  </p>
                </EmptyState>
              </div>
            </div>
          ) : (
            mappedConsultants.map((consultant) => {
              if (!consultant.consultantStatus) return null;
              const consultant_id = consultant.id;
              return (
                <div
                  key={consultant.id}
                  className="col-lg-4 col-md-6 col-sm-12"
                >
                  <div
                    className="card shadow-sm border-0 consultant-card"
                    // onClick={() => navigate(`/view-profile/${shop_id}/${consultant_id}`)}
                    onClick={() => viewProfile(consultant_id)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="card-body">
                      {/* Profile Section */}
                      <div className="consultant-header">
                        {/* Profile Image */}
                        <div className="position-relative flex-shrink-0">
                          <img
                            src={
                              consultant.image || "/images/flag/teamdefault.png"
                            }
                            alt={consultant.name}
                            className="rounded-circle profile-image"
                            onError={(e) => {
                              e.target.src = "/images/flag/teamdefault.png";
                            }}
                          />
                          {consultant.isActive && (
                            <span className="active-status-dot"></span>
                          )}
                        </div>

                        {/* Name and Details */}
                        <div className="consultant-header-info">
                          <h5 className="consultant-name">{consultant.name}</h5>
                          <p className="consultant-profession">
                            {consultant.profession}
                          </p>
                          <div className="consultant-meta">
                            <span className="experience-badge">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z" />
                              </svg>
                              {consultant.experience}+ Yrs Exp
                            </span>
                            {consultant.isBusy && (
                              <span className="busy-badge">
                                <span className="busy-dot"></span>
                                Busy · ~5 min
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <hr className="card-divider" />

                      {/* Information Section */}
                      <div className="consultant-body">
                        <p className="consultant-info">
                          <strong>Speaks:</strong>{" "}
                          {consultant.languages.join(", ")}
                        </p>

                        <span className="calling-options-title">
                          Consultation Options
                        </span>
                        <div className="calling-options">
                          <button
                            className="calling-option-btn chat-btn"
                            disabled={communicationDisabled}
                            title={
                              communicationDisabled
                                ? COMM_DISABLED_TOOLTIP
                                : undefined
                            }
                            onClick={(e) => {
                              // TEMPORARY debug — remove once the redirect-on-click
                              // report is resolved. See ConsultantChatModal.js.
                              console.log("[CONSULTLY TEST] CHAT BUTTON CLICKED");
                              console.log("[CONSULTLY TEST] Chat event target =", e.target);
                              console.log("[CONSULTLY TEST] Chat currentTarget =", e.currentTarget);
                              e.stopPropagation();
                              openChatModal(consultant);
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
                              <MoneyValue
                                currency={voucherData?.shopCurrency}
                                amount={consultant.chatPrice}
                              />
                              <span className="calling-option-unit">/min</span>

                            </span>
                          </button>
                          <button
                            className="calling-option-btn audio-btn"
                            disabled={communicationDisabled}
                            title={
                              communicationDisabled
                                ? COMM_DISABLED_TOOLTIP
                                : undefined
                            }
                            onClick={(e) => {
                              // TEMPORARY debug — remove once the redirect-on-click
                              // report is resolved.
                              console.log("[CONSULTLY TEST] CALL BUTTON CLICKED (voice)");
                              e.stopPropagation();
                              startCall({
                                receiverId: consultant.id,
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
                            {/* <span className="calling-option-label">Audio</span> */}
                            <span className="calling-option-price">
                              <MoneyValue
                                currency={voucherData?.shopCurrency}
                                amount={consultant.audioPrice}
                              />
                              <span className="calling-option-unit">/min</span>

                            </span>
                          </button>
                          <button
                            className="calling-option-btn video-btn"
                            disabled={communicationDisabled}
                            title={
                              communicationDisabled
                                ? COMM_DISABLED_TOOLTIP
                                : undefined
                            }
                            onClick={(e) => {
                              // TEMPORARY debug — remove once the redirect-on-click
                              // report is resolved.
                              console.log("[CONSULTLY TEST] CALL BUTTON CLICKED (video)");
                              e.stopPropagation();
                              startCall({
                                receiverId: consultant.id,
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
                                  d="M14 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H14C15.1 19 16 18.1 16 17V7C16 5.9 15.1 5.1 14 5Z"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>

                            <span className="calling-option-price">
                              <MoneyValue
                                currency={voucherData?.shopCurrency}
                                amount={consultant.videoPrice}
                              />
                              <span className="calling-option-unit">/min</span>
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConsultantChatModal
        show={chatOpen}
        onClose={() => setChatOpen(false)}
        consultant={chatConsultant}
        shop={shop}
      />
    </>
  );
}

export default ConsultantCards;
