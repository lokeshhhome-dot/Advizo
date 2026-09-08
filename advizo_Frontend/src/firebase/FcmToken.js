// import { useEffect, useState } from "react";
// import { getToken, isSupported, onMessage } from "firebase/messaging";
// import firebaseApp, { messaging } from "./firebase";
// import axios from "axios";

// const vapidKey = "BB8E-fAs8w3xZZ3cL_R3jjnTHaNDu4LGcra1NJhX60UG0lxvzBHVzzblrvv7cm6FMaGo_o_r2hbiB1eibrtg1h0";

// /**
//  * Request FCM token in new window and handle the response
//  * @param {string} userId - User ID
//  * @param {string} shopId - Shop ID (optional)
//  * @param {object} callbacks - Callback functions
//  * @param {function} callbacks.onSuccess - Called when token is saved successfully
//  * @param {function} callbacks.onError - Called when token generation fails
//  * @param {function} callbacks.onStatusChange - Called when status changes
//  * @returns {function} Cleanup function to remove event listeners
//  */
// export const requestFcmTokenInNewWindow = (userId, shopId, callbacks = {}) => {
//     const { onSuccess, onError, onStatusChange } = callbacks;

//     // Update status    
//     if (onStatusChange) {
//         onStatusChange("Opening notification permission window...");
//     }

//     // Open new window for permission request and token generation
//     const tokenWindowUrl = `${window.location.origin}/fcm-token?userId=${encodeURIComponent(userId)}&shopId=${encodeURIComponent(shopId || '')}`;
//     const tokenWindow = window.open(tokenWindowUrl, 'fcmTokenWindow', 'width=600,height=500,scrollbars=yes');

//     if (!tokenWindow) {
//         // Popup blocked - try direct approach
//         if (onStatusChange) {
//             onStatusChange("Popup blocked. Trying direct permission request...");
//         }

//         // Try direct token generation
//         (async () => {
//             try {
//                 const isInIframe = window.self !== window.top;
//                 if (!isInIframe && Notification.permission === "default") {
//                     await Notification.requestPermission();
//                 }

//                 const fcmToken = await getToken(messaging, { vapidKey });

//                 if (fcmToken) {
//                     const backendHost = process.env.REACT_APP_BACKEND_HOST;
//                     await axios.post(`${backendHost}/api/save-fcm-token`, {
//                         shopId: shopId,
//                         userId: userId,
//                         token: fcmToken
//                     });

//                     if (onStatusChange) {
//                         onStatusChange("Token saved successfully!");
//                         console.log("Token saved successfully!");
//                     }
//                     if (onSuccess) {
//                         onSuccess({ token: fcmToken, userId, shopId });
//                     }
//                 } else {
//                     if (onStatusChange) {
//                         console.log("Token generation failed");
//                         onStatusChange("Token generation failed");
//                     }
//                     if (onError) {
//                         console.log("Token generation failed");
//                         onError("Token generation failed");
//                     }
//                 }
//             } catch (err) {
//                 console.error("❌ Direct token generation failed:", err);
//                 if (onStatusChange) {
//                     onStatusChange("Token generation failed, proceeding...");
//                 }
//                 if (onError) {
//                     onError(err.message);
//                 }
//             }
//         })();
//         return () => { }; // No cleanup needed
//     }

//     // Listen for message from token window
//     let timeoutId;
//     const handleMessage = (event) => {
//         // Verify origin for security
//         if (event.origin !== window.location.origin) {
//             return;
//         }

//         // Clear timeout since we got a response
//         if (timeoutId) {
//             clearTimeout(timeoutId);
//         }

//         if (event.data.type === "FCM_TOKEN_SAVED") {
//             console.log("✅ Token saved successfully:", event.data);

//             if (onStatusChange) {
//                 onStatusChange("Token saved successfully! Redirecting...");
//             }

//             // Close token window if still open
//             if (tokenWindow && !tokenWindow.closed) {
//                 tokenWindow.close();
//             }

