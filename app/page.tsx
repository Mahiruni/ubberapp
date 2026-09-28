'use client';

import { useMemo, useState } from 'react';
import './driver-premium.css';

type Mode = 'rider' | 'driver';
type RiderScreen = 'home' | 'destination' | 'rides' | 'trip' | 'wallet' | 'profile';
type DriverScreen = 'home' | 'request' | 'navigation' | 'earnings' | 'profile';

type IconName = 'home' | 'search' | 'clock' | 'wallet' | 'user' | 'car' | 'shield' | 'settings' | 'locate' | 'menu' | 'arrow' | 'check' | 'phone' | 'chat' | 'navigation' | 'money' | 'close';

const paths: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6',
  search: 'm21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  wallet: 'M3 6h18v13H3zM16 12h5M16 12a2 2 0 1 0 0 4h5v-4',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  car: 'M5 17h14M6 17l-1-5 2-5h10l2 5-1 5M7 15h.01M17 15h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 12H2m20 0h-2M12 4V2m0 20v-2',
  locate: 'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 0-12 0 6 6 0 0 0 12 0Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  arrow: 'M5 12h14m-7-7 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  phone: 'M6 3l3 1-1 4-2 1a15 15 0 0 0 7 7l1-2 4-1 1 3a2 2 0 0 1-2 2C10 18 6 14 3 7a2 2 0 0 1 3-4Z',
  chat: 'M4 5h16v11H8l-4 4V5Z',
  navigation: 'M4 4l16 8-16 8 4-8-4-8Z',
  money: 'M3 6h18v12H3zM12 8v8M7 12h.01M17 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const rides = [
  { id: 'economy', name: 'Economy', description: 'Everyday rides', eta: '3 min', price: 185, seats: 4 },
  { id: 'comfort', name: 'Comfort', description: 'Newer, quieter cars', eta: '5 min', price: 265, seats: 4 },
  { id: 'premium', name: 'Premium', description: 'Top-rated drivers', eta: '7 min', price: 420, seats: 4 },
  { id: 'xl', name: 'XL', description: 'More room for groups', eta: '6 min', price: 340, seats: 6 },
];

const places = ['Bole Atlas', 'Kazanchis', 'Bole Airport', '4 Kilo', 'Piassa', 'Mexico', 'CMC', 'Megenagna', 'Sar Bet', 'Gerji', 'Lideta', 'Gotera', 'Lafto', 'Jemo', 'Kolfe', 'Ayat', 'Summit', 'Shola', 'Edna Mall', 'Friendship Mall'];

