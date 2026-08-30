import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { verifyToken } from "../Redux/slices/authConsultantSlice";
import {
  getConsultantToken,
  redirectToConsultantLogin,
} from "../../utils/consultantAuth";

const ConsultantProtectedRoute = ({ children }) => {
  const dispatch = useDispatch();
  const { isAuthenticated, loading } = useSelector(
    (state) => state.authConsultant,
  );

  useEffect(() => {
    const token = getConsultantToken();
    if (!token) return;
    if (!isAuthenticated) {
      dispatch(verifyToken());
    }
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      // TEMPORARY diagnostic — tracing the login<->dashboard loop.
      console.log(
        `[Consultly Auth] redirecting to login because = loading finished and isAuthenticated is still false (verify-token did not succeed on this page load)`,
      );
      redirectToConsultantLogin();
    }
  }, [loading, isAuthenticated]);

  // The initial boot/auth-restore gap is covered by the static Advizo
  // loader painted directly in public/index.html (before React even mounts,
  // on /consultant-dashboard* paths only) — this used to render a generic
  // Polaris skeleton here, which raced with / showed underneath that loader.
  // Rendering nothing lets the boot loader own this moment cleanly; it is
  // removed once TabNavigation signals real readiness via
  // window.__advizoReady().
  if (loading || !isAuthenticated) {
    return null;
  }

  return children;
};

export default ConsultantProtectedRoute;
