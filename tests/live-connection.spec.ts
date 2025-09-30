import { test, expect } from '@playwright/test';

test.describe('Live Connection Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Attach listeners BEFORE navigation to catch early requests
    page.on('request', () => {});
    page.on('websocket', () => {});
    // Navigate to the app (now goes directly to lesson mode)
    await page.goto('http://localhost:3000');
    // Wait for lesson layout to load
    await page.waitForSelector('.lesson-layout', { timeout: 10000 });
  });

  test('should load lesson mode and check live connection', async ({ page }) => {
    // Lesson mode is now the default view
    // Wait for lesson layout to be visible
    await expect(page.locator('.lesson-layout')).toBeVisible();
    
    // Check if scene picker is visible
    await expect(page.locator('.scene-picker')).toBeVisible();
    
    // Check if avatar control tray is visible
    await expect(page.locator('.avatar-control-tray').first()).toBeVisible();
    
    // Check if student avatar display is visible
    await expect(page.locator('.avatar-display').first()).toBeVisible();
    
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
    const websockets: string[] = [];
    page.on('websocket', ws => {
      websockets.push(ws.url());
    });
    
    // Try to click the connect button (phone call style)
    // Force click because the button has a bounce animation
    const connectButton = page.locator('.call-button.connect').first();
    await connectButton.click({ force: true });

    // Wait for and accept the permission modal
    const startButton = page.locator('button:has-text("Start! 🚀")');
    await startButton.waitFor({ timeout: 3000 });
    await startButton.click();

    // Wait up to 7s for either token request or a websocket open
    await page.waitForTimeout(7000);

    const tokenReq = networkRequests.find(req => req.includes('/token'));
    const liveWs = websockets.find(url => url.includes('generativelanguage') || url.startsWith('ws') || url.startsWith('wss'));
    console.log('Lesson: token request:', tokenReq);
    console.log('Lesson: websocket URLs:', websockets);
    expect(Boolean(tokenReq) || Boolean(liveWs), 'Should attempt token or open a websocket in lesson').toBeTruthy();
    
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

  test('should be able to open dialogue view', async ({ page }) => {
    // Check if dialogue toggle button is present
    await expect(page.locator('.dialogue-toggle')).toBeVisible();
    
    // Click to open dialogue view
    await page.click('.dialogue-toggle');
    
    // Wait for dialogue panel to be visible
    await page.waitForSelector('.dialogue-panel.open', { timeout: 2000 });
    
    // Check if dialogue panel is visible
    await expect(page.locator('.dialogue-panel')).toBeVisible();
    
    console.log('Dialogue view opened successfully');
  });
});
