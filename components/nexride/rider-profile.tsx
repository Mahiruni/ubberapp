'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ALERTS_KEY, readAccount, saveAccount, validateProfile, type RiderAccount } from '../../lib/nexride-account';
import { PREVIEW_ENABLED_KEY, PREVIEW_STORAGE_KEY, retryStartup } from '../../lib/nexride-startup';
import type { Language } from '../../lib/nexride-i18n';
import type { PreviewProfile } from '../../lib/nexride-preview';
import { Button, Dialog, Icon, InputField, ListRow, useTranslation } from './ui';
type Props = { language: Language; setLanguage: (l: Language) => void; theme: 'light'|'dark'; setTheme: (t:'light'|'dark')=>void; profile: PreviewProfile; setProfile:(p:PreviewProfile)=>void; rides:()=>void; safety:()=>void; support:()=>void; switchDriver:()=>void };
export function RiderSettings({language,setLanguage,theme,setTheme}: Pick<Props,'language'|'setLanguage'|'theme'|'setTheme'>) {
 const t=useTranslation(), [alerts,setAlerts]=useState(true), [feedback,setFeedback]=useState('');
 const say=(en:string,am:string)=>language==='am'?am:en;
 useEffect(()=>{try{setAlerts(localStorage.getItem(ALERTS_KEY)!=='off')}catch{}},[]);
 return <div className="nr-account-settings">
  <div className="nr-settings-row"><strong>{t('language')}</strong><div className="nr-segmented" role="group" aria-label={t('language')}><button aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button><button aria-pressed={language==='am'} onClick={()=>setLanguage('am')}>አማርኛ</button></div></div>
  <div className="nr-settings-row"><strong>{t('appearance')}</strong><div className="nr-segmented" role="group" aria-label={t('appearance')}><button aria-pressed={theme==='light'} onClick={()=>setTheme('light')}>{t('light')}</button><button aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}>{t('dark')}</button></div></div>
  <p className="nr-muted">{say('Appearance applies to the ride workspace. Your profile keeps its navy design.','የመልክ ምርጫው በጉዞ ገጾች ላይ ይሠራል። መገለጫዎ ሰማያዊ ንድፉን ይጠብቃል።')}</p>
  <h3>{say('Notifications','ማሳወቂያዎች')}</h3>
  <label className="nr-account-toggle"><span><strong>{say('In-app trip alerts','የጉዞ ማሳወቂያዎች')}</strong><small>{say('Show a brief alert when a booked trip changes status.','የተያዘ ጉዞ ሁኔታ ሲቀየር አጭር ማሳወቂያ አሳይ።')}</small></span><input type="checkbox" role="switch" checked={alerts} onChange={e=>{const next=e.target.checked;try{localStorage.setItem(ALERTS_KEY,next?'on':'off');setAlerts(next);setFeedback(say('Preference saved on this device.','ምርጫው በዚህ መሣሪያ ተቀምጧል።'));}catch{setFeedback(say('Could not save. Please try again.','ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።'));}}}/></label>
  <p className="nr-muted">{say('Safety and trip status remain visible. Push, SMS and email notifications are not connected.','የደህንነትና የጉዞ ሁኔታ ሁልጊዜ ይታያሉ። የፑሽ፣ ኤስኤምኤስና ኢሜይል ማሳወቂያዎች ገና አልተገናኙም።')}</p>
  <p className="nr-muted">{say('Language, appearance and alert preferences are stored on this device.','ቋንቋ፣ መልክና የማሳወቂያ ምርጫዎች በዚህ መሣሪያ ይቀመጣሉ።')}</p><p role="status">{feedback}</p>
 </div>;
}
export function RiderProfile(props:Props) {
 const {language,profile,setProfile}=props, t=useTranslation();
 const say=(en:string,am:string)=>language==='am'?am:en;
 const [account,setAccount]=useState<RiderAccount|null>(null), [loading,setLoading]=useState(true), [loadError,setLoadError]=useState(false),[attempt,setAttempt]=useState(0);
 const [panel,setPanel]=useState<'edit'|'settings'|'privacy'|'payments'|'signout'|null>(null),[form,setForm]=useState(profile),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[photoFailed,setPhotoFailed]=useState(false),[signedOutLocally,setSignedOutLocally]=useState(false);
 const lock=useRef(false);
 useEffect(()=>{let active=true;setLoading(true);setLoadError(false);setAccount(null);setPhotoFailed(false);void readAccount().then(value=>{if(active)setAccount(value)}).catch(()=>{if(active)setLoadError(true)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[attempt]);
 useEffect(()=>{const {data}=supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){if(!lock.current)setPanel(null);setAccount(null);setLoading(true);setAttempt(v=>v+1)}});return()=>data.subscription.unsubscribe()},[]);
 const shown=account?.profile || (!loading&&!loadError?profile:{name:'',phone:'',email:''});
 const initials=shown.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase()||'NR';
 const open=(next:typeof panel)=>{setError('');setPanel(next)};
 const save=async()=>{
  if(lock.current)return;
  const invalid=validateProfile(form);
  if(invalid){setError(invalid==='name'?say('Enter a name between 2 and 80 characters.','ከ2 እስከ 80 ፊደላት ያሉት ስም ያስገቡ።'):invalid==='phone'?say('Enter a valid contact number, for example +251912345678.','ትክክለኛ የስልክ ቁጥር ያስገቡ፣ ለምሳሌ +251912345678።'):say('Enter a valid email address.','ትክክለኛ የኢሜይል አድራሻ ያስገቡ።'));return}
  lock.current=true;setBusy(true);setError('');
  try{
   if(account){const saved=await saveAccount(account,form);setAccount({...account,profile:saved})}
   else {const current=await supabase.auth.getSession();if(current.error||current.data.session)throw Error('Session changed');const saved={name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim()};const stored=JSON.parse(localStorage.getItem(PREVIEW_STORAGE_KEY)||'{}');localStorage.setItem(PREVIEW_STORAGE_KEY,JSON.stringify({...stored,profile:saved}));setProfile(saved)}
   setPanel(null);setNotice(account?say('Profile saved.','መገለጫው ተቀምጧል።'):say('Preview details saved on this device.','የማሳያ ዝርዝሮች በዚህ መሣሪያ ተቀምጠዋል።'));
  }catch{setError(say('Could not save your profile. Your changes are still here; please retry.','መገለጫዎን ማስቀመጥ አልተቻለም። ለውጦችዎ አልጠፉም፤ እንደገና ይሞክሩ።'))}finally{lock.current=false;setBusy(false)}
 };
 const leaveAccount=()=>{try{localStorage.removeItem(PREVIEW_ENABLED_KEY);localStorage.removeItem(PREVIEW_STORAGE_KEY);localStorage.removeItem('nexride-state')}catch{}retryStartup();window.location.replace('/auth')};
 const signout=async()=>{if(lock.current)return;if(signedOutLocally){leaveAccount();return}lock.current=true;setBusy(true);setError('');try{const result=await supabase.auth.signOut({scope:'local'});if(result.error)throw result.error;leaveAccount()}catch{const current=await supabase.auth.getSession();const cleared=!current.error&&!current.data.session;setSignedOutLocally(cleared);setError(cleared?say('Signed out on this device. Server sign-out could not be confirmed.','በዚህ መሣሪያ ከመለያዎ ወጥተዋል። በአገልጋዩ ላይ መውጣት አልተረጋገጠም።'):say('Sign-out could not be confirmed. Please retry.','ከመለያ መውጣት አልተረጋገጠም። እንደገና ይሞክሩ።'));lock.current=false;setBusy(false)}};

 return <section className="nr-account" aria-labelledby="nr-account-title">
  <div className="nr-account-heading"><span>NEXRIDE / {say('YOUR ACCOUNT','የእርስዎ መለያ')}</span><h1 id="nr-account-title">{t('profile')}</h1><p>{say('Your ride. Your control.','ጉዞዎ። ምርጫዎ።')}</p></div>
  <div className="nr-account-person"><div className="nr-account-avatar">{account?.avatar&&!photoFailed?<Image src={account.avatar} alt={say('Your profile photo','የመገለጫዎ ፎቶ')} width={64} height={64} unoptimized onError={()=>setPhotoFailed(true)}/>:<span aria-label={say('Profile initials','የስም መጀመሪያ ፊደላት')}>{initials}</span>}</div><div><h2>{loading?say('Loading profile…','መገለጫ በመጫን ላይ…'):loadError?say('Profile unavailable','መገለጫ አይገኝም'):shown.name||t('guest')}</h2><p>{t('rider')}{!account&&!loading&&!loadError&&<span> · {t('preview')}</span>}</p></div><button className="nr-account-edit" disabled={loading||loadError} aria-label={say('Edit profile','መገለጫ አርትዕ')} onClick={()=>{setForm(shown);open('edit')}}><Icon name="user" size={17}/><span>{say('Edit','አርትዕ')}</span></button></div>
  {loadError&&<div role="alert"><p>{say('We could not load your account. Please retry.','መለያዎን መጫን አልተቻለም። እንደገና ይሞክሩ።')}</p><Button variant="secondary" onClick={()=>setAttempt(v=>v+1)}>{say('Retry','እንደገና ሞክር')}</Button></div>}
  <div className="nr-account-menu"><ListRow icon="clock" title={say('My Rides','ጉዞዎቼ')} onClick={props.rides}/><ListRow icon="wallet" title={t('paymentMethods')} onClick={()=>open('payments')}/><ListRow icon="shield" title={say('Safety Center','የደህንነት ማዕከል')} onClick={props.safety}/><ListRow icon="chat" title={say('Help & Support','እገዛ እና ድጋፍ')} onClick={props.support}/><ListRow icon="settings" title={t('settings')} onClick={()=>open('settings')}/></div>
  <div className="nr-account-language"><div><Icon name="globe" size={18}/><strong>{t('language')}</strong></div><div className="nr-segmented" role="group" aria-label={t('language')}><button aria-pressed={language==='en'} onClick={()=>props.setLanguage('en')}>English</button><button aria-pressed={language==='am'} onClick={()=>props.setLanguage('am')}>አማርኛ</button></div></div>
  <p className="nr-account-notice" role="status">{notice}</p>
  <div className="nr-account-secondary"><ListRow icon="info" title={say('Privacy & your data','ግላዊነት እና ውሂብዎ')} onClick={()=>open('privacy')}/><ListRow icon="car" title={t('switchDriver')} onClick={props.switchDriver}/></div>
  <div className="nr-account-signout"><button onClick={()=>open('signout')}><Icon name="power" size={18}/>{account||loadError?say('Sign out','ውጣ'):say('Exit preview','ከማሳያ ውጣ')}</button><small>{say('NexRide · Better rides. A brighter tomorrow.','NexRide · የተሻለ ጉዞ። ብሩህ ነገ።')}</small></div>
  {panel&&<Dialog title={panel==='edit'?say('Edit profile','መገለጫ አርትዕ'):panel==='settings'?t('settings'):panel==='payments'?t('paymentMethods'):panel==='privacy'?say('Privacy & your data','ግላዊነት እና ውሂብዎ'):say('Sign out','ውጣ')} onClose={()=>{if(!busy)setPanel(null)}}>
   {panel==='edit'?<form className="nr-profile-form" onSubmit={e=>{e.preventDefault();void save()}} aria-busy={busy}>
    <p className="nr-muted">{account?say('Update the details used for your rides.','ለጉዞዎ የሚያገለግሉ ዝርዝሮችን ያዘምኑ።'):t('localAccount')}</p>
    <fieldset disabled={busy}><InputField label={t('name')} required autoComplete="name" maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><InputField label={t('phone')} type="tel" autoComplete="tel" maxLength={25} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><InputField label={t('email')} type="email" readOnly={!!account} autoComplete="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></fieldset>
    {account&&<p className="nr-muted">{say('The phone number is a contact detail, not a verified sign-in number. Email changes are not available here.','ይህ ስልክ ለመገናኛ ነው፤ የተረጋገጠ የመግቢያ ቁጥር አይደለም። ኢሜይልን እዚህ መቀየር አይቻልም።')}</p>}
    {error&&<p className="nr-account-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?say('Saving…','በማስቀመጥ ላይ…'):t('save')}</Button>
   </form>:panel==='settings'?<RiderSettings {...props}/>:panel==='payments'?<><div className="nr-account-info"><Icon name="wallet" size={28}/><h3>{say('Payment methods unavailable','የክፍያ ዘዴዎች አይገኙም')}</h3><p>{say('Saved cards and mobile-money setup are not connected yet. Your trip receipt shows the payment method and status supplied for that booking.','ካርድ ማስቀመጥና የሞባይል ገንዘብ ማዘጋጀት ገና አልተገናኙም። የጉዞ ደረሰኝዎ ለዚያ ጉዞ የተላከውን የክፍያ ዘዴና ሁኔታ ያሳያል።')}</p></div><Button onClick={props.rides}>{say('View my rides','ጉዞዎቼን አሳይ')}</Button></>:panel==='privacy'?<div className="nr-account-info"><h3>{say('Your data, clearly explained','ስለ ውሂብዎ ግልጽ መረጃ')}</h3><p>{say('Signed-in profile details, bookings and feedback are stored with your NexRide account. Access follows the existing account permissions.','የመገለጫ ዝርዝሮች፣ ጉዞዎችና አስተያየቶች በNexRide መለያዎ ይቀመጣሉ።')}</p><p>{say('Preview details, saved places and preferences are stored in this browser. Clear site data in your browser to remove them.','የማሳያ ዝርዝሮች፣ የተቀመጡ ቦታዎችና ምርጫዎች በዚህ አሳሽ ይቀመጣሉ። ለማስወገድ በአሳሽዎ የድረ ገጹን ውሂብ ያጽዱ።')}</p><p>{say('Location access is controlled in your browser or device settings. Trip sharing explains recipient access before anything is shared.','የአካባቢ ፈቃድ በአሳሽዎ ወይም መሣሪያዎ ቅንብሮች ይቆጣጠራል። ጉዞን ከማጋራትዎ በፊት ተቀባዩ ምን ማየት እንደሚችል ይገለጻል።')}</p><p>{say('Account export and deletion requests are currently unavailable in the app.','የመለያ ውሂብ ማውረድና መሰረዝ ጥያቄዎች በአፑ ውስጥ ገና አይገኙም።')}</p></div>:<><p>{say('Sign out on this device? This does not cancel an active booking.','በዚህ መሣሪያ ከመለያዎ ይውጡ? ይህ ንቁ ጉዞን አይሰርዝም።')}</p>{error&&<p role="alert">{error}</p>}<Button className="nr-account-danger" disabled={busy} onClick={()=>void signout()}>{busy?say('Signing out…','በመውጣት ላይ…'):signedOutLocally?say('Continue to sign in','ወደ መግቢያ ቀጥል'):say('Confirm sign out','መውጣት አረጋግጥ')}</Button><Button variant="ghost" disabled={busy||signedOutLocally} onClick={()=>setPanel(null)}>{say('Stay signed in','በመለያው ቆይ')}</Button></>}
  </Dialog>}
 </section>;
}
