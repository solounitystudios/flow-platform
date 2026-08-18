import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background: "linear-gradient(135deg, #5b4dff 0%, #341ead 100%)",
          color: "white",
          fontSize: 20,
          fontWeight: 900,
          fontFamily: "sans-serif",
        }}
      >
        F
      </div>
    ),
    size,
  );
}
