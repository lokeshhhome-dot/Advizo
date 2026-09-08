// components/ProtectAdminRoute.js.js
import { FullPageSpinner } from "../loading/PageSkeletons";

const ProtectAdminRoute = ({ installed, children }) => {
    // This gate sits INSIDE the route tree App.js's root Suspense already
    // handed control to, right after RouteLoadingFallback's own spinner
    // resolves — a skeleton here on a hard refresh looked like a second,
    // different loading state stacked right after the first. Same spinner,
    // same "still starting up" signal, no visual handoff.
    if (!installed) {
        return <FullPageSpinner label="Loading Advizo" />;
    }

    return children;
};

export default ProtectAdminRoute
