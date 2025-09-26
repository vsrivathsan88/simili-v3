import { test, expect } from '@playwright/test';

test('should show avatar control tray in lesson mode', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:3000');
  
  // Wait for the app to load
  await page.waitForSelector('.mode-toggle');
  
  // Switch to lesson mode
  await page.click('button:has-text("Lesson")');
  
  // Wait for lesson layout to load
  await page.waitForSelector('.lesson-layout');
  
  // Check if avatar control tray is visible
  await expect(page.locator('.avatar-control-tray')).toBeVisible();
  
  // Check if both avatars are present
  await expect(page.locator('.avatar-container.student')).toBeVisible();
  await expect(page.locator('.avatar-container.tutor')).toBeVisible();
  
  // Check if student avatar button is clickable
  await expect(page.locator('.avatar-button')).toBeVisible();
  
  // Check if status chip is present
  await expect(page.locator('.status-chip')).toBeVisible();
  
  // Check if meatball menu is present
  await expect(page.locator('.menu-button')).toBeVisible();
  
  // Take a screenshot for visual verification
  await page.screenshot({ path: 'avatar-control-tray.png', fullPage: true });
  
  console.log('Avatar control tray elements found and visible');
});
