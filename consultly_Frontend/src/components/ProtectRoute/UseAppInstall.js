// hooks/useAppInstall.js
import { useState, useEffect } from "react";
import { Redirect } from "@shopify/app-bridge/actions";
import { Navigate } from "react-router-dom";
import { getAppBridgeToken } from "../../utils/getAppBridgeToken";
import {
  prepareSessionLogin,
  SESSION_TYPES,
} from "../../utils/browserSession";

const installCacheKey = (shop) => `consultly_install_ok::${shop}`;

export const UseAppInstall = (shop, app) => {
    // Stale-while-revalidate: if this browser session already confirmed the
    // install for this shop, render immediately and re-verify in background
    // instead of blocking the whole app on the network round-trip.
    const [installed, setInstalled] = useState(() => {
        if (!shop) return false;
        const cached = sessionStorage.getItem(installCacheKey(shop));
        if (cached) {
            prepareSessionLogin(SESSION_TYPES.ADMIN);
            if (cached !== "1") {
                localStorage.setItem("consultly", cached);
            }
            return true;
        }
        return false;
    });
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {

        const checkInstall = async () => {
            if (!shop.endsWith(".myshopify.com")) {
                <Navigate to="/not-found" />
                return;
            }
            const token = await getAppBridgeToken(app);
            try {
                const response = await fetch(
                    `${process.env.REACT_APP_BACKEND_HOST}/app/install/begin${shop}`
                    , {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                const data = await response.json();
                if (!data.installed && data.installUrl) {
                    sessionStorage.removeItem(installCacheKey(shop));
                    const redirect = Redirect.create(app);
                    redirect.dispatch(Redirect.Action.REMOTE, data.installUrl);
                    return;
                }
                if (data.installed) {
                    // Admin app embed always takes over this browser session.
                    prepareSessionLogin(SESSION_TYPES.ADMIN);
                    if (data.adminId) {
                        localStorage.setItem("consultly", data.adminId);
                    }
                    sessionStorage.setItem(
                        installCacheKey(shop),
                        data.adminId || "1",
                    );
                    setInstalled(true);
                }
            } catch (error) {
                setAccessDenied(true);
                console.log("error", error);
            }
        };
        if (shop) checkInstall();
    }, [shop, app]);

    return { installed, accessDenied };
};
