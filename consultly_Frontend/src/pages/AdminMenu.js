// import { NavMenu } from "@shopify/app-bridge-react";
// import { useAppBridge } from "../components/createContext/AppBridgeContext";

// export function AdminMenu() {
//   const app = useAppBridge();
//   if (!app) {
//     console.warn(
//       "⚠️ AdminMenu: App Bridge not initialized, NavMenu will not render",
//     );
//     return null;
//   }

//   return (
//     <NavMenu>
//       {/* First link must have rel="home" and href="/" for home route */}
//       <a href="/" rel="home">
//         Dashboard{" "}
//       </a>
//       <a href="/consultant-list">Consultant List</a>
//       <a href="/admin-percentage">Admin Charges</a>
//       <a href="/voucher-management">Voucher Management</a>
//       <a href="/history"> Activity History</a>
//       <a href="/wallet-management">Wallet Management</a>
//       <a href="/withdrawal-request">Withdrawal Request</a>
//       <a href="/revenue-management">Revenue Management</a>
//       <a href="/account-information">Account Info</a>
//       <a href="/faq">FAQ</a>
//     </NavMenu>
//   );
// }


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
      <a href="/consultant-list" onClick={(e) => handleNav(e, "/consultant-list")}>Consultants</a>
      <a href="/admin-percentage" onClick={(e) => handleNav(e, "/admin-percentage")}>Commission</a>
      <a href="/voucher-management" onClick={(e) => handleNav(e, "/voucher-management")}>Vouchers</a>
      <a href="/history" onClick={(e) => handleNav(e, "/history")}>Activity History</a>
      <a href="/wallet-management" onClick={(e) => handleNav(e, "/wallet-management")}>Wallet Management</a>
      <a href="/withdrawal-request" onClick={(e) => handleNav(e, "/withdrawal-request")}>Withdrawal Requests</a>
      <a href="/consultant-support" onClick={(e) => handleNav(e, "/consultant-support")}>Support Inbox</a>
      <a href="/revenue-management" onClick={(e) => handleNav(e, "/revenue-management")}>Revenue Management</a>
      <a href="/account-information" onClick={(e) => handleNav(e, "/account-information")}>Billing</a>
      <a href="/faq" onClick={(e) => handleNav(e, "/faq")}>FAQ</a>
    </NavMenu>
  );
}