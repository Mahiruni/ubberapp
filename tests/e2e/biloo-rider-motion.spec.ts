import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mapAvatarSvg, avatarPreset } from '../../lib/biloo-rider-avatar-art';

test.use({ video: 'off', serviceWorkers: 'block', launchOptions: {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
} });
const riderId='11111111-1111-4111-8111-111111111111', driverId='22222222-2222-4222-8222-222222222222', tripId='33333333-3333-4333-8333-333333333333', offerId='44444444-4444-4444-8444-444444444444';
const design = { preset: 8, skin: 2, hair: 0, outfit: 0 };
type State = { assigned: boolean; stage: string; signal: { id: string; createdAt: string } | null; fail: boolean; posts: Record<string, unknown>[] };
const state = (): State => ({assigned:false,stage:'accepted',signal:null,fail:false,posts:[]});

async function fixture(page: Page, data: State, role: 'rider' | 'driver' = 'rider') {
  const id = role === 'rider' ? riderId : driverId;
  const user = {id,aud:'authenticated',role:'authenticated',email:'motion@example.test',app_metadata:{},user_metadata:{role,full_name:'Biloo Motion',biloo_rider_map_avatar:design,driver_onboarding_complete:true,vehicle:'BYD Tang L',vehicle_color:'Beige'},created_at:'2026-01-01T00:00:00Z'};
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')}.test`;
  const session={access_token:token,refresh_token:'test',expires_at:4102444800,expires_in:3600,token_type:'bearer',user};
  await page.addInitScript(({session})=>{
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token',JSON.stringify(session));
    localStorage.setItem('nexride:onboarding-complete','true'); localStorage.setItem('nexride:preview-enabled','true');
    for (const role of ['rider','driver']) { localStorage.setItem(`nexride.${role}.theme`,'light');localStorage.setItem(`nexride.${role}.aurora-light-v1`,'1'); }
    let nextWatch=0, sequence=0;
    const watches = new Map<number,PositionCallback>();
    const fix=(speed=0,age=0)=>({coords:{latitude:9.008,longitude:38.775,accuracy:4,heading:0,speed,altitude:null,altitudeAccuracy:null},timestamp:Date.now()+sequence++-age}) as GeolocationPosition;
    (window as any).__riderFix = (speed: number, age=0) => { const value=fix(speed,age); watches.forEach(callback=>callback(value)); };
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      watchPosition(callback: PositionCallback) { const id=++nextWatch;watches.set(id,callback);queueMicrotask(()=>callback(fix()));return id; },
      clearWatch(id: number) {watches.delete(id);},getCurrentPosition(callback: PositionCallback){callback(fix());},
    }});
  },{session});
  await page.routeWebSocket('**/realtime/v1/**', socket=>{
    socket.onMessage(raw=>{
      const msg=JSON.parse(String(raw));
      if (['phx_join','phx_leave','heartbeat'].includes(msg.event)) socket.send(JSON.stringify({topic:msg.topic,event:'phx_reply',ref:msg.ref,join_ref:msg.join_ref,payload:{status:'ok',response:{postgres_changes:(msg.payload?.config?.postgres_changes||[]).map((v: object,i: number)=>({...v,id:i+1}))}}}));
    });
  });
  await page.route('**/auth/v1/user*', route=>route.fulfill({json:user}));
  const ride=()=>({id:tripId,rider_id:riderId,assigned_driver_id:driverId,status:data.stage,ride_category:'economy',pickup_location:'Bole Atlas',destination_location:'Meskel Square',pickup_lat:9.008,pickup_lng:38.775,destination_lat:9.018,destination_lng:38.751,estimated_trip_distance_km:6.4,estimated_trip_duration_minutes:18,estimated_trip_fare_etb:336,created_at:new Date(Date.now()-60_000).toISOString(),updated_at:new Date().toISOString(),pickup_arrived_at:data.stage==='arrived_pickup'?new Date().toISOString():null,payment_status:'pending',payment_method:'cash'});
  await page.route('**/rest/v1/**', route=>{
    const url=new URL(route.request().url()),table=url.pathname.split('/').pop(),single=route.request().headers().accept?.includes('object+json');
    let row: unknown=null;
    if(table==='profiles')row={id,role,full_name:'Biloo Motion',account_status:'active',phone:'+251912345678'};
    if(table==='drivers')row={id:driverId,review_status:'approved',reviewed_at:'2026-01-01',vehicle:'BYD Tang L',vehicle_color:'Beige',vehicle_plate:'TEST-123',is_online:false};
    if(table==='rider_map_avatars')row={design};
    if(table==='ride_requests'&&data.assigned)row=ride();
    if(table==='ride_request_offers'&&data.assigned&&url.searchParams.has('id'))row={id:offerId,request_id:tripId,driver_id:driverId,status:'accepted',pickup_distance_km:1,pickup_eta_minutes:3};
    if(table==='ride_driver_locations'&&data.assigned)row={driver_id:driverId,latitude:9.009,longitude:38.776,accuracy_meters:8,heading_degrees:30,recorded_at:new Date().toISOString()};
    return route.fulfill({json:single?row:row?[row]:[],headers:{'content-range':'0-0/0','Access-Control-Expose-Headers':'content-range'}});
  });
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'unavailable'}}));
  await page.route('**/api/rider/profile',route=>route.fulfill({json:{status:'ready'}}));
  await page.route('**/api/driver/map-avatar',route=>route.fulfill({json:{status:'ready',complete:true,avatar:{bodyType:'suv',color:'Beige',style:'signature'}}}));
  await page.route('**/api/driver/route',route=>route.fulfill({json:{status:'ready',route:{geometry:[[9.009,38.776],[9.008,38.775]],distanceMeters:400,durationSeconds:180,steps:[]}}}));
  await page.route('**/api/rider/nearby-drivers?*',route=>route.fulfill({json:{status:'ready',vehicles:[]}}));
  await page.route(`**/api/rider/trips/${tripId}/driver`,route=>route.fulfill({json:{status:'ready',driver:{id:driverId,name:'Biloo Driver',phone:'+251912345678',vehicle:{model:'BYD Tang L',color:'Beige',plate:'TEST-123'}}}}));
  await page.route(`**/api/trips/${tripId}/pickup-signal`,route=>{
    if(route.request().method()==='POST') {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      data.posts.push(route.request().postDataJSON());
      if(data.fail)return route.fulfill({status:503,json:{status:'send_failed'}});
      data.signal={id:'55555555-5555-4555-8555-555555555555',createdAt:new Date().toISOString()};
    }
    if(!['accepted','arrived_pickup'].includes(data.stage))return route.fulfill({status:409,json:{status:'inactive'}});
    return route.fulfill({json:{status:'ready',avatar:design,signal:data.signal}});
  });
  await page.route('**/api.mapbox.com/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'land',type:'background',paint:{'background-color':'#e7eeea'}}]}}));
  await page.route('**/api.mapbox.com/map-sessions/**',route=>route.fulfill({json:{}}));
  await page.route('**/events.mapbox.com/**',route=>route.fulfill({status:204}));
}

