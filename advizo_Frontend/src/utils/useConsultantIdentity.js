import { useSelector } from "react-redux";
import {
  CONSULTANT_USER_ID_KEY,
  CONSULTANT_SHOP_ID_KEY,
} from "./consultantAuth";

/**
 * Single source of truth for the authenticated consultant's identity.
 *
 * Primary source: the server-derived identity in Redux (populated by the
 * verifyToken thunk on app load — GET /api-consultant/verify-token, which
 * resolves the account from the verified JWT, never from client data).
 *
 * localStorage is only a FALLBACK for surfaces that open in a fresh window
 * (the call page) or render before verifyToken resolves. The backend never
 * trusts these IDs — every consultant API re-verifies them against the JWT
 * via assertConsultantSelf, and sockets derive identity from the handshake
 * token — so a tampered localStorage value can only break the tamperer's
 * own session, never grant access.
 */
export function useConsultantIdentity() {
  const user = useSelector((state) => state.authConsultant?.user);
  const loading = useSelector((state) => state.authConsultant?.loading);

  return {
    consultantId:
      user?.id || localStorage.getItem(CONSULTANT_USER_ID_KEY) || null,
    shopId:
      user?.shopId || localStorage.getItem(CONSULTANT_SHOP_ID_KEY) || null,
    name: user?.name || null,
    email: user?.email || null,
    role: user?.role || null,
    profileImage: user?.profileImage || null,
    isAuthenticated: Boolean(user?.id),
    loading: Boolean(loading),
  };
}
