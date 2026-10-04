"use client";
import { useState } from "react";
import { Icon, useTranslation } from "./ui";
// Deliberately illustrative: no markers represent real riders, drivers or GPS locations.
export function RideMap({
  route = false,
  driving = false,
}: {
  route?: boolean;
  driving?: boolean;
}) {
  const t = useTranslation();
  const [zoom, setZoom] = useState(1);
  return (
    <div
      className={`nr-map ${driving ? "driving" : ""}`}
      role="region"
      aria-label={t("mapNote")}
    >
      <svg
        className="nr-map-art"
        viewBox="0 0 1100 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="blocks"
            width="130"
            height="120"
            patternTransform="rotate(-18)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="130" height="120" className="map-ground" />
            <rect
              x="12"
              y="12"
              width="45"
              height="42"
              rx="5"
              className="map-block"
            />
            <rect
              x="65"
              y="12"
              width="53"
              height="42"
              rx="5"
              className="map-block"
            />
            <rect
              x="12"
              y="64"
              width="106"
              height="44"
              rx="5"
              className="map-block"
            />
          </pattern>
        </defs>
        <g
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "550px 450px",
          }}
        >
          <rect width="1100" height="900" fill="url(#blocks)" />
          <path
            d="M0 130Q230 240 190 500T380 900M650 0Q550 180 680 300T780 640 980 900"
            className="map-park"
          />
          <path
            d="M-80 550Q250 550 400 400T1150 170M120-100Q240 190 560 550T880 1000M-20 750 1160 540M-50 210Q330 320 650 220T1150 300"
            className="map-road-edge"
          />
          <path
            d="M-80 550Q250 550 400 400T1150 170M120-100Q240 190 560 550T880 1000M-20 750 1160 540M-50 210Q330 320 650 220T1150 300"
            className="map-road"
          />
          <path
            d="M400-80 330 220 570 400 950 480M-30 370 400 310 550 0M210 950 280 670 680 400 1150 390M-20 650 300 620 620 790 1130 720"
            className="map-minor-road"
          />
          <g className="map-label">
            <text x="280" y="230">
              KAZANCHIS
            </text>
            <text x="750" y="320">
              BOLE
            </text>
            <text x="280" y="600">
              KIRKOS
            </text>
            <text x="720" y="720">
              BOLE AIRPORT
            </text>
            <text x="760" y="115">
              Y E K A
            </text>
            <text x="80" y="760">
              NIFAS SILK
            </text>
            <text x="520" y="480" className="map-street">
              Africa Avenue
            </text>
          </g>
          {route && (
            <>
              <path
                d="m760 610-112-148-104-116-86 40-85-80"
                className="map-route-casing"
              />
              <path
                d="m760 610-112-148-104-116-86 40-85-80"
                className="map-route"
              />
              <circle cx="760" cy="610" r="12" className="map-origin" />
              <circle cx="373" cy="306" r="12" className="map-destination" />
            </>
          )}
        </g>
      </svg>
      <div className="nr-map-caption">
        <Icon name="pin" size={15} />
        <span>{t("schematic")}</span>
      </div>
      <div className="nr-map-tools">
        <button
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))}
          disabled={zoom >= 1.6}
          aria-label={t("zoomIn")}
        >
          <Icon name="plus" />
        </button>
        <button onClick={() => setZoom(1)} aria-label={t("back")}>
          <Icon name="locate" />
        </button>
      </div>
      <a
        className="nr-map-link"
        href="https://www.openstreetmap.org/#map=14/9.0080/38.7750"
        target="_blank"
        rel="noreferrer"
      >
        {t("loadMap")}
        <Icon name="globe" size={14} />
      </a>
    </div>
  );
}
