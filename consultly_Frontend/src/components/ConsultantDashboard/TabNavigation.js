import React, { useState, useEffect, Fragment, useRef } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import styles from "./TabNavigation.module.css";
import { useDispatch, useSelector } from "react-redux";
import { connectSocket } from "../Redux/slices/sokectSlice";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import "./consultantTheme.css";
import {
  HiOutlineSquares2X2,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineBanknotes,
  HiOutlineLifebuoy,
  HiOutlineBell,
  HiOutlineArrowRightOnRectangle,
  HiOutlineXMark,
} from "react-icons/hi2";
import { logout } from "../Redux/slices/authConsultantSlice";
import { redirectToConsultantLogin } from "../../utils/consultantAuth";
import { isDummyConsultant } from "../../utils/isDummyConsultant";
import PageFadeIn from "../loading/PageFadeIn";
import { ConsultantDashboardSkeleton } from "../loading/PageSkeletons";
import { getProfileImageUrl, handleProfileImageError } from "../../utils/getProfileImageUrl";
import { useConsultantIdentity } from "../../utils/useConsultantIdentity";
import { useConsultantNotifications } from "./useConsultantNotifications";
import appLogo from "../../assets/advizo-lockup-horizontal.svg";

// This replaces the old "logo + search + bell + avatar" top bar entirely —
// there is no shell-level header on desktop any more (each page owns its own
// contextual header inline in the canvas). This lookup only feeds the slim
// mobile-only strip that pairs with the bottom tab bar, where there's no
// room for a per-page custom header.
const PAGE_META = {
  "/consultant-dashboard": "Overview",
  "/consultant-dashboard/chats": "Conversations",
  "/consultant-dashboard/call-chat-logs": "Sessions",
  "/consultant-dashboard/consultant-wallet-logs": "Earnings",
  "/consultant-dashboard/withdrawal-request-table": "Earnings",
  "/consultant-dashboard/withdrawal-request": "Earnings",
  "/consultant-dashboard/support": "Support",
  "/consultant-dashboard/profile": "Profile",
};

function getPageTitle(pathname) {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const match = Object.keys(PAGE_META)
    .filter((p) => p !== "/consultant-dashboard" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_META[match] : "Overview";
}

const formatNotificationTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (err) {
    return "";
  }
};

function TabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstRender = useRef(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const [userId, setUserId] = useState();
  const [shopId, setShopId] = useState();
  const dispatch = useDispatch();
  const { consultantOverview } = useSelector((state) => state.consultants);
  const isSocketConnected = useSelector((state) => state.socket.isConnected);
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop");

  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
  } = useConsultantNotifications();

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
  // Dashboard-ready signal for the static Advizo boot loader (see
  // public/index.html). By the time this component exists, auth has already
  // been restored (ConsultantProtectedRoute guarantees that) — this effect's
  // settle is the remaining "initial dashboard data resolved" + "first
  // usable screen rendered" milestone the loader is waiting on. Guarded so
  // it only ever fires once per app boot, even if this effect re-runs later
  // (e.g. after a profile update re-fetches the same data).
  const bootReadyFired = useRef(false);
  useEffect(() => {
    if (!shopId || !userId) return;
    dispatch(fetchConsultantById({ shop_id: shopId, consultant_id: userId })).finally(() => {
      if (bootReadyFired.current) return;
      bootReadyFired.current = true;
      requestAnimationFrame(() => {
        window.__advizoReady?.();
      });
    });
  }, [shopId, userId]);

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
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navItems = [
    { label: "Overview", path: "/consultant-dashboard", active: location.pathname === "/consultant-dashboard", icon: <HiOutlineSquares2X2 /> },
    { label: "Conversations", path: "/consultant-dashboard/chats", active: location.pathname.startsWith("/consultant-dashboard/chats"), icon: <HiOutlineChatBubbleLeftRight /> },
    { label: "Sessions", path: "/consultant-dashboard/call-chat-logs", active: location.pathname.startsWith("/consultant-dashboard/call-chat-logs"), icon: <HiOutlineClipboardDocumentList /> },
    {
      label: "Earnings",
      path: "/consultant-dashboard/consultant-wallet-logs",
      active:
        location.pathname.startsWith("/consultant-dashboard/consultant-wallet-logs") ||
        location.pathname.startsWith("/consultant-dashboard/withdrawal-request"),
      icon: <HiOutlineBanknotes />,
    },
    { label: "Support", path: "/consultant-dashboard/support", active: location.pathname.startsWith("/consultant-dashboard/support"), icon: <HiOutlineLifebuoy /> },
  ];

  const handleNavigation = (path) => {
    localStorage.setItem("lastRoute", path);
    navigate(path);
  };
  useEffect(() => {
    const lastRoute = localStorage.getItem("lastRoute");
    if (lastRoute && location.pathname === "/consultant-dashboard") {
      navigate(lastRoute, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNotificationClick = async (notification) => {
    await markAsRead(notification);
    setNotifOpen(false);
    if (notification?.userId) {
      localStorage.setItem("consultly_pending_chat_user", notification.userId);
    }
    if (notification?.type === "missed_call") {
      navigate("/consultant-dashboard/call-chat-logs");
      return;
    }
    navigate("/consultant-dashboard/chats");
  };

  const profileImageUrl = getProfileImageUrl(consultantOverview?.consultant?.profileImage);
  const consultantDetails = consultantOverview?.consultant;
  const isDummyAccount = isDummyConsultant(consultantDetails);

  const handleLogout = () => {
    dispatch(logout());
    redirectToConsultantLogin();
  };

  const pageTitle = getPageTitle(location.pathname);
  const isProfilePage = location.pathname.startsWith("/consultant-dashboard/profile");

  return (
    <Fragment>
      <div data-theme="light" className={styles.workspaceShell}>
        {/* ---------------------------- NAV RAIL (desktop) --------------------------- */}
        <aside className={styles.rail}>
          <div className={styles.railBrand}>
            <img src={appLogo} alt="Advizo" className={styles.railBrandLogo} />
          </div>

          <nav className={styles.railNav} aria-label="Consultant dashboard">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`${styles.railItem} ${item.active ? styles.railItemActive : ""}`}
                onClick={() => handleNavigation(item.path)}
                aria-current={item.active ? "page" : undefined}
                title={item.label}
              >
                <span className={styles.railIcon}>{item.icon}</span>
                <span className={styles.railLabel}>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className={styles.railUtility} ref={notifRef}>
            <button
              type="button"
              className={styles.railUtilityBtn}
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            >
              <HiOutlineBell />
              {unreadCount > 0 && (
                <span className={styles.railBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className={styles.notifPanel} role="dialog" aria-label="Notifications">
                <div className={styles.notifPanelHead}>
                  <div>
                    <div className={styles.notifPanelTitle}>Notifications</div>
                    <div className={styles.notifPanelSub}>Missed calls and unread messages</div>
                  </div>
                  {unreadCount > 0 ? (
                    <button type="button" className={styles.notifMarkAll} onClick={markAllAsRead}>
                      Mark all read
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.notifClose}
                    onClick={() => setNotifOpen(false)}
                    aria-label="Close notifications"
                  >
                    <HiOutlineXMark />
                  </button>
                </div>
                <div className={styles.notifList}>
                  {notificationsLoading ? (
                    <div className={styles.notifEmpty}>Loading…</div>
                  ) : notifications.length === 0 ? (
                    <div className={styles.notifEmpty}>No new notifications</div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={`${notification.type}-${notification.id}`}
                        type="button"
                        className={styles.notifItem}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <span className={styles.notifAvatar}>
                          <img
                            src={getProfileImageUrl(notification.profileImage)}
                            alt=""
                            onError={handleProfileImageError}
                          />
                        </span>
                        <span className={styles.notifContent}>
                          <span className={styles.notifTop}>
                            <span className={styles.notifName}>{notification.title}</span>
                            <span className={styles.notifTime}>
                              {formatNotificationTime(notification.createdAt)}
                            </span>
                          </span>
                          <span
                            className={`${styles.notifType} ${
                              notification.type === "missed_call" ? styles.notifTypeCall : styles.notifTypeMessage
                            }`}
                          >
                            {notification.type === "missed_call" ? "Missed call" : "New message"}
                          </span>
                          <span className={styles.notifMessage}>{notification.message}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`${styles.railAvatarBtn} ${isProfilePage ? styles.railItemActive : ""}`}
            onClick={() => handleNavigation("/consultant-dashboard/profile")}
            aria-label={`Open profile for ${consultantDetails?.fullname || "your account"}`}
            aria-current={isProfilePage ? "page" : undefined}
          >
            <span className={styles.railAvatar}>
              <img
                src={profileImageUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <span
                className={`${styles.railAvatarDot} ${
                  isSocketConnected ? styles.railAvatarDotOnline : styles.railAvatarDotOffline
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            className={styles.railLogoutBtn}
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <HiOutlineArrowRightOnRectangle />
          </button>
        </aside>

        <div className={styles.main}>
        {/* ------------------------------ MOBILE TOP STRIP ---------------------------- */}
        <header className={styles.mobileStrip}>
          <span className={styles.mobileStripTitle}>{pageTitle}</span>
          <div className={styles.mobileStripActions}>
            <button
              type="button"
              className={styles.mobileStripBtn}
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            >
              <HiOutlineBell />
              {unreadCount > 0 && <span className={styles.railBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
            <button
              type="button"
              className={styles.mobileStripAvatar}
              onClick={() => handleNavigation("/consultant-dashboard/profile")}
              aria-label="Open profile"
            >
              <img
                src={profileImageUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            </button>
          </div>
        </header>

        {isDummyAccount ? (
          <div className={styles.demoBanner}>
            Demo consultant account — contact your shop admin for activation or setup help.
          </div>
        ) : null}

        {/* --------------------------------- CANVAS ----------------------------------- */}
        <main className={styles.canvas}>
          {isTransitioning ? (
            <ConsultantDashboardSkeleton />
          ) : (
            <PageFadeIn>
              <Outlet context={{ shop }} />
            </PageFadeIn>
          )}
        </main>

        {/* ---------------------------- BOTTOM TAB BAR (mobile) ----------------------- */}
        <nav className={styles.bottomBar} aria-label="Consultant dashboard">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`${styles.bottomItem} ${item.active ? styles.bottomItemActive : ""}`}
              onClick={() => handleNavigation(item.path)}
              aria-current={item.active ? "page" : undefined}
            >
              <span className={styles.bottomIcon}>{item.icon}</span>
              <span className={styles.bottomLabel}>{item.label}</span>
            </button>
          ))}
        </nav>
        </div>
      </div>
    </Fragment>
  );
}

export default TabNavigation;
