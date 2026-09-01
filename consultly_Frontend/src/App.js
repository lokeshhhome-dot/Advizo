import React, { Fragment, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useDispatch } from "react-redux";
import {
  verifyToken,
  setAuthChecked,
} from "./components/Redux/slices/authConsultantSlice";
import {
  getConsultantToken,
  isConsultantSurface,
} from "./utils/consultantAuth";
import ConsultantPublicRoute from "./components/ProtectRoute/ConsultantPublicRoute";
import VideoCallProtectedRoute from "./components/ProtectRoute/VideoCallProtectedRoute";
import { useAppBridge } from "./components/createContext/AppBridgeContext";
import { UseAppInstall } from "./components/ProtectRoute/UseAppInstall";

import ProtectAdminRoute from "./components/ProtectRoute/ProtectAdminRoute";
import ProtectStoreFront from "./components/ProtectRoute/ProtectStoreFront";
import ConsultantProtectedRoute from "./components/ProtectRoute/ConsultantProtectedRoute";
import { BillingProtectedRoute } from "./components/ProtectRoute/BillingProtectedRoute";

import "./App.css";
import { RouteLoadingFallback } from "./components/loading/PageSkeletons";
import SetupGuideProtectRoutes from "./components/ProtectRoute/setupGuideProtectRoutes";

/* ---------- Lazy Loaded Pages ---------- */

