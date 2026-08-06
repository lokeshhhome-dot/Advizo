// src/hooks/useFcmToken.js
import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { messaging } from "../firebase";

/**
 * useFcmToken(userId, vapidKey)
 * - userId: your app user id (to store token against)
 * - vapidKey: Public VAPID key from Firebase Console (Web Push)
 */
export default function useFcmToken(userId, vapidKey) {
    const [fcmToken, setFcmToken] = useState(null);

    useEffect(() => {
        if (!userId || !vapidKey) return;

        let unsubOnMessage = null;

        async function register() {
            try {
                // 1) Ask permission using utility function
             

                // 2) Get token
                const currentToken = await getToken(messaging, { vapidKey });
                if (currentToken) {
                    setFcmToken(currentToken);

                    // 3) Send token to your backend to save (replace URL)
                    try {
                        await fetch("/api/save-fcm-token", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId, token: currentToken }),
                        });
                    } catch (err) {
                        console.error("Failed to save token to backend", err);
                    }
                } else {
                    console.log("No registration token available. Request permission to generate one.");
                }

                // 4) Handle foreground messages
                unsubOnMessage = onMessage(messaging, (payload) => {
                    // show in-app toast / UI here (this runs when page open)
                });
            } catch (err) {
                console.error("FCM registration error", err);
            }
        }

        register();

        return () => {
            if (typeof unsubOnMessage === "function") unsubOnMessage();
        };
    }, [userId, vapidKey]);

    return fcmToken;
}
