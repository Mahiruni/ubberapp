"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, LanguageContext } from "../../../../components/nexride/ui";
import { useContext } from "react";
import { supabase } from "../../../../lib/supabase";
import { resolveSessionRole } from "../../../../lib/nexride-account-role";
import { loadDriverProfileData, verificationSummary } from "../../../../lib/nexride-driver-profile";
import {
  formatEtb, loadDriverEarningsReport,
  type DriverEarningsReport,
} from "../../../../lib/nexride-driver-earnings";
import "../../../nexride.css";
import "../profile.css";
import "../../../detail-system.css";
import "./phase3.css";

type Schedule = "weekly" | "monthly" | "manual";
type Destination = "undecided" | "bank" | "mobile_money";
const schedules: {id:Schedule;label:string;am:string}[]=[
  {id:"weekly",label:"Weekly",am:"በየሳምንቱ"},
  {id:"monthly",label:"Monthly",am:"በየወሩ"},
  {id:"manual",label:"On request",am:"ሲጠየቅ"},
];
const destinations: {id:Destination;label:string;am:string}[]=[
  {id:"undecided",label:"Decide later",am:"በኋላ እወስናለሁ"},
  {id:"bank",label:"Bank account",am:"የባንክ መለያ"},
  {id:"mobile_money",label:"Mobile money",am:"የሞባይል ገንዘብ"},
];