//             if (onSuccess) {
//                 onSuccess(event.data);
//             }
//         } else if (event.data.type === "FCM_TOKEN_ERROR") {
//             console.error("❌ Token generation error:", event.data.error);

//             if (onStatusChange) {
//                 onStatusChange(`Token generation failed: ${event.data.error}. Proceeding...`);
//             }

//             // Close token window if still open
//             if (tokenWindow && !tokenWindow.closed) {
//                 tokenWindow.close();
//             }

//             if (onError) {
//                 onError(event.data.error);
//             }
//         }
//     };

//     window.addEventListener("message", handleMessage);

//     // Timeout after 30 seconds if no response
//     timeoutId = setTimeout(() => {
//         window.removeEventListener("message", handleMessage);
//         if (tokenWindow && !tokenWindow.closed) {
//             tokenWindow.close();
//         }
//         if (onStatusChange) {
//             onStatusChange("Timeout. Proceeding...");
//         }
//         if (onError) {
//             onError("Timeout waiting for token generation");
//         }
//     }, 30000);

//     // Return cleanup function
//     return () => {
//         window.removeEventListener("message", handleMessage);
//         if (timeoutId) {
//             clearTimeout(timeoutId);
//         }
//         if (tokenWindow && !tokenWindow.closed) {
//             tokenWindow.close();
//         }
//     };
// };

// export default function FcmToken() {
//     const [status, setStatus] = useState("Generating FCM token...");
//     const [token, setToken] = useState(null);
//     const [error, setError] = useState(null);

//     useEffect(() => {
//         async function generateFcmToken() {
//             try {
//                 // Request notification permission first
//                 if (Notification.permission === "default") {
//                     setStatus("Requesting notification permission...");
//                     await Notification.requestPermission();
//                 }

//                 if (Notification.permission === "denied") {
//                     const errorMsg = "Notification permission is blocked. Please enable it in browser settings (click lock icon in address bar → Notifications → Allow).";
//                     setError(errorMsg);
//                     setStatus("Permission blocked");
//                     console.error("❌", errorMsg);
//                     return;
//                 }

//                 if (Notification.permission !== "granted") {
//                     const errorMsg = "Notification permission not granted. Please allow notifications.";
//                     setError(errorMsg);
//                     setStatus("Permission denied");
//                     console.error("❌", errorMsg);
//                     return;
//                 }

//                 // Get FCM token
//                 setStatus("Generating FCM token...");
//                 console.log("🔑 Generating FCM token with VAPID key...");

//                 const currentToken = await getToken(messaging, { vapidKey });
//                 console.log("currentToken", currentToken);
//                 const issSupported = await isSupported();

//                 console.log("issSupported", issSupported);

//                 if (!currentToken) {
//                     const errorMsg = "No FCM token available. Please check Firebase configuration.";
//                     setError(errorMsg);
//                     setStatus("Token generation failed");
//                     console.error("❌", errorMsg);
//                     return;
//                 }

//                 // Step 2: Token generated successfully
//                 setToken(currentToken);
//                 setStatus("Token generated successfully!");
//                 console.log("✅ ========================================");
//                 console.log("✅ FCM TOKEN GENERATED SUCCESSFULLY!");
//                 console.log("✅ ========================================");
//                 console.log("📱 FCM TOKEN:", currentToken);
//                 console.log("✅ ========================================");
//                 console.log("📋 Token Length:", currentToken.length);
//                 console.log("✅ ========================================");

//                 // Get userId and shopId from URL params (when opened from LoginForm)
//                 const urlParams = new URLSearchParams(window.location.search);
//                 const userId = urlParams.get("userId") || localStorage.getItem("client_u_Identity");
//                 const shopId = urlParams.get("shopId");

//                 if (userId) {
//                     // Step 3: Save token to backend
//                     setStatus("Saving token to backend...");
//                     console.log("💾 Saving token to backend for userId:", userId, "shopId:", shopId);

