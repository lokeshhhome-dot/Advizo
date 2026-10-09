import { NavMenu } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import { useAppBridge } from "../components/createContext/AppBridgeContext";

export function AdminMenu() {
  const app = useAppBridge();
  const navigate = useNavigate();

  if (!app) return null;

  const handleNav = (e, path) => {
    e.preventDefault();        // ← full reload rokta hai
    navigate(path);            // ← React Router se client-side navigation
  };

  return (
    <NavMenu>
      <a href="/" rel="home" onClick={(e) => handleNav(e, "/")}>Dashboard</a>
      <a href="/consultants" onClick={(e) => handleNav(e, "/consultants")}>Consultants</a>
      <a href="/vouchers" onClick={(e) => handleNav(e, "/vouchers")}>Vouchers</a>
      <a href="/activity-history" onClick={(e) => handleNav(e, "/activity-history")}>Activity history</a>
      <a href="/wallet-management" onClick={(e) => handleNav(e, "/wallet-management")}>Wallet Management</a>
      <a href="/withdrawal-request" onClick={(e) => handleNav(e, "/withdrawal-request")}>Withdrawal Requests</a>
      <a href="/revenue-management" onClick={(e) => handleNav(e, "/revenue-management")}>Revenue Management</a>
      {/* <a href="/billings" onClick={(e) => handleNav(e, "/billings")}>Billing</a> */}
      <a href="/settings" onClick={(e) => handleNav(e, "/settings")}>Settings</a>
    </NavMenu>
  );
}