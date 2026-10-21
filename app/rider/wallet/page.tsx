"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, LanguageContext } from "../../../components/nexride/ui";
import { RiderMenu, usePersistedRiderTheme } from "../../../components/nexride/rider-menu";
import { BilooFooterNav, riderFooterLinks } from "../../../components/nexride/biloo-footer-nav";
import { supabase } from "../../../lib/supabase";
import {
  paymentMethods, paymentMethodName, formatEtb, isBilooMethod, tripPaymentLabel,
  type BilooMethod,
} from "../../../lib/biloo-payment-preferences";
import "../../nexride.css";
import "../supporting.css";
import "../../detail-system.css";
import "./financial-experience.css";

type TripRow = {
  id: string;
  pickup_location: string;
  destination_location: string;
  payment_method: string;
  payment_status: string;
  status: string;
  final_fare_etb: number | string | null;
  estimated_trip_fare_etb: number | string | null;
  created_at: string;
  completed_at: string | null;
};

type GatewayAttempt = {
  id: string;
  provider: string;
  provider_tx_ref: string;
  amount_etb: number | string;
  status: string;
  created_at: string;
};

const strings = {
  heading: ["Payments", "ክፍያዎች"],
  subtitle: ["Your ride payments, clearly organized.", "የጉዞ ክፍያዎችዎ በግልጽ ሁኔታ።"],
  cash: ["Cash payments", "በጥሬ ገንዘብ ክፍያ"],
  cashInfo: ["Pay your driver directly after each ride.", "ከእያንዳንዱ ጉዞ በኋላ ለአሽከርካሪዎ በቀጥታ ይክፈሉ።"],
  active: ["Available now", "አሁን ይገኛል"],
  noWallet: ["Biloo does not hold customer money in a wallet.", "Biloo የደንበኞችን ገንዘብ በዋሌት ውስጥ አያስቀምጥም።"],
  methods: ["Methods", "የክፍያ ዘዴዎች"],
  activity: ["Activity", "እንቅስቃሴ"],
  preferred: ["Your saved preference", "የተቀመጠ ምርጫዎ"],
  cashNote: ["Cash remains the payment method for rides until online checkout launches.", "የኦንላይን ክፍያ እስኪጀምር ድረስ ለጉዞዎች ጥሬ ገንዘብ ይጠቀሙ።"],
  future: ["Upcoming methods", "በቅርቡ የሚመጡ አማራጮች"],
  futureNote: ["Save which method you'd like to use later. This does not link an account, enable payments or charge you.", "ወደፊት ሊጠቀሙበት የሚፈልጉትን ዘዴ ይመርጡ። ይህ ክፍያ አያስጀምርም።"],
  comingSoon: ["Not active", "አልነቃም"],
  selected: ["Saved preference", "የተቀመጠ ምርጫ"],
  save: ["Save preference", "ምርጫ አስቀምጥ"],
  saving: ["Saving…", "በማስቀመጥ ላይ…"],
  protect: ["No PIN, OTP, card or bank details are requested here.", "እዚህ PIN፣ OTP ወይም የባንክ መረጃ አይጠየቅም።"],
  tripHistory: ["Trip payment activity", "የጉዞ ክፍያ ታሪክ"],
  tripHistoryNote: ["Amounts and statuses are read from your actual trip records.", "መጠኖችና ሁኔታዎች ከእውነተኛ የጉዞ መዝገቦችዎ ናቸው።"],
  attempts: ["Online payment attempts", "የኦንላይን ክፍያ ሙከራዎች"],
  attemptsNote: ["Only actual provider records appear here.", "እውነተኛ የክፍያ መዝገቦች ብቻ እዚህ ይታያሉ።"],
  empty: ["No completed trips yet", "እስካሁን የተጠናቀቀ ጉዞ የለም"],
  emptyNote: ["Your completed rides will appear here automatically.", "የተጠናቀቁ ጉዞዎችዎ እዚህ ይታያሉ።"],
  noAttempts: ["No online transactions recorded.", "የኦንላይን ክፍያ መዝገብ የለም።"],
  detail: ["Trip details", "የጉዞ ዝርዝር"],
  support: ["Payment help", "የክፍያ እገዛ"],
  error: ["Payment information is temporarily unavailable. Your account has not changed.", "የክፍያ መረጃ ለጊዜው አይገኝም። መለያዎ አልተቀየረም።"],
  saveError: ["Could not save your preference. No payment details were changed.", "ምርጫውን ማስቀመጥ አልተቻለም። የክፍያ መረጃ አልተቀየረም።"],
  saved: ["Preference saved. Digital payments are still unavailable.", "ምርጫው ተቀምጧል። ዲጂታል ክፍያ ገና አይገኝም።"],
} as const;

function dateLabel(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? "—" :
    parsed.toLocaleDateString("en-ET", { day: "numeric", month: "short", year: "numeric" });
}

