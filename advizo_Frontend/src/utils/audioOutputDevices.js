// Audio-output (speaker) discovery for the in-call speaker control.
//
// Read-only by design, mirroring cameraDevices.js: nothing here touches
// Agora, the socket or the call lifecycle. It only asks the browser which
// audio outputs exist so the UI can decide whether a switch button is worth
// showing — the actual switch is Agora's own IRemoteAudioTrack.setPlaybackDevice,
// called from useSpeakerSwitch against callSlice.js's existing
// getRemoteAudioTrack() getter. Ported from advizo_CallWidget/src/engine.js's
// listAudioOutputs/canSwitchSpeaker (the customer-side widget's own speaker
// control) so both sides use the same device-enumeration rules.

export const isAudioOutputEnumerationSupported = () =>
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === "function";

/**
 * All audio output devices. Returns [] on unsupported browsers (most mobile
 * browsers included — there is no cross-browser way to force loudspeaker vs
 * earpiece on mobile web) or when the query throws — callers treat an empty
 * or single-item list as "no switching available" and hide the control.
 */
export const listAudioOutputs = async () => {
    if (!isAudioOutputEnumerationSupported()) return [];
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === "audiooutput");
    } catch (err) {
        console.warn("Audio output enumeration failed:", err?.message);
        return [];
    }
};

/**
 * Re-run `handler` when audio devices are plugged in / removed.
 * Always returns an unsubscribe function, even where the event is unsupported.
 */
export const onAudioOutputDeviceChange = (handler) => {
    if (
        !isAudioOutputEnumerationSupported() ||
        typeof navigator.mediaDevices.addEventListener !== "function"
    ) {
        return () => {};
    }
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () =>
        navigator.mediaDevices.removeEventListener("devicechange", handler);
};
