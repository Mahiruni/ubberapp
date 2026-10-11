import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
test.use({ video: 'off' });
const id='22222222-2222-4222-8222-222222222222';
const user={id,aud:'authenticated',role:'authenticated',email:'driver@example.test',app_metadata:{},user_metadata:{role:'driver',full_name:'Connected Driver'},created_at:'2026-01-01T00:00:00Z'};
const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')}.test`;
const session={access_token:token,refresh_token:'test',expires_at:4102444800,expires_in:3600,token_type:'bearer',user};
async function backend(page:Page) {
  let activePath='', fail=false, serial=0;
  const image=await sharp({create:{width:900,height:700,channels:3,background:'#00C878'}}).jpeg().toBuffer();
  await page.addInitScript(session => localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token',JSON.stringify(session)),session);
  await page.route('**/auth/v1/user',route=>route.fulfill({json:user}));
  await page.route('**/rest/v1/**',route=>{
    const url=new URL(route.request().url()),table=url.pathname.split('/').pop();
    const object=route.request().headers().accept?.includes('object+json');
    const one=(value:unknown)=>route.fulfill({json:object?value:value?[value]:[]});
    if(table==='profiles') return one({id,full_name:'Connected Driver',role:'driver',account_status:'active',phone:'+251900000001'});
    if(table==='drivers') return one({id,review_status:'pending',is_online:false,vehicle:'Toyota Yaris',vehicle_color:'Silver',vehicle_plate:'REAL-123',rating:null});
    if(table==='driver_profile_photos') return one(activePath?{id:'photo',storage_path:activePath,status:'approved'}:null);
    if(table==='set_driver_profile_photo') {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      if(fail) {fail=false;return route.fulfill({status:503,json:{message:'Try again'}});}
      const previous=activePath; activePath=route.request().postDataJSON().p_storage_path || '';return route.fulfill({json:previous?[previous]:[]});
    }
    return route.fulfill({json:[],headers:{'content-range':'0-0/0'}});
  });
  await page.route('**/storage/v1/**',route=>{
    if(route.request().method()==='POST' && route.request().url().includes('/object/sign/')) return route.fulfill({json:{signedURL:`/object/sign/nexride-driver-photos/${activePath}?token=${++serial}`}});
    if(route.request().method()==='POST') {expect(route.request().url()).toContain(`${id}/`);return route.fulfill({json:{Key:'photo'}});}
    if(route.request().method()==='DELETE') return route.fulfill({json:[]});
    return route.fulfill({contentType:'image/jpeg',body:image});
  });
  await page.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'unavailable'}}));
  return {image,failNext:()=>{fail=true;},path:()=>activePath};
}
test('existing avatar uploads immediately, safely replaces, persists and removes without approving Driver documents',async({page})=>{
  const api=await backend(page); await page.goto('/driver/profile');
  const avatar=page.getByRole('button',{name:'Profile Photo',exact:true});await expect(avatar).toBeVisible();
  const upload=async()=>{
    await avatar.click();await page.getByRole('button',{name:'Change Photo',exact:true}).click();
    await page.locator('input[type=file]').setInputFiles({name:'portrait.jpg',mimeType:'image/jpeg',buffer:api.image});
    await expect(page.getByRole('button',{name:'Save Photo',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Save Photo',exact:true}).click();
  };
  await upload();await expect(page.getByText('Your photo is now active.',{exact:true})).toBeVisible();expect(api.path()).toMatch(new RegExp(`^${id}/.*[.]jpg$`));
  const first=api.path();await expect(page.locator('.nr-photo-approved-overlay img')).toBeVisible();
  await page.reload();await expect(page.locator('.nr-photo-approved-overlay img')).toBeVisible();
  api.failNext();await upload();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Your previous photo is safe');expect(api.path()).toBe(first);
  await page.getByRole('button',{name:'Save Photo',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(api.path()).not.toBe(first);
  await avatar.click();await page.getByRole('button',{name:'Remove Photo',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Your initials will appear instead');await page.getByRole('button',{name:'Remove Photo',exact:true}).click();
  await expect(page.getByText('Your photo was removed.',{exact:true})).toBeVisible();await expect(page.locator('.nr-photo-approved-overlay img')).toHaveCount(0);await expect(page.locator('.nr-photo-approved-overlay')).toHaveText('CD');expect(api.path()).toBe('');
  await expect(page.locator('.nr-driver-verification-pill.pending')).toBeVisible();
});
test('rejects unsupported formats and oversized originals before storage',async({page})=>{
  await backend(page);await page.goto('/driver/profile');await page.getByRole('button',{name:'Profile Photo',exact:true}).click();await page.getByRole('button',{name:'Change Photo',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.getByRole('dialog').getByRole('alert')).toContainText('JPG, PNG or WebP');
  await page.locator('input[type=file]').setInputFiles({name:'large.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(5*1024*1024+1)});await expect(page.getByRole('dialog').getByRole('alert')).toContainText('up to 5 MB');
});
