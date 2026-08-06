import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import styles from "../../components/ClientDashbord/ProfileSection.module.css";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserDetailsByIds } from "../Redux/slices/UserSlices";
import { notifySocketUserReady } from "../Sokect-io/SokectConfig";
import { prepareSessionLogin, SESSION_TYPES } from "../../utils/browserSession";
import SignInRequired from "./SignInRequired";

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";

const NAV_ITEMS = [
  { to: "voucher", label: "Wallet" },
  { to: "history", label: "History" },
  { to: "call-chat-logs", label: "Call & Chat Logs" },
  { to: "support", label: "Support" },
];

const ProfileSection = () => {
  const location = useLocation();
  const [userId, setUserId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [voucherData, setVoucherData] = useState(null);
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop") || localStorage.getItem("shop") || "";
  const shop_id = params.get("shopId");
  const userId_params = params.get("userId");
  const authToken = params.get("authToken");
  // The proxy sets this when it could resolve no signed-in customer — neither
  // from Shopify's logged_in_customer_id nor from our own session cookie. It is
  // authoritative, so there is no risk of flashing the sign-in panel at a
  // customer who is actually logged in.
  const requiresLogin = params.get("requiresLogin") === "1";
  // Guards against showing the panel during the one render before the
  // localStorage lookup below has run.
  const [identityChecked, setIdentityChecked] = useState(false);
  const dispatch = useDispatch();
  const { userDetails } = useSelector((state) => state.users);
  const walletBalance = userDetails?.data?.walletBalance;
  const fullname = userDetails?.data?.fullname || "";
  const email = userDetails?.data?.email || "";

  useEffect(() => {
    if (userId_params && shop_id) {
      prepareSessionLogin(SESSION_TYPES.USER);
      localStorage.setItem("client_u_Identity", userId_params);
      localStorage.setItem("shop_o_Identity", shop_id);
      if (authToken) {
        localStorage.setItem("token", authToken);
      }
      notifySocketUserReady();
    }
  }, [userId_params, shop_id, authToken]);

  useEffect(() => {
    const adminId = localStorage.getItem("client_u_Identity");
    const shopId = localStorage.getItem("shop_o_Identity");
    if (adminId && shopId) {
      setUserId(adminId);
      setShopId(shopId);
    }
    setIdentityChecked(true);
  }, []);

  useEffect(() => {
    const resolvedUserId = userId || userId_params;
    if (!resolvedUserId) return;

    const token = localStorage.getItem("token");
    const shopIdStored = localStorage.getItem("shop_o_Identity");
    if (!token && !shopIdStored && !shop_id) return;

    dispatch(fetchUserDetailsByIds(resolvedUserId));
  }, [dispatch, userId, userId_params, shop_id, authToken]);

  // Keep the parent storefront iframe sized to this page's content: report on
  // route changes AND whenever content grows/shrinks (lists loading, forms
  // opening), not just once after mount.
  useEffect(() => {
    const sendHeight = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      if (window.parentIFrame) {
        window.parentIFrame.size(height);
      }
      if (window.parent) {
        window.parent.postMessage({ type: "AGORA_IFRAME_HEIGHT", height }, "*");
      }
    };

    const id = setTimeout(sendHeight, 300);
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);

    return () => {
      clearTimeout(id);
      observer.disconnect();
    };
  }, [location.pathname]);

  // No customer identity → explain and offer sign-in, in place. Rendering the
  // profile shell here would show an empty "—" card with a 0.00 wallet, and
  // redirecting from here is what sent shoppers to accounts.shopify.com.
  const resolvedUserId = userId || userId_params;
  if (requiresLogin || (identityChecked && !resolvedUserId)) {
    return (
      <SignInRequired shop={shop} returnTo="/apps/consultly/profile" />
    );
  }

  return (
    <div className={styles.profileSection}>
      {/* Left: identity card */}
      <aside className={styles.profileSectionHeader}>
        <h1 className={styles.profileTitle}>My Profile</h1>

        <div className={styles.profileImageContainer}>
          <div className={styles.profileAvatar} aria-hidden="true">
            {getInitials(fullname)}
          </div>
        </div>

        <div className={styles.profileIdentity}>
          <span className={styles.profileFullName}>{fullname || "—"}</span>
          <span className={styles.profileEmail}>{email || "—"}</span>
        </div>

        <div className={styles.walletCard}>
          <span className={styles.walletLabel}>Wallet balance</span>
          <span className={styles.walletValue}>
            {walletBalance !== undefined && walletBalance !== null
              ? Number(walletBalance).toFixed(2)
              : "0.00"}
          </span>
        </div>
      </aside>

      {/* Right: tabbed content */}
      <section className={styles.profileRight}>
        <nav className={styles.profileNav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive
                  ? `${styles.profileNavButton} ${styles.profileNavButtonActive}`
                  : styles.profileNavButton
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.profileContent}>
          <Outlet context={{ shop, userId, shopId, walletBalance, voucherData }} />
        </div>
      </section>
    </div>
  );
};

export default ProfileSection;
