import { useCallback, useEffect, useRef, useState } from "react";
import {
    isAudioOutputEnumerationSupported,
    listAudioOutputs,
    onAudioOutputDeviceChange,
} from "../utils/audioOutputDevices";

/**
 * Speaker/output-device switching for an active call — the React-side
 * counterpart to consultly_CallWidget/src/engine.js's canSwitchSpeaker/
 * switchSpeaker (the customer-side widget). Both call getRemoteAudioTrack()
 * from the SAME callSlice.js and Agora's own IRemoteAudioTrack.setPlaybackDevice
 * — no second audio system, no new call/Agora logic, just this app's existing
 * getter finally getting a UI on the consultant side too.
 *
 * There is no cross-browser way to force loudspeaker vs earpiece on mobile
 * web, so this never fakes a toggle: unsupported/single-output devices just
 * report `canSwitch: false` and the caller hides the button.
 *
 * @param {{enabled?: boolean}} options `enabled` gates device enumeration —
 *   pass false whenever there's no active call so this does no work at all.
 */
export default function useSpeakerSwitch({ enabled = true } = {}) {
    const [outputs, setOutputs] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [switching, setSwitching] = useState(false);
    const switchingRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refresh = useCallback(async () => {
        const list = await listAudioOutputs();
        if (!mountedRef.current) return;
        setOutputs(list);
    }, []);

    useEffect(() => {
        if (!enabled || !isAudioOutputEnumerationSupported()) return undefined;
        refresh();
        return onAudioOutputDeviceChange(refresh);
    }, [enabled, refresh]);

    /**
     * Move to the next audio output, wrapping around. Resolves
     * { ok: boolean, message? } — on failure the current output keeps playing.
     */
    const switchSpeaker = useCallback(async () => {
        if (switchingRef.current) return { ok: false };
        if (outputs.length < 2) {
            return { ok: false, message: "Only one audio output available" };
        }
        switchingRef.current = true;
        setSwitching(true);

        const nextIndex = (activeIndex + 1) % outputs.length;
        try {
            const module = await import("../components/Redux/slices/callSlice");
            const remoteTrack = module.getRemoteAudioTrack?.();
            if (!remoteTrack || typeof remoteTrack.setPlaybackDevice !== "function") {
                return { ok: false, message: "Not supported on this device" };
            }
            await remoteTrack.setPlaybackDevice(outputs[nextIndex].deviceId);
            if (mountedRef.current) setActiveIndex(nextIndex);
            return { ok: true };
        } catch (err) {
            console.warn("Speaker switch failed:", err?.message);
            return { ok: false, message: err?.message };
        } finally {
            switchingRef.current = false;
            if (mountedRef.current) setSwitching(false);
        }
    }, [activeIndex, outputs]);

    return {
        outputs,
        activeOutput: outputs[activeIndex] || null,
        canSwitch: outputs.length > 1,
        switching,
        switchSpeaker,
        refreshOutputs: refresh,
    };
}
