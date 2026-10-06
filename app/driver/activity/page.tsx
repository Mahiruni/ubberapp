"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorState, Icon, SkeletonBlock, StatusChip, useTranslation } from "../../../components/nexride/ui";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { supabase } from "../../../lib/supabase";

type ActivityRow = {
  id: string;
  status: string;
  pickup_location: string | null;
  destination_location: string | null;
  ride_category: string | null;
  estimated_trip_fare_etb: number | string | null;
  final_fare_etb: number | string | null;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

const toneFor = (status: string): "neutral" | "success" | "warning" | "danger" | "info" => {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "withdrawn") return "danger";
  if (status === "in_trip" || status === "accepted" || status === "arrived_pickup") return "info";
  if (status === "pending") return "warning";
  return "neutral";
};

const labelFor = (status: string) =>
  status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

const money = (value: ActivityRow["final_fare_etb"]) => {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(amount)
    : "—";
};

export default function DriverActivityPage() {
  const router = useRouter();
  const t = useTranslation();
  const [driverId, setDriverId] = useState("");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (id: string) => {
    setFailed(false);
    const result = await supabase
      .from("ride_requests")
      .select("id,status,pickup_location,destination_location,ride_category,estimated_trip_fare_etb,final_fare_etb,created_at,completed_at,cancelled_at")
      .eq("assigned_driver_id", id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (result.error) {
      setFailed(true);
      setLoading(false);
      return;
    }

    setRows((result.data || []) as ActivityRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        router.replace("/driver/auth");
        return;
      }

      const role = await resolveSessionRole(data.session);
      if (!active) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role !== "driver") {
        router.replace("/");
        return;
      }

      const id = data.session.user.id;
      setDriverId(id);
      await load(id);
      if (!active) return;

      channel = supabase
        .channel(`driver-activity-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ride_requests", filter: `assigned_driver_id=eq.${id}` },
          () => void load(id),
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load, router]);

  const stats = useMemo(() => {
    const completed = rows.filter((row) => row.status === "completed").length;
    const cancelled = rows.filter((row) => row.status === "cancelled" || row.status === "withdrawn").length;
    return { completed, cancelled };
  }, [rows]);

  return (
    <main className="min-h-dvh bg-[var(--nr-navy)] px-3 pb-[calc(96px+env(safe-area-inset-bottom,0px))] pt-[max(14px,env(safe-area-inset-top,0px))] text-white sm:px-6 sm:pt-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-5 flex items-center gap-3">
          <button
            className="grid size-11 min-h-11 place-items-center rounded-[15px] border border-white/10 bg-white/5 text-white"
            onClick={() => router.push("/driver/home")}
            aria-label={t("back")}
          >
            <Icon name="back" />
          </button>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold tracking-[.14em] text-[#65edb0]">NEXRIDE · DRIVER</span>
            <h1 className="mt-1 text-[clamp(24px,6vw,34px)] font-extrabold tracking-[-.04em]">{t("activity")}</h1>
            <p className="mt-1 text-sm text-white/60">Accepted, completed, and cancelled trips.</p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-2.5" aria-label="Activity summary">
          <div className="rounded-[20px] border border-white/8 bg-white/[.055] p-4">
            <small className="text-[11px] font-semibold text-white/55">Completed</small>
            <strong className="mt-1 block text-2xl tabular-nums">{stats.completed}</strong>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[.055] p-4">
            <small className="text-[11px] font-semibold text-white/55">Cancelled</small>
            <strong className="mt-1 block text-2xl tabular-nums">{stats.cancelled}</strong>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-3" aria-busy="true">
            {[0,1,2].map((item) => (
              <div key={item} className="rounded-[22px] border border-white/8 bg-white/[.055] p-4">
                <SkeletonBlock className="h-4 w-28 !bg-white/10" />
                <SkeletonBlock className="mt-3 h-5 w-4/5 !bg-white/10" />
                <SkeletonBlock className="mt-2 h-4 w-2/3 !bg-white/10" />
              </div>
            ))}
          </div>
        ) : failed ? (
          <ErrorState
            title="Activity unavailable"
            detail="We couldn’t refresh your trips. Check your connection and try again."
            action={<Button variant="secondary" onClick={() => driverId && void load(driverId)}>Retry</Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No trips here yet"
            detail="Your accepted and completed trips will appear here."
            action={<Button onClick={() => router.push("/driver/home")}>Back to home</Button>}
          />
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const fare = row.final_fare_etb ?? row.estimated_trip_fare_etb;
              return (
                <article key={row.id} className="rounded-[22px] border border-white/8 bg-white/[.055] p-4 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <StatusChip tone={toneFor(row.status)}>{labelFor(row.status)}</StatusChip>
                    <time className="text-xs tabular-nums text-white/50" dateTime={row.created_at}>
                      {new Intl.DateTimeFormat("en-ET", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(row.created_at))}
                    </time>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="flex gap-3">
                      <span className="mt-1 size-2.5 shrink-0 rounded-full bg-[#00c878]" />
                      <div><small className="text-[10px] font-bold tracking-[.1em] text-white/45">PICKUP</small><strong className="mt-0.5 block text-sm">{row.pickup_location || "Pickup unavailable"}</strong></div>
                    </div>
                    <div className="flex gap-3">
                      <span className="mt-1 size-2.5 shrink-0 rounded-full bg-white/55" />
                      <div><small className="text-[10px] font-bold tracking-[.1em] text-white/45">DESTINATION</small><strong className="mt-0.5 block text-sm">{row.destination_location || "Destination unavailable"}</strong></div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/8 pt-3">
                    <div><small className="block text-[10px] uppercase tracking-[.1em] text-white/45">Ride</small><strong className="text-sm capitalize">{row.ride_category || "Ride"}</strong></div>
                    <div className="text-right"><small className="block text-[10px] uppercase tracking-[.1em] text-white/45">Fare</small><strong className="text-base tabular-nums">ETB {money(fare)}</strong></div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <nav className="fixed inset-x-3 bottom-[calc(8px+env(safe-area-inset-bottom,0px))] z-30 mx-auto grid max-w-xl grid-cols-5 gap-1 rounded-[22px] border border-white/10 bg-[#071722]/95 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,.30)] backdrop-blur-xl" aria-label="Driver navigation">
        <button className="grid min-h-12 place-items-center gap-0.5 rounded-[16px] text-[10px] font-semibold text-white/55" onClick={() => router.push("/driver/home")}><Icon name="home" size={18}/><span>{t("home")}</span></button>
        <button className="grid min-h-12 place-items-center gap-0.5 rounded-[16px] text-[10px] font-semibold text-white/55" onClick={() => router.push("/driver/home?screen=earnings")}><Icon name="money" size={18}/><span>{t("earnings")}</span></button>
        <button className="grid min-h-12 place-items-center gap-0.5 rounded-[16px] bg-[#00c878]/15 text-[10px] font-semibold text-[#65edb0]" aria-current="page"><Icon name="clock" size={18}/><span>{t("activity")}</span></button>
        <button className="grid min-h-12 place-items-center gap-0.5 rounded-[16px] text-[10px] font-semibold text-white/55" onClick={() => router.push("/support?role=driver")}><Icon name="chat" size={18}/><span>{t("help")}</span></button>
        <button className="grid min-h-12 place-items-center gap-0.5 rounded-[16px] text-[10px] font-semibold text-white/55" onClick={() => router.push("/driver/home?screen=profile")}><Icon name="user" size={18}/><span>{t("account")}</span></button>
      </nav>
    </main>
  );
}
