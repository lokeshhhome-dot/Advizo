import React, { useState, useEffect } from "react";
import { useSetupGuide } from "./SetupGuideProvider";
import BlankModalSetupGuide from "../dashboard/BlankModalSetupGuide";
import { AdminPageSkeleton } from "../loading/PageSkeletons";

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
    return <AdminPageSkeleton />;
  }

  return children;
};

export default SetupGuideProtectRoutes;
