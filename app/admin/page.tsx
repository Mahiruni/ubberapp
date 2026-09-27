'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './admin.css';

type Module='overview'|'rides'|'drivers'|'users'|'finance'|'safety'|'support'|'promos'|'audit';
type Row=Record<string,any>;

const nav:[Module,string,string][]=[
 ['overview','Overview','⌂'],['rides','Live rides','↗'],['drivers','Drivers','◆'],['users','Users','●'],
 ['finance','Finance','₿'],['safety','Safety','!'],['support','Support','?'],['promos','Promotions','%'],['audit','Audit log','◷']
];

export default function AdminPage(){
 const [module,setModule]=useState<Module>('overview');
 const [session,setSession]=useState<any>(null);
 const [admin,setAdmin]=useState<Row|null>(null);
 const [loading,setLoading]=useState(true);
 const [loginBusy,setLoginBusy]=useState(false);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [query,setQuery]=useState('');
 const [rows,setRows]=useState<Row[]>([]);
 const [metrics,setMetrics]=useState<Row>({});
 const [range,setRange]=useState<'today'|'7d'|'30d'>('today');
 const [notice,setNotice]=useState('');
 const [refreshing,setRefreshing]=useState(false);

 const toast=(message:string)=>{setNotice(message);window.setTimeout(()=>setNotice(''),2600)};

 useEffect(()=>{
   if(!supabase){setLoading(false);return}
   supabase.auth.getSession().then(({data})=>{setSession(data.session);if(data.session)checkAdmin(data.session.user.id);else setLoading(false)});
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);if(s)checkAdmin(s.user.id);else{setAdmin(null);setLoading(false)}});
   return()=>subscription.unsubscribe();
 },[]);

 const checkAdmin=async(userId:string)=>{
   if(!supabase)return;
   const {data,error}=await supabase.from('profiles').select('id,full_name,phone,role,admin_role,account_status').eq('id',userId).maybeSingle();
   if(error||!data||data.role!=='admin'||data.account_status!=='active'){setAdmin(null);setLoading(false);return}
   setAdmin(data);setLoading(false);
 };

 const loadMetrics=async()=>{
   if(!supabase||!admin)return;
   const start=range==='today'?new Date(new Date().setHours(0,0,0,0)):new Date(Date.now()-(range==='7d'?7:30)*86400000);
   const {data,error}=await supabase.rpc('admin_dashboard_summary',{p_city_id:null,p_from:start.toISOString(),p_to:new Date().toISOString()});
   if(!error)setMetrics(data||{});
 };

 const loadRows=async()=>{
   if(!supabase||!admin)return;
   setRefreshing(true);
   let data:any[]=[];
   if(module==='rides'){
     const r=await supabase.from('trips').select('id,customer_id,driver_id,service_type,state,pickup_label,destination_label,total_minor,currency,requested_at,accepted_at,completed_at,cancelled_at').order('requested_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='drivers'){
     const r=await supabase.from('drivers').select('id,city_id,license_number,is_online,location,rating,review_status,created_at,updated_at').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='users'){
     const r=await supabase.from('profiles').select('id,full_name,phone,role,admin_role,account_status,created_at').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='finance'){
     const r=await supabase.from('payments').select('id,trip_id,customer_id,provider,amount_minor,currency,status,created_at').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='safety'){
     const r=await supabase.from('safety_reports').select('id,trip_id,reporter_id,category,severity,status,description,assigned_to,created_at').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='support'){
     const r=await supabase.from('support_tickets').select('id,requester_id,trip_id,category,subject,status,priority,assigned_to,created_at,updated_at').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='promos'){
     const r=await supabase.from('promo_codes').select('*').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   } else if(module==='audit'){
     const r=await supabase.from('admin_action_log').select('id,actor_id,action,entity_type,entity_id,metadata,created_at').order('created_at',{ascending:false}).limit(100); if(!r.error)data=r.data||[];
   }
   setRows(data);setRefreshing(false);
 };

 useEffect(()=>{if(admin){loadMetrics();loadRows()}},[admin,module,range]);

 useEffect(()=>{
   if(!supabase||!admin)return;
   const channel=supabase.channel('admin-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'trips'},()=>{loadMetrics();if(module==='rides')loadRows()})
    .on('postgres_changes',{event:'*',schema:'public',table:'drivers'},()=>{loadMetrics();if(module==='drivers')loadRows()})
    .on('postgres_changes',{event:'*',schema:'public',table:'safety_reports'},()=>{if(module==='safety')loadRows()})
    .subscribe();
   const timer=window.setInterval(()=>loadMetrics(),15000);
   return()=>{window.clearInterval(timer);supabase.removeChannel(channel)};
 },[admin,module,range]);

 const signIn=async(e:React.FormEvent)=>{
   e.preventDefault();if(!supabase)return;
   setLoginBusy(true);setError('');
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error){setError(error.message);setLoginBusy(false);return}
   if(data.session)await checkAdmin(data.session.user.id);
   setLoginBusy(false);
 };

 const action=async(fn:string,args:Row,success:string)=>{
   if(!supabase)return;
   const {error}=await supabase.rpc(fn,args);
   if(error){toast(error.message);return}
   toast(success);await loadRows();await loadMetrics();
 };

 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return rows;return rows.filter(r=>Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)))},[rows,query]);
 const active=Number(metrics.trips||0);
 const revenue=Number(metrics.revenue_minor||0)/100;
 const drivers=Number(metrics.drivers||0);
 const customers=Number(metrics.customers||0);

 if(loading)return <div className="admin-loading"><span/>Securing NexRide Control Center…</div>;
 if(!session||!admin)return <main className="admin-login"><div className="login-card"><div className="admin-mark">N</div><p className="admin-kicker">NEXRIDE · CONTROL CENTER</p><h1>Operations, with control.</h1><p className="login-copy">Restricted administrative access. Rider and driver accounts cannot enter this workspace.</p><form onSubmit={signIn}><label>Admin email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" required/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/></label>{error&&<div className="login-error">{error}</div>}<button className="admin-primary" disabled={loginBusy}>{loginBusy?'Authenticating…':'Enter Control Center'}<span>→</span></button></form><small>Access is enforced by Supabase Auth + admin RLS. Credentials are never stored by the dashboard.</small></div></main>;

 return <div className="admin-app">
  <aside className="admin-sidebar">
   <div className="admin-brand"><div className="admin-mark">N</div><div><b>NexRide</b><small>Control Center</small></div></div>
   <nav>{nav.map(([id,label,icon])=><button key={id} className={module===id?'active':''} onClick={()=>{setModule(id);setQuery('')}}><i>{icon}</i><span>{label}</span>{id==='safety'&&Number(metrics.open_safety||0)>0?<em>{metrics.open_safety}</em>:null}</button>)}</nav>
   <div className="admin-side-foot"><span className="status-dot"/> Systems nominal<div className="admin-user"><strong>{admin.full_name||'Administrator'}</strong><small>{admin.admin_role?.replace('_',' ')||'Admin'}</small></div><button onClick={()=>supabase?.auth.signOut()}>Sign out</button></div>
  </aside>
  <section className="admin-main">
   <header className="admin-header"><div><span className="admin-kicker">NEXRIDE / {module.toUpperCase()}</span><h2>{module==='overview'?'Good morning, Operations':nav.find(n=>n[0]===module)?.[1]}</h2></div><div className="header-actions"><span className="live-pill"><i/>Live</span><button className="header-icon" onClick={()=>{loadMetrics();loadRows()}}>↻</button><button className="theme-pill">● Dark</button></div></header>
   {module==='overview'?<Overview metrics={{active,revenue,drivers,customers,openSafety:Number(metrics.open_safety||0)}} range={range} setRange={setRange} setModule={setModule}/>:<DataModule module={module} rows={filtered} query={query} setQuery={setQuery} refreshing={refreshing} action={action} />}
  </section>
  {notice&&<div className="admin-toast">{notice}</div>}
 </div>;
}

