import { test, expect, type Page } from '@playwright/test';
const id='11111111-1111-4111-8111-111111111111';
const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')}.test`;
async function accountBackend(page:Page){
 const user={id,aud:'authenticated',role:'authenticated',email:'rider@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 let name='Connected Rider',failSave=true,failSignout=true;
 await page.addInitScript(session=>{if(!sessionStorage.getItem('fixture-ready')){localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token',JSON.stringify(session));sessionStorage.setItem('fixture-ready','true')}},{access_token:token,refresh_token:'test',expires_at:4102444800,expires_in:3600,token_type:'bearer',user});
 await page.route('**/auth/v1/user',r=>r.fulfill({json:user}));
 await page.route('**/auth/v1/logout*',r=>{if(failSignout){failSignout=false;return r.fulfill({status:500,json:{message:'try again'}})}return r.fulfill({status:204})});
 await page.route('**/rest/v1/**',r=>{
 const u=new URL(r.request().url());
 if(u.pathname.endsWith('/profiles')){
  expect(u.searchParams.get('id')).toBe(`eq.${id}`);
  if(r.request().method()==='PATCH'){
   expect(r.request().postDataJSON()).toEqual({full_name:'Updated Rider',phone:'+251912345678'});
   if(failSave){failSave=false;return r.fulfill({status:503,json:{message:'temporary'}})}
   name='Updated Rider';
  }
  return r.fulfill({json:{id,full_name:name,phone:'+251912345678',avatar_path:null}});
 }
 return r.fulfill({json:[]});
 });
 await page.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
}
async function profile(page:Page){await page.goto('/');await page.getByRole('button',{name:'Profile',exact:true}).first().click();}
test('connected profile validates, preserves failed edits, saves confirmed fields and signs out with retry',async({page})=>{
 await accountBackend(page);await profile(page);
 await expect(page.getByRole('heading',{name:'Connected Rider'})).toBeVisible();
 await page.getByRole('button',{name:'Edit profile',exact:true}).click();
 await expect(page.getByLabel('Email (optional)',{exact:true})).toHaveAttribute('readonly','');
 await page.getByLabel('Full name',{exact:true}).fill(' ');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('between 2 and 80');
 await page.getByLabel('Full name',{exact:true}).fill('Updated Rider');await page.getByLabel('Phone number',{exact:true}).fill('-------');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('valid contact number');await page.getByLabel('Phone number',{exact:true}).fill('+251912345678');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not save');await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Updated Rider');
 await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('heading',{name:'Updated Rider'})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Profile saved.'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Profile',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Updated Rider'})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('does not cancel');await page.getByRole('button',{name:'Confirm sign out'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('could not be confirmed');await page.getByRole('button',{name:'Continue to sign in'}).click();await expect(page).toHaveURL(/\/auth$/);
});
test('profile menus, bilingual preferences, actual appearance and local preview persistence work',async({page})=>{
 await page.addInitScript(()=>{if(!localStorage.getItem('nexride:preview-enabled'))localStorage.setItem('nexride:preview-enabled','true')});await profile(page);
 await page.getByRole('button',{name:'Edit profile',exact:true}).click();await page.getByLabel('Full name',{exact:true}).fill('Preview Rider');await page.getByRole('button',{name:'Save details'}).click();await expect(page.getByRole('heading',{name:'Preview Rider'})).toBeVisible();
 await page.getByRole('button',{name:'Payment methods',exact:true}).click();await expect(page.getByRole('heading',{name:'Wallet',exact:true})).toBeVisible();await page.getByRole('button',{name:'Profile',exact:true}).first().click();
 await page.getByRole('button',{name:'Privacy & your data',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('.nr-account-menu').getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('switch').uncheck();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('nexride:trip-alerts'))).toBe('off');await page.getByRole('button',{name:'Dark',exact:true}).click();await expect(page.locator('.nr-app')).toHaveAttribute('data-theme','dark');await page.keyboard.press('Escape');
 await page.locator('.nr-account-language').getByRole('button',{name:'አማርኛ',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','am');await expect(page.getByRole('heading',{name:'መለያ',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.nr-account-language').getByRole('button',{name:'English',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Profile',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Preview Rider'})).toBeVisible();
 await page.getByRole('button',{name:'My Rides',exact:true}).click();await expect(page.getByRole('heading',{name:'My trips',exact:true})).toBeVisible();
});
