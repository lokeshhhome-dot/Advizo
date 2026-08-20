import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { verifyToken } from "../Redux/slices/authConsultantSlice";
import {
  getConsultantToken,
  redirectToConsultantDashboard,
} from "../../utils/consultantAuth";
import { ConsultantDashboardSkeleton } from "../loading/PageSkeletons";

const ConsultantPublicRoute = ({ children }) => {
  const dispatch = useDispatch();
  const { isAuthenticated, loading } = useSelector(
    (state) => state.authConsultant,
  );

  useEffect(() => {
    const token = getConsultantToken();
    if (token && !isAuthenticated) {
      dispatch(verifyToken());
    }
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      // TEMPORARY diagnostic — tracing the login<->dashboard loop. This is
      // the "other half": /login auto-forwarding to the dashboard because a
      // fresh verify-token succeeded here, which is exactly what produces an
      // oscillation if the dashboard's OWN verify-token then fails.
      console.log(
        `[Consultly Auth] login page auto-redirecting to dashboard because = isAuthenticated is true here (verify-token succeeded on THIS page load)`,
      );
      redirectToConsultantDashboard();
    }
  }, [loading, isAuthenticated]);

  if (loading && getConsultantToken()) {
    return <ConsultantDashboardSkeleton />;
  }

  if (isAuthenticated) return <ConsultantDashboardSkeleton />;

  return children;
};

export default ConsultantPublicRoute;
