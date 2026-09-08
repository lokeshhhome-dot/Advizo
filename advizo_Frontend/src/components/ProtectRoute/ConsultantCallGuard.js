import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { verifyToken } from "../Redux/slices/authConsultantSlice";
import {
  adoptCallWindowToken,
  getConsultantToken,
  redirectToConsultantLogin,
} from "../../utils/consultantAuth";

/**
 * Lightweight guard for the call page — only requires a JWT to be present.
 *
 * Two rules make this safe for a live call:
 *  1. The token is resolved from the call URL first (`authToken`), then from
 *     storage. The accept flow forwards it precisely so a window with cold or
 *     partitioned localStorage can still authenticate.
 *  2. The decision is taken ONCE, at mount. A later verify failure — network
 *     blip, slow backend, cross-tab role switch — must never throw the
 *     consultant out of a call that is already running.
 */
const ConsultantCallGuard = ({ children }) => {
  const dispatch = useDispatch();
  const [token] = useState(
    () => adoptCallWindowToken() || getConsultantToken(),
  );

  useEffect(() => {
    if (token) {
      dispatch(verifyToken());
    } else {
      console.warn("[call-guard] no consultant token in call URL or storage");
      redirectToConsultantLogin();
    }
  }, [dispatch, token]);

  if (!token) return null;

  return children;
};

export default ConsultantCallGuard;