function Overview({metrics,range,setRange,setModule}:{metrics:Row,range:any,setRange:(x:any)=>void,setModule:(x:Module)=>void}){
 return <main className="admin-content">
  <div className="hero-row"><div><p className="admin-kicker">REAL-TIME OPERATIONS</p><h1>The network at a glance.</h1><p>Live platform health, demand and financial pulse across NexRide.</p></div><select value={range} onChange={e=>setRange(e.target.value)}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></div>
  <div className="metric-grid">
   <Metric label="Active rides" value={String(metrics.active)} detail="Current operational view" accent/><Metric label="Online drivers" value={String(metrics.drivers)} detail="Registered driver population"/><Metric label="Completed revenue" value={formatMoney(metrics.revenue)} detail="Selected period"/><Metric label="Riders" value={String(metrics.customers)} detail="Customer accounts"/><Metric label="Safety queue" value={String(metrics.openSafety)} detail="Open reports" danger/>
  </div>
  <div className="overview-grid">
   <section className="admin-card demand-card"><div className="card-head"><div><span className="admin-kicker">NETWORK HEALTH</span><h3>Operating signal</h3></div><span className="healthy">● Healthy</span></div><div className="signal"><div><strong>{metrics.active}</strong><small>rides in motion</small></div><div><strong>{metrics.drivers}</strong><small>drivers available</small></div><div><strong>{metrics.openSafety}</strong><small>safety cases</small></div></div><div className="mini-chart">{[34,46,41,58,52,67,61,73,69,82,76,88].map((h,i)=><span key={i} style={{height:h+'%'}}/>)}</div></section>
   <section className="admin-card quick-card"><div className="card-head"><div><span className="admin-kicker">ACTION QUEUE</span><h3>Needs attention</h3></div></div><Quick title="Driver verification" value="Review pending applications" onClick={()=>setModule('drivers')} icon="◆"/><Quick title="Safety desk" value={metrics.openSafety?metrics.openSafety+' open reports':'No open reports'} onClick={()=>setModule('safety')} icon="!"/><Quick title="Support inbox" value="Open customer cases" onClick={()=>setModule('support')} icon="?"/></section>
  </div>
  <section className="admin-card module-strip"><div><span className="admin-kicker">OPERATIONS</span><h3>Move quickly</h3></div><div className="quick-actions"><button onClick={()=>setModule('rides')}>Monitor rides <span>→</span></button><button onClick={()=>setModule('drivers')}>Verify drivers <span>→</span></button><button onClick={()=>setModule('finance')}>Review finance <span>→</span></button><button onClick={()=>setModule('audit')}>Inspect audit <span>→</span></button></div></section>
 </main>
}

