import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { useAppBridge } from "../createContext/AppBridgeContext";
import { getAppBridgeToken } from "../../utils/getAppBridgeToken";

const AppStatusBillingContext = createContext(null);

const BILLING_CACHE_KEY = "consultly_billing_ok";
// Only a PAID verdict is ever cached (short TTL). "Unpaid" is never cached,
// so the pricing gate can't be bypassed by stale data.
const BILLING_CACHE_TTL_MS = 5 * 60 * 1000;

const readBillingCache = () => {
    try {
        const raw = sessionStorage.getItem(BILLING_CACHE_KEY);
        if (!raw) return false;
        const { at } = JSON.parse(raw);
        return Date.now() - at < BILLING_CACHE_TTL_MS;
    } catch {
        return false;
    }
};

export const AppStatusBillingProvider = ({ children }) => {
    const app = useAppBridge();

    const [isPaid, setIsPaid] = useState(() => readBillingCache());
    const [loading, setLoading] = useState(() => !readBillingCache());

    useEffect(() => {
        if (!app) return;
        let cancelled = false;

        const resolveAdminId = async (token) => {
            const stored = localStorage.getItem("consultly");
            if (stored) return stored;

    
            const params = new URLSearchParams(window.location.search);
            const shop = params.get("shop") || localStorage.getItem("shop");
            if (!shop) return null;

            const response = await axios.get(
                `${process.env.REACT_APP_BACKEND_HOST}/app/install/${shop}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const adminId = response?.data?.adminId;
            if (adminId) localStorage.setItem("consultly", adminId);
            return adminId || null;
        };

        const fetchBillingStatus = async () => {
            try {
                const token = await getAppBridgeToken(app);
                const adminId = await resolveAdminId(token);
                if (!adminId) {
                    sessionStorage.removeItem(BILLING_CACHE_KEY);
                    if (!cancelled) setIsPaid(false);
                    return;
                }

                const response = await axios.get(
                    `${process.env.REACT_APP_BACKEND_HOST}/admin/shop/billing-status/${adminId}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const planStatus = response?.data?.data?.planStatus;
                const paid = planStatus === "ACTIVE";
                if (paid) {
                    sessionStorage.setItem(
                        BILLING_CACHE_KEY,
                        JSON.stringify({ at: Date.now() }),
                    );
                } else {
                    sessionStorage.removeItem(BILLING_CACHE_KEY);
                }
                if (!cancelled) setIsPaid(paid);
            } catch (err) {
                console.error("Billing check failed", err);
                sessionStorage.removeItem(BILLING_CACHE_KEY);
                if (!cancelled) setIsPaid(false);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchBillingStatus();
        return () => {
            cancelled = true;
        };
    }, [app]);

    return (
        <AppStatusBillingContext.Provider value={{ isPaid, loading }}>
            {children}
        </AppStatusBillingContext.Provider>
    );
};

export const useAppStatusBilling = () => useContext(AppStatusBillingContext);
