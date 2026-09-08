import React, { useEffect, useState } from "react";
import styles from "./NetworkIndicator.module.css";

const EXIT_MS = 220; // must match the .leaving animation duration

const DOT_CLASS = {
    poor: styles.dotPoor,
    reconnecting: styles.dotReconnecting,
    lost: styles.dotLost,
};

/**
 * Small network-status pill for the call stage.
 *
 * Presentational only — it renders whatever the monitor reports and holds itself
 * on screen briefly while fading out, so recovery is visible rather than the
 * pill vanishing mid-frame.
 *
 * @param {{status: 'good'|'poor'|'reconnecting'|'lost', message: string|null,
 *   scope: 'self'|'peer'|null}} props
 */
export default function NetworkIndicator({ status, message, scope }) {
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Frozen copy so the text does not change to null part-way through the exit.
    const [shown, setShown] = useState({ status, message, scope });

    useEffect(() => {
        if (message) {
            setShown({ status, message, scope });
            setLeaving(false);
            setVisible(true);
            return undefined;
        }

        if (!visible) return undefined;

        setLeaving(true);
        const timer = setTimeout(() => {
            setVisible(false);
            setLeaving(false);
        }, EXIT_MS);
        return () => clearTimeout(timer);
    }, [status, message, scope, visible]);

    if (!visible) return null;

    return (
        <div
            className={`${styles.indicator} ${leaving ? styles.leaving : ""}`}
            role="status"
            aria-live="polite"
        >
            <span
                className={`${styles.dot} ${DOT_CLASS[shown.status] || ""}`}
                aria-hidden="true"
            />
            <span className={styles.label}>
                {shown.message}
                {shown.scope === "peer" ? (
                    <span className={styles.scope}> · other side</span>
                ) : null}
            </span>
        </div>
    );
}
