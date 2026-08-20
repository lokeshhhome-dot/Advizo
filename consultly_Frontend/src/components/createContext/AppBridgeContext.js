import { createContext, useContext, useMemo, useEffect } from "react";
import createApp from "@shopify/app-bridge";
import { Navigate } from "react-router-dom";


export const AppBridgeContext = createContext(null);

export const useAppBridge = () => {
  const app = useContext(AppBridgeContext);
  return app;
};



export const AppBridgeProvider = ({ children }) => {
  const getHost = () => {
    const urlParams = new URLSearchParams(window.location.search);
    let host = urlParams.get("host");
    const shop = urlParams.get("shop");
    const adminId = urlParams.get("adminId");
    if (adminId) {
      localStorage.setItem("consultly", adminId);
    }

    if (host) {
      return host;
    }

    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      host = hashParams.get("host");
      if (host) {
        return host;
      }
    }

    if (!shop || !host) {
      console.warn("Missing shop or host parameter. App should be accessed through Shopify admin.");
    }

    return host || null;
  };

  const host = getHost();
  const apiKey = process.env.REACT_APP_SHOPIFY_API_KEY;

  const app = useMemo(() => {
    if (!host) {
      console.warn("App Bridge: Host parameter not found. App should be accessed through Shopify admin.");
      return null;
    }

    if (!apiKey) {
      console.error("App Bridge: REACT_APP_SHOPIFY_API_KEY is not set in environment variables.");
      return null;
    }

    try {
      const appInstance = createApp({
        apiKey: apiKey,
        host: host,
        forceRedirect: true,
        embedded: true,
      });


      return appInstance;
    } catch (error) {
      console.error("❌ Error initializing App Bridge:", error);
      return null;
    }
  }, [host, apiKey]);

  useEffect(() => {
    if (host && apiKey) {
    } else {
      <Navigate to="/not-found" />
    }
  }, [host, apiKey, app]);

  // shopify-api-key meta + app-bridge.js are loaded conditionally in
  // public/index.html itself (synchronous inline script, gated on the
  // `host` param) — not here. A React effect runs after mount, which is
  // too late for Shopify Admin's parent frame to pick up the meta tag for
  // TopBar/navigation negotiation, and caused degraded plain-link nav.
  // See public/index.html for the actual injection.

  return (
    <AppBridgeContext.Provider value={app}>
      {children}
    </AppBridgeContext.Provider>
  );
};

