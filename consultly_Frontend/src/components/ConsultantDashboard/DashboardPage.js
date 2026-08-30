import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineArrowDownTray,
  HiOutlineArrowRight,
  HiOutlineInbox,
  HiOutlinePhoneXMark,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { fetchConsultantById } from "../Redux/slices/ConsultantSlices";
import { getConsultantToken } from "../../utils/consultantAuth";
import { useConsultantIdentity } from "../../utils/useConsultantIdentity";
import { useConsultantNotifications } from "./useConsultantNotifications";
import { preloadProfileImage, getProfileImageUrl } from "../../utils/getProfileImageUrl";
import styles from "./DashboardOverview.module.css";

/* ---------------------------------------------------------------------------
   Pure helpers — kept outside the component so they never re-create on render.
   Every number below is derived ONLY from data the API actually returns
   (consultation list, wallet balance, real notifications). No fabricated
   numbers, and no invented "today's scheduled sessions" — this product has
   no session-scheduling/calendar concept, only chat-based consultations and
   a separate call-history log, so the activity feed below is built from
   real timestamped events instead.
--------------------------------------------------------------------------- */

const WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const AVATAR_COLORS = ["#4a6cf7", "#12b76a", "#f79009", "#0ea5e9", "#a855f7", "#ec4899", "#14b8a6"];

const avatarColor = (name = "") => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("") || "?";

