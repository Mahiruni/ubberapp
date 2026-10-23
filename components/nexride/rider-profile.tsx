'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { ALERTS_KEY, readAccount, saveAccount, validateProfile, type RiderAccount } from '../../lib/nexride-account';
import { RiderPhotoEditor } from './rider-photo-editor';
import { photoSizeLabel } from '../../lib/nexride-photo-processing';
import { PREVIEW_ENABLED_KEY, PREVIEW_STORAGE_KEY, retryStartup } from '../../lib/nexride-startup';
import { signOutNexRide } from '../../lib/nexride-sign-out';
import type { Language } from '../../lib/nexride-i18n';
import type { PreviewProfile } from '../../lib/nexride-preview';
import { Button, Dialog, Icon, InputField, useTranslation, type IconName } from './ui';
import { AppearanceSelector } from "./appearance-selector";
import { PermissionSettings } from "./permission-settings";
import { NativeReliabilitySettings } from "./native-reliability-settings";
import { NexRideFeedbackSettings } from './feedback-settings';
import './rider-avatar-upload.css';
import { AppVersion } from './app-version';
import { SettingsGroups } from "./settings-groups";

type Props = {
  language: Language;
  setLanguage: (l: Language) => void;
  theme: 'light'|'dark';
  setTheme: (t:'light'|'dark')=>void;
  profile: PreviewProfile;
  setProfile:(p:PreviewProfile)=>void;
  onAvatarSaved?: (avatar: string | null) => void;
  rides:()=>void;
  saved:()=>void;
  payments:()=>void;
  safety:()=>void;
  support:()=>void;
  switchDriver:()=>void;
  isAdmin?: boolean;
};

export function RiderSettings({language,setLanguage}: Pick<Props,'language'|'setLanguage'|'theme'|'setTheme'>) {
  const t=useTranslation();
  const [alerts,setAlerts]=useState(true);
  const [feedback,setFeedback]=useState('');
  const say=(en:string,am:string)=>language==='am'?am:en;

  useEffect(()=>{try{setAlerts(localStorage.getItem(ALERTS_KEY)!=='off')}catch{}},[]);

  return <div className="nr-account-settings nr-account-settings-v2 biloo-reference-settings">
    <header className="biloo-ref-settings-heading">
      <h2>{say("App settings", "የመተግበሪያ ቅንብሮች")}</h2>
      <p>{say("A simpler way to personalize your Biloo experience.", "የBiloo ልምድዎን በቀላሉ ያስተካክሉ።")}</p>
    </header>
    <SettingsGroups groups={[
      { id: "legal", icon: "shield", title: say("Legal documents", "ሕጋዊ ሰነዶች"), summary: say("Privacy and terms", "ግላዊነት እና ውሎች"), children: <nav className="biloo-settings-links" aria-label="Legal documents"><a href="/explore/privacy">Privacy policy <span>›</span></a><a href="/explore/terms">Terms of service <span>›</span></a></nav> },

      { id: "notifications", icon: "bell", title: say("Notifications", "ማሳወቂያዎች"), summary: say("Trip alerts, sounds and haptics", "የጉዞ ማሳወቂያ፣ ድምፅ እና ንዝረት"), children: <>
    <PermissionSettings/>
    <label className="nr-account-toggle">
      <span>
        <strong>{say('In-app trip alerts','የጉዞ ማሳወቂያዎች')}</strong>
        <small>{say('Show a brief alert when a booked trip changes status.','የተያዘ ጉዞ ሁኔታ ሲቀየር አጭር ማሳወቂያ አሳይ።')}</small>
      </span>
      <input type="checkbox" role="switch" checked={alerts} onChange={e=>{
        const next=e.target.checked;
        try{
          localStorage.setItem(ALERTS_KEY,next?'on':'off');
          setAlerts(next);
          setFeedback(say('Preference saved on this device.','ምርጫው በዚህ መሣሪያ ተቀምጧል።'));
        }catch{
          setFeedback(say('Could not save. Please try again.','ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።'));
        }
      }}/>
    </label>
    <NexRideFeedbackSettings role="rider" language={language}/>
        <NativeReliabilitySettings role="rider"/>
    <p className="nr-muted">{say('System notifications are available when this device supports them and you allow permission. SMS and email alerts are not connected yet. Safety and trip status remain visible in the app.','የስርዓት ማሳወቂያዎች መሣሪያው ሲደግፍና ፈቃድ ሲሰጡ ይገኛሉ። የSMS እና ኢሜይል ማሳወቂያዎች ገና አልተገናኙም።')}</p>
        {feedback&&<p className="nr-settings-feedback" role="status">{feedback}</p>}
      </> },
      { id: "appearance", icon: "globe", title: say("Language & Appearance", "ቋንቋ እና ገጽታ"), summary: say("English, Amharic and your theme", "እንግሊዝኛ፣ አማርኛ እና ገጽታ"), children: <>
    <div className="nr-settings-block"><div><strong>{t("appearance")}</strong><small>{t("appearanceHint")}</small></div><AppearanceSelector role="rider"/></div>
    <div className="nr-settings-block">
      <div>
        <strong>{t('language')}</strong>
        <small>{say('Choose the language used across Biloo.','በBiloo ውስጥ የሚጠቀሙትን ቋንቋ ይምረጡ።')}</small>
      </div>
      <div className="nr-segmented" role="group" aria-label={t('language')}>
        <button aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button>
        <button aria-pressed={language==='am'} onClick={()=>setLanguage('am')}>አማርኛ</button>
      </div>
    </div>
      </> },
    ]}/>
    <div className="biloo-ref-settings-meta" aria-label={say("App information", "የመተግበሪያ መረጃ")}>
      <span><Icon name="info" size={20}/>{say("App version", "የመተግበሪያ ስሪት")}</span>
      <AppVersion />
    </div>
    <a className="biloo-ref-delete-entry" href="/account/manage?role=rider#account-deletion">
      <Icon name="info" size={19}/>{say("Request account deletion", "መለያ እንዲሰረዝ ጠይቅ")}<Icon name="chevron" size={17}/>
    </a>
    <p className="biloo-ref-settings-note">{say("Account deletion requires verification; nothing is deleted by opening this page.", "መለያ ለመሰረዝ ማረጋገጫ ያስፈልጋል።")}</p>
  </div>;
}

