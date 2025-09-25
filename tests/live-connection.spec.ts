import { test, expect } from '@playwright/test';

test.describe('Live Connection Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Wait for the app to load
    await page.waitForSelector('.mode-toggle');
  });

  test('should load lesson mode and check live connection', async ({ page }) => {
    // Switch to lesson mode
    await page.click('button:has-text("Lesson")');
    
    // Wait for lesson layout to load
    await page.waitForSelector('.lesson-layout');
    
    // Check if scene picker is visible
    await expect(page.locator('.scene-picker')).toBeVisible();
    
    // Check if mic button is visible
    await expect(page.locator('button.mic-button, button[title*="microphone"]').first()).toBeVisible();
    
    // Monitor console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Monitor network requests
    const networkRequests: string[] = [];
    page.on('request', request => {
      networkRequests.push(`${request.method()} ${request.url()}`);
    });
    
    // Try to click the mic button
    const micButton = page.locator('button.mic-button, button[title*="microphone"]').first();
    await micButton.click();
    
    // Wait a bit for connection attempt
    await page.waitForTimeout(2000);
    
    // Check if token request was made
    const tokenRequest = networkRequests.find(req => req.includes('/token'));
    console.log('Token request:', tokenRequest);
    
    // Log all console errors
    console.log('Console errors:', consoleErrors);
    
    // Log all network requests
    console.log('Network requests:', networkRequests.filter(req => 
      req.includes('localhost') || req.includes('token') || req.includes('websocket')
    ));
    
    // Check for specific error patterns
    const hasWebSocketError = consoleErrors.some(error => 
      error.includes('WebSocket') || error.includes('CLOSING') || error.includes('CLOSED')
    );
    
    const hasContextError = consoleErrors.some(error => 
      error.includes('LiveAPIContext') || error.includes('useLiveAPIContext')
    );
    
    const hasTokenError = consoleErrors.some(error => 
      error.includes('token') || error.includes('Token fetch failed')
    );
    
    console.log('Analysis:');
    console.log('- WebSocket errors:', hasWebSocketError);
    console.log('- Context errors:', hasContextError);
    console.log('- Token errors:', hasTokenError);
    
    // Fail the test if there are critical errors
    expect(hasContextError, 'Should not have LiveAPIContext errors').toBeFalsy();
  });

  test('should check token server availability', async ({ page }) => {
    // Test token endpoint directly
    const response = await page.request.post('http://localhost:3001/token');
    const responseBody = await response.json();
    
    console.log('Token server response:', response.status(), responseBody);
    
    expect(response.status()).toBe(200);
    expect(responseBody.token).toBeDefined();
  });

  test('should test console mode connection', async ({ page }) => {
    // Switch to console mode
    await page.click('button:has-text("Console")');
    
    // Wait for console layout
    await page.waitForSelector('.streaming-console');
    
    // Monitor errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Try to connect in console mode
    const micButton = page.locator('button.mic-button, button[title*="microphone"]').first();
    await micButton.click();
    
    await page.waitForTimeout(2000);
    
    console.log('Console mode errors:', consoleErrors);
    
    // Check if console mode has fewer errors
    const hasWebSocketError = consoleErrors.some(error => 
      error.includes('WebSocket') || error.includes('CLOSING') || error.includes('CLOSED')
    );
    
    console.log('Console mode WebSocket errors:', hasWebSocketError);
  });
});