export default function RiderWalletPage() {
  const router = useRouter();
  const theme = usePersistedRiderTheme();
  const locale = useContext(LanguageContext);
  const say = (key: keyof typeof strings) => strings[key][locale === "am" ? 1 : 0];
  const [tab, setTab] = useState<"methods" | "activity">("methods");
  const [riderId, setRiderId] = useState("");
  const [preference, setPreference] = useState<BilooMethod>("cash");
  const [rides, setRides] = useState<TripRow[]>([]);
  const [attempts, setAttempts] = useState<GatewayAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      const session = sessionData.session;
      if (sessionError || !session) {
        router.replace("/rider/sign-in");
        return;
      }
      setRiderId(session.user.id);
      const [pref, history, gateway] = await Promise.all([
        supabase.from("rider_payment_preferences").select("preferred_method")
          .eq("rider_id", session.user.id).maybeSingle(),
        supabase.from("ride_requests")
          .select("id,pickup_location,destination_location,payment_method,payment_status,status,final_fare_etb,estimated_trip_fare_etb,created_at,completed_at")
          .eq("rider_id", session.user.id).eq("status", "completed")
          .order("completed_at", { ascending: false }).limit(50),
        supabase.from("payment_transactions")
          .select("id,provider,provider_tx_ref,amount_etb,status,created_at")
          .eq("rider_id", session.user.id).order("created_at", { ascending: false }).limit(25),
      ]);
      if (!active) return;
      if (isBilooMethod(pref.data?.preferred_method)) setPreference(pref.data.preferred_method);
      if (history.error || gateway.error || pref.error) setError(say("error"));
      setRides((history.data || []) as TripRow[]);
      setAttempts((gateway.data || []) as GatewayAttempt[]);
      setLoading(false);
    })().catch(() => {
      if (!active) return;
      setError(say("error"));
      setLoading(false);
    });
    return () => { active = false; };
  }, [router]); // Data is reloaded on new session mount; no payment is initiated.

  async function savePreference(next: BilooMethod) {
    if (!riderId || saving || next === preference) return;
    setSaving(true);
    setAlert("");
    setError("");
    try {
      const { error: saveError } = await supabase
        .from("rider_payment_preferences")
        .upsert({
          rider_id: riderId,
          preferred_method: next,
          updated_at: new Date().toISOString(),
        }, { onConflict: "rider_id" });
      if (saveError) throw saveError;
      setPreference(next);
      setAlert(say("saved"));
    } catch {
      setError(say("saveError"));
    } finally {
      setSaving(false);
    }
  }

  const attentionCount = useMemo(
    () => rides.filter(ride => ride.payment_status !== "paid").length,
    [rides],
  );
  const preferredName = paymentMethodName(preference);
  return (
    <main className="nr-app nr-support-page nr-biloo-finance" data-theme={theme} data-mode="rider">
      <div className="nr-support-wrap bf-wrap">
        <header className="nr-support-head bf-header">
          <button type="button" className="nr-support-back" onClick={() => router.push("/")}
            aria-label="Return to rider home"><Icon name="back" /></button>
          <div>
            <span className="kicker">BILOO · RIDER</span>
            <h1>{say("heading")}</h1>
            <p>{say("subtitle")}</p>
          </div>
          <Link className="bf-help" href="/support?role=rider" aria-label={say("support")}><Icon name="headphones" size={20} /></Link>
        </header>

        <section className="bf-hero" aria-label={say("cash")}>
          <div className="bf-hero-top"><span className="bf-kicker">{say("active")}</span><Icon name="shield" size={19} /></div>
          <div className="bf-hero-main">
            <span className="bf-hero-icon"><Icon name="money" size={29} /></span>
            <div><h2>{say("cash")}</h2><p>{say("cashInfo")}</p></div>
          </div>
          <div className="bf-hero-bottom"><Icon name="info" size={16} />{say("noWallet")}</div>
        </section>

        <div className="bf-tabs" role="tablist" aria-label="Payment sections">
          <button type="button" id="bf-methods-tab" role="tab" aria-selected={tab === "methods"}
            aria-controls="bf-section" className={tab === "methods" ? "is-active" : ""}
            onClick={() => setTab("methods")}><Icon name="wallet" size={18} />{say("methods")}</button>
          <button type="button" id="bf-activity-tab" role="tab" aria-selected={tab === "activity"}
            aria-controls="bf-section" className={tab === "activity" ? "is-active" : ""}
            onClick={() => setTab("activity")}><Icon name="clock" size={18} />{say("activity")}
            {attentionCount > 0 && <span className="bf-count">{attentionCount}</span>}
          </button>
        </div>

        {error && <div className="bf-alert" role="alert"><Icon name="info" size={18} />{error}</div>}
        {alert && <div className="bf-alert bf-alert-success" role="status"><Icon name="check" size={18} />{alert}</div>}

        {loading ? <div className="bf-loading" aria-busy="true" aria-label="Loading your payment information">
          <span /><span /><span /><span />
        </div> : (
          <section id="bf-section" role="tabpanel" aria-labelledby={tab === "methods" ? "bf-methods-tab" : "bf-activity-tab"}>
            {tab === "methods" ? (
              <>
                <section className="bf-section">
                  <header className="bf-section-header">
                    <div><h2>{say("preferred")}</h2><p>{say("cashNote")}</p></div>
                  </header>
                  <div className="bf-preference">
                    <span className="bf-preference-mark"><Icon name={preference === "cash" ? "money" : "wallet"} size={23} /></span>
                    <div><strong>{preferredName}</strong>
                      <small>{preference === "cash" ? say("active") : say("comingSoon")}</small>
                    </div>
                    <Icon name="check" size={20} />
                  </div>
                </section>
                <section className="bf-section">
                  <header className="bf-section-header">
                    <div><h2>{say("future")}</h2><p>{say("futureNote")}</p></div>
                  </header>
                  <div className="bf-method-grid">
                    {paymentMethods.map(method => {
                      const chosen = preference === method.id;
                      return <div key={method.id} className={"bf-method " + (chosen ? "is-preferred" : "")}>
                        <span className="bf-method-icon"><Icon name={method.icon} size={23} /></span>
                        <div className="bf-method-text"><strong>{method.name}</strong>
                          <small>{method.available ? say("active") : say("comingSoon")}</small>
                        </div>
                        <button type="button" className="bf-method-action"
                          disabled={saving || chosen}
                          aria-label={method.name + ": " + (chosen ? say("selected") : say("save"))}
                          onClick={() => void savePreference(method.id)}>
                          {chosen ? <><Icon name="check" size={16} />{say("selected")}</> :
                            saving ? say("saving") : say("save")}
                        </button>
                      </div>;
                    })}
                  </div>
                  <div className="bf-privacy"><Icon name="shield" size={19} />{say("protect")}</div>
                </section>
              </>
            ) : (
              <>
                <section className="bf-section">
                  <header className="bf-section-header">
                    <div><h2>{say("tripHistory")}</h2><p>{say("tripHistoryNote")}</p></div>
                  </header>
                  {!rides.length ? <div className="bf-empty">
                    <Icon name="clock" size={25} /><strong>{say("empty")}</strong><p>{say("emptyNote")}</p>
                    <Link href="/">{locale === "am" ? "ወደ መነሻ" : "Book a ride"} <Icon name="arrow" size={17} /></Link>
                  </div> : <div className="bf-trip-list">
                    {rides.map(ride => {
                      const paid = ride.payment_status === "paid";
                      const failed = ride.payment_status === "failed";
                      const amountIsFinal = ride.final_fare_etb != null;
                      return <article className="bf-trip" key={ride.id}>
                        <span className={"bf-trip-icon " + (paid ? "is-paid" : failed ? "is-failed" : "")}>
                          <Icon name={paid ? "check" : failed ? "info" : "clock"} size={20} />
                        </span>
                        <div className="bf-trip-main">
                          <strong>{ride.pickup_location} → {ride.destination_location}</strong>
                          <small>{dateLabel(ride.completed_at || ride.created_at)} · {ride.payment_method === "cash" ? "Cash" : "Online"}</small>
                          <span className={"bf-trip-status " + (paid ? "is-paid" : failed ? "is-failed" : "")}>
                            {tripPaymentLabel(ride.payment_status, true)}
                          </span>
                        </div>
                        <div className="bf-trip-aside">
                          <strong>{formatEtb(ride.final_fare_etb ?? ride.estimated_trip_fare_etb)}</strong>
                          <small>{amountIsFinal ? "Final fare" : "Estimate"}</small>
                          <Link href={"/rider/trips/receipt?ride=" + encodeURIComponent(ride.id)}>
                            {say("detail")} <Icon name="chevron" size={15} /></Link>
                        </div>
                      </article>;
                    })}
                  </div>}
                </section>
                <section className="bf-section">
                  <header className="bf-section-header">
                    <div><h2>{say("attempts")}</h2><p>{say("attemptsNote")}</p></div>
                  </header>
                  {!attempts.length ? <p className="bf-empty-attempts">{say("noAttempts")}</p> :
                    <div className="bf-attempt-list">{attempts.map(tx => <div key={tx.id} className="bf-attempt">
                      <div><strong>{tx.provider.toUpperCase()} · {tx.status}</strong>
                        <small>{dateLabel(tx.created_at)} · Ref {tx.provider_tx_ref.slice(-12)}</small></div>
                      <strong>{formatEtb(tx.amount_etb)}</strong>
                    </div>)}</div>}
                </section>
              </>
            )}
          </section>
        )}
      </div>
      <RiderMenu active="wallet" />
      <BilooFooterNav role="rider" active="wallet" items={riderFooterLinks()} />
    </main>
  );
}
