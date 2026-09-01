import React from "react";
import styles from "./SignInRequired.module.css";

/**
 * Shown when a storefront surface needs a signed-in customer and none could be
 * resolved. It exists so the shopper is never silently thrown at the Shopify
 * account login — they see where they are, what they will get, and choose to go.
 *
 * The sign-in link carries `return_to`, so Shopify brings them straight back to
 * the page they wanted instead of their account overview.
 *
 * @param {{shop?: string, returnTo?: string, title?: string, lead?: string,
 *   detail?: string, buttonLabel?: string}} props
 */
export default function SignInRequired({
    shop,
    // "/apps/consultly/profile" (the old iframe profile route) is gone —
    // callers should pass an explicit returnTo; this generic fallback no
    // longer assumes the caller is the profile page.
    returnTo = "/",
    title = "Sign in Required",
    lead = "Please sign in to access your profile.",
    detail = "Your profile, wallet, consultations and bookings will become available immediately after login.",
    buttonLabel = "Continue to Sign In",
}) {
    // Storefront domain, falling back to the remembered one — building
    // "https://null/..." would produce a navigation the browser silently drops.
    const shopDomain =
        shop ||
        (() => {
            try {
                return (
                    new URLSearchParams(window.location.search).get("shop") ||
                    localStorage.getItem("shop") ||
                    ""
                );
            } catch (_) {
                return "";
            }
        })();

  

    return (
        <div className={styles.wrap}>
            <div className={styles.card}>
                <div className={styles.icon} aria-hidden="true">
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                </div>

                <h2 className={styles.title}>{title}</h2>
                <p className={styles.lead}>{lead}</p>
                <p className={styles.detail}>{detail}</p>

             

                {!shopDomain ? (
                    <p className={styles.note}>
                        Please reload this page from your store to continue.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
