import React, { useState, useEffect } from "react";
import { useSetupGuide } from "./SetupGuideProvider";
import BlankModalSetupGuide from "../dashboard/BlankModalSetupGuide";
import { FullPageSpinner } from "../loading/PageSkeletons";

const SetupGuideProtectRoutes = ({ children }) => {
  const { showSetupGuide, loading, setShowSetupGuide } = useSetupGuide();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!loading && showSetupGuide === true) {
      setOpen(true);
    }
  }, [loading, showSetupGuide]);

  const handleClose = () => {
    setOpen(false);
    setShowSetupGuide(false); 
  };

  if (showSetupGuide === true && open) {
    return (
      <BlankModalSetupGuide open={open} onClose={handleClose} />
    );
  }

  if (loading) {
    // Nested inside ProtectAdminRoute in the same Admin route tree — same
    // reasoning as there: this used to show a second, different skeleton
    // immediately after RouteLoadingFallback's spinner (and after
    // ProtectAdminRoute's own install check) resolved. Same spinner here
    // keeps the whole hard-refresh sequence a single continuous loader.
    return <FullPageSpinner label="Loading Advizo" />;
  }

  return children;
};

export default SetupGuideProtectRoutes;