test('real speed controls limbs, while idle, stale, reduced-motion and data-saver states stay still',async({page})=>{
  await fixture(page,state()); await page.goto('/');
  const marker=page.locator('.mapboxgl-marker.biloo-custom-map-avatar');
  await expect(marker).toBeVisible({timeout:20_000});await expect(marker).toHaveAttribute('data-pickup-motion','idle');
  await expect(marker).toHaveCSS('width','36px');await expect(marker).toHaveCSS('height','48px');
  await expect(marker).toHaveClass(/anchor-bottom/);
  await page.evaluate(()=>(window as any).__riderFix(1.2));
  await expect(marker).toHaveAttribute('data-pickup-motion','walk');
  await expect(marker.locator('.biloo-rider-leg-left')).toHaveCSS('animation-name','biloo-rider-stride');
  await expect(marker.locator('svg')).toHaveCSS('transform','none');
  await page.evaluate(()=>(window as any).__riderFix(3.2));await expect(marker).toHaveAttribute('data-pickup-motion','jog');
  await expect(marker.locator('.biloo-rider-leg-left')).toHaveCSS('animation-duration','0.51s');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(marker.locator('.biloo-rider-leg-left')).toHaveCSS('animation-name','none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>document.documentElement.setAttribute('data-nr-data-saver','true'));
  await expect(marker.locator('.biloo-rider-leg-left')).toHaveCSS('animation-name','none');
  await page.evaluate(()=>{document.documentElement.removeAttribute('data-nr-data-saver');(window as any).__riderFix(3,20_000);});
  await expect(marker).toHaveClass(/is-stale/);await expect(marker).toHaveAttribute('data-pickup-motion','idle');
});

test('a rider waves briefly at arrival, sends a confirmed signal across contexts, and boards the car',async({page,browser},info)=>{
  const data=state();data.assigned=true;
  await page.setViewportSize({width:390,height:844});await fixture(page,data);await page.goto('/');
  const own=page.locator('.mapboxgl-marker.biloo-custom-map-avatar');
  const button=page.getByRole('button',{name:"I'm here",exact:true});
  await expect(button).toBeVisible({timeout:20_000});await expect(own).toHaveAttribute('data-pickup-motion','idle');
  const driver=await browser.newPage({baseURL:info.project.use.baseURL,serviceWorkers:'block',viewport:{width:390,height:844}});
  await fixture(driver,data,'driver');await driver.goto(`/driver/navigation?offer=${offerId}`);
  const assigned=driver.locator('.biloo-assigned-rider-marker');
  await expect(assigned).toBeVisible({timeout:20_000});await expect(assigned.locator('svg')).toHaveAttribute('data-avatar-preset','8');
  await expect(assigned).toHaveAttribute('aria-label','Rider avatar at the booked pickup point');
  await expect(assigned).toHaveAttribute('data-pickup-motion','idle');
  await expect(assigned).toHaveCSS('position','absolute');
  const car=driver.locator('.biloo-driver-car-marker');await expect(car).toHaveCSS('position','absolute');
  // This fixture puts the driver's GPS exactly on the booked pickup. Assert
  // their projected coordinate, not just Mapbox's anchor class or CSS dimensions.
  await expect.poll(async()=>{
    const person=await assigned.boundingBox(), vehicle=await car.boundingBox();
    return person&&vehicle ? Math.abs(person.x+person.width/2-vehicle.x-vehicle.width/2)+Math.abs(person.y+person.height-vehicle.y-vehicle.height/2) : 1000;
  }).toBeLessThan(2);
  data.stage='arrived_pickup';
  await Promise.all([page.evaluate(()=>window.dispatchEvent(new Event('online'))),driver.evaluate(()=>window.dispatchEvent(new Event('online')))]);
  await expect(own).toHaveAttribute('data-pickup-motion','wave');await expect(assigned).toHaveAttribute('data-pickup-motion','wave');
  await expect(own.locator('.biloo-rider-wave-hand')).toHaveCSS('animation-name','biloo-rider-wave');
  await expect(own).toHaveAttribute('data-pickup-motion','idle',{timeout:10_000});
  data.fail=true;await button.click();await expect(page.locator('.biloo-pickup-wave [role="alert"]')).toContainText('Couldn’t send');
  await expect(own).toHaveAttribute('data-pickup-motion','idle');
  data.fail=false;await button.click();await expect(page.getByRole('button',{name:'Sent to your driver'})).toBeDisabled();
  await expect(own).toHaveAttribute('data-pickup-motion','wave');
  expect(data.posts).toHaveLength(2);expect(data.posts[0].nonce).toBe(data.posts[1].nonce);
  await driver.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(driver.locator('.biloo-rider-pickup-signal')).toContainText('Your rider is at pickup');await expect(assigned).toHaveAttribute('data-pickup-motion','wave');
  await page.screenshot({path:`/tmp/biloo-rider-wave-${info.project.name}.png`});
  await driver.screenshot({path:`/tmp/biloo-driver-pickup-wave-${info.project.name}.png`});
  await driver.evaluate(()=>{localStorage.setItem('nexride.driver.theme','dark');window.dispatchEvent(new Event('nexride:appearance-change'));});
  await expect(driver.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme','dark');
  const contrast = await driver.locator('.biloo-rider-pickup-signal').evaluate(element=>{
    const style=getComputedStyle(element);
    const luminance=(color: string)=>{
      const rgb=(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    const a=luminance(style.color),b=luminance(style.backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await driver.screenshot({path:`/tmp/biloo-driver-pickup-wave-dark-${info.project.name}.png`});
  data.stage='in_trip';await Promise.all([page.evaluate(()=>window.dispatchEvent(new Event('online'))),driver.evaluate(()=>window.dispatchEvent(new Event('online')))]);
  await expect(own).toHaveAttribute('data-onboard','true');await expect(own).toBeHidden();
  await expect(page.locator('.nr-nearby-car-marker')).toBeVisible();
  await expect(page.locator('.biloo-pickup-wave')).toHaveCount(0);await expect(assigned).toHaveCount(0);
  await driver.close();
});

test('all 20 character textures keep compact bounds and raise an arm instead of rotating the person',async({page},info)=>{
  await page.setViewportSize({width:1280,height:900});await page.goto('/offline.html');
  const css=readFileSync('app/live-location.css','utf8');
  await page.setContent(`<style>${css}body{background:#e8eef2;padding:32px;font:12px sans-serif}.gallery{display:grid;grid-template-columns:repeat(5,1fr);gap:40px}.sample{display:grid;justify-items:center;gap:10px}.gallery .nr-live-location-marker.nr-location-identity.biloo-custom-map-avatar.large[data-marker-role="rider"]>.biloo-rider-avatar-art{width:96px!important;height:160px!important;max-width:none!important;max-height:none!important}.gallery .nr-live-location-marker.nr-location-identity.biloo-custom-map-avatar.large[data-marker-role="rider"]{width:120px!important;height:160px!important;max-width:none!important;max-height:none!important;min-width:120px!important;min-height:160px!important}</style><div class="gallery">${Array.from({length:20},(_,preset)=>`<div class="sample"><div class="nr-live-location-marker nr-location-identity biloo-custom-map-avatar large" data-marker-role="rider" data-pickup-motion="wave">${mapAvatarSvg(avatarPreset(preset),`qa-${preset}`,true)}</div><span>${preset+1}</span></div>`).join('')}</div>`);
  await expect.poll(()=>page.locator('.biloo-rider-wave-hand').first().evaluate(e=>e.getAnimations().length)).toBe(1);
  await page.evaluate(()=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=1000;}));
  await page.screenshot({path:`/tmp/biloo-rider-rig-collection-${info.project.name}.png`,fullPage:true});
  await expect(page.locator('svg').first()).toHaveCSS('transform','none');
  await expect(page.locator('.biloo-rider-wave-hand').first()).not.toHaveCSS('transform','none');
});
