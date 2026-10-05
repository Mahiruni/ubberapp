"use client";
import { useId } from "react";
import type { RideCategory } from "../../lib/nexride-booking";
export function VehicleIllustration({ category }: { category: RideCategory }) {
  const id = useId();
  const xl = category === "xl",
    comfort = category === "comfort";
  return (
    <svg className="nr-vehicle-art" viewBox="0 0 112 66" aria-hidden="true">
      <defs>
        <linearGradient id={id} x2=".2" y2="1">
          <stop stopColor={comfort ? "#647a8c" : xl ? "#536879" : "#e5edf2"} />
          <stop
            offset=".55"
            stopColor={comfort ? "#193448" : xl ? "#253f52" : "#a6b6c2"}
          />
          <stop offset="1" stopColor={comfort || xl ? "#091e2d" : "#63798a"} />
        </linearGradient>
      </defs>
      <ellipse cx="57" cy="56" rx="49" ry="5" fill="#041c30" opacity=".09" />
      <path
        d={
          xl
            ? "M14 41 21 22Q23 17 31 16L74 15Q82 17 91 31L101 35 104 47 98 53 17 53 10 48Z"
            : "M13 41 27 24Q33 19 44 19L70 21Q77 23 87 34L101 38 104 48 97 53 16 53 10 48Z"
        }
        fill={`url(#${id})`}
        stroke="#536b7a"
        strokeWidth=".8"
      />
      <path
        d={
          xl
            ? "M27 23 49 21 49 34 21 34ZM53 21 73 21 83 34 53 34Z"
            : "M31 27Q35 23 46 23L49 23 49 35 24 35ZM53 23 69 25 80 35 53 35Z"
        }
        fill="#173044"
      />
      <path
        d="M26 29 44 25M57 26 73 30"
        stroke="#b8d5e5"
        strokeWidth="1.4"
        opacity=".65"
      />
      <path
        d="M18 38 86 38 100 42M49 37 49 49M82 39 87 48"
        fill="none"
        stroke={comfort || xl ? "#90a9b9" : "#f4f8fa"}
        strokeWidth=".7"
        opacity=".65"
      />
      <path d="M54 41h7M30 41h6" stroke="#b8c9d2" strokeWidth="1.5" />
      <path d="m93 39 9 3-1 3-8-1Z" fill="#e6faff" />
      <path d="M11 41h5v4h-5" fill="#b95650" />
      <path d="M96 47h7M17 48h75" stroke="#082032" strokeWidth="2" />
      {[29, 85].map((x) => (
        <g key={x}>
          <circle cx={x} cy="51" r="8" fill="#10212d" />
          <circle cx={x} cy="51" r="5" fill="#96a8b3" />
          <circle cx={x} cy="51" r="2" fill="#435b6d" />
          <path
            d={`M${x - 4} 51h8M${x} 47v8`}
            stroke="#d7e0e6"
            strokeWidth=".8"
          />
        </g>
      ))}
      <path
        d="M66 45h9"
        stroke="#00c878"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
