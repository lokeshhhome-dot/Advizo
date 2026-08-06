import { useEffect, useRef, useState } from "react";
import { getSocket } from "../components/Sokect-io/SokectConfig";

/**
 * Passive network-quality monitor for an active call.
 *
 * OBSERVER ONLY. It subscribes to signals that already exist — Agora's
 * network-quality / connection-state-change events, the Socket.IO connection
 * state, the browser's online/offline events, and the server's additive
 * peer-network-state notice — and derives a display status from them. It never
 * joins, leaves, publishes, reconnects, ends a call, touches billing or timers.
 *
 * Recovery and call-ending are already handled: socket.io reconnects on its own,
 * Agora reconnects on its own, and the server's grace period ends the call
 * through the existing flow if a participant stays gone. This hook only tells
 * the user what is happening.
 *
 * @param {{enabled?: boolean}} options `enabled` should be false outside a live
 *   call so nothing is subscribed or polled when there is nothing to watch.
 * @returns {{status: 'good'|'poor'|'reconnecting'|'lost', message: string|null,
 *   scope: 'self'|'peer'|null}}
 */

// Agora quality scale: 0 unknown, 1 excellent, 2 good, 3 poor, 4 bad,
// 5 very bad, 6 down. Warn from "bad" upward — warning at 3 is too noisy to be
// useful and merchants learn to ignore an indicator that is always on.
const WARN_FROM = 4;
const DOWN = 6;

const SAMPLE_MS = 2000;
// Two consecutive bad samples before warning, one good sample to clear. Slower
// to alarm than to reassure, so a single dropped sample cannot flicker the UI.
const BAD_SAMPLES_TO_WARN = 2;

const STATUS_TEXT = {
    poorSelf: "Poor Network",
    poorPeer: "Weak Connection",
    reconnecting: "Reconnecting...",
    lost: "Connection Lost",
};

export default function useCallNetworkQuality({ enabled = true } = {}) {
    const [state, setState] = useState({
        status: "good",
        message: null,
        scope: null,
    });

    // Everything the sampler reads lives in refs: these update many times a
    // second in the worst case and must never trigger a React render.
    const localQualityRef = useRef({ uplink: 0, downlink: 0 });
    const agoraStateRef = useRef(null);
    const peerOfflineRef = useRef(false);
    const badStreakRef = useRef(0);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        let client = null;
        let interval = null;
        let socket = null;

        const applyStatus = (status, message, scope) => {
            setState((prev) =>
                prev.status === status &&
                prev.message === message &&
                prev.scope === scope
                    ? prev // identical → no re-render
                    : { status, message, scope },
            );
        };

        // --- discrete signals: react immediately, no polling ------------------
        const onOnline = () => {
            /* the next sample confirms recovery */
        };
        const onOffline = () => {
            if (!cancelled) {
                applyStatus("lost", STATUS_TEXT.lost, "self");
            }
        };

        const onNetworkQuality = (stats) => {
            localQualityRef.current = {
                uplink: stats?.uplinkNetworkQuality || 0,
                downlink: stats?.downlinkNetworkQuality || 0,
            };
        };

        const onConnectionStateChange = (curState) => {
            agoraStateRef.current = curState;
        };

        const onPeerNetworkState = (payload) => {
            // Additive server notice: the peer's socket dropped and the existing
            // grace period is running, or they came back within it.
            peerOfflineRef.current = payload?.online === false;
        };

        // --- the single sampler ------------------------------------------------
        const sample = () => {
            if (cancelled) return;

            // 1. Hard local loss wins over everything else.
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
                applyStatus("lost", STATUS_TEXT.lost, "self");
                return;
            }

            const agoraState = agoraStateRef.current;
            if (agoraState === "DISCONNECTED" || agoraState === "ABORTED") {
                applyStatus("lost", STATUS_TEXT.lost, "self");
                return;
            }

            // 2. Actively re-establishing — ours or the peer's.
            const socketDown = socket ? socket.connected === false : false;
            const { uplink, downlink } = localQualityRef.current;
            if (
                agoraState === "RECONNECTING" ||
                socketDown ||
                uplink === DOWN ||
                downlink === DOWN
            ) {
                applyStatus("reconnecting", STATUS_TEXT.reconnecting, "self");
                return;
            }
            if (peerOfflineRef.current) {
                applyStatus("reconnecting", STATUS_TEXT.reconnecting, "peer");
                return;
            }

            // 3. Degraded but connected. Remote quality is read from the client
            //    rather than tracked, so there is no extra subscription.
            let remoteWorst = 0;
            if (client && typeof client.getRemoteNetworkQuality === "function") {
                try {
                    const remote = client.getRemoteNetworkQuality() || {};
                    for (const uid of Object.keys(remote)) {
                        const q = remote[uid] || {};
                        remoteWorst = Math.max(
                            remoteWorst,
                            q.uplinkNetworkQuality || 0,
                            q.downlinkNetworkQuality || 0,
                        );
                    }
                } catch (_) {
                    /* stats unavailable on this SDK/browser — ignore */
                }
            }

            const selfBad = uplink >= WARN_FROM || downlink >= WARN_FROM;
            const peerBad = remoteWorst >= WARN_FROM;

            if (selfBad || peerBad) {
                badStreakRef.current += 1;
                if (badStreakRef.current >= BAD_SAMPLES_TO_WARN) {
                    applyStatus(
                        "poor",
                        selfBad ? STATUS_TEXT.poorSelf : STATUS_TEXT.poorPeer,
                        selfBad ? "self" : "peer",
                    );
                }
                return;
            }

            // 4. Stable — clear immediately.
            badStreakRef.current = 0;
            applyStatus("good", null, null);
        };

        // Agora's client is a module-level singleton in the call slice; import it
        // lazily so this hook never pulls the SDK into a bundle that has no call.
        import("../components/Redux/slices/callSlice")
            .then((module) => {
                if (cancelled) return;
                client = module.getAgoraClient?.() || null;
                if (!client) return;
                agoraStateRef.current = client.connectionState || null;
                client.on("network-quality", onNetworkQuality);
                client.on("connection-state-change", onConnectionStateChange);
            })
            .catch(() => {
                /* monitoring is best-effort — never break the call */
            });

        try {
            socket = getSocket();
            socket.on("peer-network-state", onPeerNetworkState);
        } catch (_) {
            socket = null;
        }

        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        interval = setInterval(sample, SAMPLE_MS);
        sample();

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
            // Remove ONLY our own handlers — never client.removeAllListeners(),
            // which would tear down the call slice's subscriptions.
            if (client) {
                try {
                    client.off("network-quality", onNetworkQuality);
                    client.off(
                        "connection-state-change",
                        onConnectionStateChange,
                    );
                } catch (_) {
                    /* client already destroyed */
                }
            }
            if (socket) {
                try {
                    socket.off("peer-network-state", onPeerNetworkState);
                } catch (_) {
                    /* socket already gone */
                }
            }
        };
    }, [enabled]);

    return state;
}