export function RiderProfile(props:Props) {
  const router = useRouter();
  const {language,profile,setProfile}=props;
  const t=useTranslation();
  const say=(en:string,am:string)=>language==='am'?am:en;
  const [account,setAccount]=useState<RiderAccount|null>(null);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [panel,setPanel]=useState<'edit'|'settings'|'privacy'|'signout'|null>(null);
  const [form,setForm]=useState(profile);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [photoFailed,setPhotoFailed]=useState(false);
  const [signedOutLocally,setSignedOutLocally]=useState(false);
  const lock=useRef(false);

  useEffect(()=>{
    let active=true;
    setLoading(true);
    setLoadError(false);
    setAccount(null);
    setPhotoFailed(false);

    void readAccount()
      .then(value=>{
        if(!active)return;
        setAccount(value);
      })
      .catch(()=>{if(active)setLoadError(true)})
      .finally(()=>{if(active)setLoading(false)});

    return()=>{active=false};
  },[attempt]);

  useEffect(()=>{
    const {data}=supabase.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){
        if(!lock.current)setPanel(null);
        setAccount(null);
        setLoading(false);
      }
    });
    return()=>data.subscription.unsubscribe();
  },[]);

  const shown=account?.profile || (!loading&&!loadError?profile:{name:'',phone:'',email:''});
  const initials=shown.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase()||'BL';
  const open=(next:typeof panel)=>{setError('');setPanel(next)};

  const save=async()=>{
    if(lock.current)return;
    const invalid=validateProfile(form);
    if(invalid){
      setError(
        invalid==='name'
          ?say('Enter a name between 2 and 80 characters.','ከ2 እስከ 80 ፊደላት ያሉት ስም ያስገቡ።')
          :invalid==='phone'
            ?say('Enter a valid contact number, for example +251912345678.','ትክክለኛ የስልክ ቁጥር ያስገቡ።')
            :say('Enter a valid email address.','ትክክለኛ የኢሜይል አድራሻ ያስገቡ።')
      );
      return;
    }
    lock.current=true;
    setBusy(true);
    setError('');
    try{
      if(account){
        const saved=await saveAccount(account,form);
        setAccount({...account,profile:saved});
      }else{
        const current=await supabase.auth.getSession();
        if(current.error||current.data.session)throw Error('Session changed');
        const saved={name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim()};
        const stored=JSON.parse(localStorage.getItem(PREVIEW_STORAGE_KEY)||'{}');
        localStorage.setItem(PREVIEW_STORAGE_KEY,JSON.stringify({...stored,profile:saved}));
        setProfile(saved);
      }
      setPanel(null);
      setNotice(account?say('Profile updated','መገለጫው ተዘምኗል።'):say('Preview details saved on this device.','የማሳያ ዝርዝሮች ተቀምጠዋል።'));
    }catch{
      setError(say('Could not save your profile. Your changes are still here; please retry.','መገለጫዎን ማስቀመጥ አልተቻለም።'));
    }finally{
      lock.current=false;
      setBusy(false);
    }
  };


  const leaveAccount=()=>{
    try{
      localStorage.removeItem(PREVIEW_ENABLED_KEY);
      localStorage.removeItem(PREVIEW_STORAGE_KEY);
      localStorage.removeItem('nexride-state');
    }catch{}
    retryStartup();
    window.location.replace('/rider/sign-in');
  };

  const signout=async()=>{
    if(lock.current)return;
    if(signedOutLocally){leaveAccount();return}
    lock.current=true;
    setBusy(true);
    setError('');
    try{
      await signOutNexRide('rider');
      setSignedOutLocally(true);
      leaveAccount();
    }catch{
      const current=await supabase.auth.getSession();
      const cleared=!current.error&&!current.data.session;
      setSignedOutLocally(cleared);
      setError(cleared
        ?say('Signed out on this device. Continue to sign in.','በዚህ መሣሪያ ከመለያዎ ወጥተዋል።')
        :say('Sign-out could not be confirmed. Please retry.','ከመለያ መውጣት አልተረጋገጠም።'));
      lock.current=false;
      setBusy(false);
    }
  };

  return <section className="nr-account nr-account-v2 nr-account-standard" aria-labelledby="nr-account-title">
    <header className="nr-account-top nr-account-standard-top">
      <div>
        <span className="nr-account-eyebrow">{say('YOUR SPACE / 05','የእርስዎ ቦታ / 05')}</span>
        <h1 id="nr-account-title" aria-label={say('Account','መለያ')}>{say('Account','መለያ')}</h1>
        <p>{say('All your personal essentials, beautifully organized.','የግል መረጃዎ፣ ምርጫዎችዎ እና ደህንነትዎ በአንድ ቦታ።')}</p>
      </div>
    </header>

    <section className="nr-account-hero nr-account-identity-card">
      <RiderPhotoEditor
        account={account}
        initials={initials}
        language={language}
        photoFailed={photoFailed}
        onImageError={() => setPhotoFailed(true)}
        onSaved={({ avatar, avatarPath }, bytes) => {
          setAccount(current => current && current.id === account?.id
            ? { ...current, avatar, avatarPath } : current);
          setPhotoFailed(false);
          props.onAvatarSaved?.(avatar);
          setNotice(say('Profile photo saved. No admin approval needed. · ', 'ፎቶዎ ተቀምጧል። የአስተዳዳሪ ፈቃድ አያስፈልግም። · ') + photoSizeLabel(bytes));
        }}
      />
      <div className="nr-account-identity">
        <h2>{loading?say('Loading profile…','መገለጫ በመጫን ላይ…'):loadError?say('Profile unavailable','መገለጫ አይገኝም'):shown.name||t('guest')}</h2>
        <p>{shown.phone||shown.email||say('Add your contact details','የመገናኛ መረጃዎን ያክሉ')}</p>
        {shown.phone&&shown.email&&<small>{shown.email}</small>}
      </div>
      <button className="nr-account-edit" aria-label={say('Edit profile','መገለጫ አርትዕ')} disabled={loading||loadError} onClick={()=>{setForm(shown);open('edit')}}>
        <Icon name="user" size={17}/><span>{say('Edit','አርትዕ')}</span>
      </button>
    </section>

    <div className="biloo-account-protection-note">
      <Icon name="shield" size={15}/>
      <span>{account
        ? say('Your account details are protected with secure sign-in.','የመለያዎ መረጃ በደህንነቱ በተጠበቀ መግቢያ ይጠበቃል።')
        : say('Preview details stay on this device.','የማሳያ መረጃ በዚህ መሣሪያ ላይ ይቀመጣል።')}</span>
    </div>

    {loadError&&<div className="nr-account-inline-error" role="alert">
      <Icon name="info" size={18}/>
      <div><strong>{say('Account unavailable','መለያ አይገኝም')}</strong><span>{say('We could not load your account right now.','መለያዎን አሁን መጫን አልተቻለም።')}</span></div>
      <button onClick={()=>setAttempt(v=>v+1)}>{say('Retry','እንደገና ሞክር')}</button>
    </div>}

    <div className="nr-account-standard-groups" aria-label={say('Your account options', 'የመለያ አማራጮች')}>
      <AccountSection title={say('Personal information','የግል መረጃ')} subtitle={say('Your identity and contact details','የእርስዎ ማንነት እና የመገናኛ መረጃ')}>
        <AccountRow icon="lock" title={say('Account & security','መለያ እና ደህንነት')} detail={say('Verified contacts, sign-in and privacy','የተረጋገጠ መገናኛ፣ መግቢያ እና ግላዊነት')} onClick={()=>router.push('/account/manage?role=rider#account-security')}/>
      </AccountSection>

      <AccountSection title={say('Preferences','ምርጫዎች')} subtitle={say('Make Biloo work your way','Bilooን ለራስዎ ያስተካክሉ')}>
        <AccountRow icon="settings" title={say('Appearance, language & alerts','ገጽታ፣ ቋንቋ እና ማሳወቂያዎች')} detail={say('Light/dark theme, permissions and settings','ብርሃን/ጨለማ ገጽታ፣ ፈቃዶች እና ቅንብሮች')} onClick={()=>open('settings')}/>
        <AccountRow icon="shield" title={say('Privacy & your data','ግላዊነት እና ውሂብዎ')} detail={say('Understand how your information is handled','መረጃዎ እንዴት እንደሚተዳደር ይወቁ')} onClick={()=>open('privacy')}/>
        <AccountRow icon="info" title={say('Terms & about Biloo','ሕጋዊ መረጃ እና ስለ Biloo')} detail={say('Service terms and product information','የአገልግሎት ውሎች እና ስለ መተግበሪያው')} onClick={()=>router.push('/explore/terms')}/>
      </AccountSection>

    </div>

    {notice&&<div className="nr-account-success" role="status"><Icon name="check" size={17}/><span>{notice}</span></div>}

    <footer className="nr-account-footer nr-account-standard-footer">
      <button className="nr-account-signout-button" onClick={()=>open('signout')}>
        <Icon name="power" size={18}/>{account||loadError?say('Sign out','ውጣ'):say('Exit preview','ከማሳያ ውጣ')}
      </button>
      <small>{say('Biloo · Better Rides. A Brighter Tomorrow.','Biloo · የተሻለ ጉዞ። ብሩህ ነገ።')}</small>
      <AppVersion />
    </footer>

    {panel&&<Dialog className={panel==='edit'?'biloo-ref-profile-modal':panel==='settings'?'biloo-ref-settings-modal':''} title={
      panel==='edit'?say('Edit profile','መገለጫ አርትዕ')
      :panel==='settings'?t('settings')
      :panel==='privacy'?say('Privacy & your data','ግላዊነት እና ውሂብዎ')
      :say('Sign out of Biloo?','ከBiloo ይውጡ?')
    } onClose={()=>{if(!busy)setPanel(null)}}>
      {panel==='edit'?<form className="nr-profile-form nr-profile-form-v2" onSubmit={e=>{e.preventDefault();void save()}} aria-busy={busy}>
        <div className="nr-edit-profile-intro">
          <div className="nr-edit-avatar" role="img" aria-label={say("Profile photo", "የመገለጫ ፎቶ")}>{account?.avatar&&!photoFailed?<Image src={account.avatar} width={50} height={50} alt="" unoptimized onError={()=>setPhotoFailed(true)}/>:initials}</div>
          <div><strong>{say('Keep your account details current','የመለያ ዝርዝሮችዎን ወቅታዊ ያድርጉ')}</strong><small>{account?say('These details are used across your Biloo rides.','እነዚህ ዝርዝሮች በBiloo ጉዞዎችዎ ላይ ይጠቀማሉ።'):t('localAccount')}</small></div>
        </div>
        <fieldset disabled={busy} className="biloo-ref-profile-fields">
          <InputField label={t('name')} required autoComplete="name" maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <InputField label={t('phone')} type="tel" autoComplete="tel" maxLength={25} value={form.phone} readOnly={!!account} onChange={e=>{if(!account)setForm({...form,phone:e.target.value})}}/>
          <InputField label={t('email')} type="email" readOnly={!!account} autoComplete="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
        </fieldset>
        {account&&<>
          <p className="nr-muted">{say('Verified email and phone changes require account ownership confirmation.','ኢሜይልን እና ስልክን ለመቀየር የባለቤትነት ማረጋገጫ ያስፈልጋል።')}</p>
          <button type="button" className="nr-account-edit" onClick={()=>router.push("/account/manage")}>
            {say('Verify or change email and phone in Manage Account →','ኢሜይልና ስልክን በመለያ አስተዳደር ይቀይሩ →')}
          </button>
        </>}
        {error&&<p className="nr-account-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy} loading={busy}>{busy?say('Saving…','በማስቀመጥ ላይ…'):t('save')}</Button>
      </form>
      :panel==='settings'?<RiderSettings {...props}/>
      :panel==='privacy'?<div className="nr-account-info nr-privacy-copy">
        <div className="nr-privacy-icon"><Icon name="shield" size={22}/></div>
        <h3>{say('Your data, clearly explained','ስለ ውሂብዎ ግልጽ መረጃ')}</h3>
        <p>{say('Signed-in profile details, bookings and feedback are stored with your Biloo account and protected by the existing account permissions.','የመገለጫ ዝርዝሮች፣ ጉዞዎችና አስተያየቶች በBiloo መለያዎ ይቀመጣሉ።')}</p>
        <p>{say('Preview details and preferences are stored in this browser. Location permission stays under your browser or device controls.','የማሳያ ዝርዝሮችና ምርጫዎች በዚህ አሳሽ ይቀመጣሉ።')}</p>
      </div>
      :<>
        <div className="nr-signout-confirm">
          <span><Icon name="power" size={22}/></span>
          <div><strong>{say('Sign out on this device?','በዚህ መሣሪያ ይውጡ?')}</strong><p>{say('You’ll need to sign in again. Active bookings are not cancelled automatically.','እንደገና መግባት ይኖርብዎታል። ንቁ ጉዞዎች በራስ-ሰር አይሰረዙም።')}</p></div>
        </div>
        {error&&<p role="alert" className="nr-account-error">{error}</p>}
        <div className="nr-signout-actions">
          <Button variant="secondary" disabled={busy||signedOutLocally} onClick={()=>setPanel(null)}>{say('Stay signed in','በመለያው ቆይ')}</Button>
          <Button className="nr-account-danger" disabled={busy} loading={busy} onClick={()=>void signout()}>{signedOutLocally?say('Continue to sign in','ወደ መግቢያ ቀጥል'):say('Confirm sign out','መውጣት አረጋግጥ')}</Button>
        </div>
      </>}
    </Dialog>}
  </section>;
}

function AccountSection({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}) {
  return <section className="nr-account-section">
    <header><div><h3>{title}</h3><p>{subtitle}</p></div></header>
    <div className="nr-account-section-list">{children}</div>
  </section>;
}

function AccountRow({icon,title,detail,onClick,accent=false}:{icon:IconName;title:string;detail:string;onClick:()=>void;accent?:boolean}) {
  return <button className={"nr-account-row"+(accent?" accent":"")} onClick={onClick}>
    <span className="nr-account-row-icon" data-tone={icon}><Icon name={icon} size={19}/></span>
    <span className="nr-account-row-copy"><strong>{title}</strong><small>{detail}</small></span>
    <Icon name="chevron" size={17}/>
  </button>;
}