//                     const backendHost = process.env.REACT_APP_BACKEND_HOST || "http://localhost:5001";
//                     try {
//                         const response = await fetch(`${backendHost}/api/save-fcm-token`, {
//                             method: "POST",
//                             headers: { "Content-Type": "application/json" },
//                             body: JSON.stringify({
//                                 userId,
//                                 shopId: shopId || null,
//                                 token: currentToken
//                             }),
//                         });

//                         if (response.ok) {
//                             const data = await response.json();
//                             console.log("✅ Token saved to backend successfully:", data);
//                             setStatus("Token saved successfully!");

//                             // Send success message to parent window (if opened from LoginForm)
//                             if (window.opener) {
//                                 window.opener.postMessage({
//                                     type: "FCM_TOKEN_SAVED",
//                                     success: true,
//                                     token: currentToken,
//                                     userId: userId,
//                                     shopId: shopId
//                                 }, window.location.origin);
//                                 console.log("✅ Sent success message to parent window");

//                                 // Close window after 2 seconds
//                                 setTimeout(() => {
//                                     window.close();
//                                 }, 2000);
//                             }
//                         } else {
//                             console.warn("⚠️ Failed to save token to backend:", response.statusText);
//                             setStatus("Token generated but save failed");

//                             // Send error message to parent window
//                             if (window.opener) {
//                                 window.opener.postMessage({
//                                     type: "FCM_TOKEN_ERROR",
//                                     success: false,
//                                     error: "Failed to save token to backend"
//                                 }, window.location.origin);
//                             }
//                         }
//                     } catch (apiError) {
//                         console.error("❌ Error saving token to backend:", apiError);
//                         setStatus("Token generated but save failed");

//                         // Send error message to parent window
//                         if (window.opener) {
//                             window.opener.postMessage({
//                                 type: "FCM_TOKEN_ERROR",
//                                 success: false,
//                                 error: apiError.message
//                             }, window.location.origin);
//                         }
//                     }
//                 } else {
//                     console.warn("⚠️ No userId found. Token generated but not saved.");
//                 }

//                 // Step 4: Setup foreground message listener
//                 const unsubOnMessage = onMessage(messaging, (payload) => {
//                     console.log("📨 Foreground message received:", payload);
//                 });

//                 // Auto close after 3 seconds if opened from window (not from iframe)
//                 if (window.opener && !urlParams.get("userId")) {
//                     setTimeout(() => {
//                         window.close();
//                     }, 3000);
//                 }

//                 return () => {
//                     if (typeof unsubOnMessage === "function") {
//                         unsubOnMessage();
//                     }
//                 };

//             } catch (err) {
//                 const errorMsg = `FCM token generation failed: ${err.message}`;
//                 setError(errorMsg);
//                 setStatus("Error occurred");
//                 console.error("❌ FCM TOKEN ERROR:", err);

//                 // Send error message to parent window
//                 if (window.opener) {
//                     window.opener.postMessage({
//                         type: "FCM_TOKEN_ERROR",
//                         success: false,
//                         error: err.message
//                     }, window.location.origin);
//                 }
//             }
//         }

//         // Generate FCM token directly
//         generateFcmToken();
//     }, []);

//     return (
//         <div style={{
//             display: "flex",
//             flexDirection: "column",
//             alignItems: "center",
//             justifyContent: "center",
//             minHeight: "100vh",
//             padding: "20px",
//             fontFamily: "Arial, sans-serif",
//             backgroundColor: "#f5f5f5"
//         }}>
//             <div style={{
//                 backgroundColor: "white",
//                 padding: "30px",
//                 borderRadius: "10px",
//                 boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
//                 maxWidth: "500px",
//                 width: "100%",
//                 textAlign: "center"
//             }}>
//                 <h2 style={{ color: "#333", marginBottom: "20px" }}>
//                     🔔 FCM Token Generation
//                 </h2>

