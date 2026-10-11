import { test, expect } from '@playwright/test';

test('rider surface loads',async({page})=>{
 await page.goto('/');
 await expect(page.locator('body')).toBeVisible();
});

test('admin surface enforces authentication',async({page})=>{
 await page.route('**/auth/v1/session*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'',token_type:'bearer',expires_in:0,refresh_token:'',user:null})}));
 await page.goto('/admin',{waitUntil:'domcontentloaded',timeout:10000});
 await expect(page.getByRole('heading',{name:'NexRide Control Center',exact:true})).toBeVisible({timeout:10000});
 await expect(page.getByText('Administrative access is restricted to authorized NexRide accounts.')).toBeVisible({timeout:10000});
});
