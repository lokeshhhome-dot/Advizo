import { createContext, useContext, useEffect, useState } from "react";
import { useAppBridge } from "../createContext/AppBridgeContext";
import { getAppBridgeToken } from "../../utils/getAppBridgeToken";
import axios from "axios";

const SetupGuideContext = createContext(null);

const SETUP_GUIDE_CACHE_KEY = "advizo_setup_guide_state";

export const SetupGuideProvider = ({ children }) => {
  const app = useAppBridge();

  // Stale-while-revalidate: render instantly from the last known verdict in
  // this session; the real check below still runs and corrects it.
  const cached = sessionStorage.getItem(SETUP_GUIDE_CACHE_KEY);
  const [loading, setLoading] = useState(cached === null);
  const [showSetupGuide, setShowSetupGuide] = useState(cached === "true");

  useEffect(() => {
    const checkSetupGuide = async () => {
      try {
        const adminId = localStorage.getItem("advizo");

        if (!adminId) {
          setLoading(false);
          return;
        }

        const token = await getAppBridgeToken(app);

        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/admin/is-setup-guide-open/${adminId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

       
        const shouldShow =
          response.data.menuSetupComplete === true ||
          response.data.menuSetupComplete === "true";
        setShowSetupGuide(shouldShow);
        sessionStorage.setItem(SETUP_GUIDE_CACHE_KEY, String(shouldShow));
      } catch (error) {
        console.error("SetupGuide error:", error);
        setShowSetupGuide(false);
      } finally {
        setLoading(false);
      }
    };

    if (app) {
      checkSetupGuide();
    }
  }, [app]);

  // Persist manual changes (e.g. the guide being dismissed) so a reload
  // doesn't flash the stale cached verdict.
  const updateShowSetupGuide = (value) => {
    setShowSetupGuide(value);
    sessionStorage.setItem(SETUP_GUIDE_CACHE_KEY, String(value));
  };

  return (
    <SetupGuideContext.Provider
      value={{ showSetupGuide, loading, setShowSetupGuide: updateShowSetupGuide }}
    >
      {children}
    </SetupGuideContext.Provider>
  );
};

export const useSetupGuide = () => useContext(SetupGuideContext);