//                 {token ? (
//                     <>
//                         <div style={{
//                             backgroundColor: "#d4edda",
//                             border: "1px solid #c3e6cb",
//                             borderRadius: "5px",
//                             padding: "15px",
//                             marginBottom: "20px"
//                         }}>
//                             <p style={{ color: "#155724", margin: 0, fontWeight: "bold" }}>
//                                 ✅ Token Generated Successfully!
//                             </p>
//                         </div>
//                         <div style={{
//                             backgroundColor: "#f8f9fa",
//                             border: "1px solid #dee2e6",
//                             borderRadius: "5px",
//                             padding: "15px",
//                             marginBottom: "20px",
//                             wordBreak: "break-all"
//                         }}>
//                             <p style={{ margin: "0 0 10px 0", fontWeight: "bold", color: "#333" }}>
//                                 Your FCM Token:
//                             </p>
//                             <code style={{
//                                 color: "#0066cc",
//                                 fontSize: "12px",
//                                 display: "block",
//                                 textAlign: "left"
//                             }}>
//                                 {token}
//                             </code>
//                         </div>
//                         <p style={{ color: "#666", fontSize: "14px" }}>
//                             Check browser console for detailed logs.
//                             <br />
//                             This window will close automatically...
//                         </p>
//                     </>
//                 ) : error ? (
//                     <>
//                         <div style={{
//                             backgroundColor: "#f8d7da",
//                             border: "1px solid #f5c6cb",
//                             borderRadius: "5px",
//                             padding: "15px",
//                             marginBottom: "20px"
//                         }}>
//                             <p style={{ color: "#721c24", margin: 0, fontWeight: "bold" }}>
//                                 ❌ {error}
//                             </p>
//                         </div>
//                         <div style={{
//                             backgroundColor: "#fff3cd",
//                             border: "1px solid #ffc107",
//                             borderRadius: "5px",
//                             padding: "15px",
//                             marginBottom: "20px",
//                             textAlign: "left"
//                         }}>
//                             <p style={{ margin: "0 0 10px 0", fontWeight: "bold", color: "#856404" }}>
//                                 📋 How to Enable Notifications:
//                             </p>
//                             <ol style={{ margin: "0", paddingLeft: "20px", color: "#856404", fontSize: "14px" }}>
//                                 <li>Click the <strong>lock icon (🔒)</strong> in your browser's address bar</li>
//                                 <li>Find <strong>"Notifications"</strong> in the permissions list</li>
//                                 <li>Change it to <strong>"Allow"</strong></li>
//                                 <li>Click the button below to retry</li>
//                             </ol>
//                         </div>
//                         <button
//                             onClick={() => window.location.reload()}
//                             style={{
//                                 backgroundColor: "#007bff",
//                                 color: "white",
//                                 border: "none",
//                                 borderRadius: "5px",
//                                 padding: "10px 20px",
//                                 fontSize: "16px",
//                                 cursor: "pointer",
//                                 fontWeight: "bold"
//                             }}
//                             onMouseOver={(e) => e.target.style.backgroundColor = "#0056b3"}
//                             onMouseOut={(e) => e.target.style.backgroundColor = "#007bff"}
//                         >
//                             🔄 Retry After Enabling Notifications
//                         </button>
//                     </>
//                 ) : (
//                     <>
//                         <div style={{
//                             display: "flex",
//                             alignItems: "center",
//                             justifyContent: "center",
//                             marginBottom: "20px"
//                         }}>
//                             <div style={{
//                                 width: "40px",
//                                 height: "40px",
//                                 border: "4px solid #f3f3f3",
//                                 borderTop: "4px solid #3498db",
//                                 borderRadius: "50%",
//                                 animation: "spin 1s linear infinite"
//                             }}></div>
//                         </div>
//                         <p style={{ color: "#666" }}>{status}</p>
//                         <style>{`
//                             @keyframes spin {
//                                 0% { transform: rotate(0deg); }
//                                 100% { transform: rotate(360deg); }
//                             }
//                         `}</style>
//                     </>
//                 )}
//             </div>
//         </div>
//     );
// }
