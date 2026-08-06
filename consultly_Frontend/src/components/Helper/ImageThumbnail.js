import { useState } from "react";
import { Spinner } from "@shopify/polaris";

export const ImageThumbnail = ({ src }) => {
  const [loading, setLoading] = useState(true);

  return (
    <div
      style={{
        width: "40px",
        height: "40px",
        position: "relative",
      }}
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f6f6f7",
            borderRadius: "4px",
          }}
        >
          <Spinner size="small" />
        </div>
      )}

      <img
        src={src}
        alt="consultant"
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
        style={{
          width: "40px",
          height: "40px",
          objectFit: "cover",
          borderRadius: "4px",
          display: loading ? "none" : "block",
        }}
      />
    </div>
  );
};
