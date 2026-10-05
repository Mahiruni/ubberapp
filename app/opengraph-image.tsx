import { ImageResponse } from "next/og";

export const alt = "NexRide — Better Rides. A Brighter Tomorrow.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const mark = (
  <svg width="188" height="188" viewBox="0 0 128 128" fill="none">
    <path d="M18 106 35 24c1.3-6 5.2-9 11.5-9H61L42.5 105c-1 5.2-4.2 8-9.6 8H24c-4.7 0-7-2.5-6-7Z" fill="#42E9A4"/>
    <path d="M45 15c6 0 10 2.4 13.4 8.2L102 99.5c4.9 8.6 1.2 13.5-8.3 13.5H81L39.5 37.5C34 27.5 35.8 15 45 15Z" fill="#00B978"/>
    <path d="m79 101 17-77c1.4-6 4.4-9 10.3-9H116c4.3 0 6.2 2.5 5.3 6.7l-17.8 81.7c-1.6 6.5-4.9 9.6-10.8 9.6-8.2 0-15.2-4-13.7-12Z" fill="#00D889"/>
  </svg>
);

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "76px 92px",
          color: "white",
          background: "linear-gradient(135deg,#041C30 0%,#082D43 58%,#064439 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "48px" }}>
          <div
            style={{
              width: "226px",
              height: "226px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "54px",
              background: "rgba(255,255,255,0.055)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {mark}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "88px", fontWeight: 800, letterSpacing: "-5px" }}>
              NexRide
            </div>
            <div style={{ marginTop: "18px", fontSize: "34px", color: "#D3E6EF" }}>
              Better Rides. A Brighter Tomorrow.
            </div>
            <div
              style={{
                marginTop: "34px",
                display: "flex",
                alignItems: "center",
                width: "fit-content",
                padding: "13px 24px",
                borderRadius: "999px",
                background: "#00C878",
                color: "#041C30",
                fontSize: "23px",
                fontWeight: 700,
              }}
            >
              Ride across Addis Ababa
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
