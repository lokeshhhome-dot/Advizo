import axios from "axios";
import { store } from "../components/Redux/store/store";
import { logout } from "../components/Redux/slices/authConsultantSlice";
import {
  clearConsultantSession,
  getConsultantToken,
  redirectToConsultantLogin,
  shouldPreserveSessionForCall,
} from "./consultantAuth";
import { getActiveSession, SESSION_TYPES } from "./browserSession";

let interceptorInstalled = false;

// Only attach the token to requests aimed at our own backend — never to Shopify
// or other third-party hosts (prevents token leakage).
const BACKEND_HOST = process.env.REACT_APP_BACKEND_HOST || "";

const targetsBackend = (config) => {
  if (!BACKEND_HOST) return false;
  const url = String(config?.url || "");
  const base = String(config?.baseURL || "");
  return url.startsWith(BACKEND_HOST) || base.startsWith(BACKEND_HOST);
};

export const setupConsultantAuthInterceptor = () => {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  // Attach the app JWT to every backend request so protected endpoints
  // authenticate the caller (customer or consultant). Existing explicit
  // Authorization headers are preserved.
  axios.interceptors.request.use(
    (config) => {
      try {
        if (targetsBackend(config) && !config.headers?.Authorization) {
          const token =
            localStorage.getItem("token") || getConsultantToken();
          if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
      } catch (_) {
        /* never block a request because of token lookup */
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;
      const requestUrl = String(error.config?.url || "");

      // Only bounce to the consultant login when this browser is actually in
      // a CONSULTANT session. The "token" key is shared with customers, so a
      // 401 from an /api-consultant call on a CUSTOMER surface (chat header,
      // support tab) must never throw the customer onto the consultant login.
      if (
        status === 401 &&
        getConsultantToken() &&
        requestUrl.includes("/api-consultant") &&
        getActiveSession() === SESSION_TYPES.CONSULTANT
      ) {
        // A call in progress outranks a 401 from a background request. Tearing
        // the session down here would navigate the whole call window to the
        // login page mid-conversation.
        if (shouldPreserveSessionForCall()) {
          console.warn(
            "[auth] 401 ignored on the call surface — session preserved",
          );
        } else {
          store.dispatch(logout());
          clearConsultantSession();
          redirectToConsultantLogin();
        }
      }

      return Promise.reject(error);
    },
  );
};
