import React, { useEffect, useRef } from "react";

// Safari/iOS block audio.play() until the page has had a user gesture. This
// one-time listener "unlocks" the audio element on the first tap/click/key
// anywhere in the dashboard, so a later incoming-call ring is allowed.
let audioUnlocked = false;

export default function TestRingtone({ incomingCall }) {
    const ringtoneRef = useRef(null);
    const pendingRingRef = useRef(false);

    const playRingtoneIncoming = () => {
        if (!ringtoneRef.current) return;

        ringtoneRef.current
            .play()
            .then(() => {
                pendingRingRef.current = false;
            })
            .catch(() => {
                // Autoplay blocked (Safari) — retry on the next user gesture.
                // The visual incoming-call popup is already on screen either way.
                pendingRingRef.current = true;
            });
    };

    // One-time audio unlock on the first user gesture (Safari autoplay policy).
    useEffect(() => {
        if (audioUnlocked) return;
        const unlock = () => {
            audioUnlocked = true;
            const el = ringtoneRef.current;
            if (el) {
                // Prime the element inside the gesture so future play() calls
                // are allowed, then ring immediately if a call is waiting.
                const p = el.play();
                if (p?.then) {
                    p.then(() => {
                        if (!pendingRingRef.current) {
                            el.pause();
                            el.currentTime = 0;
                        }
                    }).catch(() => {});
                }
            }
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
    }, []);

    useEffect(() => {
        if (incomingCall) {
            playRingtoneIncoming();
        } else {
            pendingRingRef.current = false;
            stopRingtone();
        }
    }, [incomingCall]);

    const stopRingtone = () => {
        if (!ringtoneRef.current) return;

        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
    };

    return (
        <>
            {/* Audio element */}
            <audio
                ref={ringtoneRef}
                src="/sounds/discord_incoming_call.mp3"
                loop
                preload="auto"
            />

            {/* Buttons */}
            {/* <button onClick={playRingtoneIncoming}>Play Ring</button>
            <button onClick={stopRingtone}>Stop Ring</button> */}
        </>
    );
}
