// src/firebase.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// <-- replace these with values from your Firebase console -->
const firebaseConfig = {
    apiKey: "AIzaSyCi61pDIUtbi7pvnxfFRNIpi8RjTHpFNxs",
    authDomain: "consultant-app-24ceb.firebaseapp.com",
    projectId: "consultant-app-24ceb",
    storageBucket: "consultant-app-24ceb.firebasestorage.app",
    messagingSenderId: "465295888006",
    appId: "1:465295888006:web:ae07e6f6667e0e6f838b07",
    measurementId: "G-9TD9Q1Q0PJ"
};

const firebaseApp = initializeApp(firebaseConfig);
export const messaging = getMessaging(firebaseApp);
export default firebaseApp;


export const getFcmToken = async () => {
    try {
        const token = await getToken(messaging, {
            vapidKey: "BB8E-fAs8w3xZZ3cL_R3jjnTHaNDu4LGcra1NJhX60UG0lxvzBHVzzblrvv7cm6FMaGo_o_r2hbiB1eibrtg1h0"
        });

        return token;
    } catch (error) {
        console.log("FCM TOKEN ERROR:", error);
        return null;
    }
};

// Foreground message listener
export const onMessageListener = () =>
    new Promise((resolve) => {
        onMessage(messaging, (payload) => {
            resolve(payload);
        });
    });