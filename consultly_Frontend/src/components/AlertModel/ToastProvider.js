import { Frame, Toast } from "@shopify/polaris";
import { useCallback, useState } from "react";
import { ToastContext } from "./PolariesTostContext";

const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState({
        active: false,
        content: "",
        error: false,
    });

    const showToast = (message, error = false) => {
        setToast({
            active: true,
            content: message,
            error,
        });
    };

    const dismissToast = useCallback(() => {
        setToast((prev) => ({ ...prev, active: false }));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            <Frame>
                {toast.active && (
                    <Toast
                        content={toast.content}
                        error={toast.error}
                        onDismiss={dismissToast}
                        duration={3000}
                    />
                )}
                {children}
            </Frame>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