function Metric({label,value,detail,accent,danger}:{label:string,value:string,detail:string,accent?:boolean,danger?:boolean}){return <div className={'metric '+(accent?'accent ':'')+(danger?'danger':'')}><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>}
function Quick({title,value,onClick,icon}:{title:string,value:string,onClick:()=>void,icon:string}){return <button className="queue-row" onClick={onClick}><i>{icon}</i><span><b>{title}</b><small>{value}</small></span><strong>→</strong></button>}
function formatMoney(n:number){return new Intl.NumberFormat('en-ET',{style:'currency',currency:'ETB',maximumFractionDigits:2}).format(n)}
function formatDate(v:any){return v?new Intl.DateTimeFormat('en-ET',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—'}

function DataModule({module,rows,query,setQuery,refreshing,action}:{module:Module,rows:Row[],query:string,setQuery:(x:string)=>void,refreshing:boolean,action:(fn:string,args:Row,msg:string)=>void}){
 const title=nav.find(n=>n[0]===module)?.[1]||'Records';
 const columns=module==='rides'?['id','service_type','state','pickup_label','destination_label','total_minor','requested_at']:
 module==='drivers'?['id','review_status','is_online','rating','license_number','created_at']:
 module==='users'?['full_name','phone','role','admin_role','account_status','created_at']:
 module==='finance'?['id','provider','amount_minor','currency','status','created_at']:
 module==='safety'?['category','severity','status','trip_id','description','created_at']:
 module==='support'?['category','subject','status','priority','trip_id','created_at']:
 module==='promos'?['code','kind','value_minor','percentage','usage_count','is_active','starts_at']:
 ['action','entity_type','entity_id','created_at'];
 return <main className="admin-content"><div className="module-head"><div><p className="admin-kicker">OPERATIONS DATA</p><h1>{title}</h1><p>{module==='rides'?'Every operational trip, with lifecycle and intervention controls.':module==='drivers'?'Verification, availability and driver health.':module==='users'?'Rider and administrative identities.':module==='finance'?'Payments and financial movement.':module==='safety'?'Safety-first incident queue.':module==='support'?'Customer support workload.':module==='promos'?'Growth controls and promo inventory.':'Immutable administrative activity trail.'}</p></div><div className="module-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={'Search '+title.toLowerCase()+'…'}/><button onClick={()=>window.location.reload()}>↻</button></div></div>
 <section className="admin-card table-card"><div className="table-meta"><span>{rows.length} records shown</span>{refreshing&&<span className="syncing">Syncing…</span>}</div><div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}{(module==='drivers'||module==='rides'||module==='safety')&&<th>Actions</th>}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i}>{columns.map(c=><td key={c}>{renderCell(c,r[c])}</td>)}{module==='drivers'&&<td className="actions">{r.review_status!=='approved'&&<button onClick={()=>action('admin_driver_review',{p_driver_id:r.id,p_status:'approved'},'Driver approved')}>Approve</button>}{r.review_status==='approved'&&<button className="danger-action" onClick={()=>action('admin_driver_review',{p_driver_id:r.id,p_status:'suspended'},'Driver suspended')}>Suspend</button>}</td>}{module==='rides'&&<td className="actions">{!['completed','cancelled'].includes(r.state)&&<button className="danger-action" onClick={()=>action('admin_cancel_trip',{p_trip_id:r.id,p_reason:'admin_intervention'},'Ride cancelled')}>Intervene</button>}</td>}{module==='safety'&&<td className="actions">{r.status!=='resolved'&&<button onClick={()=>action('admin_safety_update',{p_report_id:r.id,p_status:'resolved'},'Safety report resolved')}>Resolve</button>}</td>}</tr>):<tr><td colSpan={columns.length+1}><div className="empty"><span>⌁</span><b>No records yet</b><small>The live NexRide data layer is ready for operational activity.</small></div></td></tr>}</tbody></table></div></section>
 </main>
}
function renderCell(key:string,value:any){if(value===null||value===undefined||value==='')return '—';if(key.includes('at')||key==='created_at'||key==='updated_at')return formatDate(value);if(key==='amount_minor'||key==='total_minor'||key==='value_minor')return formatMoney(Number(value)/100);if(typeof value==='boolean')return value?<span className="bool yes">Yes</span>:<span className="bool">No</span>;if(key==='state'||key==='status'||key==='review_status'||key==='severity'||key==='priority')return <span className={'tag '+String(value).toLowerCase()}>{String(value).replaceAll('_',' ')}</span>;if(key==='id'||key.endsWith('_id'))return <code>{String(value).slice(0,8)}…</code>;return String(value).length>70?String(value).slice(0,70)+'…':String(value)}