export default function Home() {
  const [mode, setMode] = useState<Mode>('rider');
  const [riderScreen, setRiderScreen] = useState<RiderScreen>('home');
  const [driverScreen, setDriverScreen] = useState<DriverScreen>('home');
  const [destination, setDestination] = useState('');
  const [selectedRide, setSelectedRide] = useState(rides[0]);
  const [online, setOnline] = useState(false);
  const [requestVisible, setRequestVisible] = useState(true);
  const [tripStarted, setTripStarted] = useState(false);
  const [rating, setRating] = useState(0);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredPlaces = useMemo(() => {
    const q = destination.trim().toLowerCase();
    return q ? places.filter((p) => p.toLowerCase().includes(q)).slice(0, 7) : places.slice(0, 6);
  }, [destination]);

  const chooseDestination = (place: string) => {
    setDestination(place);
    setRiderScreen('rides');
  };

  const bookRide = () => setRiderScreen('trip');

  return (
    <main className={`${dark ? 'dark ' : ''}nx-app ${mode === 'driver' ? 'driver-page' : ''}`}>
      {menuOpen && (
        <div className="nx-menu-backdrop" onClick={() => setMenuOpen(false)}>
          <aside className="nx-menu" onClick={(e) => e.stopPropagation()}>
            <div className="nx-menu-head"><strong>NexRide</strong><button onClick={() => setMenuOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
            <div className="nx-menu-profile"><div className="nx-avatar">MA</div><div><strong>Mahir Aman</strong><small>Premium rider</small></div></div>
            <button onClick={() => { setMode('rider'); setRiderScreen('profile'); setMenuOpen(false); }}><Icon name="user" /> Profile</button>
            <button onClick={() => { setRiderScreen('wallet'); setMenuOpen(false); }}><Icon name="wallet" /> Payments & Wallet</button>
            <button><Icon name="shield" /> Safety</button>
            <button onClick={() => setDark((v) => !v)}><Icon name={dark ? 'sun' as IconName : 'settings'} /> {dark ? 'Light mode' : 'Dark mode'}</button>
            <button><Icon name="settings" /> Settings</button>
            <button><Icon name="chat" /> Help & Support</button>
            <div className="nx-menu-divider" />
            <button className="nx-driver-switch" onClick={() => { setMode('driver'); setDriverScreen('home'); setMenuOpen(false); }}><Icon name="car" /> Drive with NexRide <Icon name="arrow" size={17} /></button>
          </aside>
        </div>
      )}

      {mode === 'rider' ? (
        <RiderApp
          screen={riderScreen}
          destination={destination}
          selectedRide={selectedRide}
          filteredPlaces={filteredPlaces}
          rating={rating}
          onMenu={() => setMenuOpen(true)}
          onDestinationChange={setDestination}
          onChooseDestination={chooseDestination}
          onSelectRide={setSelectedRide}
          onBook={bookRide}
          onSetRating={setRating}
          onNavigate={setRiderScreen}
          onSwitchDriver={() => { setMode('driver'); setDriverScreen('home'); }}
        />
      ) : (
        <DriverApp
          screen={driverScreen}
          online={online}
          requestVisible={requestVisible}
          tripStarted={tripStarted}
          onMenu={() => setMenuOpen(true)}
          onToggleOnline={() => setOnline((v) => !v)}
          onRequest={() => setRequestVisible(true)}
          onAccept={() => { setRequestVisible(false); setDriverScreen('navigation'); }}
          onDecline={() => setRequestVisible(false)}
          onStartTrip={() => setTripStarted(true)}
          onComplete={() => setDriverScreen('earnings')}
          onNavigate={setDriverScreen}
          onSwitchRider={() => { setMode('rider'); setRiderScreen('home'); }}
        />
      )}
    </main>
  );
}

function Map({ dark = false, route = false, driver = false }: { dark?: boolean; route?: boolean; driver?: boolean }) {
  return <div className={`nx-map ${dark ? 'nx-map-dark' : ''}`}>
    <div className="nx-map-grid" />
    <div className="nx-road nx-road-a" /><div className="nx-road nx-road-b" /><div className="nx-road nx-road-c" /><div className="nx-road nx-road-d" />
    {route && <div className="nx-route" />}
    <div className="nx-pin nx-pin-start" />
    {route && <div className="nx-pin nx-pin-end" />}
    {driver && <div className="nx-driver-car"><Icon name="car" size={18} /></div>}
    <div className="nx-map-controls"><button aria-label="Locate"><Icon name="locate" /></button><button aria-label="Layers"><span>◈</span></button></div>
    <small className="nx-map-credit">NexRide maps</small>
  </div>;
}

function Header({ title, onMenu, right }: { title: string; onMenu: () => void; right?: React.ReactNode }) {
  return <header className="nx-header"><button className="nx-icon-button" onClick={onMenu} aria-label="Open menu"><Icon name="menu" /></button><strong>{title}</strong><div>{right}</div></header>;
}

function RiderApp({ screen, destination, selectedRide, filteredPlaces, rating, onMenu, onDestinationChange, onChooseDestination, onSelectRide, onBook, onSetRating, onNavigate, onSwitchDriver }: { screen: RiderScreen; destination: string; selectedRide: typeof rides[number]; filteredPlaces: string[]; rating: number; onMenu: () => void; onDestinationChange: (v: string) => void; onChooseDestination: (v: string) => void; onSelectRide: (r: typeof rides[number]) => void; onBook: () => void; onSetRating: (n: number) => void; onNavigate: (s: RiderScreen) => void; onSwitchDriver: () => void }) {
  if (screen === 'destination') return <div className="nx-mobile-shell"><Header title="Where to?" onMenu={onMenu} /><section className="nx-search-page"><div className="nx-search-box"><Icon name="search" /><input autoFocus value={destination} onChange={(e) => onDestinationChange(e.target.value)} placeholder="Search destination" /></div><div className="nx-current"><span className="nx-dot blue" /><span>Current location</span></div><h2>Recent & nearby</h2><div className="nx-place-list">{filteredPlaces.map((p) => <button key={p} onClick={() => onChooseDestination(p)}><span className="nx-place-icon"><Icon name="clock" size={18} /></span><span><strong>{p}</strong><small>Addis Ababa</small></span><Icon name="arrow" size={17} /></button>)}</div></section></div>;

  if (screen === 'rides') return <div className="nx-mobile-shell nx-map-shell"><Map route /><div className="nx-bottom-sheet"><div className="nx-handle" /><div className="nx-sheet-title"><div><small>Going to</small><h1>{destination || 'Choose destination'}</h1></div><button onClick={() => onNavigate('destination')}>Edit</button></div><div className="nx-ride-list">{rides.map((r) => <button key={r.id} className={`nx-ride-card ${selectedRide.id === r.id ? 'selected' : ''}`} onClick={() => onSelectRide(r)}><span className="nx-car-icon"><Icon name="car" /></span><span className="nx-ride-info"><strong>{r.name}</strong><small>{r.description} · {r.seats} seats</small></span><span className="nx-ride-time"><strong>{r.price} ETB</strong><small>{r.eta}</small></span></button>)}</div><button className="nx-primary" onClick={onBook}>Confirm {selectedRide.name} · {selectedRide.price} ETB</button></div></div>;

  if (screen === 'trip') return <div className="nx-mobile-shell nx-map-shell"><Map route driver /><div className="nx-trip-top"><span className="nx-live-dot" /> Driver is on the way <strong>4 min</strong></div><div className="nx-bottom-sheet nx-trip-sheet"><div className="nx-driver-row"><div className="nx-driver-photo">AB</div><div><strong>Abebe M.</strong><small>★ 4.9 · Toyota Corolla</small><small>3-A12345 · 1,240 trips</small></div><div className="nx-actions"><button><Icon name="phone" /></button><button><Icon name="chat" /></button></div></div><div className="nx-progress"><span /></div><div className="nx-safety-row"><span><Icon name="shield" size={18} /> Your trip is protected</span><button>Safety</button></div></div></div>;

  if (screen === 'wallet') return <div className="nx-mobile-shell"><Header title="Wallet" onMenu={onMenu} /><section className="nx-page-content"><div className="nx-wallet-hero"><small>Available balance</small><strong>ETB 1,240</strong><button>Add payment method</button></div><h2>Payment methods</h2><div className="nx-list-card"><div><Icon name="wallet" /><span><strong>Cash</strong><small>Default payment</small></span><b>✓</b></div><div><Icon name="money" /><span><strong>Mobile money</strong><small>Add a payment method</small></span><Icon name="arrow" size={17} /></div></div></section><BottomNav active="wallet" onNavigate={onNavigate} /></div>;

  if (screen === 'profile') return <div className="nx-mobile-shell"><Header title="Profile" onMenu={onMenu} /><section className="nx-page-content"><div className="nx-profile-head"><div className="nx-profile-avatar">MA</div><div><h1>Mahir Aman</h1><p>Rider · 4.9 rating</p></div></div><div className="nx-list-card"><button><Icon name="user" /><span>Personal information</span><Icon name="arrow" size={17} /></button><button><Icon name="clock" /><span>My trips</span><Icon name="arrow" size={17} /></button><button><Icon name="shield" /><span>Safety</span><Icon name="arrow" size={17} /></button><button><Icon name="settings" /><span>Settings</span><Icon name="arrow" size={17} /></button></div><button className="nx-secondary" onClick={onSwitchDriver}>Become a NexRide driver</button></section><BottomNav active="profile" onNavigate={onNavigate} /></div>;

  return <div className="nx-mobile-shell nx-home"><Map /><Header title="NexRide" onMenu={onMenu} /><div className="nx-home-overlay"><button className="nx-destination-bar" onClick={() => onNavigate('destination')}><span className="nx-search-circle"><Icon name="search" /></span><span><small>Where to?</small><strong>Choose your destination</strong></span><Icon name="arrow" size={18} /></button><div className="nx-quick-row"><button onClick={() => onChooseDestination('Home')}><b>⌂</b><span>Home</span></button><button onClick={() => onChooseDestination('Work')}><b>▣</b><span>Work</span></button><button onClick={() => onNavigate('destination')}><b>＋</b><span>Add</span></button></div></div><BottomNav active="home" onNavigate={onNavigate} /></div>;
}

function BottomNav({ active, onNavigate }: { active: string; onNavigate: (s: RiderScreen) => void }) {
  return <nav className="nx-bottom-nav"><button className={active === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}><Icon name="home" size={19} />Home</button><button className={active === 'trips' ? 'active' : ''} onClick={() => onNavigate('trip')}><Icon name="clock" size={19} />Trips</button><button className={active === 'wallet' ? 'active' : ''} onClick={() => onNavigate('wallet')}><Icon name="wallet" size={19} />Wallet</button><button className={active === 'profile' ? 'active' : ''} onClick={() => onNavigate('profile')}><Icon name="user" size={19} />Profile</button></nav>;
}

function DriverApp({ screen, online, requestVisible, tripStarted, onMenu, onToggleOnline, onAccept, onDecline, onStartTrip, onComplete, onNavigate, onSwitchRider }: { screen: DriverScreen; online: boolean; requestVisible: boolean; tripStarted: boolean; onMenu: () => void; onToggleOnline: () => void; onRequest: () => void; onAccept: () => void; onDecline: () => void; onStartTrip: () => void; onComplete: () => void; onNavigate: (s: DriverScreen) => void; onSwitchRider: () => void }) {
  if (screen === 'request' && requestVisible) return <div className="nx-mobile-shell nx-map-shell"><Map route /><div className="nx-driver-request"><div className="nx-request-handle" /><small>New ride request</small><div className="nx-request-price">ETB 265</div><div className="nx-request-route"><div><span className="nx-dot green" /><strong>Bole Atlas</strong><small>Pickup · 3 min</small></div><div className="nx-route-line" /><div><span className="nx-dot blue" /><strong>Kazanchis</strong><small>Drop-off · 6.2 km</small></div></div><div className="nx-request-meta"><span>★ 4.9 rider</span><span>~18 min</span><span>6.2 km</span></div><div className="nx-request-actions"><button className="nx-secondary" onClick={onDecline}>Decline</button><button className="nx-primary" onClick={onAccept}>Accept ride</button></div></div></div>;

  if (screen === 'navigation') return <div className="nx-mobile-shell nx-map-shell"><Map route driver /><Header title={tripStarted ? 'On trip' : 'Pickup'} onMenu={onMenu} /><div className="nx-turn-card"><small>Next turn</small><strong>{tripStarted ? 'Continue toward Kazanchis' : 'Head to Bole Atlas'}</strong><span>{tripStarted ? '4.1 km · 12 min' : '1.8 km · 4 min'}</span></div><div className="nx-driver-trip-sheet"><div><small>{tripStarted ? 'Passenger on board' : 'Arriving at pickup'}</small><strong>{tripStarted ? 'Kazanchis' : 'Bole Atlas'}</strong></div>{tripStarted ? <button className="nx-primary" onClick={onComplete}>Complete trip</button> : <button className="nx-primary" onClick={onStartTrip}>Start trip</button>}</div></div>;

  if (screen === 'earnings') return <div className="nx-mobile-shell"><Header title="Earnings" onMenu={onMenu} /><section className="nx-page-content"><div className="nx-earnings-card"><small>Today</small><strong>ETB 1,845</strong><span>+12% from yesterday</span></div><div className="nx-stat-grid"><div><small>Online time</small><strong>7h 24m</strong></div><div><small>Trips</small><strong>14</strong></div></div><h2>This week</h2><div className="nx-chart"><span style={{height:'48%'}} /><span style={{height:'67%'}} /><span style={{height:'54%'}} /><span style={{height:'82%'}} /><span style={{height:'61%'}} /><span style={{height:'92%'}} /><span style={{height:'70%'}} /></div></section><DriverNav active="earnings" onNavigate={onNavigate} /></div>;

  if (screen === 'profile') return <div className="nx-mobile-shell"><Header title="Driver profile" onMenu={onMenu} /><section className="nx-page-content"><div className="nx-profile-head"><div className="nx-profile-avatar">MA</div><div><h1>Mahir Aman</h1><p>★ 4.9 · 1,240 trips</p></div></div><div className="nx-list-card"><button><Icon name="money" /><span>Earnings</span><Icon name="arrow" size={17} /></button><button><Icon name="clock" /><span>Trip history</span><Icon name="arrow" size={17} /></button><button><Icon name="settings" /><span>Preferences</span><Icon name="arrow" size={17} /></button><button><Icon name="shield" /><span>Safety & support</span><Icon name="arrow" size={17} /></button></div><button className="nx-secondary" onClick={onSwitchRider}>Switch to rider</button></section><DriverNav active="profile" onNavigate={onNavigate} /></div>;

  return <div className="nx-mobile-shell nx-driver-home"><Map dark={false} /><Header title="NexRide Driver" onMenu={onMenu} /><div className="nx-driver-status"><div><small>{online ? 'You are online' : 'You are offline'}</small><strong>{online ? 'Ready for trips' : 'Take a break'}</strong></div><button className={online ? 'nx-online-toggle online' : 'nx-online-toggle'} onClick={onToggleOnline}><span />{online ? 'ONLINE' : 'GO ONLINE'}</button></div><div className="nx-driver-summary"><div><small>Today</small><strong>ETB 1,845</strong><span>14 trips</span></div><div><small>Demand</small><strong>Moderate</strong><span>+8% nearby</span></div></div>{online && requestVisible && <button className="nx-opportunity" onClick={() => onNavigate('request')}><span className="nx-opportunity-icon"><Icon name="car" /></span><span><strong>Ride request available</strong><small>Bole Atlas → Kazanchis · ETB 265</small></span><Icon name="arrow" size={18} /></button>}<DriverNav active="home" onNavigate={onNavigate} /></div>;
}

function DriverNav({ active, onNavigate }: { active: string; onNavigate: (s: DriverScreen) => void }) {
  return <nav className="nx-bottom-nav"><button className={active === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}><Icon name="home" size={19} />Home</button><button className={active === 'request' ? 'active' : ''} onClick={() => onNavigate('request')}><Icon name="car" size={19} />Requests</button><button className={active === 'earnings' ? 'active' : ''} onClick={() => onNavigate('earnings')}><Icon name="money" size={19} />Earnings</button><button className={active === 'profile' ? 'active' : ''} onClick={() => onNavigate('profile')}><Icon name="user" size={19} />Account</button></nav>;
}
