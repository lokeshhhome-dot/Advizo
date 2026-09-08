import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "bootstrap/dist/css/bootstrap.min.css";
import "@shopify/polaris/build/esm/styles.css";

import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { Provider } from "react-redux";
import { store } from "./components/Redux/store/store";
import { AppBridgeProvider } from "./components/createContext/AppBridgeContext";
import SocketProvider from "./components/Sokect-io/sokectProvider";
import { AppStatusProvider } from "./components/ProtectRoute/AppStatusProvider";
import { AppStatusBillingProvider } from "./components/ProtectRoute/AppStatusBillingProvider";
import ToastProvider from "./components/AlertModel/ToastProvider";
import { SetupGuideProvider } from "./components/ProtectRoute/SetupGuideProvider";
import { setupConsultantAuthInterceptor } from "./utils/setupConsultantAuthInterceptor";
import { enforcePageSession } from "./utils/browserSession";

setupConsultantAuthInterceptor();
enforcePageSession();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/firebase-messaging-sw.js")
    .catch((err) => console.error("SW registration failed:", err));
}
const isShopifyAdmin = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("host");
};

// TEMPORARY diagnostics — tracing the admin.shopify.com redirect bug on the
// standalone consultant portal. Safe to log: no tokens/passwords/secrets.
// Remove once the fix (moving app-bridge.js out of public/index.html into
// AppBridgeContext.js's conditional injection) is confirmed working.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  const admin = isShopifyAdmin();
  console.log(`[advizo Frontend] pathname = ${window.location.pathname}`);
  console.log(`[advizo Frontend] search = ${window.location.search}`);
  console.log(`[advizo Frontend] host param present = ${params.has("host")}`);
  console.log(`[advizo Frontend] shop param = ${params.get("shop")}`);
  console.log(`[advizo Frontend] isShopifyAdmin = ${admin}`);
  console.log(`[advizo Frontend] AppBridge enabled = ${admin}`);
  console.log(`[advizo Frontend] current href = ${window.location.href}`);
}

const AppWrapper = ({ children }) => {
  if (isShopifyAdmin()) {
    return <AppBridgeProvider>{children}</AppBridgeProvider>;
  }
  return <>{children}</>; // store frontend → no AppBridge
};

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <AppWrapper>
    <PolarisAppProvider i18n={en}>
      <ToastProvider>
        <Provider store={store}>
          <SocketProvider>
            <AppStatusProvider>
              <AppStatusBillingProvider>
                <SetupGuideProvider>
                <App />
                </SetupGuideProvider>
              </AppStatusBillingProvider>
            </AppStatusProvider>
          </SocketProvider>
        </Provider>
      </ToastProvider>
    </PolarisAppProvider>
  </AppWrapper>,
);

if (process.env.NODE_ENV === "development") {
  const hideErrorOverlay = () => {
    const overlay = document.getElementById("react-error-overlay");
    if (overlay) {
      overlay.style.display = "none";
      overlay.remove();
    }

    const iframe = document.querySelector('iframe[id*="webpack-dev-server"]');
    if (iframe) {
      iframe.style.display = "none";
    }

    const errorDivs = document.querySelectorAll("div");
    errorDivs.forEach((div) => {
      if (
        div.textContent &&
        div.textContent.includes("Uncaught runtime errors")
      ) {
        div.style.display = "none";
        div.remove();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideErrorOverlay);
  } else {
    hideErrorOverlay();
  }

  const observer = new MutationObserver(() => {
    hideErrorOverlay();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also check periodically
  setInterval(hideErrorOverlay, 500);
}
