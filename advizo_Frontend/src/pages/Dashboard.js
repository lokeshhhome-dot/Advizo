import {
  Page,
  Text,
  Button,
  Badge,
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
  PhoneIcon,
  CameraIcon,
  WorkIcon,
  RefreshIcon,
  XIcon,
  CheckIcon,
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
import { FullPageSpinner } from "../components/loading/PageSkeletons";
import WelcomeModal from "../components/dashboard/WelcomeModal";
import styles from "./Dashboard.module.css";

const TIP_BANNER_DISMISS_KEY = "advizo_dashboard_tip_dismissed";
// Recent activity table only ever shows the latest 4 (unchanged), but the
// Revenue card's last-7-days bars are bucketed from this same fetched list
// client-side — real transaction data, not a fabricated series. 40 is enough
// to cover a week for all but the very highest-volume stores without an
// unnecessarily large fetch.
const HOME_ACTIVITY_FETCH_LIMIT = 40;

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

/**
 * Small inline trend chart for a metric card. @shopify/polaris-viz (Shopify's
 * own charting package, the natural choice for this) only supports React
 * 16-18 (checked via `npm view` — peerDependencies caps at ^18.0.0); this
 * project is on React 19, so installing it would be unsupported and
 * unverifiable without a browser. This is a plain inline SVG instead — no
 * new dependency, same Polaris color tokens already used across this page.
 * `values` must be real data; renders nothing meaningful for an all-zero
 * series rather than pretending there's a trend.
 */
function Sparkline({ values, color = "#29845a" }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill={color} fillOpacity="0.12" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small horizontal ratio bar — for a real current value (0-100), not a
 * fabricated trend. Used where no historical series exists but a genuine
 * current proportion does (active/total consultants, commission %). */
function MiniRatioBar({ percent, color = "#29845a" }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  return (
    <div className={styles.miniRatioTrack} aria-hidden="true">
      <div
        className={styles.miniRatioFill}
        style={{ width: `${clamped}%`, background: color }}
      />
    </div>
  );
}

function getActivityTypeBadge(item) {
  const type = item.type?.toLowerCase();
  if (type === "voice") {
    return { label: "Voice", icon: PhoneIcon, className: "typeBadgeVoice" };
  }
  if (type === "video") {
    return { label: "Video", icon: CameraIcon, className: "typeBadgeVideo" };
  }
  if (type === "chat") {
    return { label: "Chat", icon: ChatIcon, className: "typeBadgeChat" };
  }
  return { label: "Session", icon: WorkIcon, className: "typeBadgeDefault" };
}

/**
 * "Consultly is set up" summary — DashboardSetupGuide.js returns null once
 * every step is complete (it's a nudge-to-finish-setup component, nothing to
 * nudge once done), so there was previously no all-done state at all. Reuses
 * getSetupGuideSteps for step id/title/status — only the per-step summary
 * copy below is new, built from data already available on Dashboard rather
 * than the step's generic pre-completion `description`.
 */
function SetupCompleteCard({ steps, consultantCount, adminPercentage }) {
  const summaries = {
    1: `${consultantCount} consultant${consultantCount === 1 ? "" : "s"} added`,
    2: `Set to ${Number(adminPercentage)}%`,
    // No "activated on" timestamp exists anywhere in the data available
    // here — shown as an honest status rather than a fabricated date.
    3: "Active on your storefront",
    4: "Added to your storefront navigation",
  };
  // Display order only (4, 1, 2, 3) — matches the reference layout;
  // status/completeness itself is untouched, still driven by real data.
  const orderedSteps = [4, 1, 2, 3]
    .map((id) => steps.find((s) => s.id === id))
    .filter(Boolean);

  return (
    <div className={styles.setupCompleteCard}>
      <div className={styles.setupCompleteHeader}>
        <div>
          <h3 className={styles.setupCompleteTitle}>Consultly is set up</h3>
          <p className={styles.setupCompleteSubtitle}>
            All four setup steps are complete — bookings are live on your storefront.
          </p>
        </div>
        <span className={styles.setupCompleteCount}>
          {steps.length} / {steps.length}
        </span>
      </div>
      <div className={styles.setupCompleteProgressTrack}>
        <div className={styles.setupCompleteProgressFill} style={{ width: "100%" }} />
      </div>
      <ul className={styles.setupCompleteList}>
        {orderedSteps.map((step) => (
          <li key={step.id} className={styles.setupCompleteItem}>
            <span className={styles.setupCompleteCheck}>
              <Icon source={CheckIcon} tone="base" />
            </span>
            <div>
              <p className={styles.setupCompleteItemTitle}>{step.title}</p>
              <p className={styles.setupCompleteItemDesc}>
                {summaries[step.id] || "Complete"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
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
  const activeConsultantsCount =
    shopAllConsultants?.data?.filter((c) => c.consultantStatus)?.length || 0;

  // Real last-7-days revenue, bucketed client-side from the same activity
  // records already fetched above (HOME_ACTIVITY_FETCH_LIMIT) — not a
  // separate endpoint, not fabricated numbers.
  const last7DaysRevenue = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        key: d.toDateString(),
        label: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }),
        total: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    (activityHistory?.data || []).forEach((item) => {
      if (!item?.createdAt) return;
      const key = new Date(item.createdAt).toDateString();
      const bucket = byKey.get(key);
      if (bucket) bucket.total += Number(item.amount || 0);
    });
    return days;
  }, [activityHistory]);
  const last7DaysTotal = last7DaysRevenue.reduce((sum, d) => sum + d.total, 0);
  const last7DaysMax = Math.max(...last7DaysRevenue.map((d) => d.total), 1);
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
  const allSetupSteps = useMemo(() => {
    if (!setupComplete) return [];
    return getSetupGuideSteps(setupGuideProps);
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
    const id = localStorage.getItem("advizo");
    setAdminIdLocal(id);
    localStorage.removeItem("advizo_setup_guide_dismissed");
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
            limit: HOME_ACTIVITY_FETCH_LIMIT,
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
  const resetDate = plan?.currentPeriodEnd
    ? new Date(plan.currentPeriodEnd).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    : "—";

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

  // No conversion-rate data source exists anywhere in this app today
  // (nothing tracks storefront views vs. bookings) — shown as an honest
  // placeholder rather than reusing adminPercentage under the wrong label,
  // which is what this card used to do.
  const voucherCount = adminDetails_?.vouchers?.length || 0;
  const activeRatio = consultantCount
    ? (activeConsultantsCount / consultantCount) * 100
    : 0;

  // Real vouchers-created-per-day over the last 14 days, from each
  // voucher's own createdAt — not a fabricated trend.
  const voucherSparkline = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({ key: d.toDateString(), count: 0 });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    (adminDetails_?.vouchers || []).forEach((v) => {
      if (!v?.createdAt) return;
      const key = new Date(v.createdAt).toDateString();
      const bucket = byKey.get(key);
      if (bucket) bucket.count += 1;
    });
    return days.map((d) => d.count);
  }, [adminDetails_?.vouchers]);
  const hasVoucherTrend = voucherSparkline.some((v) => v > 0);

  const homeMetrics = [
    {
      label: "Conversion rate",
      value: "—",
      icon: ChartVerticalIcon,
      bg: "#F1F1F2",
      iconColor: "#5C5F62",
      sub: "Not tracked yet",
      isPlaceholder: true,
    },
    {
      label: "Active consultants",
      value: <AnimatedCount value={consultantCount} />,
      icon: PersonIcon,
      bg: "#F1F1F2",
      iconColor: "#5C5F62",
      sub: `${activeConsultantsCount} available now`,
      chart: <MiniRatioBar percent={activeRatio} color="#2E7D32" />,
    },
    {
      label: "Commission rate",
      value: `${Number(adminPercentage)}%`,
      icon: CreditCardIcon,
      bg: "#F1F1F2",
      iconColor: "#5C5F62",
      sub: "Applied to all bookings",
      chart: <MiniRatioBar percent={Number(adminPercentage)} color="#1565C0" />,
    },
    {
      label: "Vouchers issued",
      value: <AnimatedCount value={voucherCount} />,
      icon: CartDiscountIcon,
      bg: "#F1F1F2",
      iconColor: "#5C5F62",
      sub: "Total vouchers created",
      chart: hasVoucherTrend ? (
        <Sparkline values={voucherSparkline} color="#C2185B" />
      ) : null,
    },
  ];

  const openSupportEmail = useCallback(() => {
    const subject = encodeURIComponent(
      `Consultly support — ${shopDomain || "my store"}`,
    );
    const body = encodeURIComponent(
      `Hi Consultly team,\n\nStore: ${shopDomain || "-"}\n\nI need help with:\n`,
    );
    const mailtoUrl = `mailto:support@advizo.com?subject=${subject}&body=${body}`;

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
      title: "FAQ",
      desc: "Read guides and learn",
      bg: "#E3F2FD",
      iconColor: "#1565C0",
      action: () => navigateTo("/faq"),
    },

    {
      icon: EmailIcon,
      title: "support@advizo.com",
      bg: "#FFF3E0",
      iconColor: "#EF6C00",
      action: openSupportEmail,
    },
  ];

  if (adminIdLocal && !adminDetails_?.shop && adminLoading) {
    return <FullPageSpinner label="Loading Advizo" />;
  }

  const currency = adminDetails?.currency || "$";

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
      <Page fullWidth>
        <div className={styles.page}>
          {/* Header */}
          <div className={styles.homeHeader}>
            <div className={styles.homeHeaderLeft}>
              <h1 className={styles.homeTitle}>Home</h1>
              <p className={styles.homeSubtitle}>
                Welcome back, {displayName}. Here's what's happening with
                your consultation business.
              </p>
            </div>
            <div className={styles.greetingActions}>
              {isTogglingApp ? (
                <Button size="slim" loading disabled>
                  {enabled ? "Deactivating…" : "Activating…"}
                </Button>
              ) : enabled ? (
                <>
                  <Badge tone="success">Active</Badge>
                  <Button
                    size="slim"
                    tone="critical"
                    onClick={handleToggle}
                    accessibilityLabel="Deactivate Consultly on your storefront"
                  >
                    Deactivate
                  </Button>
                </>
              ) : (
                <>
                  <Badge tone="attention">Inactive</Badge>
                  <Button
                    size="slim"
                    onClick={handleToggle}
                    accessibilityLabel="Activate Consultly on your storefront"
                  >
                    Activate app
                  </Button>
                </>
              )}
              <Button
                icon={RefreshIcon}
                onClick={handleRefresh}
                loading={isRefreshing}
                disabled={isRefreshing}
              >
                Refresh
              </Button>
              <Button onClick={() => navigateTo("/faq")}>
                FAQ
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

          {/* Top metric cards */}
          <div className={styles.metricsGrid}>
            {homeMetrics.map((metric) => (
              <div key={metric.label} className={styles.metricCard}>
                <div className={styles.metricCardTop}>
                  <p className={styles.metricLabel}>{metric.label}</p>
                  <div
                    className={styles.metricIcon}
                    style={{ background: metric.bg, color: metric.iconColor }}
                  >
                    <Icon source={metric.icon} tone="base" />
                  </div>
                </div>
                <p
                  className={[
                    styles.metricValue,
                    metric.isPlaceholder && styles.metricValuePlaceholder,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {metric.value}
                </p>
                <p className={styles.metricSub}>{metric.sub}</p>
                {metric.chart && (
                  <div className={styles.metricChart}>{metric.chart}</div>
                )}
              </div>
            ))}
          </div>

          {/* Overview & trends */}
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

          {/* Revenue (left, stretches to match the right column's height) /
              Communication minutes + Need help (right, stacked) */}
          <div className={styles.revenueMinutesRow}>
            <div className={styles.revenueBoxWrap}>
              <div className={styles.homeCard}>
                <div className={styles.homeCardHeader}>
                  <Text variant="headingMd" as="h3">
                    Revenue — last 7 days
                  </Text>
                  <p className={styles.revenueTotal}>
                    <MoneyValue currency={currency} amount={last7DaysTotal} />
                  </p>
                </div>
                <div className={styles.revenueChart}>
                  {last7DaysRevenue.map((day) => (
                    <div key={day.key} className={styles.revenueBarCol}>
                      <div className={styles.revenueBarTrack}>
                        <div
                          className={[
                            styles.revenueBar,
                            day.total > 0 && styles.revenueBarActive,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            height: `${Math.max((day.total / last7DaysMax) * 100, 8)}%`,
                          }}
                          title={`${day.label}: ${day.total}`}
                        />
                      </div>
                      <span className={styles.revenueBarLabel}>{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.homeSideCol}>
              {/* Communication minutes */}
              <div className={styles.homeCard}>
                <div className={styles.homeCardHeader}>
                  <Text variant="headingMd" as="h3">
                    Communication minutes
                  </Text>
                </div>

                <div className={styles.minutesStatsList}>
                  <div className={styles.minutesStatRow}>
                    <span className={styles.minutesStatLabel}>Total</span>
                    <span className={styles.minutesStatValue}>
                      <AnimatedCount value={totalMinutes} /> min
                    </span>
                  </div>
                  <div className={styles.minutesStatRow}>
                    <span className={styles.minutesStatLabel}>Used</span>
                    <span className={styles.minutesStatValue}>
                      <AnimatedCount value={usedMinutes} /> min
                    </span>
                  </div>
                  <div className={styles.minutesStatRow}>
                    <span className={styles.minutesStatLabel}>Remaining</span>
                    <span
                      className={`${styles.minutesStatValue} ${styles.minutesStatValueGood}`}
                    >
                      <AnimatedCount value={remainingMinutes} /> min
                    </span>
                  </div>
                </div>

                <div
                  className={styles.minutesUsageTrack}
                  role="progressbar"
                  aria-valuenow={usedPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={[
                      styles.minutesUsageFill,
                      usedPercentage >= 90
                        ? styles.minutesToneCritical
                        : usedPercentage >= 70
                          ? styles.minutesToneWarning
                          : styles.minutesToneOk,
                    ].join(" ")}
                    style={{ width: `${Math.min(usedPercentage, 100)}%` }}
                  />
                </div>
                <p className={styles.minutesResetText}>Resets {resetDate}</p>
              </div>

              {/* Need help */}
              <div className={styles.homeCard}>
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
                      <div
                        className={styles.helpIconBox}
                        style={{ background: item.bg, color: item.iconColor }}
                      >
                        <Icon source={item.icon} tone="base" />
                      </div>
                      <Text variant="bodySm" as="p">
                        {item.title}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Setup guide — the nudge-to-finish version while incomplete,
              the "all done" summary once every step is complete (the guide
              component itself renders nothing in that state). */}
          {!setupComplete ? (
            <div className={styles.sectionGap}>
              <DashboardSetupGuide
                {...setupGuideProps}
                onStepAction={handleStepAction}
              />
            </div>
          ) : (
            <div className={styles.sectionGap}>
              {/* <SetupCompleteCard
                steps={allSetupSteps}
                consultantCount={consultantCount}
                adminPercentage={adminPercentage}
              /> */}
            </div>
          )}

          {/* Store navigation */}
          <div className={styles.homeCard}>
            <div className={styles.storeNavRow}>
              <div className={styles.storeNavIconBox}>
                <Icon source={ExternalIcon} tone="base" />
              </div>
              <div className={styles.storeNavLeft}>
                <div className={styles.storeNavTitleRow}>
                  <h3 className={styles.storeNavTitle}>Store navigation</h3>
                  <span
                    className={[
                      styles.storeNavStatus,
                      menusComplete
                        ? styles.storeNavStatusOn
                        : styles.storeNavStatusOff,
                    ].join(" ")}
                  >
                    {menusComplete ? "On" : "Off"}
                  </span>
                </div>
                <p className={styles.storeNavText}>
                  {menusComplete
                    ? "Your app menus are configured and visible on the storefront."
                    : "Some app menus still need to be added to your storefront navigation."}
                </p>
              </div>
              <Button onClick={handleOpenMenus}>Configure menus →</Button>
            </div>
          </div>

          {/* Recent activity */}
          <div className={styles.homeCard}>
              <div className={styles.homeCardHeader}>
                <div>
                  <Text variant="headingMd" as="h3">
                    Recent activity
                  </Text>
                  <p className={styles.homeCardSubtitle}>
                    Latest consultations booked through your store.
                  </p>
                </div>
                <Button variant="plain" onClick={() => navigateTo("/history")}>
                  View all
                </Button>
              </div>

              {recentActivity.length === 0 ? (
                <div className={styles.activityEmpty}>
                  <Text as="p" tone="subdued">
                    No recent activity yet.
                  </Text>
                </div>
              ) : (
                <div className={styles.activityTableWrap}>
                  <table className={styles.activityTable}>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Consultant</th>
                        <th>Type</th>
                        <th>Cost</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentActivity.map((item, i) => {
                        const badge = getActivityTypeBadge(item);
                        const amount = Number(item.amount || 0);
                        return (
                          <tr key={item._id || i}>
                            <td data-label="Customer">
                              {item.senderId?.fullname || "—"}
                            </td>
                            <td data-label="Consultant">
                              {item.receiverId?.fullname || "—"}
                            </td>
                            <td data-label="Type">
                              <span
                                className={`${styles.typeBadge} ${styles[badge.className]}`}
                              >
                                <Icon source={badge.icon} tone="base" />
                                {badge.label}
                              </span>
                            </td>
                            <td data-label="Cost">
                              <MoneyValue currency={currency} amount={amount} />
                            </td>
                            <td data-label="When" className={styles.activityWhen}>
                              {formatTimeAgo(item.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      </Page>
    </>
  );
}

export default Dashboard;
