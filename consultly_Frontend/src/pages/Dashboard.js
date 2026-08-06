import {
  Page,
  LegacyCard,
  Text,
  Box,
  Button,
  Badge,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  ExternalIcon,
  PersonIcon,
  ChartVerticalIcon,
  NoteIcon,
  ChatIcon,
  EmailIcon,
  CalendarIcon,
  CashDollarIcon,
  CreditCardIcon,
  CartDiscountIcon,
  PlusIcon,
  ChevronRightIcon,
  PhoneIcon,
  CameraIcon,
  WorkIcon,
  RefreshIcon,
  XIcon,
  ClockIcon,
  WatchIcon,
} from "@shopify/polaris-icons";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { animate } from "framer-motion";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { DashboardSetupGuide, isSetupGuideComplete, getSetupGuideSteps } from "../components/dashboard/DashboardSetupGuide";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchAdminDetails,
  fetchSetupGuideWarning,
  fetchShopAllConsultants,
  fetchShopAllUsers,
  fetchActivityHistory,
  manageAppStatus,
  _PlanDetails,
} from "../components/Redux/slices/adminSlice";
import { Redirect } from "@shopify/app-bridge/actions";
import MoneyValue from "../components/Helper/MoneyValue";
import { openShopifyMenus } from "../utils/shopifyAdmin";
import { DashboardSkeleton } from "../components/loading/PageSkeletons";
import WelcomeModal from "../components/dashboard/WelcomeModal";
import styles from "./Dashboard.module.css";

const TIP_BANNER_DISMISS_KEY = "consultly_dashboard_tip_dismissed";

