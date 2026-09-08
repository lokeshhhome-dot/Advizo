// Camera discovery helpers for the in-call camera switch.
//
// Read-only by design: nothing here touches Agora, the socket, the call
// lifecycle or any app state. It only asks the browser which video inputs
// exist so the UI can decide whether a switch button is worth showing.

export const isCameraEnumerationSupported = () =>
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === "function";

// Labels are the only hint browsers give about which way a camera points.
// Chrome/Android use "front"/"back", Safari uses "Front Camera"/"Back Camera",
// desktops usually say neither — in which case facingMode stays null and we
// switch purely by deviceId.
const guessFacingMode = (label = "") => {
    const text = label.toLowerCase();
    if (/(back|rear|environment|world)/.test(text)) return "environment";
    if (/(front|user|face|selfie)/.test(text)) return "user";
    return null;
};

/**
 * All video input devices, de-duplicated and in a stable order.
 * Returns [] on unsupported browsers or when the query throws — callers treat
 * an empty list as "no switching available" and simply hide the control.
 */
export const listVideoInputs = async () => {
    if (!isCameraEnumerationSupported()) return [];
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const seen = new Set();
        return devices
            .filter((device) => device.kind === "videoinput")
            .reduce((cameras, device, index) => {
                // Safari can repeat the same physical camera and can return an
                // empty deviceId before/without permission; fall back to the
                // label so duplicates still collapse to one entry.
                const key = device.deviceId || device.label || `camera-${index}`;
                if (seen.has(key)) return cameras;
                seen.add(key);
                cameras.push({
                    deviceId: device.deviceId || "",
                    label: device.label || `Camera ${cameras.length + 1}`,
                    facingMode: guessFacingMode(device.label),
                });
                return cameras;
            }, []);
    } catch (err) {
        console.warn("Camera enumeration failed:", err?.message);
        return [];
    }
};

/**
 * Re-run `handler` when cameras are plugged in / removed.
 * Always returns an unsubscribe function, even where the event is unsupported.
 */
export const onCameraDeviceChange = (handler) => {
    if (
        !isCameraEnumerationSupported() ||
        typeof navigator.mediaDevices.addEventListener !== "function"
    ) {
        return () => {};
    }
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () =>
        navigator.mediaDevices.removeEventListener("devicechange", handler);
};
