import React from "react";
import { useAppBridge } from "../createContext/AppBridgeContext";

const AdminProtectRoute = ({ children }) => {
    const app = useAppBridge();

    if (!app) {
        // Invalid access → show message instead of rendering children
        return (
            <div style={{ padding: 40, textAlign: "center" }}>
                <h2>Unauthorized Access</h2>
                <p>This app must be opened from Shopify Admin.</p>
            </div>
        );
    }

    return children;
};

export default AdminProtectRoute;
