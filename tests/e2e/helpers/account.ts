import { expect, type Page } from '@playwright/test';
export const riderId='11111111-1111-4111-8111-111111111111';
export const bookingId='33333333-3333-4333-8333-333333333333';
const driverId='22222222-2222-4222-8222-222222222222';

/** Authenticated service booking fixture, including the authorized assigned-trip view. */
export async function connectedBooking(page: Page) {
  let assigned: {name:string;vehicle:string;plate:string}|null=null;
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:riderId,exp:4102444800})).toString('base64url')}.fixture`;
  const user={id:riderId,aud:'authenticated',role:'authenticated',email:'rider@example.test',app_metadata:{},user_metadata:{role:'rider'},created_at:'2026-01-01T00:00:00Z'};
  const session={access_token:token,refresh_token:'fixture',expires_at:4102444800,expires_in:3600,token_type:'bearer',user};
  await page.addInitScript(session=>localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token',JSON.stringify(session)),session);
  await page.route('**/auth/v1/user',r=>r.fulfill({json:user}));
  await page.route('**/api/rider/profile',r=>r.fulfill({json:{status:'ready'}}));
  await page.route('**/api/rider/trips/*/driver',r=>r.fulfill({json:{status:'ready',driver:assigned?{id:driverId,name:assigned.name,photo:null,phone:'+251912345679',rating:null,tripCount:null,vehicle:{model:assigned.vehicle,color:'Silver',plate:assigned.plate},verification:null}:null}}));
  await page.route('**/rest/v1/**',r=>{
    expect(r.request().headers().authorization).toBe(`Bearer ${token}`);
    const url=new URL(r.request().url());
    const one=(value:unknown)=>r.fulfill({json:r.request().headers().accept?.includes('object+json')?value:value?[value]:[]});
    switch(url.pathname.split('/').pop()) {
      case 'profiles': return one({id:riderId,role:'rider',account_status:'active',full_name:'Connected Rider',phone:'+251912345678'});
      case 'account_roles': return r.fulfill({json:[{user_id:riderId,role:'rider',status:'active'}]});
      case 'ride_requests': return one(assigned?{id:bookingId,rider_id:riderId,assigned_driver_id:driverId,status:'accepted',pickup_location:'Bole Atlas',destination_location:'Bole Airport',pickup_lat:8.9956,pickup_lng:38.7885,destination_lat:8.9779,destination_lng:38.7993,ride_category:'economy',estimated_trip_fare_etb:180,payment_method:'cash',payment_status:'pending',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}:null);
      case 'drivers': return one(assigned?{vehicle:assigned.vehicle,vehicle_plate:assigned.plate,review_status:'approved'}:null);
      default: return one(null);
    }
  });
  await page.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
  return {assign(driver:{name:string;vehicle:string;plate:string}){assigned=driver;}};
}
