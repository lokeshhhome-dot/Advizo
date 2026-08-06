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
