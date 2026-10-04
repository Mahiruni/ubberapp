"use client";
import { useState } from "react";
import {
  Button,
  Icon,
  ListRow,
  Sheet,
  StatusBanner,
  useTranslation,
} from "./ui";
export type DriverScreen =
  "home" | "request" | "navigation" | "earnings" | "history" | "profile";
export function DriverWorkspace({
  screen,
  navigate,
  onSafety,
}: {
  screen: DriverScreen;
  navigate: (s: DriverScreen) => void;
  onSafety: () => void;
}) {
  const t = useTranslation();
  const [online, setOnline] = useState(false);
  const [request, setRequest] = useState(true);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  if (screen === "home")
    return (
      <Sheet title={t("ready")} subtitle={t("driverMessage")}>
        <div className="nr-availability">
          <Icon name="power" />
          <span>
            <strong>{t(online ? "online" : "offline")}</strong>
            <small>{t("sampleAccount")}</small>
          </span>
          <button
            role="switch"
            aria-checked={online}
            aria-label={t("goOnline")}
            className={`nr-switch ${online ? "on" : ""}`}
            onClick={() => setOnline((v) => !v)}
          >
            <span />
          </button>
        </div>
        <div className="nr-driver-metrics">
          <div>
            <small>{t("today")}</small>
            <strong>
              1,245 <span>ETB</span>
            </strong>
          </div>
          <div>
            <small>{t("sampleTrips")}</small>
            <strong>12</strong>
          </div>
        </div>
        <div className="nr-demand">
          <span>
            <Icon name="navigation" />
            {t("demand")}
          </span>
          <small>{t("demandNote")}</small>
        </div>
        <Button onClick={() => setOnline((v) => !v)}>
          {t(online ? "goOffline" : "goOnline")}
        </Button>
        {online && (
          <button
            className="nr-request-teaser"
            onClick={() => navigate("request")}
          >
            <span className="nr-list-icon">
              <Icon name="car" />
            </span>
            <span>
              <strong>{t("viewRequest")}</strong>
              <small>Meskel Square · Bole Airport</small>
            </span>
            <Icon name="chevron" />
          </button>
        )}
        <button className="nr-driver-safety" onClick={onSafety}>
          <Icon name="shield" />
          <span>{t("safety")}</span>
          <Icon name="chevron" size={16} />
        </button>
      </Sheet>
    );
  if (screen === "request")
    return (
      <Sheet title={t("newRequest")} onBack={() => navigate("home")}>
        {request ? (
          <>
            <div className="nr-request-fare">
              <small>{t("sampleFare")}</small>
              <strong>
                152 <span>ETB</span>
              </strong>
            </div>
            <div className="nr-route-summary">
              <div>
                <span className="nr-route-dot" />
                <span>
                  <small>{t("pickup")}</small>
                  <strong>Meskel Square</strong>
                </span>
              </div>
              <div>
                <span className="nr-route-dot end" />
                <span>
                  <small>{t("dropoff")}</small>
                  <strong>Bole Airport</strong>
                </span>
              </div>
            </div>
            <div className="nr-request-facts">
              <span>6.2 km</span>
              <span>18 min</span>
              <span>★ 4.9</span>
            </div>
            <StatusBanner>{t("requestNote")}</StatusBanner>
            <Button
              onClick={() => {
                setRequest(false);
                setStarted(false);
                setCompleted(false);
                navigate("navigation");
              }}
            >
              {t("accept")}
            </Button>
            <Button variant="secondary" onClick={() => setRequest(false)}>
              {t("decline")}
            </Button>
          </>
        ) : (
          <div className="nr-empty-state">
            <span>
              <Icon name="car" size={28} />
            </span>
            <h2>{t("noRequests")}</h2>
            <Button onClick={() => setRequest(true)}>{t("loadRequest")}</Button>
          </div>
        )}
      </Sheet>
    );
  if (screen === "navigation")
    return (
      <Sheet
        title={t(started ? "onTrip" : "headPickup")}
        subtitle={t("sample")}
      >
        <div className="nr-navigation-cue">
          <span>
            <Icon name="navigation" size={32} />
          </span>
          <div>
            <small>{t(started ? "dropoff" : "pickup")}</small>
            <strong>{started ? "Bole Airport" : "Meskel Square"}</strong>
          </div>
        </div>
        <p className="nr-muted">{t("navigationNote")}</p>
        <ListRow icon="user" title="NexRide rider" detail={t("sample")} />
        <Button
          onClick={() => {
            if (started) {
              setCompleted(true);
              navigate("earnings");
            } else setStarted(true);
          }}
        >
          {t(started ? "complete" : "startTrip")}
        </Button>
        <Button variant="ghost" onClick={() => navigate("home")}>
          {t("cancel")}
        </Button>
      </Sheet>
    );
  if (screen === "earnings")
    return (
      <Sheet title={t("earnings")}>
        <div className="nr-earnings-total">
          <small>{t("today")}</small>
          <strong>
            {completed ? "1,397" : "1,245"} <span>ETB</span>
          </strong>
        </div>
        <div className="nr-earnings-chart" role="img" aria-label={t("week")}>
          <svg viewBox="0 0 320 110" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#00C878" stopOpacity=".28" />
                <stop offset="1" stopColor="#00C878" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 89 25 70 50 80 75 40 100 68 125 55 150 16 175 52 200 30 225 65 250 18 275 40 300 5 320 25V110H0Z"
              fill="url(#earningsFill)"
            />
            <path
              d="M0 89 25 70 50 80 75 40 100 68 125 55 150 16 175 52 200 30 225 65 250 18 275 40 300 5 320 25"
              stroke="#00C878"
              strokeWidth="2"
            />
          </svg>
          <small>{t("week")}</small>
        </div>
        <div className="nr-list">
          <ListRow
            icon="car"
            title={t("sampleTrips")}
            detail={completed ? "13" : "12"}
          />
          <ListRow icon="clock" title={t("onlineTime")} detail="6h 23m" />
          <ListRow icon="money" title={t("sampleFare")} detail="104 ETB" />
        </div>
        <p className="nr-fine-print">{t("earningsNote")}</p>
        <Button variant="secondary" onClick={() => navigate("history")}>
          {t("history")}
        </Button>
      </Sheet>
    );
  return (
    <Sheet title={t("history")}>
      {completed ? (
        <>
          <ListRow
            icon="check"
            title="Bole Airport"
            detail={`152 ETB · ${t("sample")}`}
          />
          <p className="nr-fine-print">{t("earningsNote")}</p>
        </>
      ) : (
        <div className="nr-empty-state">
          <span>
            <Icon name="clock" size={28} />
          </span>
          <h2>{t("emptyTrips")}</h2>
          <p>{t("emptyNote")}</p>
          <Button onClick={() => navigate("request")}>
            {t("viewRequest")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
