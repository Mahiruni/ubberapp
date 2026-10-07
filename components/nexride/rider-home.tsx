"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon, ListRow, useTranslation } from "./ui";
import { placeKey, placeName, locality } from "../../lib/nexride-search";
import { LanguageContext } from "./ui";
import { type Place } from "../../lib/nexride-places";
import type { HomePlaces } from "../../lib/nexride-home";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";

type HomeSheetSnap = "collapsed" | "medium" | "expanded";

const visibleRatio: Record<HomeSheetSnap, number> = {
  collapsed: 0.27,
  medium: 0.46,
  expanded: 0.75,
};
const maxRatio = 0.75;

const snapOffset = (snap: HomeSheetSnap, viewportHeight: number) =>
  Math.max(0, (maxRatio - visibleRatio[snap]) * viewportHeight);

export function LocationMessage({
  status,
  position,
  label,
}: {
  status: LocationStatus;
  position: RiderLocation | null;
  label?: string;
}) {
  const t = useTranslation();
  return (
    <div className={`nr-home-location ${status}`} role="status">
      <Icon
        name={
          status === "denied" || status === "unavailable" ? "info" : "locate"
        }
        size={16}
      />
      <span>
        {status === "ready" && label
          ? label
          : t(
              status === "loading"
                ? "locating"
                : status === "denied"
                  ? "locationPermissionDenied"
                  : status === "unavailable"
                    ? "locationUnavailable"
                    : status === "ready"
                      ? "locationReady"
                      : "locationPrompt",
            )}
      </span>
    </div>
  );
}

