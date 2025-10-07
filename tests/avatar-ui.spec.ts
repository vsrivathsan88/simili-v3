import { test, expect } from '@playwright/test';

test('should show avatar control tray in lesson mode', async ({ page }) => {
  // Navigate to the app (now goes directly to lesson mode)
  await page.goto('http://localhost:3000');

  // Wait for lesson layout to load
  await page.waitForSelector('.lesson-layout', { timeout: 10000 });

  // Wait for incoming call overlay (phone ring UI)
  await expect(page.locator('.incoming-call-overlay')).toBeVisible({ timeout: 10000 });

  // Check if Pi avatar is ringing
  await expect(page.locator('.incoming-call-avatar.ringing')).toBeVisible();

  // Answer the call (force click due to ringing animation)
  await page.locator('.incoming-call-avatar').click({ force: true });

  // Wait for connection
  await page.waitForTimeout(2000);

  // Check if avatar control tray is visible after connecting
  await expect(page.locator('.avatar-control-tray-redesign')).toBeVisible();

  // Check if both avatars are present in the redesigned tray
  await expect(page.locator('.avatar-container.student')).toBeVisible();
  await expect(page.locator('.avatar-container.pi')).toBeVisible();

  // Check if scene picker is present in header
  await expect(page.locator('.scene-picker')).toBeVisible();

  // Check if dialogue toggle button is present
  await expect(page.locator('.dialogue-toggle')).toBeVisible();

  // Take a screenshot for visual verification
  await page.screenshot({ path: 'avatar-control-tray.png', fullPage: true });

  console.log('Avatar control tray and lesson layout elements found and visible');
});