function AnimatedCount({ value }) {
  const targetValue = value || 0;
  const [displayValue, setDisplayValue] = useState(targetValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(targetValue);

  useEffect(() => {
    if (value === undefined || value === null) {
      setDisplayValue(0);
      return;
    }
    const startValue = prevValueRef.current;
    prevValueRef.current = value;
    if (startValue !== value) {
      setIsAnimating(true);
      const controls = animate(startValue, value, {
        duration: 1.5,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (latest) => setDisplayValue(Math.round(latest)),
        onComplete: () => setIsAnimating(false),
      });
      return () => controls.stop();
    }
  }, [value]);

  return (
    <span
      style={{
        display: "inline-block",
        transform: isAnimating ? "scale(1.1)" : "scale(1)",
        transition: "transform 0.3s ease-out",
      }}
    >
      {displayValue}
    </span>
  );
}

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function getActivityMeta(item) {
  const user =
    item.senderId?.fullname || item.receiverId?.fullname || "User";
  const type = item.type?.toLowerCase();

  if (type === "voice") {
    return {
      icon: PhoneIcon,
      tone: "critical",
      text: `${user} completed a voice call`,
    };
  }
  if (type === "video") {
    return {
      icon: CameraIcon,
      tone: "base",
      text: `${user} completed a video call`,
    };
  }
  if (type === "chat") {
    return {
      icon: ChatIcon,
      tone: "base",
      text: `${user} started a chat`,
    };
  }
  return {
    icon: WorkIcon,
    tone: "subdued",
    text: `${user} completed a session`,
  };
}

function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const app = useAppBridge();
  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);

  const navigateTo = useCallback(
    (path) => {
      if (redirect) {
        redirect.dispatch(Redirect.Action.APP, path);
      } else {
        navigate(path);
      }
    },
    [redirect, navigate]
  );

  const [adminDetails, setAdminDetails] = useState(null);
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const [enabled, setEnabled] = useState(null);
  const [isTogglingApp, setIsTogglingApp] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tipBannerDismissed, setTipBannerDismissed] = useState(
    () => localStorage.getItem(TIP_BANNER_DISMISS_KEY) === "true",
  );
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const prevSetupCompleteRef = useRef(null);
  const appStatus = useSelector((state) => state.admin.appStatus);
  const { adminDetails_ } = useSelector((state) => state.admin);
  const { loading: adminLoading } = useSelector((state) => state.admin);
  const { shopAllUsers } = useSelector((state) => state.admin);
  const { shopAllConsultants } = useSelector((state) => state.admin);
  const { menuSetupComplete } = useSelector((state) => state.admin);
  const { activityHistory } = useSelector((state) => state.admin);
  const { planDetails } = useSelector((state) => state.admin);
 
  const userCount = shopAllUsers?.data?.length || 0;
  const consultantCount = shopAllConsultants?.data?.length || 0;
  const consultationCount = activityHistory?.totalItems || 0;
  const recentActivity = activityHistory?.data?.slice(0, 4) || [];
  const activeConsultant =
    shopAllConsultants?.data?.filter(item => item.isActive).length || 0;
  const hasActivity = consultationCount > 0;
  const adminPercentage = adminDetails_?.adminPersenTage?.$numberDecimal || 0;
  const menusComplete =
    menuSetupComplete && !menuSetupComplete.missingMenus?.length;
  const displayName =
    adminDetails_?.shopOwnerName?.trim() ||
    adminDetails_?.shopName?.trim() ||
    adminDetails_?.shop?.replace(".myshopify.com", "") ||
    adminDetails_?.email?.split("@")[0] ||
    "there";

  useEffect(() => {
    if (!adminIdLocal || !adminDetails_ || adminLoading) return;
    if (adminDetails_.isWelcomeShown === true) {
      setWelcomeModalOpen(false);
      return;
    }
    setWelcomeModalOpen(true);
  }, [adminIdLocal, adminDetails_, adminLoading]);

  const shopDomain =
    adminDetails_?.shop ||
    new URLSearchParams(window.location.search).get("shop") ||
    localStorage.getItem("shop");

  const setupGuideProps = {
    consultantCount,
    adminPercentage,
    appEnabled: enabled,
    menuSetupComplete,
    hasActivity,
    shop: shopDomain,
  };
  const setupComplete = isSetupGuideComplete(setupGuideProps);
  const incompleteSteps = useMemo(() => {
    if (setupComplete) return [];
    return getSetupGuideSteps(setupGuideProps).filter(
      (step) => step.status !== "completed",
    );
  }, [
    setupComplete,
    consultantCount,
    adminPercentage,
    enabled,
    menuSetupComplete,
    shopDomain,
  ]);

  useEffect(() => {
    const wasComplete = prevSetupCompleteRef.current;
    if (wasComplete === true && !setupComplete) {
      localStorage.removeItem(TIP_BANNER_DISMISS_KEY);
      setTipBannerDismissed(false);
    }
    prevSetupCompleteRef.current = setupComplete;
  }, [setupComplete]);

  useEffect(() => {
    const refreshSetupStatus = () => {
      if (document.visibilityState !== "visible" || !adminIdLocal) return;
      dispatch(fetchSetupGuideWarning({ adminIdLocal, app }));
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
      dispatch(_PlanDetails({ adminIdLocal, app }));
    };

    document.addEventListener("visibilitychange", refreshSetupStatus);
    window.addEventListener("focus", refreshSetupStatus);
    return () => {
      document.removeEventListener("visibilitychange", refreshSetupStatus);
      window.removeEventListener("focus", refreshSetupStatus);
    };
  }, [adminIdLocal, app, dispatch]);

  useEffect(() => {
    const id = localStorage.getItem("consultly");
    setAdminIdLocal(id);
    localStorage.removeItem("consultly_setup_guide_dismissed");
  }, []);

  useEffect(() => {
    if (adminDetails_) setEnabled(adminDetails_?.appEnabled);
  }, [adminDetails_]);

  useEffect(() => {
    if (adminIdLocal) dispatch(fetchAdminDetails({ adminIdLocal, app }));
  }, [adminIdLocal, appStatus, dispatch, app]);

  const handleToggle = useCallback(async () => {
    setIsTogglingApp(true);
    try {
      await dispatch(
        manageAppStatus({ adminIdLocal, app, status: !enabled }),
      ).unwrap();
      await Promise.all([
        dispatch(fetchAdminDetails({ adminIdLocal, app })),
        dispatch(fetchSetupGuideWarning({ adminIdLocal, app })),
      ]);
    } catch {
      // Error is stored in admin slice
    } finally {
      setIsTogglingApp(false);
    }
  }, [dispatch, adminIdLocal, app, enabled]);

  const [justActivated, setJustActivated] = useState(false);
  const prevEnabledRef = useRef(enabled);
  useEffect(() => {
    const prev = prevEnabledRef.current;
    prevEnabledRef.current = enabled;
    if (prev === false && enabled === true) {
      setJustActivated(true);
      const timer = setTimeout(() => setJustActivated(false), 1600);
      return () => clearTimeout(timer);
    }
  }, [enabled]);

  const handleRefresh = useCallback(async () => {
    if (!adminIdLocal || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        dispatch(fetchShopAllUsers({ adminIdLocal, app })),
        dispatch(fetchShopAllConsultants({ adminIdLocal, app })),
        dispatch(fetchAdminDetails({ adminIdLocal, app })),
        dispatch(fetchSetupGuideWarning({ adminIdLocal, app })),
        dispatch(_PlanDetails({ adminIdLocal, app })),
        dispatch(
          fetchActivityHistory({
            adminIdLocal,
            page: 1,
            limit: 4,
            type: 0,
            app,
          }),
        ),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [dispatch, adminIdLocal, app, isRefreshing]);

  const handleDismissTipBanner = useCallback(() => {
    localStorage.setItem(TIP_BANNER_DISMISS_KEY, "true");
    setTipBannerDismissed(true);
  }, []);

  const handleOpenMenus = useCallback(() => {
    const shop =
      new URLSearchParams(window.location.search).get("shop") ||
      localStorage.getItem("shop") ||
      adminDetails_?.shop;
    if (!openShopifyMenus(redirect, shop)) {
      navigateTo("/faq");
    }
  }, [redirect, adminDetails_?.shop, navigateTo]);

  useEffect(() => {
    if (!adminIdLocal) return;
    dispatch(fetchShopAllUsers({ adminIdLocal, app }));
    dispatch(fetchShopAllConsultants({ adminIdLocal, app }));
    dispatch(fetchAdminDetails({ adminIdLocal, app }));
    dispatch(fetchSetupGuideWarning({ adminIdLocal, app }));
    dispatch(_PlanDetails({ adminIdLocal, app }));
    dispatch(
      fetchActivityHistory({
        adminIdLocal,
        page: 1,
        limit: 4,
        type: 0,
        app,
      }),
    );
  }, [dispatch, adminIdLocal, app]);

  useEffect(() => {
    if (adminDetails_) setAdminDetails(adminDetails_);
  }, [adminDetails_]);

  const handleStepAction = (stepId, mode = "primary") => {
    if (mode === "manage") {
      switch (stepId) {
        case 1:
          navigateTo("/consultant-list");
          break;
        case 2:
          navigateTo("/admin-percentage");
          break;
        case 3:
          navigateTo("/faq");
          break;
        case 4: {
          const shop =
            new URLSearchParams(window.location.search).get("shop") ||
            localStorage.getItem("shop") ||
            adminDetails_?.shop;
          if (!openShopifyMenus(redirect, shop)) {
            navigateTo("/faq");
          }
          break;
        }
        default:
          break;
      }
      return;
    }

    switch (stepId) {
      case 1:
        navigateTo("/consultant-list/add-consultant");
        break;
      case 2:
        navigateTo("/admin-percentage");
        break;
      case 3:
        if (!enabled) handleToggle();
        else navigateTo("/faq");
        break;
      case 4: {
        const shop =
          new URLSearchParams(window.location.search).get("shop") ||
          localStorage.getItem("shop") ||
          adminDetails_?.shop;
        if (!openShopifyMenus(redirect, shop)) {
          navigateTo("/faq");
        }
        break;
      }
      case 5:
        navigateTo("/history");
        break;
      default:
        break;
    }
  };

  const plan = planDetails?.data;
  const totalMinutes = plan?.totalMinutes || 0;
  const usedMinutes = plan?.usedMinutes || 0;
  const remainingMinutes =
    plan?.remainingMinutes ?? Math.max(totalMinutes - usedMinutes, 0);
  const usedPercentage =
    plan?.usedPercentage ??
    (totalMinutes ? Math.round((usedMinutes / totalMinutes) * 100) : 0);
  const CIRCLE_CIRCUMFERENCE = 314;
  const circleOffset =
    CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * usedPercentage) / 100;
  const resetDate = plan?.currentPeriodEnd
    ? new Date(plan.currentPeriodEnd).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    : "—";

  const activeConsultantsCount =
    shopAllConsultants?.data?.filter((c) => c.consultantStatus)?.length || 0;

  const overviewMetrics = [
    {
      label: "Total clients",
      value: <AnimatedCount value={userCount} />,
      icon: PersonIcon,
      bg: "#E3F2FD",
      iconColor: "#1565C0",
      sub: "Registered store customers",
    },
    {
      label: "Total consultants",
      value: <AnimatedCount value={consultantCount} />,
      icon: WorkIcon,
      bg: "#E8F5E9",
      iconColor: "#2E7D32",
      sub: `${activeConsultantsCount} currently active`,
    },
    {
      label: "Total consultations",
      value: <AnimatedCount value={consultationCount} />,
      icon: CalendarIcon,
      bg: "#F3E5F5",
      iconColor: "#7B1FA2",
      sub: "Sessions booked to date",
    },
    {
      label: "Total revenue",
      value: (
        <MoneyValue
          currency={adminDetails?.currency}
          amount={
            adminDetails?.totalEarning?.$numberDecimal ??
            adminDetails?.totalEarning ??
            0
          }
        />
      ),
      icon: CashDollarIcon,
      bg: "#FFF3E0",
      iconColor: "#E65100",
      sub: "Lifetime earnings",
    },
  ];

  const detailMetrics = [
    {
      label: "Conversion rate",
      value: `${Number(adminPercentage)}%`,
      icon: ChartVerticalIcon,
      bg: "#FFF8E1",
    },
    {
      label: "Active consultants",
      value: activeConsultant,
      icon: PersonIcon,
      bg: "#E8F5E9",
    },
    {
      label: "Admin Percantage",
      value: (
        <MoneyValue
          currency={adminDetails?.currency}
          amount={
            adminDetails?.adminWalletBalance?.$numberDecimal ??
            adminDetails?.adminWalletBalance ??
            0
          }
        />
      ),
      icon: CreditCardIcon,
      bg: "#E3F2FD",
    },
    {
      label: "Vouchers created",
      value: adminDetails_?.vouchers?.length || 0,
      icon: CartDiscountIcon,
      bg: "#FCE4EC",
    },
  ];

  const quickActions = [
    {
      icon: PlusIcon,
      title: "Add consultant",
      desc: "Create a new consultant profile",
      path: "/consultant-list/add-consultant",
      bg: "#E8F5E9",
      iconColor: "#2E7D32",
    },

    {
      icon: CartDiscountIcon,
      title: "Create voucher",
      desc: "Offer credits to users",
      path: "/voucher-management",
      bg: "#FCE4EC",
      iconColor: "#C2185B",
    },
    {
      icon: CreditCardIcon,
      title: "Manage wallet",
      desc: "View wallet transactions",
      path: "/wallet-management",
      bg: "#E0F7FA",
      iconColor: "#00838F",
    },
    {
      icon: ChartVerticalIcon,
      title: "View revenue",
      desc: "Check earnings & reports",
      path: "/revenue-management",
      bg: "#FFF8E1",
      iconColor: "#F9A825",
    },
  ];

  const openSupportEmail = useCallback(() => {
    const subject = encodeURIComponent(
      `Consultly support — ${shopDomain || "my store"}`,
    );
    const body = encodeURIComponent(
      `Hi Consultly team,\n\nStore: ${shopDomain || "-"}\n\nI need help with:\n`,
    );
    const mailtoUrl = `mailto:support@consultly.com?subject=${subject}&body=${body}`;

    // mailto inside the embedded iframe is blocked in most browsers —
    // it must open in a new browsing context to reach the mail client.
    if (redirect) {
      redirect.dispatch(Redirect.Action.REMOTE, {
        url: mailtoUrl,
        newContext: true,
      });
    } else {
      window.open(mailtoUrl, "_blank");
    }
  }, [redirect, shopDomain]);

  const helpItems = [
    {
      icon: NoteIcon,
      title: "Documentation",
      desc: "Read guides and learn",
      bg: "#E3F2FD",
      iconColor: "#1565C0",
      action: () => navigateTo("/faq"),
    },

    {
      icon: EmailIcon,
      title: "Email support",
      desc: "support@consultly.com",
      bg: "#FFF3E0",
      iconColor: "#EF6C00",
      action: openSupportEmail,
    },
  ];

  if (adminIdLocal && !adminDetails_?.shop && adminLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      {app && <TitleBar title="" />}
      {/* <WelcomeModal
        open={welcomeModalOpen}
        onClose={() => setWelcomeModalOpen(false)}
        adminIdLocal={adminIdLocal}
        shopOwnerName={adminDetails_?.shopOwnerName}
        shopName={adminDetails_?.shopName}
      /> */}
      <Page >
        <div className={styles.page}>
          {/* Greeting header */}
          <div className={styles.greetingRow}>
            <div className={styles.greetingContainer}>
              <h1 className={styles.greetingTitle}>  Welcome back, {displayName}
</h1>
              <p className={styles.greetingSubTitle}>
                Here's what's happening with your business today.
              </p>
            </div>
            <div className={styles.greetingActions}>
              <button
                type="button"
                className={[
                  styles.statusPill,
                  enabled ? styles.statusPillActive : styles.statusPillInactive,
                  isTogglingApp && styles.statusPillLoading,
                  justActivated && styles.statusPillPop,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={
                  !enabled && !isTogglingApp ? handleToggle : undefined
                }
                disabled={isTogglingApp}
                title={
                  enabled
                    ? "Consultly is live on your storefront"
                    : "Click to activate Consultly on your storefront"
                }
              >
                <span className={styles.statusDot}>
                  {!enabled && !isTogglingApp && (
                    <span className={styles.statusDotPing} />
                  )}
                  <span className={styles.statusDotCore} />
                </span>
                {isTogglingApp
                  ? "Activating…"
                  : enabled
                    ? "App active"
                    : "Inactive · Activate app"}
              </button>
              <Button
                icon={RefreshIcon}
                onClick={handleRefresh}
                loading={isRefreshing}
                disabled={isRefreshing}
              >
                Refresh
              </Button>
              <Button onClick={() => navigateTo("/faq")}>
                View documentation
              </Button>
            </div>
          </div>

          {/* Tip banner */}
          {!tipBannerDismissed && !setupComplete && (
            <div className={styles.tipBanner}>
              <div className={styles.tipBannerContent}>
                <div className={styles.tipIcon} aria-hidden="true">
                  ★
                </div>
                <div>
                  <p className={styles.tipTitle}>
                    {incompleteSteps.length === 1
                      ? "One setup step still needs attention"
                      : `${incompleteSteps.length} setup steps still need attention`}
                  </p>
                  <p className={styles.tipText}>
                    {incompleteSteps.map((step) => step.title).join(" · ")}
                  </p>
                </div>
              </div>
              <Button onClick={handleDismissTipBanner} variant="plain" icon={XIcon}>
                Dismiss
              </Button>
            </div>
          )}

          <div className={styles.metricsGrid}>
            {detailMetrics.map((metric) => (
              <div key={metric.label} className={styles.metricCard}>
                <div
                  className={styles.metricIcon}
                  style={{ background: metric.bg }}
                >
                  <Icon source={metric.icon} tone="base" />
                </div>
                <div>
                  <p className={styles.metricLabel}>{metric.label}</p>
                  <p className={styles.metricValue}>{metric.value}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Setup guide — always visible while any step is incomplete */}
          {!setupComplete && (
            <div className={styles.sectionGap}>
              <DashboardSetupGuide
                {...setupGuideProps}
                onStepAction={handleStepAction}
              />
            </div>
          )}
          <div className={styles.minutesCard}>
            <div className={styles.minutesHeader}>
              <div className={styles.minutesTitle}>
                <span className={styles.minutesTitleIcon}>
                  <Icon source={ClockIcon} />
                </span>
                <div>
                  <h3>Communication Minutes Usage</h3>
                  <p className={styles.minutesSubtitle}>
                    Plan resets on {resetDate}
                  </p>
                </div>
              </div>
              <Badge
                tone={
                  usedPercentage >= 90
                    ? "critical"
                    : usedPercentage >= 70
                      ? "warning"
                      : "success"
                }
              >
                {`${usedPercentage}% used`}
              </Badge>
            </div>

            <div className={styles.minutesRow}>
              <div className={styles.minutesItem}>
                <div className={`${styles.minutesIcon} ${styles.minutesIconBlue}`}>
                  <Icon source={WatchIcon} />
                </div>
                <div>
                  <p className={styles.minutesLabel}>Total minutes</p>
                  <p className={styles.minutesValue}>
                    <AnimatedCount value={totalMinutes} />
                    <span className={styles.minutesUnit}>min</span>
                  </p>
                </div>
              </div>

              <div className={styles.minutesItem}>
                <div className={`${styles.minutesIcon} ${styles.minutesIconOrange}`}>
                  <Icon source={ClockIcon} />
                </div>
                <div>
                  <p className={styles.minutesLabel}>Used minutes</p>
                  <p className={styles.minutesValue}>
                    <AnimatedCount value={usedMinutes} />
                    <span className={styles.minutesUnit}>min</span>
                  </p>
                </div>
              </div>

              <div className={styles.minutesItem}>
                <div className={`${styles.minutesIcon} ${styles.minutesIconGreen}`}>
                  <Icon source={RefreshIcon} />
                </div>
                <div>
                  <p className={styles.minutesLabel}>Remaining minutes</p>
                  <p className={styles.minutesValue}>
                    <AnimatedCount value={remainingMinutes} />
                    <span className={styles.minutesUnit}>min</span>
                  </p>
                </div>
              </div>

              <div className={styles.minutesUsage}>
                <div className={styles.minutesDonut}>
                  <svg viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      className={styles.minutesDonutBg}
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      className={`${styles.minutesDonutProgress} ${usedPercentage >= 90
                        ? styles.minutesToneCritical
                        : usedPercentage >= 70
                          ? styles.minutesToneWarning
                          : styles.minutesToneOk
                        }`}
                      strokeDasharray={CIRCLE_CIRCUMFERENCE}
                      strokeDashoffset={circleOffset}
                    />
                  </svg>

                  <div className={styles.minutesDonutText}>
                    <h2>{usedPercentage}%</h2>
                    <span>Used</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Status rows */}
          <div className={styles.sectionGap}>
            <div className={styles.statusRow}>
              <div className={styles.statusLeft}>
                <p className={styles.statusLabel}>Store navigation links</p>
                <Badge tone={menusComplete ? "success" : undefined}>
                  {menusComplete ? "On" : "Off"}
                </Badge>
              </div>
              <div className={styles.statusRight}>
                <Button icon={ExternalIcon} onClick={handleOpenMenus}>
                  Configure menus
                </Button>
                <Button variant="plain" onClick={() => navigateTo("/faq")}>
                  Guideline
                </Button>
              </div>
            </div>

            <div className={styles.statusRow}>
              <div className={styles.statusLeft}>
                <p className={styles.statusLabel}>App setting status</p>
                <Badge tone={enabled ? "success" : undefined}>
                  {enabled ? "On" : "Off"}
                </Badge>
              </div>
              <div className={styles.statusRight}>
                <Button
                  onClick={handleToggle}
                  loading={isTogglingApp}
                  disabled={isTogglingApp}
                >
                  {enabled ? "Deactivate app" : "Activate app"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigateTo("/consultant-list")}
                >
                  Manage consultants
                </Button>
              </div>
            </div>
          </div>

          {/* Overview */}
          <div className={styles.overviewHeader}>
            <h2 className={styles.overviewTitle}>Overview</h2>
            {/* <Button
              icon={RefreshIcon}
              onClick={handleRefresh}
              loading={isRefreshing}
              disabled={isRefreshing}
            >
              Refresh data
            </Button> */}
          </div>
          <div className={styles.trendsCard}>
            <div className={styles.trendsCardHeader}>
              <p className={styles.trendsLabel}>Overview &amp; trends</p>
              <Badge tone={enabled ? "success" : undefined}>
                {enabled ? "Tracking" : "Inactive"}
              </Badge>
            </div>
            <div className={styles.trendsGrid}>
              {overviewMetrics.map((metric) => (
                <div key={metric.label} className={styles.trendItem}>
                  <div className={styles.trendItemTop}>
                    <div
                      className={styles.trendIconBox}
                      style={{ background: metric.bg, color: metric.iconColor }}
                    >
                      <Icon source={metric.icon} tone="base" />
                    </div>
                    <p className={styles.trendItemLabel}>{metric.label}</p>
                  </div>
                  <p className={styles.trendItemValue}>{metric.value}</p>
                  <p className={styles.trendItemSub}>{metric.sub}</p>
                </div>
              ))}
            </div>
          </div>


          {/* Recent activity + help */}
          <div className={styles.twoCol}>
            <LegacyCard>
              <Box padding="400">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text variant="headingMd" as="h3">
                    Recent activity
                  </Text>
                  <Button variant="plain" onClick={() => navigateTo("/history")}>
                    View all
                  </Button>
                </div>
                {recentActivity.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No recent activity yet.
                  </Text>
                ) : (
                  recentActivity.map((item, i) => {
                    const meta = getActivityMeta(item);
                    const amount = Number(item.amount || 0);
                    const currency = adminDetails?.currency || "$";
                    return (
                      <div key={item._id || i}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "#f6f6f7",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Icon source={meta.icon} tone={meta.tone} />
                            </div>
                            <div>
                              <Text variant="bodySm" as="p">
                                {meta.text}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="p">
                                {formatTimeAgo(item.createdAt)}
                              </Text>
                            </div>
                          </div>
                          <Text
                            variant="bodySm"
                            tone="success"
                            fontWeight="semibold"
                            as="p"
                          >
                            +<MoneyValue currency={currency} amount={amount} />
                          </Text>
                        </div>
                        {i < recentActivity.length - 1 && <Divider />}
                      </div>
                    );
                  })
                )}
              </Box>
            </LegacyCard>

            <LegacyCard>
              <Box padding="400">
                <Text variant="headingMd" as="h3">
                  Need help?
                </Text>
                <div className={styles.helpList}>
                  {helpItems.map((item) => (
                    <div
                      key={item.title}
                      role="button"
                      tabIndex={0}
                      onClick={item.action}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") item.action();
                      }}
                      className={styles.helpItem}
                    >
                      <div className={styles.helpItemLeft}>
                        <div
                          className={styles.helpIconBox}
                          style={{ background: item.bg, color: item.iconColor }}
                        >
                          <Icon source={item.icon} tone="base" />
                        </div>
                        <div className={styles.helpItemText}>
                          <Text variant="bodySm" fontWeight="semibold" as="p">
                            {item.title}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {item.desc}
                          </Text>
                        </div>
                      </div>
                      <span className={styles.helpItemAction}>
                        <Icon source={ExternalIcon} tone="subdued" />
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20 }}>
                  <Button
                    icon={ExternalIcon}
                    onClick={openSupportEmail}
                    variant="secondary"
                  >
                    Contact support
                  </Button>
                </div>
              </Box>
            </LegacyCard>


          </div>

          {/* Quick actions */}
          <LegacyCard>
            <Box padding="400">
              <Text variant="headingMd" as="h3">
                Quick actions
              </Text>
              <div className={styles.quickGrid}>
                {quickActions.map((action) => (
                  <div
                    key={action.title}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateTo(action.path)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        navigateTo(action.path);
                      }
                    }}
                    className={styles.quickItem}
                  >
                    <div className={styles.quickItemLeft}>
                      <div
                        className={styles.quickIconBox}
                        style={{
                          background: action.bg,
                          color: action.iconColor,
                        }}
                      >
                        <Icon source={action.icon} tone="base" />
                      </div>
                      <div className={styles.quickItemText}>
                        <Text variant="bodySm" fontWeight="semibold" as="p">
                          {action.title}
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          {action.desc}
                        </Text>
                      </div>
                    </div>
                    <Icon source={ChevronRightIcon} tone="subdued" />
                  </div>
                ))}
              </div>
            </Box>
          </LegacyCard>
        </div>
      </Page>
    </>
  );
}

export default Dashboard;
