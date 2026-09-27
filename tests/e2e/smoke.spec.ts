import { test, expect } from '@playwright/test';

test('rider surface loads',async({page})=>{
 await page.goto('/');
 await expect(page.locator('body')).toBeVisible();
});

test('admin surface enforces authentication',async({page})=>{
 await page.route('**/auth/v1/session*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'',token_type:'bearer',expires_in:0,refresh_token:'',user:null})}));
 await page.goto('/admin',{waitUntil:'domcontentloaded',timeout:10000});
 await expect(page.getByText('Operations, with control.')).toBeVisible({timeout:10000});
 await expect(page.getByText('Restricted administrative access.')).toBeVisible({timeout:10000});
});