export function RiderHomePanel({
  navigate,
  choose,
  data,
  shortcut,
  status,
  position,
  locationLabel,
}: {
  navigate: () => void;
  choose: (p: Place) => void;
  data: HomePlaces;
  shortcut: (kind: "home" | "work" | "saved") => void;
  status: LocationStatus;
  position: RiderLocation | null;
  locationLabel?: string;
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const rows = data.recent.slice(0, 3);
  const [snap, setSnap] = useState<HomeSheetSnap>("medium");
  const [viewportHeight, setViewportHeight] = useState(800);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const offsetRef = useRef(snapOffset("medium", 800));
  const drag = useRef({
    active: false,
    source: "grab" as "grab" | "content",
    pointerId: -1,
    startY: 0,
    startOffset: 0,
    lastY: 0,
    lastAt: 0,
    velocity: 0,
    moved: false,
  });

  const bounds = () => ({
    min: snapOffset("expanded", viewportHeight),
    max: snapOffset("collapsed", viewportHeight),
  });

  const paintOffset = (next: number) => {
    offsetRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      sheetRef.current?.style.setProperty(
        "--nr-home-sheet-offset",
        `${offsetRef.current}px`,
      );
      frameRef.current = null;
    });
  };

  const clampWithResistance = (raw: number) => {
    const { min, max } = bounds();
    if (raw < min) return min + (raw - min) * 0.18;
    if (raw > max) return max + (raw - max) * 0.18;
    return raw;
  };

  useEffect(() => {
    const update = () => {
      const nextHeight = Math.max(
        520,
        window.visualViewport?.height || window.innerHeight || 800,
      );
      setViewportHeight(nextHeight);
      const nextOffset = snapOffset(snap, nextHeight);
      offsetRef.current = nextOffset;
      sheetRef.current?.style.setProperty(
        "--nr-home-sheet-offset",
        `${nextOffset}px`,
      );
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [snap]);

  const applySnap = (next: HomeSheetSnap) => {
    drag.current.active = false;
    setDragging(false);
    setSnap(next);
    const nextOffset = snapOffset(next, viewportHeight);
    offsetRef.current = nextOffset;
    requestAnimationFrame(() => paintOffset(nextOffset));
  };

  const nearestSnap = (value: number) =>
    (Object.keys(visibleRatio) as HomeSheetSnap[]).reduce((best, candidate) =>
      Math.abs(snapOffset(candidate, viewportHeight) - value) <
      Math.abs(snapOffset(best, viewportHeight) - value)
        ? candidate
        : best,
    );

  const beginDrag = (
    clientY: number,
    source: "grab" | "content",
    pointerId = -1,
  ) => {
    const now = performance.now();
    drag.current = {
      active: true,
      source,
      pointerId,
      startY: clientY,
      startOffset: offsetRef.current,
      lastY: clientY,
      lastAt: now,
      velocity: 0,
      moved: false,
    };
    setDragging(true);
  };

  const moveDrag = (clientY: number) => {
    if (!drag.current.active) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.current.lastAt);
    drag.current.velocity = (clientY - drag.current.lastY) / elapsed;
    drag.current.lastY = clientY;
    drag.current.lastAt = now;
    const delta = clientY - drag.current.startY;
    if (Math.abs(delta) > 5) drag.current.moved = true;
    paintOffset(
      clampWithResistance(drag.current.startOffset + delta),
    );
  };

  const finishDrag = () => {
    if (!drag.current.active) return;
    const velocity = drag.current.velocity;
    drag.current.active = false;
    setDragging(false);

    const { min, max } = bounds();
    const clamped = Math.min(max, Math.max(min, offsetRef.current));
    const projected = Math.min(
      max,
      Math.max(min, clamped + velocity * 180),
    );

    applySnap(nearestSnap(projected));
  };

  const onGrabPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginDrag(event.clientY, "grab", event.pointerId);
  };

  const onGrabPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current.active || drag.current.source !== "grab") return;
    event.stopPropagation();
    event.preventDefault();
    moveDrag(event.clientY);
  };

  const onGrabPointerEnd = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (drag.current.source !== "grab") return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDrag();
  };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let touchId = -1;
    let startY = 0;
    let lastY = 0;
    let lastAt = 0;
    let handoff = false;

    const touchStart = (event: TouchEvent) => {
      event.stopPropagation();
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchId = touch.identifier;
      startY = touch.clientY;
      lastY = touch.clientY;
      lastAt = performance.now();
      handoff = false;
    };

    const touchMove = (event: TouchEvent) => {
      event.stopPropagation();
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === touchId,
      );
      if (!touch) return;

      const delta = touch.clientY - startY;
      if (
        !handoff &&
        scroller.scrollTop <= 1 &&
        delta > 6
      ) {
        handoff = true;
        beginDrag(startY, "content");
      }

      if (!handoff) return;

      event.preventDefault();
      const now = performance.now();
      const elapsed = Math.max(1, now - lastAt);
      drag.current.velocity = (touch.clientY - lastY) / elapsed;
      lastY = touch.clientY;
      lastAt = now;
      drag.current.lastY = touch.clientY;
      drag.current.lastAt = now;
      drag.current.moved = true;
      paintOffset(
        clampWithResistance(
          drag.current.startOffset + touch.clientY - drag.current.startY,
        ),
      );
    };

    const touchEnd = (event: TouchEvent) => {
      event.stopPropagation();
      if (!handoff) return;
      event.preventDefault();
      handoff = false;
      finishDrag();
    };

    scroller.addEventListener("touchstart", touchStart, { passive: true });
    scroller.addEventListener("touchmove", touchMove, { passive: false });
    scroller.addEventListener("touchend", touchEnd, { passive: false });
    scroller.addEventListener("touchcancel", touchEnd, { passive: false });

    return () => {
      scroller.removeEventListener("touchstart", touchStart);
      scroller.removeEventListener("touchmove", touchMove);
      scroller.removeEventListener("touchend", touchEnd);
      scroller.removeEventListener("touchcancel", touchEnd);
    };
  }, [viewportHeight]);

  const toggleSnap = () => {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    applySnap(
      snap === "collapsed"
        ? "medium"
        : snap === "medium"
          ? "expanded"
          : "medium",
    );
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const order: HomeSheetSnap[] = ["expanded", "medium", "collapsed"];
    const index = order.indexOf(snap);
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applySnap(order[Math.max(0, index - 1)]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applySnap(order[Math.min(order.length - 1, index + 1)]);
    } else if (event.key === "Home") {
      event.preventDefault();
      applySnap("expanded");
    } else if (event.key === "End") {
      event.preventDefault();
      applySnap("collapsed");
    }
  };

  return (
    <section
      ref={sheetRef}
      className="nr-rider-home-panel nr-rider-home-sheet"
      aria-label={t("destination")}
      data-snap={snap}
      data-dragging={dragging || undefined}
      style={{
        "--nr-home-sheet-offset": "29dvh",
      } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div
        className="nr-home-sheet-grab-area"
        onPointerDown={onGrabPointerDown}
        onPointerMove={onGrabPointerMove}
        onPointerUp={onGrabPointerEnd}
        onPointerCancel={onGrabPointerEnd}
        onLostPointerCapture={onGrabPointerEnd}
      >
        <button
          type="button"
          className="nr-home-sheet-drag-zone"
          aria-label={
            language === "am"
              ? "የመነሻ ፓነሉን አስፋ ወይም አሳንስ"
              : "Expand or collapse ride panel"
          }
          aria-expanded={snap !== "collapsed"}
          onClick={toggleSnap}
          onKeyDown={onHandleKeyDown}
        >
          <span className="nr-home-handle" aria-hidden="true" />
        </button>

        <div className="nr-rider-home-intro">
          <div>
            <span className="nr-home-kicker">NEXRIDE</span>
            <h2>
              {language === "am"
                ? "ወዴት መሄድ ይፈልጋሉ?"
                : "Where are you going?"}
            </h2>
          </div>
          <span className="nr-home-city">
            <Icon name="pin" size={14} />
            {t("city")}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="nr-home-sheet-scroll"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
      >
        <h1 className="nr-sr-only">{t("where")}</h1>
        <button
          className="nr-home-search"
          onClick={navigate}
          aria-label={t("destination")}
        >
          <Icon name="search" size={22} />
          <span>{t("whereTo")}</span>
          <span className="nr-search-arrow">
            <Icon name="arrow" size={20} />
          </span>
        </button>

        <div className="nr-home-expandable">
          <div className="nr-home-shortcuts">
            {(["home", "work", "saved"] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => shortcut(kind)}
                aria-label={t(
                  kind === "home"
                    ? "home"
                    : kind === "work"
                      ? "work"
                      : "savedPlaces",
                )}
              >
                <Icon
                  name={
                    kind === "home"
                      ? "home"
                      : kind === "work"
                        ? "briefcase"
                        : "star"
                  }
                  size={20}
                />
                <span>
                  {t(
                    kind === "home"
                      ? "home"
                      : kind === "work"
                        ? "work"
                        : "savedPlaces",
                  )}
                </span>
                {kind !== "saved" && data.saved[kind] && (
                  <i aria-hidden="true" title={t("shortcutSet")} />
                )}
              </button>
            ))}
          </div>

          <LocationMessage
            status={status}
            position={position}
            label={locationLabel}
          />

          <div className="nr-home-history-heading">
            <h2>{t("recentDestinations")}</h2>
          </div>

          {!data.recent.length && (
            <div className="nr-home-empty-state">
              <span>
                <Icon name="clock" size={19} />
              </span>
              <div>
                <strong>{t("emptyRecent")}</strong>
                <small>Places you ride to will appear here.</small>
              </div>
            </div>
          )}

          <div className="nr-home-destinations">
            {rows.map((p) => (
              <ListRow
                key={placeKey(p)}
                icon="pin"
                title={
                  language === "en" && p.name === "Bole Airport"
                    ? p.address
                    : placeName(p, language)
                }
                detail={
                  p.name === "Bole Airport" ? t("city") : locality(p, language)
                }
                onClick={() => choose(p)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
