import { test, expect } from '@playwright/test';

test('rider surface loads',async({page})=>{
 await page.goto('/');
 await expect(page.locator('body')).toBeVisible();
});

test('admin surface enforces authentication',async({page})=>{
 await page.goto('/admin');
 await expect(page.getByText('Operations, with control.')).toBeVisible();
 await expect(page.getByText('Restricted administrative access.')).toBeVisible();
});
