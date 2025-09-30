import { test, expect } from '@playwright/test';

test('should show avatar control tray in lesson mode', async ({ page }) => {
  // Navigate to the app (now goes directly to lesson mode)
  await page.goto('http://localhost:3000');
  
  // Wait for lesson layout to load
  await page.waitForSelector('.lesson-layout', { timeout: 10000 });
  
  // Check if avatar control tray is visible
  await expect(page.locator('.avatar-control-tray')).toBeVisible();
  
  // Check if both avatars are present
  await expect(page.locator('.avatar-container.student')).toBeVisible();
  await expect(page.locator('.avatar-container.tutor')).toBeVisible();
  
  // Check if student avatar display is visible
  await expect(page.locator('.avatar-display').first()).toBeVisible();
  
  // Check if connect button is present
  await expect(page.locator('.call-button.connect')).toBeVisible();
  
  // Check if scene picker is present in header
  await expect(page.locator('.scene-picker')).toBeVisible();
  
  // Check if dialogue toggle button is present
  await expect(page.locator('.dialogue-toggle')).toBeVisible();
  
  // Take a screenshot for visual verification
  await page.screenshot({ path: 'avatar-control-tray.png', fullPage: true });
  
  console.log('Avatar control tray and lesson layout elements found and visible');
});


