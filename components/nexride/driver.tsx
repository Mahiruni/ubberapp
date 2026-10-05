"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";
import { supabase } from "../../lib/supabase";
import "../../app/driver/driver-dashboard.css";

export type DriverScreen = "home" | "earnings" | "map" | "profile";

type DriverState = {
  name: string;
  avatarUrl: string;
  online: boolean;
  verified: boolean;
  canGoOnline: boolean;
  permissionIssue: string;
  permissionAction: string;
  earnings: number | null;
  trips: number | null;
  rating: number | null;
  activeTrip: { pickup: string; destination: string; status: string } | null;
};

const emptyState: DriverState = { name: "Driver", avatarUrl: "", online: false, verified: false, canGoOnline: false, permissionIssue: "Driver verification is still pending.", permissionAction: "Complete verification", earnings: null, trips: null, rating: null, activeTrip: null };
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown) => typeof v === "string" ? v : "";

function parseDriverState(metadata: Record<string, unknown>): DriverState {
  const verified = metadata.driver_verified === true || metadata.verification_status === "approved";
  const permissions = Array.isArray(metadata.required_permissions) ? metadata.required_permissions.filter((v): v is string => typeof v === "string") : [];
  const issue = str(metadata.online_block_reason) || (permissions.length ? `Required permission: ${permissions[0]}` : "");
  const canGoOnline = metadata.can_go_online === true || (verified && permissions.length === 0 && !issue);
  const active = metadata.active_trip;
  const activeTrip = active && typeof active === "object" ? { pickup: str((active as Record<string, unknown>).pickup) || "Pickup", destination: str((active as Record<string, unknown>).destination) || "Destination", status: str((active as Record<string, unknown>).status) || "Active trip" } : null;
  return { name: str(metadata.full_name) || str(metadata.name) || "Driver", avatarUrl: str(metadata.avatar_url) || str(metadata.avatarUrl), online: metadata.driver_online === true || metadata.online === true, verified, canGoOnline, permissionIssue: issue, permissionAction: str(metadata.online_block_action) || (verified ? "Resolve issue" : "Complete verification"), earnings: num(metadata.today_earnings), trips: num(metadata.completed_trips_today), rating: num(metadata.rating), activeTrip };
}

function formatEarnings(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(value); }

