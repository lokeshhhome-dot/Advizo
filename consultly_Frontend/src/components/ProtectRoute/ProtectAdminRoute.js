// components/ProtectAdminRoute.js.js
import { AdminPageSkeleton } from "../loading/PageSkeletons";

const ProtectAdminRoute = ({ installed, children }) => {
    if (!installed) {
        return <AdminPageSkeleton />;
    }

    return children;
};

export default ProtectAdminRoute
