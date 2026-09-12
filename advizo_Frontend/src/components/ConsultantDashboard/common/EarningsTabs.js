import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./EarningsTabs.module.css";

const TABS = [
  { label: "Transactions", path: "/consultant-dashboard/consultant-wallet-logs" },
  { label: "Withdraw", path: "/consultant-dashboard/withdrawal-request" },
  { label: "Withdrawal Activity-history", path: "/consultant-dashboard/withdrawal-request-table" },
];

/**
 * The Earnings workspace is really three existing routes (kept separate so
 * URLs/bookmarks never break), presented as one cohesive financial workspace
 * via a shared tab strip that just navigates between them.
 */
export default function EarningsTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className={styles.tabs}>
      {TABS.map((tab) => (
        <button
          key={tab.path}
          type="button"
          className={`${styles.tab} ${location.pathname === tab.path ? styles.tabActive : ""}`}
          onClick={() => navigate(tab.path)}
          aria-current={location.pathname === tab.path ? "page" : undefined}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
