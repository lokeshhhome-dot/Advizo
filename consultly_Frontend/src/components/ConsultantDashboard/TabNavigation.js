import React, { useState, useEffect, Fragment, useRef } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import styles from "../../components/ConsultantDashboard/TabNavigation.module.css";
import { useDispatch, useSelector } from "react-redux";
import { connectSocket } from "../Redux/slices/sokectSlice";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import ConsultantProfileModal from "./ConsultantProfileModal";
import "./consultantTheme.css";
import axios from "axios";
import {
  HiOutlineSquares2X2,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineBanknotes,
  HiOutlineArrowDownTray,
  HiOutlineLifebuoy,
} from "react-icons/hi2";
import TopHeader from "./TopHeader";
import { logout } from "../Redux/slices/authConsultantSlice";
import { redirectToConsultantLogin } from "../../utils/consultantAuth";
import { isDummyConsultant } from "../../utils/isDummyConsultant";
import PageFadeIn from "../loading/PageFadeIn";
import { ConsultantDashboardSkeleton } from "../loading/PageSkeletons";
import { getProfileImageUrl } from "../../utils/getProfileImageUrl";
import { useConsultantIdentity } from "../../utils/useConsultantIdentity";

function TabNavigation({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstRender = useRef(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userId, setUserId] = useState();
  const [shopId, setShopId] = useState();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    gender: "",
    bio: "",
    profileImage: null,
  });
  const [selfDetails, setSelfDetails] = useState(null);
  const { consultantOverview } = useSelector((state) => state.consultants);
  const isSocketConnected = useSelector((state) => state.socket.isConnected);
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop");
  const token = localStorage.getItem("token");

  // Server-derived identity (Redux via verifyToken) with localStorage fallback.
  const identity = useConsultantIdentity();
  useEffect(() => {
    setUserId(identity.consultantId);
    setShopId(identity.shopId);
  }, [identity.consultantId, identity.shopId]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 200);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const sendHeight = () => {
    const height = document.documentElement.scrollHeight;
    if (window.parent) {
      window.parent.postMessage({ type: "AGORA_IFRAME_HEIGHT", height }, "*");
    }
  };
  useEffect(() => {
    dispatch(fetchConsultantById({ shop_id: shopId, consultant_id: userId }));
  }, [shopId, userId]);

  // Own email/phone/bio come from the authenticated self endpoint — the
  // public consultant endpoint strips PII, so consultantOverview never has
  // them and the profile modal showed empty fields.
  const loadSelfDetails = async () => {
    if (!userId || !token) return;
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/me/overview/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data?.success) setSelfDetails(response.data.data);
    } catch (error) {
      console.error("Failed to load consultant details:", error);
    }
  };

  useEffect(() => {
    loadSelfDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  const updateProfileDeatailsHandler = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("consultantId", userId);
      formData.append("shopId", shopId);
      formData.append("name", profile.name);
      formData.append("email", profile.email);
      formData.append("phone", profile.phone);
      formData.append("gender", profile.gender);
      formData.append("bio", profile.bio || "");
      if (profile.profileImage instanceof File) {
        formData.append("profileImage", profile.profileImage);
      }
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/update-profile`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      console.log("Profile updated:", response.data);

      if (response.data.success) {
        dispatch(
          fetchConsultantById({
            shop_id: shopId,
            consultant_id: userId,
            token,
            shop,
          }),
        );
        loadSelfDetails();
        setLoading(false);
        setShowModal(false);
      }

      console.log("Profile updated:", response.data);
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        window.top.location.href = `https://${shop}/apps/consultly/login`;
        return;
      }
      console.error("Error updating profile details:", error);
      alert(
        error?.response?.data?.message ||
          "Failed to update profile. Please try again.",
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    window.addEventListener("load", sendHeight);
    window.addEventListener("resize", sendHeight);
    const timeoutId = setTimeout(sendHeight, 500);
    return () => {
      window.removeEventListener("load", sendHeight);
      window.removeEventListener("resize", sendHeight);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    dispatch(connectSocket(userId));
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");
    if (page === "consulant-chats") {
      if (
        location.pathname !== "/consulant-chats" &&
        !location.pathname.startsWith("/consulant-chats")
      ) {
        setTimeout(() => {
          navigate("/consulant-chats", { replace: true });
        }, 100);
      }
    }
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Grouped, human-friendly labels. Paths + active logic unchanged — only the
  // presentation is modernized (sections + clearer wording).
  const menuSections = [
    {
      title: "Workspace",
      items: [
        {
          label: "Dashboard",
          path: "/consultant-dashboard",
          active: location.pathname === "/consultant-dashboard",
          icon: <HiOutlineSquares2X2 />,
        },
        {
          label: "Messages",
          path: "/consultant-dashboard/chats",
          active: location.pathname.startsWith("/consultant-dashboard/chats"),
          icon: <HiOutlineChatBubbleLeftRight />,
        },
        {
          label: "Consultations",
          path: "/consultant-dashboard/call-chat-logs",
          active: location.pathname.startsWith(
            "/consultant-dashboard/call-chat-logs",
          ),
          icon: <HiOutlineClipboardDocumentList />,
        },
      ],
    },
    {
      title: "Finance",
      items: [
        {
          label: "Wallet",
          path: "/consultant-dashboard/consultant-wallet-logs",
          active: location.pathname.startsWith(
            "/consultant-dashboard/consultant-wallet-logs",
          ),
          icon: <HiOutlineBanknotes />,
        },
        {
          label: "Withdrawals",
          path: "/consultant-dashboard/withdrawal-request-table",
          active: location.pathname.startsWith(
            "/consultant-dashboard/withdrawal-request-table",
          ),
          icon: <HiOutlineArrowDownTray />,
        },
      ],
    },
    {
      title: "Help",
      items: [
        {
          label: "Support",
          path: "/consultant-dashboard/support",
          active: location.pathname.startsWith("/consultant-dashboard/support"),
          icon: <HiOutlineLifebuoy />,
        },
      ],
    },
  ];

  const handleNavigation = (path) => {
    localStorage.setItem("lastRoute", path); // save route
    navigate(path);
  };
  useEffect(() => {
    const lastRoute = localStorage.getItem("lastRoute");

    if (lastRoute && location.pathname === "/consultant-dashboard") {
      navigate(lastRoute, { replace: true });
    }
  }, []);

  const handleOpenProfile = () => {
    setShowModal(true);
  };

  const handleOpenInbox = () => {
    handleNavigation("/consultant-dashboard/chats");
  };

  const profileImageUrl = getProfileImageUrl(
    consultantOverview?.consultant?.profileImage,
  );
  const consultantDetails = consultantOverview?.consultant;
  const isDummyAccount = isDummyConsultant(consultantDetails);
  const isVideoCallPage =
    location.pathname === "/video-call" ||
    location.pathname.startsWith("/video-call");

  const handleLogout = () => {
    dispatch(logout());
    redirectToConsultantLogin();
  };
  return (
    <Fragment>
      <ConsultantProfileModal
        show={showModal}
        handleClose={() => setShowModal(false)}
        onLogout={handleLogout}
        consultantOverview={consultantOverview}
        selfDetails={selfDetails}
        profile={profile}
        setProfile={setProfile}
        updateProfileDeatailsHandler={updateProfileDeatailsHandler}
        loading={loading}
      />

      <div
        data-theme="light"
        className={`${styles.dashboardWrapper} ${isVideoCallPage ? styles.videoCallMode : ""}`}
      >
        <TopHeader
          onMenuToggle={toggleSidebar}
          isSidebarOpen={sidebarOpen}
          profile={profileImageUrl}
          userName={consultantOverview?.consultant?.fullname}
          userEmail={selfDetails?.email || consultantOverview?.consultant?.email}
          shop={shop}
          isOnline={isSocketConnected}
          onOpenProfile={handleOpenProfile}
          onOpenInbox={handleOpenInbox}
        />
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div className={styles.mobileOverlay} onClick={toggleSidebar}></div>
        )}

        <div className={styles.mainContainer}>
          {!isVideoCallPage && (
            <aside
              className={`${styles.sideNav} ${sidebarOpen ? styles.sideNavOpen : ""}`}
            >
              <button
                type="button"
                className={styles.sideProfile}
                onClick={handleOpenProfile}
                title="Edit profile"
              >
                <span className={styles.sideProfileAvatar}>
                  <img
                    src={profileImageUrl}
                    alt={consultantDetails?.fullname || "Profile"}
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                  <span
                    className={`${styles.sideProfileDot} ${
                      isSocketConnected
                        ? styles.sideProfileDotOnline
                        : styles.sideProfileDotOffline
                    }`}
                  />
                </span>
                <span className={styles.sideProfileInfo}>
                  <span className={styles.sideProfileName}>
                    {consultantDetails?.fullname || "Consultant"}
                  </span>
                  <span className={styles.sideProfileStatus}>
                    {isSocketConnected ? "Online" : "Offline"}
                  </span>
                </span>
                <span className={styles.sideProfileEdit} aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </span>
              </button>

              <nav className={styles.navTabs}>
                {menuSections.map((section) => (
                  <div className={styles.navSection} key={section.title}>
                    <div className={styles.navSectionLabel}>{section.title}</div>
                    <ul className={styles.navTabList}>
                      {section.items.map((item) => (
                        <li key={item.path}>
                          <button
                            className={`${styles.navTab} ${item.active ? styles.navTabActive : ""}`}
                            onClick={() => handleNavigation(item.path)}
                            title={item.label}
                          >
                            <span className={styles.navTabIcon}>{item.icon}</span>
                            <span className={styles.navTabLabel}>{item.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>

              <div className={styles.sideNavFooter}>
                {isDummyAccount ? (
                  <div className={styles.dummySupportBanner}>
                    Demo consultant account detected. Contact your shop admin for
                    activation or setup help.
                  </div>
                ) : null}
                <button
                  type="button"
                  className={`${styles.supportButton} ${
                    isDummyAccount ? "" : styles.supportButtonSecondary
                  }`}
                  onClick={() => handleNavigation("/consultant-dashboard/support")}
                >
                  Contact admin support
                </button>
              </div>
            </aside>
          )}

          <div className={styles.contentArea}>
            <main className={styles.content}>
              {isTransitioning ? (
                <ConsultantDashboardSkeleton />
              ) : (
                <PageFadeIn>
                  <Outlet context={{ shop }} />
                </PageFadeIn>
              )}
            </main>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

export default TabNavigation;
