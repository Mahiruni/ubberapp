import { test, expect } from '@playwright/test';

test.describe('critical journey contracts',()=>{
 test('rider journey exposes destination and ride selection surfaces',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('nexride:onboarding-complete','true'));
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/destination|where/i);
 });
 test('driver workspace exposes operational controls',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('nexride:onboarding-complete','true'));
  await page.goto('/');
  await page.getByRole('button',{name:/Mahir/i}).click();
  await page.getByText('Driver mode',{exact:true}).click();
  await expect(page.locator('body')).toContainText(/driver workspace|go online|earnings/i);
 });
});
