"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon, LanguageContext, ListRow, useTranslation } from "./ui";
import { locality, placeKey, placeName } from "../../lib/nexride-search";
import { type Place } from "../../lib/nexride-places";
import type { HomePlaces } from "../../lib/nexride-home";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";

type HomeSheetSnap = "collapsed" | "medium" | "expanded";

const visibleRatio: Record<HomeSheetSnap, number> = {
  collapsed: 0.29,
  medium: 0.5,
  expanded: 0.78,
};

const snapHeight = (snap: HomeSheetSnap, viewportHeight: number) => {
  const mapMinimum = Math.min(160, viewportHeight * 0.28);
  return Math.max(
    150,
    Math.min(visibleRatio[snap] * viewportHeight, viewportHeight - mapMinimum),
  );
};

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
  const heightRef = useRef(snapHeight("medium", 800));
  const dragActive = useRef(false);
  const drag = useRef({
    startY: 0,
    startHeight: snapHeight("medium", 800),
    lastY: 0,
    lastAt: 0,
    velocity: 0,
    moved: false,
  });

  const flowRoot = () =>
    sheetRef.current?.closest<HTMLElement>(".rider-map-flow") || null;

  const paintHeight = (next: number) => {
    heightRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      flowRoot()?.style.setProperty(
        "--nr-flow-sheet-height",
        `${heightRef.current}px`,
      );
      frameRef.current = null;
    });
  };

  const minHeight = () => snapHeight("collapsed", viewportHeight);
  const maxHeight = () => snapHeight("expanded", viewportHeight);

  const withResistance = (raw: number) => {
    const min = minHeight();
    const max = maxHeight();
    if (raw < min) return min + (raw - min) * 0.22;
    if (raw > max) return max + (raw - max) * 0.22;
    return raw;
  };

  useEffect(() => {
    const update = () => {
      const nextHeight = Math.max(
        520,
        window.visualViewport?.height || window.innerHeight || 800,
      );
      setViewportHeight(nextHeight);
      const next = snapHeight(snap, nextHeight);
      heightRef.current = next;
      flowRoot()?.style.setProperty("--nr-flow-sheet-height", `${next}px`);
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      flowRoot()?.style.removeProperty("--nr-flow-sheet-height");
      flowRoot()?.removeAttribute("data-sheet-dragging");
    };
  }, [snap]);

  const applySnap = (next: HomeSheetSnap) => {
    dragActive.current = false;
    flowRoot()?.removeAttribute("data-sheet-dragging");
    setDragging(false);
    setSnap(next);
    paintHeight(snapHeight(next, viewportHeight));
  };

  const nearestSnap = (value: number) =>
    (Object.keys(visibleRatio) as HomeSheetSnap[]).reduce((best, candidate) =>
      Math.abs(snapHeight(candidate, viewportHeight) - value) <
      Math.abs(snapHeight(best, viewportHeight) - value)
        ? candidate
        : best,
    );

  const beginDrag = (clientY: number) => {
    const now = performance.now();
    drag.current = {
      startY: clientY,
      startHeight: heightRef.current,
      lastY: clientY,
      lastAt: now,
      velocity: 0,
      moved: false,
    };
    dragActive.current = true;
    flowRoot()?.setAttribute("data-sheet-dragging", "true");
    setDragging(true);
  };

  const moveDrag = (clientY: number) => {
    if (!dragActive.current) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.current.lastAt);
    const instantVelocity = -(clientY - drag.current.lastY) / elapsed;
    drag.current.velocity = drag.current.velocity * 0.62 + instantVelocity * 0.38;
    drag.current.lastY = clientY;
    drag.current.lastAt = now;

    const delta = drag.current.startY - clientY;
    if (Math.abs(delta) > 4) drag.current.moved = true;
    paintHeight(withResistance(drag.current.startHeight + delta));
  };

  const finishDrag = () => {
    if (!dragActive.current) return;
    dragActive.current = false;
    setDragging(false);

    const min = minHeight();
    const max = maxHeight();
    const clamped = Math.min(max, Math.max(min, heightRef.current));
    const projected = Math.min(
      max,
      Math.max(min, clamped + drag.current.velocity * 230),
    );
    applySnap(nearestSnap(projected));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginDrag(event.clientY);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragActive.current) return;
    event.preventDefault();
    event.stopPropagation();
    moveDrag(event.clientY);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDrag();
  };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let startY = 0;
    let touchId = -1;
    let handedToSheet = false;
    let startedOnControl = false;

    const start = (event: TouchEvent) => {
      event.stopPropagation();
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchId = touch.identifier;
      startY = touch.clientY;
      handedToSheet = false;
      const target = event.target;
      startedOnControl =
        target instanceof Element &&
        Boolean(target.closest("button,a,input,textarea,select,[role='button'],.nr-list-row"));
    };

    const move = (event: TouchEvent) => {
      event.stopPropagation();
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === touchId,
      );
      if (!touch) return;

      const deltaY = touch.clientY - startY;
      const atTop = scroller.scrollTop <= 1;
      const verticalIntent = Math.abs(deltaY) > 6;
      const canExpandFromBody = deltaY < 0 && snap !== "expanded";
      const canCollapseFromBody = deltaY > 0;

      if (
        !handedToSheet &&
        !startedOnControl &&
        atTop &&
        verticalIntent &&
        (canExpandFromBody || canCollapseFromBody)
      ) {
        handedToSheet = true;
        beginDrag(startY);
        drag.current.moved = true;
      }

      if (!handedToSheet) return;
      event.preventDefault();
      moveDrag(touch.clientY);
    };

    const end = (event: TouchEvent) => {
      event.stopPropagation();
      if (!handedToSheet) return;
      event.preventDefault();
      handedToSheet = false;
      finishDrag();
    };

    scroller.addEventListener("touchstart", start, { passive: true });
    scroller.addEventListener("touchmove", move, { passive: false });
    scroller.addEventListener("touchend", end, { passive: false });
    scroller.addEventListener("touchcancel", end, { passive: false });

    return () => {
      scroller.removeEventListener("touchstart", start);
      scroller.removeEventListener("touchmove", move);
      scroller.removeEventListener("touchend", end);
      scroller.removeEventListener("touchcancel", end);
    };
  }, [viewportHeight, snap]);

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
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="nr-home-sheet-grab-area"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
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
        onTouchStart={(event) => event.stopPropagation()}
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
