import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { verifyToken } from "../Redux/slices/authConsultantSlice";
import {
  getConsultantToken,
  redirectToConsultantLogin,
} from "../../utils/consultantAuth";
import { ConsultantDashboardSkeleton } from "../loading/PageSkeletons";

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

  if (loading || !isAuthenticated) {
    return <ConsultantDashboardSkeleton />;
  }

  return children;
};

export default ConsultantProtectedRoute;