export function DriverWorkspace({ screen, navigate, onSafety }: { screen: DriverScreen; navigate: (s: DriverScreen) => void; onSafety: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<DriverState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) { setError("Your driver session could not be restored."); setLoading(false); return; }
      if (data.session.user.user_metadata?.role !== "driver") { router.replace("/auth"); return; }
      setState(parseDriverState(data.session.user.user_metadata || {}));
      setLoading(false);
    }).catch(() => { if (active) { setError("Unable to load driver data."); setLoading(false); } });
    return () => { active = false; };
  }, [router]);

  const firstName = useMemo(() => state.name.trim().split(/\s+/)[0] || "Driver", [state.name]);
  const initials = useMemo(() => state.name.trim().split(/\s+/).slice(0, 2).map((v) => v[0]).join("").toUpperCase() || "DR", [state.name]);

  const toggleAvailability = async () => {
    if (updating || (!state.canGoOnline && !state.online)) return;
    setUpdating(true); setError("");
    const nextOnline = !state.online;
    const { error: updateError } = await supabase.auth.updateUser({ data: { driver_online: nextOnline } });
    if (updateError) setError("Availability could not be updated. Please try again.");
    else setState((current) => ({ ...current, online: nextOnline }));
    setUpdating(false);
  };

  if (screen === "earnings") return <div className="nr-driver-page"><PageHead title="Earnings" navigate={navigate} /><section className="nr-driver-card nr-driver-earnings-card"><span>Today</span><strong>{formatEarnings(state.earnings)} <small>ETB</small></strong><p>Actual earnings appear here when connected to driver earnings data.</p></section><section className="nr-driver-card nr-driver-list-card"><div><span>Completed trips</span><strong>{state.trips ?? "—"}</strong></div><div><span>Rating</span><strong>{state.rating === null ? "—" : state.rating.toFixed(1)} <small>★</small></strong></div></section><DriverBottomNav screen={screen} navigate={navigate} /></div>;
  if (screen === "map") return <div className="nr-driver-page"><PageHead title="Map" navigate={navigate} back={false} /><div className="nr-driver-map-placeholder"><Icon name="navigation" size={34} /><strong>Driver map</strong><span>Live driver positioning and trip navigation will appear here.</span></div><DriverBottomNav screen={screen} navigate={navigate} /></div>;
  if (screen === "profile") return <div className="nr-driver-page"><PageHead title="Profile" navigate={navigate} back={false} /><section className="nr-driver-profile-card"><div className="nr-driver-avatar large">{state.avatarUrl ? <img src={state.avatarUrl} alt="" /> : initials}</div><div><strong>{state.name}</strong><span>{state.verified ? "Verified driver" : "Verification pending"}</span></div></section><button className="nr-driver-action-row" onClick={onSafety}><Icon name="shield" /><span>Safety & support</span><Icon name="chevron" /></button><DriverBottomNav screen={screen} navigate={navigate} /></div>;

  return <div className="nr-driver-page">
    <header className="nr-driver-header"><div className="nr-driver-avatar">{state.avatarUrl ? <img src={state.avatarUrl} alt="" /> : initials}</div><div><span className="nr-driver-kicker">DRIVER HOME</span><h1>Good day, {firstName}</h1><p>Ready when you are.</p></div><button className="nr-driver-icon-btn" onClick={() => navigate("profile")} aria-label="Profile"><Icon name="user" /></button></header>
    {loading ? <div className="nr-driver-card nr-driver-loading"><span className="nr-driver-skeleton wide" /><span className="nr-driver-skeleton" /><span className="nr-driver-skeleton" /></div> : error ? <div className="nr-driver-notice error"><Icon name="info" /><span>{error}</span></div> : !state.verified ? <div className="nr-driver-notice pending"><Icon name="clock" /><div><strong>Verification pending</strong><span>Your driver account must be verified before you can go online.</span></div><button onClick={() => router.push("/driver/onboarding")}>Complete</button></div> : null}
    {!loading && state.verified && state.permissionIssue && !state.online && <div className="nr-driver-notice blocked"><Icon name="shield" /><div><strong>Can’t go online</strong><span>{state.permissionIssue}</span></div><button onClick={() => router.push("/driver/onboarding")}>{state.permissionAction}</button></div>}
    <section className={`nr-driver-card nr-availability-card ${state.online ? "is-online" : ""}`}><div className="nr-availability-copy"><span className={`nr-status-dot ${state.online ? "online" : "offline"}`} /><div><strong>{state.online ? "Online" : "Offline"}</strong><span>{state.online ? "You can receive trip requests." : "You are not receiving trip requests."}</span></div></div><button className={`nr-driver-primary ${state.online ? "secondary-state" : ""}`} disabled={loading || updating || (!state.canGoOnline && !state.online)} onClick={toggleAvailability}>{updating ? "Updating…" : state.online ? "Go Offline" : "Go Online"}</button></section>
    <div className="nr-driver-metric-grid"><Metric label="Today’s earnings" value={state.earnings === null ? "—" : formatEarnings(state.earnings)} suffix="ETB" loading={loading} /><Metric label="Completed trips" value={state.trips === null ? "—" : String(state.trips)} loading={loading} /><Metric label="Rating" value={state.rating === null ? "—" : state.rating.toFixed(1)} suffix={state.rating === null ? "" : "★"} loading={loading} /></div>
    {state.activeTrip ? <section className="nr-driver-card nr-active-trip"><div><span className="nr-driver-kicker">ACTIVE TRIP</span><strong>{state.activeTrip.status}</strong></div><div className="nr-trip-route"><span>{state.activeTrip.pickup}</span><Icon name="chevron" /><span>{state.activeTrip.destination}</span></div><button onClick={() => navigate("map")}>Open trip</button></section> : <section className="nr-driver-card nr-empty-trip"><Icon name="car" size={25} /><div><strong>{state.online ? "Waiting for your next trip" : "No active trip"}</strong><span>{state.online ? "Stay online to receive new requests." : "Your active trip will appear here."}</span></div></section>}
    <button className="nr-driver-action-row" onClick={onSafety}><Icon name="shield" /><span>Safety & support</span><Icon name="chevron" /></button><DriverBottomNav screen={screen} navigate={navigate} />
  </div>;
}

function PageHead({ title, navigate, back = true }: { title: string; navigate: (s: DriverScreen) => void; back?: boolean }) { return <div className="nr-driver-page-head"><div><span className="nr-driver-kicker">NEXRIDE DRIVER</span><h1>{title}</h1></div>{back && <button className="nr-driver-icon-btn" onClick={() => navigate("home")} aria-label="Back"><Icon name="chevron" /></button>}</div>; }
function Metric({ label, value, suffix, loading }: { label: string; value: string; suffix?: string; loading: boolean }) { return <section className="nr-driver-card nr-metric">{loading ? <><span className="nr-driver-skeleton" /><span className="nr-driver-skeleton wide" /></> : <><span>{label}</span><strong>{value} {suffix && <small>{suffix}</small>}</strong></>}</section>; }
function DriverBottomNav({ screen, navigate }: { screen: DriverScreen; navigate: (s: DriverScreen) => void }) { const items: { id: DriverScreen; label: string; icon: "home" | "money" | "navigation" | "user" }[] = [{ id: "home", label: "Home", icon: "home" }, { id: "earnings", label: "Earnings", icon: "money" }, { id: "map", label: "Map", icon: "navigation" }, { id: "profile", label: "Profile", icon: "user" }]; return <nav className="nr-driver-bottom-nav" aria-label="Driver navigation">{items.map((item) => <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span></button>)}</nav>; }
