'use client';
import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { ALERTS_KEY, readAccount, saveAccount, validateProfile, type RiderAccount } from '../../lib/nexride-account';
import { PREVIEW_ENABLED_KEY, PREVIEW_STORAGE_KEY, markExplicitSignOut, retryStartup } from '../../lib/nexride-startup';
import type { Language } from '../../lib/nexride-i18n';
import type { PreviewProfile } from '../../lib/nexride-preview';
import { Button, Dialog, Icon, InputField, useTranslation, type IconName } from './ui';

type Props = {
  language: Language;
  setLanguage: (l: Language) => void;
  theme: 'light'|'dark';
  setTheme: (t:'light'|'dark')=>void;
  profile: PreviewProfile;
  setProfile:(p:PreviewProfile)=>void;
  rides:()=>void;
  saved:()=>void;
  payments:()=>void;
  safety:()=>void;
  support:()=>void;
  switchDriver:()=>void;
  isAdmin?: boolean;
};

export function RiderSettings({language,setLanguage,theme,setTheme}: Pick<Props,'language'|'setLanguage'|'theme'|'setTheme'>) {
  const t=useTranslation();
  const [alerts,setAlerts]=useState(true);
  const [feedback,setFeedback]=useState('');
  const say=(en:string,am:string)=>language==='am'?am:en;

  useEffect(()=>{try{setAlerts(localStorage.getItem(ALERTS_KEY)!=='off')}catch{}},[]);

  return <div className="nr-account-settings nr-account-settings-v2">
    <div className="nr-settings-block">
      <div>
        <strong>{t('language')}</strong>
        <small>{say('Choose the language used across NexRide.','በNexRide ውስጥ የሚጠቀሙትን ቋንቋ ይምረጡ።')}</small>
      </div>
      <div className="nr-segmented" role="group" aria-label={t('language')}>
        <button aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button>
        <button aria-pressed={language==='am'} onClick={()=>setLanguage('am')}>አማርኛ</button>
      </div>
    </div>
    <div className="nr-settings-block">
      <div>
        <strong>{t('appearance')}</strong>
        <small>{say('Match the ride workspace to your preferred appearance.','የጉዞ ገጹን ከሚመርጡት መልክ ጋር ያስማሙ።')}</small>
      </div>
      <div className="nr-segmented" role="group" aria-label={t('appearance')}>
        <button aria-pressed={theme==='light'} onClick={()=>setTheme('light')}>{t('light')}</button>
        <button aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}>{t('dark')}</button>
      </div>
    </div>
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
    <p className="nr-muted">{say('Push, SMS and email notifications are not connected yet. Safety and trip status remain visible in the app.','የፑሽ፣ ኤስኤምኤስና ኢሜይል ማሳወቂያዎች ገና አልተገናኙም።')}</p>
    {feedback&&<p className="nr-settings-feedback" role="status">{feedback}</p>}
  </div>;
}