export default function DriverSettlementCenter(){
  const router=useRouter();
  const language=useContext(LanguageContext);
  const am=language==="am";
  const [driverId,setDriverId]=useState("");
  const [report,setReport]=useState<DriverEarningsReport|null>(null);
  const [schedule,setSchedule]=useState<Schedule>("weekly");
  const [destination,setDestination]=useState<Destination>("undecided");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [verificationRequired,setVerificationRequired]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const label=(en:string,amharic:string)=>am?amharic:en;

  useEffect(()=>{
    let live=true;
    (async()=>{
      const {data}=await supabase.auth.getSession();
      if(!live)return;
      const session=data.session;
      if(!session){router.replace("/driver/auth");return;}
      const role=await resolveSessionRole(session).catch(()=>"");
      if(!live)return;
      if(role!=="driver"){router.replace(role==="admin"?"/admin":"/");return;}
      const profile=await loadDriverProfileData(session.user.id);
      if(!live)return;
      setVerificationRequired(verificationSummary(profile).tone !== "approved");
      setDriverId(session.user.id);
      const [finance,settings]=await Promise.all([
        loadDriverEarningsReport(session.user.id,"all"),
        supabase.from("driver_settlement_preferences")
          .select("requested_schedule,preferred_destination_type")
          .eq("driver_id",session.user.id).maybeSingle(),
      ]);
      if(!live)return;
      setReport(finance);
      if(finance.failed||settings.error)setError("Some financial information is currently unavailable.");
      if(settings.data){
        const selectedSchedule=settings.data.requested_schedule;
        const selectedDestination=settings.data.preferred_destination_type;
        if(schedules.some(i=>i.id===selectedSchedule))setSchedule(selectedSchedule as Schedule);
        if(destinations.some(i=>i.id===selectedDestination))setDestination(selectedDestination as Destination);
      }
      setLoading(false);
    })().catch(()=>{
      if(live){setError("Financial records could not be loaded. Try again later.");setLoading(false);}
    });
    return ()=>{live=false};
  },[router]);

  async function save(){
    if(!driverId||saving)return;
    setSaving(true);setError("");setNotice("");
    try{
      const {error:writeError}=await supabase.from("driver_settlement_preferences")
        .upsert({
          driver_id:driverId,
          requested_schedule:schedule,
          preferred_destination_type:destination,
          updated_at:new Date().toISOString(),
        },{onConflict:"driver_id"});
      if(writeError)throw writeError;
      setNotice("Preference saved. This does not request or schedule a transfer.");
    }catch{
      setError("Your preference could not be saved. No payout was requested.");
    }finally{setSaving(false)}
  }

  const completed=useMemo(()=>report?.payoutRequests.filter(r=>r.status==="paid")||[],[report]);
  const outstanding=useMemo(()=>report?.payoutRequests.filter(r=>r.status==="requested"||r.status==="processing")||[],[report]);

  return <main className="nr-app bf-driver-settlement" data-mode="driver">
    <div className="bf-settlement-wrap">
      <header className="bf-settlement-header">
        <button type="button" onClick={()=>router.push("/driver/profile")} aria-label="Back to driver profile">
          <Icon name="back" size={20}/>
        </button>
        <div><span className="bf-settlement-kicker">BILOO · DRIVER FINANCE</span>
          <h1>{label("Settlement center","የክፍያ ማስተካከያ")}</h1>
          <p>{label("Your earnings and future payout preferences, clearly separated.","ገቢዎን እና የወደፊት ክፍያ ምርጫዎችዎን ይመልከቱ።")}</p></div>
        <Link href="/driver/earnings/report" aria-label="Detailed earnings report"><Icon name="chart" size={20}/></Link>
      </header>

      <section className="bf-settlement-hero">
        <div className="bf-settlement-hero-top"><span>{label("Gateway transfers","በክፍያ አገልግሎት ማስተላለፍ")}</span><Icon name="shield" size={20}/></div>
        <h2>{label("Not yet enabled","እስካሁን አልነቃም")}</h2>
        <p>{label("No bank or mobile-money transfer can be requested from this screen. Integration and merchant approval are reserved for the final phase.",
          "ከዚህ ገጽ የባንክ ወይም የሞባይል ገንዘብ ዝውውር መጠየቅ አይቻልም።")}</p>
      </section>

      {loading?<div className="bf-settlement-skeleton" aria-busy="true"><span/><span/><span/></div>:<>
        {error&&<div className="bf-settlement-message error" role="alert"><Icon name="info" size={18}/>{error}</div>}
        {notice&&<div className="bf-settlement-message success" role="status"><Icon name="check" size={18}/>{notice}</div>}
        {verificationRequired && <div className="bf-settlement-message" role="status">
          <Icon name="shield" size={18}/>Driver documents still need approval. Settlement preferences may be saved, but payouts remain unavailable until verification and payment-provider activation.
        </div>}

        <section className="bf-settlement-section">
          <div className="bf-settlement-section-head"><h2>{label("Recorded financial position","የተመዘገበ የገንዘብ ሁኔታ")}</h2><span>{label("Lifetime","እስካሁን")}</span></div>
          <div className="bf-settlement-metrics">
            <Summary label="Net driver earnings" value={report?.netDriverEarningsEtb??null} note="Posted driver shares minus deductions" />
            <Summary label="Gross ride fares" value={report?.grossFaresEtb??null} note="Fare accounting only; not cash held" />
            <Summary label="Cash pending confirmation" value={report?.cashFaresPendingEtb??null} note="Not counted as collected or payable" />
            <Summary label="Cash trips marked paid" value={report?.cashFaresConfirmedEtb??null} note="Recorded trip status, not bank settlement" />
            <Summary label="Payouts marked paid" value={report?.paidOutEtb??null} note="Recorded finalized ledger entries" />
            <Summary label="Pending payout entries" value={report?.pendingPayoutEtb??null} note="No new transfers can be initiated here" />
          </div>
          <p className="bf-settlement-disclosure">Commission and remittance balances are not finalized until the platform's financial rules and ledgers are reconciled. A recorded fare is never shown as money available to withdraw.</p>
        </section>

        <section className="bf-settlement-section">
          <div className="bf-settlement-section-head"><h2>{label("Future settlement preferences","የወደፊት ክፍያ ምርጫዎች")}</h2><span>PREPARATION ONLY</span></div>
          <p className="bf-settlement-intro">Save how you would prefer to receive payouts after Biloo enables its approved settlement service. These settings do not authorize a transfer, register a bank account or store bank details.</p>
          <div className="bf-settlement-form">
            <label>{label("Preferred payout schedule","የሚመረጥ የክፍያ ጊዜ")}
              <select value={schedule} onChange={e=>setSchedule(e.target.value as Schedule)} disabled={saving}>
                {schedules.map(item=><option key={item.id} value={item.id}>{am?item.am:item.label}</option>)}
              </select></label>
            <label>{label("Preferred destination type","የሚመረጥ የክፍያ መድረሻ")}
              <select value={destination} onChange={e=>setDestination(e.target.value as Destination)} disabled={saving}>
                {destinations.map(item=><option key={item.id} value={item.id}>{am?item.am:item.label}</option>)}
              </select></label>
          </div>
          <button type="button" className="bf-settlement-save" onClick={()=>void save()} disabled={saving||!driverId}>
            <Icon name="check" size={18}/>{saving?label("Saving…","በማስቀመጥ ላይ…"):label("Save preferences","ምርጫዎችን አስቀምጥ")}
          </button>
          <div className="bf-settlement-privacy"><Icon name="lock" size={17}/> No PIN, account number, OTP, or card details are collected.</div>
        </section>

        <section className="bf-settlement-section">
          <div className="bf-settlement-section-head"><h2>{label("Recorded payout history","የክፍያ ታሪክ")}</h2><span>{report?.payoutRequests.length??0} records</span></div>
          {!report?.payoutRequests.length?<div className="bf-settlement-empty"><Icon name="clock" size={22}/><strong>No payouts recorded</strong><p>Approved settlements will appear here after provider integration and verification.</p></div>:
            <div className="bf-settlement-list">{report.payoutRequests.map(row=><article key={row.id} className="bf-settlement-row">
              <span className="bf-settlement-row-icon"><Icon name={row.status==="paid"?"check":"clock"} size={17}/></span>
              <div><strong>{row.status==="paid"?"Confirmed paid":row.status==="processing"?"Processing":row.status==="requested"?"Requested":row.status==="failed"?"Failed":"Cancelled"}</strong>
                <small>{new Date(row.createdAt).toLocaleDateString("en-ET",{dateStyle:"medium"})} · Reference {row.id.slice(0,8)}</small>
              </div><strong>{formatEtb(row.amountEtb,2)} ETB</strong>
            </article>)}</div>}
          <p className="bf-settlement-disclosure">{outstanding.length} unresolved requests · {completed.length} payout requests marked paid. These are historical records, not a provider balance inquiry.</p>
        </section>
      </>}
    </div>
  </main>;
}

function Summary({label,value,note}:{label:string;value:number|null;note:string}){
  return <div className="bf-settlement-metric"><span>{label}</span><strong>{value===null?"Not finalized":formatEtb(value,2)+" ETB"}</strong><small>{note}</small></div>
}