const formatAmount = (num) => {
  if (!num) return "0.00";
  return Number(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const relativeTime = (value) => {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

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

/* Small inline sparkline — a supporting visual inside a stat, not a headline
   chart panel. */
const Sparkline = ({ data }) => {
  const W = 120;
  const H = 34;
  const max = Math.max(1, ...data);
  const stepX = W / Math.max(1, data.length - 1);
  const points = data.map((v, i) => [i * stepX, H - (v / max) * H]).map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--ds-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

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
  const { notifications } = useConsultantNotifications();

  const identity = useConsultantIdentity();
  useEffect(() => {
    setUserId(identity.consultantId);
    setShopId(identity.shopId);
  }, [identity.consultantId, identity.shopId]);
  useEffect(() => {
    if (shopId && userId) {
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
      setError(err.response?.data?.message || "Unable to load consultation data. Please try again.");
      setUserData([]);
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => {
    loadConsultations();
  }, [loadConsultations]);

  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    axios
      .get(`${process.env.REACT_APP_BACKEND_HOST}/api-consultant/me/overview/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        if (!cancelled && response.data?.success) setWalletInfo(response.data.data);
      })
      .catch((err) => console.error("Failed to load wallet balance:", err));
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  const consultant = consultantOverview?.consultant;
  const currency = walletInfo?.currency || consultantOverview?.shopCurrency || "$";
  const walletBalance = walletInfo?.walletBalance ?? consultant?.walletBalance ?? 0;
  const consultantName = consultant?.fullname || "Consultant";
  const rawProfileImage = consultant?.profileImage;

  useEffect(() => {
    if (rawProfileImage) preloadProfileImage(rawProfileImage);
  }, [rawProfileImage]);

  const metrics = useMemo(() => {
    const consultations = Array.isArray(userData) ? userData : [];
    const now = Date.now();
    const totalClients = consultations.length;
    const activeClients = consultations.filter((c) => c.userId?.isActive).length;
    const pending = consultations.filter((c) => c.userId?.isRequest);
    const newThisWeek = consultations.filter(
      (c) => c.createdAt && now - new Date(c.createdAt).getTime() < 7 * DAY_MS,
    ).length;
    const trend = buildWeeklyTrend(consultations);
    const recent = [...consultations]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8);
    return { consultations, totalClients, activeClients, pending, newThisWeek, trend, recent };
  }, [userData]);

  const missedCalls = useMemo(
    () => notifications.filter((n) => n.type === "missed_call"),
    [notifications],
  );

  // Recent consultations + missed-call notifications merged into one
  // real, timestamped feed — this stands in for "today's activity" since
  // the product has no scheduled-session/calendar concept to show instead.
  const activityFeed = useMemo(() => {
    const fromConsultations = metrics.recent.map((c) => ({
      key: `c-${c._id}`,
      kind: c.userId?.isRequest ? "request" : "consultation",
      name: c.userId?.fullname || "Client",
      avatar: c.userId?.profileImage,
      detail: c.userId?.isRequest ? "New conversation request" : c.userId?.userType || "Consultation",
      at: c.createdAt,
    }));
    const fromCalls = missedCalls.map((n) => ({
      key: `m-${n.id}`,
      kind: "missed_call",
      name: n.title || "Client",
      avatar: n.profileImage,
      detail: "Missed call",
      at: n.createdAt,
    }));
    return [...fromConsultations, ...fromCalls]
      .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
      .slice(0, 8);
  }, [metrics.recent, missedCalls]);

  const isEmpty = !loading && !error && metrics.totalClients === 0 && activityFeed.length === 0;
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (loading && !metrics.totalClients) {
    return (
      <div className={styles.dashboard}>
        <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 64 }} />
        <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 40 }} />
        <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 96 }} />
        <div className={`${styles.skeleton} ${styles.skBlock}`} style={{ height: 260 }} />
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* ------------------------------- GREETING ------------------------------ */}
      <section className={styles.greeting}>
        <div>
          <div className={styles.greetingStatusRow}>
            <span className={`${styles.statusDot} ${isOnline ? styles.dotOnline : styles.dotOffline}`} />
            <span className={styles.greetingStatusText}>
              {isOnline ? "Available for consultations" : "Offline"}
            </span>
          </div>
          <h1 className={styles.greetingTitle}>
            {greeting}, {consultantName.split(" ")[0]}
          </h1>
          <p className={styles.greetingDate}>{todayLabel}</p>
        </div>
        <div className={styles.greetingActions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => navigate("/consultant-dashboard/chats")}>
            <HiOutlineChatBubbleLeftRight />
            Open conversations
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => navigate("/consultant-dashboard/withdrawal-request")}>
            <HiOutlineArrowDownTray />
            Withdraw
          </button>
        </div>
      </section>

      {error ? (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button type="button" onClick={loadConsultations}>Retry</button>
        </div>
      ) : null}

      {/* ---------------------------- LIVE ACTIVITY LINE ------------------------ */}
      <div className={styles.liveLine}>
        <span className={styles.liveLabel}>
          <HiOutlineSparkles /> Live activity
        </span>
        <button type="button" className={styles.liveStat} onClick={() => navigate("/consultant-dashboard/chats")}>
          <strong>{metrics.pending.length}</strong> conversation{metrics.pending.length === 1 ? "" : "s"} waiting
        </button>
        <span className={styles.liveDivider} />
        <button type="button" className={styles.liveStat} onClick={() => navigate("/consultant-dashboard/call-chat-logs")}>
          <strong>{missedCalls.length}</strong> missed call{missedCalls.length === 1 ? "" : "s"}
        </button>
        <span className={styles.liveDivider} />
        <span className={styles.liveStat}>
          <strong>{metrics.newThisWeek}</strong> new this week
        </span>
      </div>

      {/* ------------------------------ NEEDS ATTENTION -------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Needs your attention</h2>
        {metrics.pending.length === 0 ? (
          <p className={styles.calmNote}>Nothing waiting on you right now — you're all caught up.</p>
        ) : (
          <div className={styles.attentionList}>
            {metrics.pending.slice(0, 5).map((c) => {
              const name = c.userId?.fullname || "Client";
              return (
                <div className={styles.attentionRow} key={c._id}>
                  <div className={styles.avatar} style={{ background: avatarColor(name) }}>
                    {initials(name)}
                  </div>
                  <div className={styles.attentionMain}>
                    <div className={styles.attentionName}>{name}</div>
                    <div className={styles.attentionSub}>Wants to start a conversation</div>
                  </div>
                  <button type="button" className={styles.attentionAction} onClick={() => navigate("/consultant-dashboard/chats")}>
                    Review <HiOutlineArrowRight />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* -------------------------------- PERFORMANCE ---------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Performance</h2>
        <div className={styles.statRow}>
          <div className={`${styles.stat} ${styles.statFeatured}`}>
            <span className={styles.statLabel}>Earnings</span>
            <div className={styles.statValue}>
              <span className={styles.statCurrency}>{currency}</span>
              {formatAmount(walletBalance)}
            </div>
            <span className={styles.statFoot}>Available to withdraw</span>
          </div>
          <span className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total clients</span>
            <div className={styles.statValueRow}>
              <div className={styles.statValue}>{metrics.totalClients}</div>
              <Sparkline data={metrics.trend} />
            </div>
            <span className={styles.statFoot}>Last 8 weeks</span>
          </div>
          <span className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statLabel}>Active clients</span>
            <div className={styles.statValue}>{metrics.activeClients}</div>
            <span className={styles.statFoot}>
              {metrics.totalClients ? `${Math.round((metrics.activeClients / metrics.totalClients) * 100)}% of your clients` : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------------ ACTIVITY FEED ---------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Recent activity</h2>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <HiOutlineInbox />
            </span>
            <div className={styles.emptyTitle}>No activity yet</div>
            <p className={styles.emptyText}>
              When customers connect with you from the storefront, their conversations and calls will show up here.
            </p>
          </div>
        ) : (
          <div className={styles.timeline}>
            {activityFeed.map((item) => (
              <div className={styles.timelineRow} key={item.key}>
                <span className={`${styles.timelineDot} ${item.kind === "missed_call" ? styles.timelineDotDanger : item.kind === "request" ? styles.timelineDotWarning : styles.timelineDotBrand}`} />
                <div className={styles.timelineAvatar}>
                  {item.avatar ? (
                    <img src={getProfileImageUrl(item.avatar)} alt="" />
                  ) : (
                    <span style={{ background: avatarColor(item.name) }}>{initials(item.name)}</span>
                  )}
                </div>
                <div className={styles.timelineMain}>
                  <span className={styles.timelineName}>{item.name}</span>
                  <span className={styles.timelineDetail}>
                    {item.kind === "missed_call" ? <HiOutlinePhoneXMark /> : null}
                    {item.detail}
                  </span>
                </div>
                <span className={styles.timelineTime}>{relativeTime(item.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default DashboardPage;
