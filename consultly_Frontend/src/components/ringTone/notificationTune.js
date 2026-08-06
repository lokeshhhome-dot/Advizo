// src/utils/notificationSound.js

let notificationSound = null;

const getNotificationSound = () => {
    if (!notificationSound) {
        notificationSound = new Audio(
            "/sounds/mixkit-fast-whoosh-transition-1490.wav"
        );

        // Notification sound should play only once
        notificationSound.loop = false;

        // Volume (0.0 - 1.0)
        notificationSound.volume = 1;

        // Preload audio
        notificationSound.preload = "auto";
    }

    return notificationSound;
};

export const playNotificationSound = async () => {
    try {
        const sound = getNotificationSound();

        sound.pause();
        sound.currentTime = 0;

        await sound.play();
    } catch (err) {
        console.warn("Notification sound blocked:", err);
    }
};

export const stopNotificationSound = () => {
    if (!notificationSound) return;

    notificationSound.pause();
    notificationSound.currentTime = 0;
};

export const destroyNotificationSound = () => {
    if (!notificationSound) return;

    notificationSound.pause();
    notificationSound.src = "";
    notificationSound.load();

    notificationSound = null;
};