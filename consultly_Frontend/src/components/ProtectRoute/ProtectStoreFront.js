import { EmptyState } from '@shopify/polaris';
import { useAppStatus } from '../ProtectRoute/AppStatusProvider';
import { StorefrontSkeleton } from '../loading/PageSkeletons';

const ProtectStoreFront = ({ children }) => {
    const { loading, appEnabled } = useAppStatus();

    if (loading) return <StorefrontSkeleton />;

    if (!appEnabled) {
        return (
            <div
                style={{
                    minHeight: "60vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                }}
            >
                <div
                    style={{
                        maxWidth: "560px",
                        width: "100%",
                        background: "#ffffff",
                        border: "1px solid #eceef2",
                        borderRadius: "16px",
                        boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
                        padding: "16px",
                    }}
                >
                    <EmptyState
                        heading="This service is currently unavailable"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>
                            Consultations are temporarily disabled by the store.
                            Please check back later.
                        </p>
                    </EmptyState>
                </div>
            </div>
        );
    }

    return children;
};

export default ProtectStoreFront;
