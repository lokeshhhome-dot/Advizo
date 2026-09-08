import { useCallback, useEffect, useRef, useState } from "react";
import {
    isCameraEnumerationSupported,
    listVideoInputs,
    onCameraDeviceChange,
} from "../utils/cameraDevices";

/**
 * Camera switching for an active video call.
 *
 * Owns only UI-level state (the device list, which one is live, and whether a
 * switch is in flight) — the media work lives in the call slice. Redux, the
 * socket and the call lifecycle are never touched.
 *
 * @param {{enabled?: boolean}} options `enabled` gates device enumeration, so
 *   voice calls and camera-off states do no work at all.
 */
export default function useCameraSwitch({ enabled = true } = {}) {
    const [cameras, setCameras] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [switching, setSwitching] = useState(false);
    // Ref mirror of `switching`: state updates are async, so two fast taps
    // could both pass a state-based guard.
    const switchingRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refresh = useCallback(async () => {
        const list = await listVideoInputs();
        if (!mountedRef.current) return;

        // Anchor the cycle to the camera actually capturing right now, so the
        // "next" camera is correct even after a hot-plug or a failed switch.
        let index = 0;
        try {
            const module = await import("../components/Redux/slices/callSlice");
            const currentId = module.getLocalCameraDeviceId?.();
            const found = list.findIndex(
                (camera) => camera.deviceId && camera.deviceId === currentId,
            );
            if (found >= 0) index = found;
        } catch (err) {
            /* fall back to the first entry */
        }
        if (!mountedRef.current) return;
        setCameras(list);
        setActiveIndex(index);
    }, []);

    useEffect(() => {
        if (!enabled || !isCameraEnumerationSupported()) return undefined;
        refresh();
        return onCameraDeviceChange(refresh);
    }, [enabled, refresh]);

    /**
     * Move to the next camera, wrapping around. With two cameras this is a
     * front/back toggle; with more it cycles through every one of them.
     * Resolves true on success, false when the switch was refused or failed —
     * in both cases the current camera keeps streaming.
     */
    const switchCamera = useCallback(async () => {
        if (switchingRef.current || cameras.length < 2) return false;
        switchingRef.current = true;
        setSwitching(true);

        const nextIndex = (activeIndex + 1) % cameras.length;
        try {
            const module = await import("../components/Redux/slices/callSlice");
            await module.switchCamera(cameras[nextIndex]);
            if (mountedRef.current) setActiveIndex(nextIndex);
            return true;
        } catch (err) {
            console.warn("Camera switch failed:", err?.message);
            return false;
        } finally {
            switchingRef.current = false;
            if (mountedRef.current) setSwitching(false);
        }
    }, [activeIndex, cameras]);

    const nextCamera =
        cameras.length > 1 ? cameras[(activeIndex + 1) % cameras.length] : null;

    return {
        cameras,
        activeCamera: cameras[activeIndex] || null,
        nextCamera,
        canSwitch: cameras.length > 1,
        switching,
        switchCamera,
        refreshCameras: refresh,
    };
}
