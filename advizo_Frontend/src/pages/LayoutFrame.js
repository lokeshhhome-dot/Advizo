import {
    Frame,
    TopBar,
    Toast,
    Modal,
    TextField,
    FormLayout,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import Footer from "./Footer";
import { AdminMenu } from "./AdminMenu";
import PageFadeIn from "../components/loading/PageFadeIn";
import { prepareSessionLogin, SESSION_TYPES } from "../utils/browserSession";
import AiAssistantWidget, { AiAssistantProvider } from "../components/AIAssistant";

// Trial banner dismissal is remembered per calendar day AND per trial state, so
// closing it hides it until tomorrow — unless something changed that the merchant
// has not seen yet. Running the free minutes out is exactly that: dismissing the
// "3 days remaining" banner must not also suppress "your minutes are gone",
// which is the message that actually blocks their store from taking calls.
// An upgrade clears trialEndsOn server-side, so inTrial turns false and the
// banner never comes back at all.
const TRIAL_BANNER_DISMISS_KEY = (id) => `advizo_trial_banner_dismissed_${id}`;

const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// How often to re-check the trial while it still has minutes left. Only runs on
// admin pages, only during a trial, and pauses on a hidden tab.
const TRIAL_STATUS_POLL_MS = 60000;

// Stamp identifying "this banner, today". A stored stamp from before this change
// carries no state suffix, so it can never match — the banner shows once more
// after deploy, which is the safe direction to fail in.
const bannerStamp = (exhausted) =>
    `${todayKey()}:${exhausted ? "exhausted" : "active"}`;

export default function LayoutFrame() {
    const [mobileNavActive, setMobileNavActive] = useState(false);
    const [toastActive, setToastActive] = useState(false);
    const [modalActive, setModalActive] = useState(false);
    const [supportSubject, setSupportSubject] = useState("");
    const [supportMessage, setSupportMessage] = useState("");
    const [adminIdLocal, setAdminIdLocal] = useState(null);

    const params = new URLSearchParams(window.location.search);
    const adminId = params.get("adminId");
    const app = useAppBridge();
    const navigate = useNavigate();
    const location = useLocation();
    const [trialStatus, setTrialStatus] = useState(null);
    const [trialBannerDismissedStamp, setTrialBannerDismissedStamp] = useState(
        () => {
            const id = adminId || localStorage.getItem("advizo");
            return id ? localStorage.getItem(TRIAL_BANNER_DISMISS_KEY(id)) : null;
        },
    );

    const dismissTrialBanner = useCallback(() => {
        const id = adminId || localStorage.getItem("advizo");
        // Record the state being dismissed, not just the date — so the banner
        // returns the moment the trial flips to exhausted.
        const stamp = bannerStamp(trialStatus?.exhausted);
        if (id) localStorage.setItem(TRIAL_BANNER_DISMISS_KEY(id), stamp);
        setTrialBannerDismissedStamp(stamp);
    }, [adminId, trialStatus?.exhausted]);

    useEffect(() => {
        if (adminId) {
            prepareSessionLogin(SESSION_TYPES.ADMIN);
            localStorage.setItem("advizo", adminId);
            setAdminIdLocal(adminId);
        }
    }, [adminId]);

    // Trial-minutes gate: when the shop is in its Shopify trial and the free
    // consultation minutes are used up, surface the upgrade banner on every
    // admin page. Read-only; failures are silently ignored.
    useEffect(() => {
        const id = adminId || localStorage.getItem("advizo");
        if (!id) return;
        setTrialBannerDismissedStamp(
            localStorage.getItem(TRIAL_BANNER_DISMISS_KEY(id)),
        );
        let cancelled = false;
        (async () => {
            try {
                const token = await getAppBridgeToken(app);
                const res = await axios.get(
                    `${process.env.REACT_APP_BACKEND_HOST}/admin/billing/trial-status/${id}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!cancelled && res.data?.success) setTrialStatus(res.data);
            } catch (_) {
                /* non-blocking */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [adminId, app, location.pathname]);

    // The minutes run out because of calls happening elsewhere, so the admin can
    // be sitting on one page when it happens. Re-check periodically while the
    // trial still has minutes left, so a dismissed banner can come back the
    // moment they are gone. Stops itself once exhausted or once the trial ends.
    useEffect(() => {
        if (!trialStatus?.inTrial || trialStatus?.exhausted) return undefined;
        const id = adminId || localStorage.getItem("advizo");
        if (!id) return undefined;

        let cancelled = false;
        const poll = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const token = await getAppBridgeToken(app);
                const res = await axios.get(
                    `${process.env.REACT_APP_BACKEND_HOST}/admin/billing/trial-status/${id}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!cancelled && res.data?.success) setTrialStatus(res.data);
            } catch (_) {
                /* non-blocking */
            }
        };

        const timer = setInterval(poll, TRIAL_STATUS_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [adminId, app, trialStatus?.inTrial, trialStatus?.exhausted]);

    // Prefetch the other admin page chunks while the browser is idle, so a
    // menu click never waits on a network fetch for its JS bundle.
    useEffect(() => {
        const prefetch = () => {
            import("./Dashboard");
            import("./ConsultantList");
            import("./UserTransHistory");
            import("./ManualDebetCreditBlance");
            import("./WithdrawalRequest");
            import("./ConsultantSupportInbox");
            import("./AccountInformation");
            import("./VoucherTable");
            import("./VoucherSettings");
            import("./AdminPercentage");
            import("./RevenuManagement");
            import("./Faq");
        };
        if ("requestIdleCallback" in window) {
            const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
            return () => window.cancelIdleCallback(id);
        }
        const timer = setTimeout(prefetch, 1500);
        return () => clearTimeout(timer);
    }, []);

    const toggleMobileNav = useCallback(
        () => setMobileNavActive((v) => !v),
        []
    );

    const topBarMarkup = (
        <TopBar
            showNavigationToggle
            onNavigationToggle={toggleMobileNav}
        />
    );

    return (
        <AiAssistantProvider>
            {/* // <Frame topBar={topBarMarkup}> */}
            {/* 🔥 Page Content */}
            {/* Sticky footer: column fills the viewport, content area grows,
                so the footer sits at the viewport bottom on short pages and
                right below the content on long pages. */}
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <AdminMenu />

                {trialStatus?.inTrial &&
                trialBannerDismissedStamp !== bannerStamp(trialStatus.exhausted) &&
                location.pathname !== "/trial-upgrade" ? (
                    // Premium trial banner — width matches the Polaris Page
                    // content column (62.375rem), never edge-to-edge.
                    <div
                        style={{
                            maxWidth: "62.375rem",
                            width: "100%",
                            margin: "0 auto",
                            padding: "16px 24px 0",
                            boxSizing: "border-box",
                        }}
                    >
                        <div
                            style={{
                                background: "#ffffff",
                                border: "1px solid #e3e3e3",
                                borderLeft: trialStatus.exhausted
                                    ? "4px solid #e8a200"
                                    : "4px solid #1a1a1a",
                                borderRadius: "12px",
                                boxShadow: "0 1px 3px rgba(16,24,40,0.06)",
                                padding: "16px 44px 16px 20px",
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                flexWrap: "wrap",
                                position: "relative",
                            }}
                        >
                            <button
                                type="button"
                                aria-label="Dismiss for today"
                                title="Hide until tomorrow"
                                onClick={dismissTrialBanner}
                                style={{
                                    position: "absolute",
                                    top: "10px",
                                    right: "10px",
                                    width: "26px",
                                    height: "26px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: "8px",
                                    border: "none",
                                    background: "transparent",
                                    color: "#616a75",
                                    fontSize: "16px",
                                    lineHeight: 1,
                                    cursor: "pointer",
                                }}
                            >
                                ✕
                            </button>
                            <div
                                style={{
                                    width: "42px",
                                    height: "42px",
                                    borderRadius: "50%",
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: trialStatus.exhausted
                                        ? "#fff4e0"
                                        : "#f2f3f5",
                                    fontSize: "20px",
                                }}
                            >
                                {trialStatus.exhausted ? "⏳" : "🎁"}
                            </div>

                            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: "14px",
                                        fontWeight: 650,
                                        color: "#1a1a1a",
                                        marginBottom: "3px",
                                    }}
                                >
                                    {trialStatus.exhausted
                                        ? "Your free trial minutes have been used"
                                        : `Free trial active — ${trialStatus.trialDaysRemaining} day${trialStatus.trialDaysRemaining === 1 ? "" : "s"} remaining`}
                                </div>
                                <div
                                    style={{
                                        fontSize: "13px",
                                        color: "#616a75",
                                        marginBottom: "8px",
                                    }}
                                >
                                    {trialStatus.exhausted
                                        ? `All ${trialStatus.trialMinutesLimit} free consultation minutes are used. Upgrade to continue instantly, or wait until the trial ends.`
                                        : `${trialStatus.trialMinutesUsed} of ${trialStatus.trialMinutesLimit} free consultation minutes used. Upgrade anytime for your plan's full minutes.`}
                                </div>
                                <div
                                    style={{
                                        height: "6px",
                                        borderRadius: "999px",
                                        background: "#eceef2",
                                        overflow: "hidden",
                                        maxWidth: "320px",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            width: `${Math.min(100, (trialStatus.trialMinutesUsed / (trialStatus.trialMinutesLimit || 1)) * 100)}%`,
                                            borderRadius: "999px",
                                            background: trialStatus.exhausted
                                                ? "#e8a200"
                                                : "#1a1a1a",
                                            transition: "width 0.3s ease",
                                        }}
                                    />
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: "10px",
                                    flexShrink: 0,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => navigate("/trial-upgrade")}
                                    style={{
                                        padding: "9px 18px",
                                        borderRadius: "10px",
                                        border: "none",
                                        background: "#1a1a1a",
                                        color: "#ffffff",
                                        fontWeight: 650,
                                        fontSize: "13px",
                                        cursor: "pointer",
                                    }}
                                >
                                    Upgrade Now
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate("/trial-upgrade")}
                                    style={{
                                        padding: "9px 16px",
                                        borderRadius: "10px",
                                        border: "1px solid #d5d8dc",
                                        background: "#ffffff",
                                        color: "#1a1a1a",
                                        fontWeight: 600,
                                        fontSize: "13px",
                                        cursor: "pointer",
                                    }}
                                >
                                    View details
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                <div style={{ flex: "1 0 auto" }}>
                    <PageFadeIn>
                        <Outlet context={{ adminIdLocal }} />
                    </PageFadeIn>
                </div>
                <Footer />
            </div>

            {toastActive && (
                <Toast
                    content="Saved successfully"
                    onDismiss={() => setToastActive(false)}
                />
            )}

            <Modal
                open={modalActive}
                onClose={() => setModalActive(false)}
                title="Contact support"
                primaryAction={{
                    content: "Send",
                    onAction: () => setModalActive(false),
                }}
            >
                <Modal.Section>
                    <FormLayout>
                        <TextField
                            label="Subject"
                            value={supportSubject}
                            onChange={setSupportSubject}
                        />
                        <TextField
                            label="Message"
                            value={supportMessage}
                            onChange={setSupportMessage}
                            multiline
                        />
                    </FormLayout>
                </Modal.Section>
            </Modal>

            {/* Global admin AI Assistant (floating button + drawer) */}
            <AiAssistantWidget />
        </AiAssistantProvider>
    );
}
