import { useEffect } from "react";
import { getToken } from "firebase/messaging";
import { messaging } from "../firebase";


export default function FcmTokenWindow() {

    useEffect(() => {
        const run = async () => {
            try {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    return;
                }

                const fcmToken = await getToken(messaging, {
                    vapidKey: "BB8E-fAs8w3xZZ3cL_R3jjnTHaNDu4LGcra1NJhX60UG0lxvzBHVzzblrvv7cm6FMaGo_o_r2hbiB1eibrtg1h0"
                });

                const params = new URLSearchParams(window.location.search);
                const userId = params.get("userId");
                const shopId = params.get("shopId");

                // 4️⃣ Backend API call
                await fetch(`${process.env.REACT_APP_BACKEND_HOST}/save-fcm-token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId,
                        shopId,
                        token: fcmToken
                    })
                });
                if (window.opener) {
                    window.opener.postMessage(
                        { tokenGenerated: true, },
                        window.location.origin

                    );
                }

                // optional: window close
                window.close();


            } catch (err) {
                console.log("❌ FCM ERROR:", err);
            }
        };

        run();
    }, []);

    return (
        <div style={{ padding: 30, textAlign: "center" }}>
            <div className="page-loader">
                <div className="loader-container">
                    <div className="loader-spinner"></div>
                    <p className="loader-text">Loading </p>
                </div>
            </div>
        </div>
    );
}
