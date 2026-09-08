import { Outlet, useLocation } from "react-router-dom";
import SignInRequired from "../ClientDashbord/SignInRequired";

/**
 * Storefront customer gate.
 *
 * Renders the in-app "Sign in Required" panel instead of navigating away. It
 * used to push window.top straight to `https://{shop}/account/login`, which on
 * stores with new customer accounts lands on accounts.shopify.com — the shopper
 * got no explanation, no way back, and (because the redirect fired from an
 * effect) a visible "Redirecting to login..." flash first.
 *
 * NOTE: this component is currently not mounted on any route. It is kept
 * correct rather than left as a landmine for whoever wires it up.
 */
export default function CustomerProtected() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);

    // Accept both spellings: the profile proxy emits `logged_in_customer_Id`
    // (capital I) while Shopify's own parameter is `logged_in_customer_id`.
    const loggedInCustomerId =
        params.get("logged_in_customer_id") ||
        params.get("logged_in_customer_Id");
    const shop = params.get("shop");

    if (!loggedInCustomerId) {
        return (
            <SignInRequired
                shop={shop}
                returnTo={`/apps/advizo${location.pathname || ""}`}
            />
        );
    }

    return <Outlet />;
}
