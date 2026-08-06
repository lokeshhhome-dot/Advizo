import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function PageFadeIn({ children }) {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <div
      className={`page-fade-in ${visible ? "page-fade-in--visible" : ""}`}
      key={location.pathname}
    >
      {children}
    </div>
  );
}