export function RiderProfile(props:Props) {
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
  const initials=shown.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase()||'NR';
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
      const result=await supabase.auth.signOut({scope:'local'});
      if(result.error)throw result.error;
      const current=await supabase.auth.getSession();
      if(current.error||current.data.session)throw Error('Session still active');
      markExplicitSignOut('rider');
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
        <span className="nr-account-eyebrow">NEXRIDE · {say('ACCOUNT','መለያ')}</span>
        <h1 id="nr-account-title">{say('Account','መለያ')}</h1>
        <p>{say('Manage your profile, rides and preferences.','መገለጫዎን፣ ጉዞዎችዎን እና ምርጫዎችዎን ያስተዳድሩ።')}</p>
      </div>
    </header>

    <section className="nr-account-hero nr-account-identity-card">
      <div className="nr-account-avatar-wrap">
        <div className="nr-account-avatar">
          {account?.avatar&&!photoFailed
            ?<Image src={account.avatar} alt={say('Your profile photo','የመገለጫዎ ፎቶ')} width={72} height={72} unoptimized onError={()=>setPhotoFailed(true)}/>
            :<span aria-label={say('Profile initials','የስም መጀመሪያ ፊደላት')}>{initials}</span>}
        </div>
        {account&&<span className="nr-account-avatar-badge" aria-label={say('Signed in','ገብተዋል')}><Icon name="check" size={12}/></span>}
      </div>
      <div className="nr-account-identity">
        <h2>{loading?say('Loading profile…','መገለጫ በመጫን ላይ…'):loadError?say('Profile unavailable','መገለጫ አይገኝም'):shown.name||t('guest')}</h2>
        <p>{shown.phone||shown.email||say('Add your contact details','የመገናኛ መረጃዎን ያክሉ')}</p>
        {shown.phone&&shown.email&&<small>{shown.email}</small>}
      </div>
      <button className="nr-account-edit" disabled={loading||loadError} onClick={()=>{setForm(shown);open('edit')}}>
        <Icon name="user" size={17}/><span>{say('Edit','አርትዕ')}</span>
      </button>
    </section>

    {loadError&&<div className="nr-account-inline-error" role="alert">
      <Icon name="info" size={18}/>
      <div><strong>{say('Account unavailable','መለያ አይገኝም')}</strong><span>{say('We could not load your account right now.','መለያዎን አሁን መጫን አልተቻለም።')}</span></div>
      <button onClick={()=>setAttempt(v=>v+1)}>{say('Retry','እንደገና ሞክር')}</button>
    </div>}

    <div className="nr-account-standard-groups">
      <AccountSection title={say('Your NexRide','የእርስዎ NexRide')} subtitle={say('Everything for your rides','ለጉዞዎችዎ የሚያስፈልጉ ነገሮች')}>
        <AccountRow icon="clock" title={say('Activity','እንቅስቃሴ')} detail={say('Trips and receipts','ጉዞዎች እና ደረሰኞች')} onClick={props.rides}/>
        <AccountRow icon="wallet" title={say('Payments','ክፍያዎች')} detail={say('Payment methods and status','የክፍያ መንገዶች እና ሁኔታ')} onClick={props.payments}/>
        <AccountRow icon="star" title={say('Saved places','የተቀመጡ ቦታዎች')} detail={say('Home, work and frequent places','ቤት፣ ስራ እና ተደጋጋሚ ቦታዎች')} onClick={props.saved}/>
        <AccountRow icon="shield" title={say('Safety','ደህንነት')} detail={say('Safety tools and trip sharing','የደህንነት መሳሪያዎች እና ጉዞ ማጋራት')} onClick={props.safety}/>
      </AccountSection>

      <AccountSection title={say('Account & help','መለያ እና እገዛ')} subtitle={say('Your details and support','ዝርዝሮችዎ እና ድጋፍ')}>
        <AccountRow icon="user" title={say('Personal information','የግል መረጃ')} detail={say('Name and contact details','ስም እና የመገናኛ ዝርዝሮች')} onClick={()=>{setForm(shown);open('edit')}}/>
        <AccountRow icon="chat" title={say('Support','ድጋፍ')} detail={say('Help with rides and your account','ለጉዞና መለያ እገዛ')} onClick={props.support}/>
        <AccountRow icon="info" title={say('Privacy & data','ግላዊነት እና ውሂብ')} detail={say('How NexRide handles your information','NexRide መረጃዎን እንዴት እንደሚይዝ')} onClick={()=>open('privacy')}/>
      </AccountSection>

      <AccountSection title={say('Preferences','ምርጫዎች')} subtitle={say('Language, appearance and alerts','ቋንቋ፣ መልክ እና ማሳወቂያዎች')}>
        <AccountRow icon="settings" title={t('settings')} detail={say('Manage your app preferences','የመተግበሪያ ምርጫዎችዎን ያስተዳድሩ')} onClick={()=>open('settings')}/>
      </AccountSection>

      <section className="nr-account-secondary-actions" aria-label={say('More NexRide options','ተጨማሪ የNexRide አማራጮች')}>
        <button onClick={props.switchDriver}>
          <span className="nr-account-row-icon"><Icon name="navigation" size={19}/></span>
          <span className="nr-account-row-copy"><strong>{say('Drive with NexRide','በNexRide ያሽከርክሩ')}</strong><small>{say('Open the Driver experience','የአሽከርካሪ ልምድን ይክፈቱ')}</small></span>
          <Icon name="chevron" size={17}/>
        </button>
        {props.isAdmin&&<button className="admin-access" onClick={()=>window.location.assign('/admin')}>
          <span className="nr-account-row-icon"><Icon name="shield" size={19}/></span>
          <span className="nr-account-row-copy"><strong>Admin Control Center</strong><small>Operations and platform management</small></span>
          <Icon name="chevron" size={17}/>
        </button>}
      </section>
    </div>

    {notice&&<div className="nr-account-success" role="status"><Icon name="check" size={17}/><span>{notice}</span></div>}

    <footer className="nr-account-footer nr-account-standard-footer">
      <button className="nr-account-signout-button" onClick={()=>open('signout')}>
        <Icon name="power" size={18}/>{account||loadError?say('Sign out','ውጣ'):say('Exit preview','ከማሳያ ውጣ')}
      </button>
      <small>{say('NexRide · Better Rides. A Brighter Tomorrow.','NexRide · የተሻለ ጉዞ። ብሩህ ነገ።')}</small>
    </footer>

    {panel&&<Dialog title={
      panel==='edit'?say('Edit profile','መገለጫ አርትዕ')
      :panel==='settings'?t('settings')
      :panel==='privacy'?say('Privacy & your data','ግላዊነት እና ውሂብዎ')
      :say('Sign out of NexRide?','ከNexRide ይውጡ?')
    } onClose={()=>{if(!busy)setPanel(null)}}>
      {panel==='edit'?<form className="nr-profile-form nr-profile-form-v2" onSubmit={e=>{e.preventDefault();void save()}} aria-busy={busy}>
        <div className="nr-edit-profile-intro">
          <div className="nr-edit-avatar">{initials}</div>
          <div><strong>{say('Keep your account details current','የመለያ ዝርዝሮችዎን ወቅታዊ ያድርጉ')}</strong><small>{account?say('These details are used across your NexRide rides.','እነዚህ ዝርዝሮች በNexRide ጉዞዎችዎ ላይ ይጠቀማሉ።'):t('localAccount')}</small></div>
        </div>
        <fieldset disabled={busy}>
          <InputField label={t('name')} required autoComplete="name" maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <InputField label={t('phone')} type="tel" autoComplete="tel" maxLength={25} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
          <InputField label={t('email')} type="email" readOnly={!!account} autoComplete="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
        </fieldset>
        {account&&<p className="nr-muted">{say('Email is your sign-in identity and cannot be changed from this profile screen.','ኢሜይል የመግቢያ መለያዎ ነው እና ከዚህ ገጽ ሊቀየር አይችልም።')}</p>}
        {error&&<p className="nr-account-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy} loading={busy}>{busy?say('Saving…','በማስቀመጥ ላይ…'):t('save')}</Button>
      </form>
      :panel==='settings'?<RiderSettings {...props}/>
      :panel==='privacy'?<div className="nr-account-info nr-privacy-copy">
        <div className="nr-privacy-icon"><Icon name="shield" size={22}/></div>
        <h3>{say('Your data, clearly explained','ስለ ውሂብዎ ግልጽ መረጃ')}</h3>
        <p>{say('Signed-in profile details, bookings and feedback are stored with your NexRide account and protected by the existing account permissions.','የመገለጫ ዝርዝሮች፣ ጉዞዎችና አስተያየቶች በNexRide መለያዎ ይቀመጣሉ።')}</p>
        <p>{say('Preview details and preferences are stored in this browser. Location permission stays under your browser or device controls.','የማሳያ ዝርዝሮችና ምርጫዎች በዚህ አሳሽ ይቀመጣሉ።')}</p>
        <p>{say('Account export and deletion requests are not available in the app yet.','የመለያ ውሂብ ማውረድና መሰረዝ ጥያቄዎች ገና አይገኙም።')}</p>
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
    <span className="nr-account-row-icon"><Icon name={icon} size={19}/></span>
    <span className="nr-account-row-copy"><strong>{title}</strong><small>{detail}</small></span>
    <Icon name="chevron" size={17}/>
  </button>;
}
