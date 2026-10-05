import { test, expect, type Page } from '@playwright/test';
const rider='11111111-1111-4111-8111-111111111111', driver='22222222-2222-4222-8222-222222222222', id='33333333-3333-4333-8333-333333333333';
const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:rider,exp:4102444800})).toString('base64url')}.test-signature`;
const user={id:rider,aud:'authenticated',role:'authenticated',email:'rider@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const session={access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,user};
async function backend(page:Page){
 let state='accepted',driverId:string|null=driver,payment='pending',rating:number|null=null,failRating=true,stamp=new Date().toISOString();
 const locationStamp=new Date().toISOString();
 await page.addInitScript(({session})=>localStorage.setItem('sb-mrbgtdrpscdoxwdgvfcs-auth-token',JSON.stringify(session)),{session});
 await page.route('**/auth/v1/user',r=>r.fulfill({json:user}));
 await page.route('**/rest/v1/**',r=>{
  const url=new URL(r.request().url()),table=url.pathname.split('/').pop();
  const one=(value:unknown)=>r.fulfill({json:r.request().headers().accept?.includes('object+json')?value:value?[value]:[]});
  expect(r.request().headers().authorization).toBe(`Bearer ${token}`);
  if(table==='trips')return one({id,customer_id:rider,driver_id:driverId,vehicle_id:'v1',state,updated_at:stamp,requested_at:new Date(Date.now()-600000).toISOString(),pickup_address:'Real pickup',destination_address:'Real destination',pickup:{type:'Point',coordinates:[38.76,9.01]},destination:{type:'Point',coordinates:[38.79,8.99]},total_minor:23500,currency:'ETB',completed_at:state==='completed'?stamp:null});
  if(table==='profiles')return one({id:driverId,full_name:driverId===driver?'Connected Driver':'Replacement Driver',phone:'+251900000001'});
  if(table==='drivers')return one({id:driverId,rating:4.8,review_status:'approved'});
  if(table==='vehicles')return one({id:'v1',driver_id:driverId,make:'Toyota',model:'Yaris',color:'White',plate_number:'REAL-123'});
  if(table==='ride_locations')return one(driverId===driver?{actor_id:driver,location:{type:'Point',coordinates:[38.77,9.005]},recorded_at:locationStamp,accuracy_m:35}:null);
  if(table==='driver_locations'||table==='ride_events')return one(null);
  if(table==='payments')return one({status:payment,provider:'cash'});
  if(table==='ratings')return one(rating?{score:rating}:null);
  if(table==='submit_trip_rating'){
   if(failRating){failRating=false;return r.fulfill({status:503,json:{message:'Temporary error'}});}
   rating=r.request().postDataJSON().p_score;return r.fulfill({json:{trip_id:id,rater_id:rider,score:rating}});
  }
  if(table==='chat_messages')return one({id:'message1'});
  return r.fulfill({status:503,json:{message:'Unsupported test request'}});
 });
 await page.route('https://*.tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2ee"/></svg>'}));
 await page.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
 return { change(next:string){state=next;stamp=new Date().toISOString();}, reassign(){driverId='44444444-4444-4444-8444-444444444444';stamp=new Date().toISOString();}, setPayment(next:string){payment=next;} };
}
test('live rider sees assignment, real trip transition and receipt, then retries without losing feedback',async({page})=>{
 const api=await backend(page);await page.goto('/');await page.getByRole('button',{name:'Resume your trip'}).click();
 const assigned=page.frameLocator('iframe[title="NexRide assigned driver"]');
 await expect(assigned.getByRole('heading',{name:'Connected Driver'})).toBeVisible();
 await expect(assigned.locator('#vehiclePlate')).toHaveText('REAL-123');await expect(assigned.locator('#verification')).toBeHidden();
 await expect(assigned.locator('#etaUnit')).toHaveText('ETA unavailable');await expect(assigned.locator('#demoBar')).toBeHidden();
 await assigned.getByRole('button',{name:'Cancel ride',exact:true}).click();await expect(assigned.getByRole('dialog')).toContainText('could not load the cancellation fee');await assigned.getByRole('button',{name:'Close dialog'}).click();
 api.change('in_progress');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const active=page.frameLocator('iframe[title="NexRide active trip"]');await expect(active.getByRole('heading',{name:'On trip',exact:true})).toBeVisible();
 await active.getByRole('button',{name:'Share trip',exact:true}).click();await expect(active.getByRole('dialog')).toContainText('There is no timed access');await active.getByRole('button',{name:'Close dialog'}).click();
 await page.context().setOffline(true);await expect(active.locator('#trackingText')).toContainText('Location last updated');await expect(active.getByRole('button',{name:'Safety',exact:true})).toBeEnabled();await page.context().setOffline(false);
 api.change('completed');api.setPayment('failed');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const receipt=page.frameLocator('iframe[title="NexRide trip receipt and rating"]');await expect(receipt.getByRole('heading',{name:'Trip completed!',exact:true})).toBeVisible();
 await expect(receipt.locator('#paymentStatus')).toHaveText('Payment failed');await expect(receipt.locator('#finalAmount')).toContainText('235');
 await receipt.getByRole('radio',{name:'4 stars',exact:true}).check();await receipt.getByText('Add optional feedback').click();await receipt.getByRole('textbox').fill('Keep this feedback during retry');
 await receipt.getByRole('button',{name:'Submit',exact:true}).click();await expect(receipt.getByRole('button',{name:'Retry',exact:true})).toBeVisible();await expect(receipt.getByRole('textbox')).toHaveValue('Keep this feedback during retry');
 await receipt.getByRole('button',{name:'Retry',exact:true}).click();await expect(receipt.getByText('Thank you for your feedback.',{exact:true})).toBeVisible();await expect(receipt.locator('#paymentStatus')).toHaveText('Payment failed');await receipt.getByRole('button',{name:'View details',exact:true}).click();await expect(receipt.getByRole('dialog')).toContainText('REAL-123');
});
test('reassignment clears the old vehicle position and never displays an unsupported verification',async({page})=>{
 const api=await backend(page);await page.goto('/');await page.getByRole('button',{name:'Resume your trip'}).click();const assigned=page.frameLocator('iframe[title="NexRide assigned driver"]');
 await expect(assigned.getByRole('heading',{name:'Connected Driver'})).toBeVisible();api.reassign();await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(assigned.getByRole('heading',{name:'Replacement Driver'})).toBeVisible();await expect(assigned.locator('#verification')).toBeHidden();await expect(assigned.locator('#trackingText')).toHaveText('Driver location unavailable');
 const state=await assigned.locator('body').evaluate(()=> (window as unknown as {NexRide:{getSnapshot():{tracking:unknown}}}).NexRide.getSnapshot());expect(state.tracking).toBeNull();
});
