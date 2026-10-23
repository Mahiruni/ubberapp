"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "./biloo-page-transitions.css";

/**
 * App Router templates remount on navigation. Animate the new route's surface
 * only: no blocking overlays, delayed navigation, or changes to ride state.
 */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === "/" || pathname === "/driver" || pathname.startsWith("/driver/home") || pathname.startsWith("/driver/map");
  return (
    <div className="biloo-route-stage" data-map-route={isMap ? "true" : "false"}>
      {children}
    </div>
  );
}
