import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import {
  HiOutlineWallet,
  HiOutlineUsers,
  HiOutlineBolt,
  HiOutlineInbox,
  HiOutlineChatBubbleLeftRight,
  HiOutlineArrowDownTray,
  HiOutlineClipboardDocumentList,
  HiOutlineArrowTrendingUp,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import { getConsultantToken } from "../../utils/consultantAuth";
import { useConsultantIdentity } from "../../utils/useConsultantIdentity";
import styles from "./DashboardOverview.module.css";
import { preloadProfileImage } from "../../utils/getProfileImageUrl";
import ProfileAvatar from "../common/ProfileAvatar";


/* ---------------------------------------------------------------------------
   Pure helpers — kept outside the component so they never re-create on render.
   All metrics below are derived ONLY from data the API actually returns
   (consultation list + consultant.walletBalance). No fabricated numbers.
--------------------------------------------------------------------------- */

const WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const AVATAR_COLORS = [
  "#4a6cf7", "#12b76a", "#f79009", "#0ea5e9", "#a855f7", "#ec4899", "#14b8a6",
];

const avatarColor = (name = "") => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("") || "?";

const formatAmount = (num) => {
  if (!num) return "0.00";
  return Number(num).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** Bucket consultations into the last 8 ISO weeks by createdAt. */
const buildWeeklyTrend = (consultations) => {
  const now = Date.now();
  const buckets = new Array(WEEKS).fill(0);
  consultations.forEach((c) => {
    if (!c.createdAt) return;
    const diffDays = Math.floor((now - new Date(c.createdAt).getTime()) / DAY_MS);
    const weekIndex = WEEKS - 1 - Math.floor(diffDays / 7);
    if (weekIndex >= 0 && weekIndex < WEEKS) buckets[weekIndex] += 1;
  });
  return buckets;
};

/* Lightweight inline-SVG area chart — zero dependencies, no re-render cost. */
const TrendChart = ({ data }) => {
  const W = 560;
  const H = 180;
  const PAD = 8;
  const max = Math.max(1, ...data);
  const stepX = (W - PAD * 2) / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return [x, y];
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  return (
    <svg
      className={styles.chartSvg}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Consultations over the last 8 weeks"
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ds-brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--ds-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#trendFill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--ds-brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === points.length - 1 ? 4 : 2.5}
          fill="var(--ds-brand)"
          stroke="var(--ds-surface)"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
};

/* Donut for active vs inactive split — pure SVG. */
const Donut = ({ active, total }) => {
  const R = 52;
  const C = 2 * Math.PI * R;
  const ratio = total ? active / total : 0;
  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 132 132" width="132" height="132">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--ds-border)" strokeWidth="14" />
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="var(--ds-success)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${C * ratio} ${C}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutValue}>{Math.round(ratio * 100)}%</span>
        <span className={styles.donutLabel}>active</span>
      </div>
    </div>
  );
};

const weekLabels = () => {
  const now = Date.now();
  const labels = [];
  for (let i = WEEKS - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 7 * DAY_MS);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return labels;
};

/* ------------------------------ Component ------------------------------ */

const DashboardPage = () => {
  const [userId, setUserId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { consultantOverview } = useSelector((state) => state.consultants);
  const isOnline = useSelector((state) => state.socket?.isConnected);
  const shop = localStorage.getItem("shop");
  const token = getConsultantToken();

  // Server-derived identity (Redux via verifyToken) with localStorage fallback.
  const identity = useConsultantIdentity();
  useEffect(() => {
    setUserId(identity.consultantId);
    setShopId(identity.shopId);
  }, [identity.consultantId, identity.shopId]);
  useEffect(() => {
    if (shopId && userId) {
      console.log("fetchConsultantById is not calling ")
      dispatch(fetchConsultantById({ shop_id: shopId, consultant_id: userId, token, shop }));
    }
  }, [shopId, userId, dispatch, token, shop]);

  const loadConsultations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/get/consultant/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setUserData(response.data?.payload || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load consultation data. Please try again.",
      );
      setUserData([]);
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => {
    loadConsultations();
  }, [loadConsultations]);

  // Wallet balance comes from the authenticated self-overview endpoint —
  // the public consultant endpoint (used for consultantOverview) never
  // exposes walletBalance, so reading it from there always showed 0.
  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    axios
      .get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/me/overview/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      .then((response) => {
        if (!cancelled && response.data?.success) {
          setWalletInfo(response.data.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load wallet balance:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  const consultant = consultantOverview?.consultant;
  const currency =
    walletInfo?.currency || consultantOverview?.shopCurrency || "$";
  const walletBalance =
    walletInfo?.walletBalance ?? consultant?.walletBalance ?? 0;
  const consultantName = consultant?.fullname || "Consultant";
  const profileImage = consultant?.profileImage;

  /* All heavy derivations memoized — the list can be large. */
  const metrics = useMemo(() => {
    const consultations = Array.isArray(userData) ? userData : [];
    const now = Date.now();
    const totalClients = consultations.length;
    const activeClients = consultations.filter((c) => c.userId?.isActive).length;
    const pendingRequests = consultations.filter((c) => c.userId?.isRequest).length;
    const newThisWeek = consultations.filter(
      (c) => c.createdAt && now - new Date(c.createdAt).getTime() < 7 * DAY_MS,
    ).length;

    const trend = buildWeeklyTrend(consultations);
    const prevWeek = trend[WEEKS - 2] || 0;
    const thisWeek = trend[WEEKS - 1] || 0;

    // Consultation-type breakdown (real userType field)
    const typeMap = {};
    consultations.forEach((c) => {
      const t = c.userId?.userType || "Other";
      typeMap[t] = (typeMap[t] || 0) + 1;
    });

    const recent = [...consultations]
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      )
      .slice(0, 6);

    return {
      consultations,
      totalClients,
      activeClients,
      pendingRequests,
      newThisWeek,
      trend,
      prevWeek,
      thisWeek,
      typeMap,
      recent,
    };
  }, [userData]);

  const isEmpty = !loading && !error && metrics.totalClients === 0;

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const rawProfileImage = consultantOverview?.consultant?.profileImage;

  useEffect(() => {
    if (rawProfileImage) preloadProfileImage(rawProfileImage);
  }, [rawProfileImage]);

  /* --------------------------- Loading skeleton --------------------------- */

  if (loading && !metrics.totalClients) {
    return (
      <div className={styles.dashboard}>
        <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 108 }} />
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 116 }} />
          ))}
        </div>
        <div className={styles.mainGrid}>
          <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 280 }} />
          <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 280 }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* -------------------------------- HERO -------------------------------- */}
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroAvatar}>
            <ProfileAvatar
              src={rawProfileImage}
              alt={consultantName}
              size={60}
              radius={16}
              eager
              fallback={
                <div
                  className={styles.avatar}
                  style={{ width: 60, height: 60, borderRadius: 16, background: avatarColor(consultantName) }}
                >
                  {initials(consultantName)}
                </div>
              }
            />
            <span
              className={`${styles.heroStatusDot} ${isOnline ? styles.dotOnline : styles.dotOffline}`}
              title={isOnline ? "Online" : "Offline"}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className={styles.heroGreeting}>Welcome back</p>
            <h1 className={styles.heroName}>{consultantName}</h1>
            <div className={styles.heroMeta}>
              <span
                className={`${styles.statusPill} ${isOnline ? styles.statusPillOnline : styles.statusPillOffline}`}
              >
                <span className={styles.pulse} />
                {isOnline ? "Available for consultations" : "Offline"}
              </span>
              <span className={styles.heroDate}>{todayLabel}</span>
            </div>
          </div>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => navigate("/consultant-dashboard/chats")}
          >
            <HiOutlineChatBubbleLeftRight />
            Open chats
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => navigate("/consultant-dashboard/withdrawal-request")}
          >
            <HiOutlineArrowDownTray />
            Withdraw
          </button>
        </div>
      </section>

      {/* ------------------------------- ERROR ------------------------------- */}
      {error ? (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button type="button" onClick={loadConsultations}>
            Retry
          </button>
        </div>
      ) : null}

      {/* ------------------------------- KPIs -------------------------------- */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpi} ${styles.kpiFeatured}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Total Earning </span>
            <span className={styles.kpiIcon}>
              <HiOutlineWallet />
            </span>
          </div>
          <div className={styles.kpiValue}>
            <span className={styles.kpiCurrency}>{currency}</span>
            {formatAmount(walletBalance)}
          </div>
          <div className={styles.kpiFoot}>Available to withdraw</div>
        </div>

        <div className={styles.kpi}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Total clients</span>
            <span className={`${styles.kpiIcon} ${styles.iconBrand}`}>
              <HiOutlineUsers />
            </span>
          </div>
          <div className={styles.kpiValue}>{metrics.totalClients}</div>
          <div className={styles.kpiFoot}>
            {metrics.newThisWeek > 0 ? (
              <>
                <span className={styles.trendUp}>+{metrics.newThisWeek}</span> new this week
              </>
            ) : (
              <span className={styles.trendFlat}>No new clients this week</span>
            )}
          </div>
        </div>

        <div className={styles.kpi}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Active clients</span>
            <span className={`${styles.kpiIcon} ${styles.iconSuccess}`}>
              <HiOutlineBolt />
            </span>
          </div>
          <div className={styles.kpiValue}>{metrics.activeClients}</div>
          <div className={styles.kpiFoot}>
            {metrics.totalClients
              ? `${Math.round((metrics.activeClients / metrics.totalClients) * 100)}% of your clients`
              : "—"}
          </div>
        </div>

        <div className={styles.kpi}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Pending requests</span>
            <span className={`${styles.kpiIcon} ${styles.iconWarning}`}>
              <HiOutlineInbox />
            </span>
          </div>
          <div className={styles.kpiValue}>{metrics.pendingRequests}</div>
          <div className={styles.kpiFoot}>
            {metrics.pendingRequests > 0 ? "Awaiting your response" : "You're all caught up"}
          </div>
        </div>
      </div>

      {/* ---------------------------- MAIN GRID ------------------------------ */}
      <div className={styles.mainGrid}>
        {/* Trend */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Consultation activity</h2>
              <p className={styles.panelSub}>New consultations · last 8 weeks</p>
            </div>
            <span className={`${styles.kpiIcon} ${styles.iconBrand}`}>
              <HiOutlineArrowTrendingUp />
            </span>
          </div>
          <div className={styles.chartWrap}>
            <TrendChart data={metrics.trend} />
            <div className={styles.chartAxis}>
              {weekLabels().map((l, i) =>
                i === 0 || i === WEEKS - 1 || i === Math.floor(WEEKS / 2) ? (
                  <span key={i}>{l}</span>
                ) : (
                  <span key={i} aria-hidden="true" />
                ),
              )}
            </div>
          </div>
        </section>

        {/* Breakdown */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Client breakdown</h2>
              <p className={styles.panelSub}>Active vs. inactive</p>
            </div>
            <span className={`${styles.kpiIcon} ${styles.iconInfo}`}>
              <HiOutlineUserGroup />
            </span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.breakdown}>
              <Donut active={metrics.activeClients} total={metrics.totalClients} />
              <div className={styles.legend}>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: "var(--ds-success)" }} />
                  <span className={styles.legendLabel}>Active</span>
                  <span className={styles.legendValue}>{metrics.activeClients}</span>
                </div>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: "var(--ds-border-strong)" }} />
                  <span className={styles.legendLabel}>Inactive</span>
                  <span className={styles.legendValue}>
                    {metrics.totalClients - metrics.activeClients}
                  </span>
                </div>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: "var(--ds-warning)" }} />
                  <span className={styles.legendLabel}>Requests</span>
                  <span className={styles.legendValue}>{metrics.pendingRequests}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* --------------------------- RECENT CLIENTS -------------------------- */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Recent clients</h2>
            <p className={styles.panelSub}>Your latest consultations</p>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "7px 12px" }}
            onClick={() => navigate("/consultant-dashboard/call-chat-logs")}
          >
            <HiOutlineClipboardDocumentList />
            View all
          </button>
        </div>

        {isEmpty ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <HiOutlineUserGroup />
            </span>
            <div className={styles.emptyTitle}>No consultations yet</div>
            <p className={styles.emptyText}>
              When customers connect with you from the storefront, their consultations
              will appear here.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {metrics.recent.map((c) => {
              const name = c.userId?.fullname || "Client";
              return (
                <div className={styles.listItem} key={c._id}>
                  <div className={styles.avatar} style={{ background: avatarColor(name) }}>
                    {initials(name)}
                  </div>
                  <div className={styles.listMain}>
                    <div className={styles.listName}>{name}</div>
                    <div className={styles.listSub}>{c.userId?.userType || "Consultation"}</div>
                  </div>
                  <div className={styles.listSide}>
                    <span className={styles.listDate}>{formatDate(c.createdAt)}</span>
                    {c.userId?.isRequest ? (
                      <span className={`${styles.tag} ${styles.tagWarning}`}>
                        <span className={styles.tagDot} />
                        Request
                      </span>
                    ) : c.userId?.isActive ? (
                      <span className={`${styles.tag} ${styles.tagSuccess}`}>
                        <span className={styles.tagDot} />
                        Active
                      </span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagMuted}`}>Inactive</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default DashboardPage;