const LayoutFrame = lazy(() => import("./pages/LayoutFrame"));
const TrialUpgrade = lazy(() => import("./pages/TrialUpgrade"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ConsultantList = lazy(() => import("./pages/ConsultantList"));
const AddConsultant = lazy(() => import("./pages/AddConsultant"));
const Faq = lazy(() => import("./pages/Faq"));
const Voucher = lazy(() => import("./pages/Voucher"));
const History = lazy(() => import("./pages/History"));
const VoucherSettings = lazy(() => import("./pages/VoucherSettings"));
const VoucherTable = lazy(() => import("./pages/VoucherTable"));
const WithdrawalRequest = lazy(() => import("./pages/WithdrawalRequest"));
const AccountInformation = lazy(() => import("./pages/AccountInformation"));
const UserTransHistory = lazy(() => import("./pages/UserTransHistory"));
const ManualDebetCreditBlance = lazy(
  () => import("./pages/ManualDebetCreditBlance"),
);
const AdminPercentage = lazy(() => import("./pages/AdminPercentage"));
const ConsultantCardTheme = lazy(() => import("./pages/ConsultantCardTheme"));
const EditorSettings = lazy(() => import("./pages/EditorSettings"));
const RevenuManagement = lazy(() => import("./pages/RevenuManagement"));
const ConsultantSupportInbox = lazy(() => import("./pages/ConsultantSupportInbox"));
const NotFound = lazy(() => import("./pages/NotFound"));



const ConsultantCards = lazy(
  () => import("./components/ConsultantCards/ConsultantCards"),
);
const ViewProfile = lazy(
  () => import("./components/ConsultantCards/ViewProfile"),
);

const TabNavigation = lazy(
  () => import("./components/ConsultantDashboard/TabNavigation"),
);
const DashboardPage = lazy(
  () => import("./components/ConsultantDashboard/DashboardPage"),
);
const ConsultantProfilePage = lazy(
  () => import("./components/ConsultantDashboard/ConsultantProfilePage"),
);
const ChatsPage = lazy(
  () => import("./components/ConsultantDashboard/ChatsPage"),
);
const CallLogsConsultant = lazy(
  () => import("./components/ConsultantDashboard/CallChatLogsConsultant"),
);
const ConsultantWalletLogs = lazy(
  () => import("./components/ConsultantDashboard/ConsultantWalletLogs"),
);
const WithdrawalRequestForm = lazy(
  () => import("./components/ConsultantDashboard/WithdrawalRequestForm"),
);
const WithdrawalRequestTable = lazy(
  () => import("./components/ConsultantDashboard/WithdrawalRequestTable"),
);
const ConsultantSupportPage = lazy(
  () => import("./components/ConsultantDashboard/ConsultantSupportPage"),
);

const VideoCallingPage = lazy(
  () => import("./components/ConsultantDashboard/VideoCallingPage"),
);

const UserChat = lazy(() => import("./components/ClientDashbord/UserChat"));
const ProfileSection = lazy(
  () => import("./components/ClientDashbord/ProfileSection"),
);
const CallChatLogs = lazy(() => import("./pages/CallChatLogs"));
const UserSupport = lazy(
  () => import("./components/ClientDashbord/UserSupport"),
);

const LoginForm = lazy(
  () => import("./components/ConsultantDashboard/LoginForm"),
);

const GlobalMessageNotification = lazy(
  () => import("./components/AlertModel/GlobalMessageNotification"),
);
const IncomingCallAlert = lazy(
  () => import("./components/AlertModel/IncommingCallAlert"),
);
const PushCallIncoming = lazy(
  () => import("./components/AlertModel/PushCallIncoming"),
);
const FcmTokenWindow = lazy(() => import("./firebase/utils/FcmTokenWindow"));



export default function App() {
  const dispatch = useDispatch();

  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop");

  const app = useAppBridge();
  const { installed } = UseAppInstall(shop, app);


  useEffect(() => {
    // Only consultant surfaces may run the consultant verify. On a customer
    // storefront page the same "token" key holds a CUSTOMER JWT, and putting it
    // through /api-consultant/verify-token guarantees a 401 whose fallout used
    // to clear the shopper's storefront identity keys.
    if (isConsultantSurface() && getConsultantToken()) {
      dispatch(verifyToken());
    } else {
      dispatch(setAuthChecked());
    }
  }, [dispatch]);


  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.data?.type) return;

      if (event.data.type === "SHOW_TOAST") {
        fetch("/logMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event.data),
        }).catch(console.error);
      }

      // CONSULTLY_CHAT_OPEN / CONSULTLY_CHAT_CLOSE are sent BY this app
      // (ConsultantChatModal.js) via window.parent.postMessage — they
      // target the PARENT document (this iframe's parent window), not
      // this iframe itself, so this listener (bound to this iframe's own
      // `window`) never actually receives them back. The real handling —
      // resizing the <iframe> element to fullscreen — lives in the parent
      // document's own listener: proxyThemeAssetsController and
      // renderShopifyPage in the backend, not here. These two branches are
      // intentional no-ops, kept only so both message types are documented
      // in the one place this app's postMessage contract is dispatched.
      if (
        event.data.type === "CONSULTLY_CHAT_OPEN" ||
        event.data.type === "CONSULTLY_CHAT_CLOSE"
      ) {
        // No-op here by design — see comment above.
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const getPageHeight = () =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

  const sendHeightToParent = () => {
    if (!window.parent) return;

    window.parent.postMessage(
      {
        type: "AGORA_IFRAME_HEIGHT",
        height: getPageHeight(),
      },
      "*",
    );
  };

  useEffect(() => {
    sendHeightToParent();

    const observer = new ResizeObserver(() => {
      sendHeightToParent();
    });

    observer.observe(document.body);

    return () => observer.disconnect();
  }, []);

  return (
    <Fragment>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <GlobalMessageNotification />
          <IncomingCallAlert />

          <Routes>
            {/* -------- Admin -------- */}
 {/* // <BillingProtectedRoute></BillingProtectedRoute> use after protect route  */}
            <Route
              element={
                <ProtectAdminRoute installed={installed}>
                 
                     <SetupGuideProtectRoutes>
                      <LayoutFrame />
                     </SetupGuideProtectRoutes>
                </ProtectAdminRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/consultant-list" element={<ConsultantList />} />
              <Route
                path="/consultant-list/add-consultant"
                element={<AddConsultant />}
              />
              <Route path="/history" element={<UserTransHistory />} />
              <Route
                path="/wallet-management"
                element={<ManualDebetCreditBlance />}
              />
              <Route
                path="/withdrawal-request"
                element={<WithdrawalRequest />}
              />
              <Route path="/trial-upgrade" element={<TrialUpgrade />} />
              <Route
                path="/consultant-support"
                element={<ConsultantSupportInbox />}
              />
              <Route
                path="/account-information"
                element={<AccountInformation />}
              />
              <Route
                path="/voucher-management/voucher"
                element={<VoucherSettings />}
              />
              <Route path="/voucher-management" element={<VoucherTable />} />
              <Route path="/admin-percentage" element={<AdminPercentage />} />
              <Route path="/editor/consultant-card-theme" element={<ConsultantCardTheme />} />
              <Route path="/editor" element={<EditorSettings />} />
              <Route
                path="/revenue-management"
                element={<RevenuManagement />}
              />
              <Route path="/faq" element={<Faq />} />
            </Route>

            {/* -------- Storefront -------- */}

            <Route
              path="/consultant-cards"
              element={
                <ProtectStoreFront>
                  <ConsultantCards />
                </ProtectStoreFront>
              }
            />

            <Route
              path="/view-profile"
              element={
                <ProtectStoreFront>
                  <ViewProfile />
                </ProtectStoreFront>
              }
            />

            {/* -------- Consultant Dashboard -------- */}

            <Route
              path="/consultant-dashboard/*"
              element={
                <ConsultantProtectedRoute>
                  <TabNavigation />
                </ConsultantProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="profile" element={<ConsultantProfilePage />} />
              <Route path="chats/:chatId?" element={<ChatsPage />} />
              <Route path="call-chat-logs" element={<CallLogsConsultant />} />
              <Route
                path="consultant-wallet-logs"
                element={<ConsultantWalletLogs />}
              />
              <Route
                path="withdrawal-request"
                element={<WithdrawalRequestForm />}
              />
              <Route
                path="withdrawal-request-table"
                element={<WithdrawalRequestTable />}
              />
              <Route path="support" element={<ConsultantSupportPage />} />
            </Route>

            {/* -------- Video Calling -------- */}

            <Route
              path="/video/calling/page"
              element={
                <VideoCallProtectedRoute>
                  <VideoCallingPage />
                </VideoCallProtectedRoute>
              }
            />

            {/* -------- Client -------- */}

            <Route
              path="/chats"
              element={
                <ProtectStoreFront loadingVariant="spinner">
                  <UserChat />
                </ProtectStoreFront>
              }
            />

            <Route
              path="/login"
              element={
                <ProtectStoreFront>
                  <ConsultantPublicRoute>
                    <LoginForm />
                  </ConsultantPublicRoute>
                </ProtectStoreFront>
              }
            />

            <Route path="/fcm-token" element={<FcmTokenWindow />} />

            <Route
              path="/profile"
              element={
                <ProtectStoreFront>
                  <ProfileSection />
                </ProtectStoreFront>
              }
            >
              <Route index element={<Voucher />} />
              <Route path="voucher" element={<Voucher />} />
              <Route path="history" element={<History />} />
              <Route path="call-chat-logs" element={<CallChatLogs />} />
              <Route path="support" element={<UserSupport />} />
            </Route>

            <Route path="/push-call-incoming" element={<PushCallIncoming />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </Fragment>
  );
}
