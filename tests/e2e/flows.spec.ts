import { test, expect } from '@playwright/test';

test.describe('critical journey contracts',()=>{
 test('rider journey exposes destination and ride selection surfaces',async({page})=>{
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/destination|where/i);
 });
 test('driver workspace exposes operational controls',async({page})=>{
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/driver|go online|earnings/i);
 });
});
