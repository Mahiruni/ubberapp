import { mapFixture } from "./helpers/mobility";
import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({page}) => { await mapFixture(page); });
test.setTimeout(60_000);
const id='11111111-1111-4111-8111-111111111111';
const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')}.test`;
async function accountBackend(page:Page){
 const user={id,aud:'authenticated',role:'authenticated',email:'rider@example.test',app_metadata:{},user_metadata:{role:'rider'},created_at:'2026-01-01T00:00:00Z'};
 let name='Connected Rider',failSave=true,failSignout=true;
 const session={access_token:token,refresh_token:'test',expires_at:4102444800,expires_in:3600,token_type:'bearer',user};
 await page.route('**/auth/v1/token?grant_type=password',r=>r.fulfill({json:session}));
 await page.route('**/api/rider/profile',r=>{expect(r.request().headers().authorization).toBe(`Bearer ${token}`);return r.fulfill({json:{status:'ready'}})});
 await page.route('**/auth/v1/user',r=>r.fulfill({json:user}));
 await page.route('**/auth/v1/logout*',r=>{if(failSignout){failSignout=false;return r.fulfill({status:500,json:{message:'try again'}})}return r.fulfill({status:204})});
 await page.route('**/rest/v1/**',r=>{
 const u=new URL(r.request().url());
 if(u.pathname.endsWith('/profiles')){
  expect(u.searchParams.get('id')).toBe(`eq.${id}`);
  if(r.request().method()==='PATCH'){
   expect(r.request().postDataJSON()).toEqual({full_name:'Updated Rider'});
   if(failSave){failSave=false;return r.fulfill({status:503,json:{message:'temporary'}})}
   name='Updated Rider';
  }
  const profile={id,role:'rider',account_status:'active',full_name:name,phone:'+251912345678',avatar_path:null};
  return r.fulfill({json:r.request().headers().accept?.includes('object+json')?profile:[profile]});
 }
 if(u.pathname.endsWith('/account_roles')) return r.fulfill({json:[{user_id:id,role:'rider',status:'active'}]});
 return r.fulfill({json:[]});
 });
 await page.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
}
async function connectedProfile(page:Page){
 await page.goto('/auth');
 await page.getByLabel('Email address',{exact:true}).fill('rider@example.test');
 await page.getByLabel('Password',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/$/);
 await page.getByRole('button',{name:'Account',exact:true}).first().click();
}
async function previewProfile(page:Page){await page.goto('/');await page.getByRole('button',{name:'Account',exact:true}).first().click();}
test('connected profile preserves failed edits, protects verified contacts and clears a failed remote sign-out locally',async({page})=>{
 await accountBackend(page);await connectedProfile(page);
 await expect(page.getByRole('heading',{name:'Connected Rider'})).toBeVisible();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await expect(page.getByLabel('Email (optional)',{exact:true})).toHaveAttribute('readonly','');
 await page.getByLabel('Full name',{exact:true}).fill(' ');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('between 2 and 80');
 await expect(page.getByLabel('Phone number',{exact:true})).toHaveAttribute('readonly','');
 await page.getByLabel('Full name',{exact:true}).fill('Updated Rider');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not save');await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Updated Rider');
 await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('heading',{name:'Updated Rider'})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Profile updated'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Account',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Updated Rider'})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Active bookings are not cancelled automatically');await page.getByRole('button',{name:'Confirm sign out'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Signed out on this device');await page.getByRole('button',{name:'Continue to sign in'}).click();await expect(page).toHaveURL(/\/rider\/sign-in$/);
});
test('profile menus, bilingual preferences, actual appearance and local preview persistence work',async({page})=>{
 await page.addInitScript(()=>{if(!localStorage.getItem('nexride:preview-enabled'))localStorage.setItem('nexride:preview-enabled','true')});await previewProfile(page);
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Full name',{exact:true}).fill('Preview Rider');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('heading',{name:'Preview Rider'})).toBeVisible();
 await page.getByRole('button',{name:/^Payments/}).click();await expect(page.getByRole('heading',{name:'Payments',exact:true})).toBeVisible();await page.getByRole('button',{name:'Account',exact:true}).first().click();
 await page.getByRole('button',{name:/^Privacy & data/}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('.nr-account-section-list').getByRole('button',{name:/^Settings/}).click();await page.getByRole('switch',{name:/In-app trip alerts/}).uncheck();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('nexride:trip-alerts'))).toBe('off');await page.getByRole('button',{name:'Dark',exact:true}).click();await expect(page.locator('.nr-app')).toHaveAttribute('data-theme','dark');await page.keyboard.press('Escape');
 await page.locator('.nr-account-section-list').getByRole('button',{name:/^Settings/}).click();await page.getByRole('dialog').getByRole('button',{name:'አማርኛ',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('lang','am');await expect(page.getByRole('heading',{name:'የእርስዎ መለያ',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.nr-account-section-list').getByRole('button',{name:/^ቅንብሮች/}).click();await page.getByRole('dialog').getByRole('button',{name:'English',exact:true}).click();await page.keyboard.press('Escape');await page.goto('/?screen=profile');await expect(page.getByRole('heading',{name:'Preview Rider'})).toBeVisible();
 await page.locator('.nr-account-section-list').getByRole('button',{name:/^Activity/}).click();await expect(page.getByRole('heading',{name:'Your rides',exact:true})).toBeVisible();
});
