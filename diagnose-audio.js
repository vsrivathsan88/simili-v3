// Audio Interruption Diagnostic Script
// This will help us understand what's happening with the two-voice issue

import { chromium } from 'playwright';

async function diagnoseAudioInterruption() {
  console.log('🔍 Starting Deep Audio Interruption Diagnosis...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ]
  });
  
  const context = await browser.newContext({
    permissions: ['microphone']
  });
  
  const page = await context.newPage();
  
  // Collect ALL console messages with timestamps
  const logs = [];
  page.on('console', msg => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    };
    logs.push(logEntry);
    
    // Real-time logging of critical audio events
    if (msg.text().includes('[AudioStreamer]') || 
        msg.text().includes('[Audio]') || 
        msg.text().includes('interrupted') ||
        msg.text().includes('INTERRUPTION') ||
        msg.text().includes('Active connections') ||
        msg.text().includes('client-')) {
      console.log(`${timestamp} [${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  // Track WebSocket connections
  const websockets = [];
  page.on('websocket', ws => {
    const timestamp = new Date().toISOString();
    websockets.push({ url: ws.url(), timestamp });
    console.log(`${timestamp} [WEBSOCKET] Opened: ${ws.url()}`);
  });

  try {
    console.log('📱 Navigating to application...');
    await page.goto('http://localhost:3000');
    await page.waitForSelector('.lesson-layout', { timeout: 10000 });
    
    console.log('🔌 Connecting to Gemini Live...');
    await page.locator('.call-button.connect').first().click({ force: true });
    await page.locator('button:has-text("Start! 🚀")').click();
    
    console.log('⏳ Waiting for connection to establish...');
    await page.waitForTimeout(8000);
    
    // Check connection status
    const connectionLogs = logs.filter(log => 
      log.text.includes('Connection opened successfully') ||
      log.text.includes('Connected successfully')
    );
    
    if (connectionLogs.length === 0) {
      console.log('❌ Connection failed - cannot test audio interruption');
      return;
    }
    
    console.log('✅ Connected! Now testing audio interruption scenarios...\n');
    
    // SCENARIO 1: Check for multiple client instances
    console.log('🔍 SCENARIO 1: Checking for multiple client instances...');
    const clientLogs = logs.filter(log => 
      log.text.includes('client-') || 
      log.text.includes('Active connections')
    );
    
    if (clientLogs.length > 0) {
      console.log('Found client tracking logs:');
      clientLogs.forEach(log => {
        console.log(`  ${log.timestamp}: ${log.text}`);
      });
    }
    
    // SCENARIO 2: Trigger a disconnect/reconnect to see if multiple streams occur
    console.log('\n🔍 SCENARIO 2: Testing disconnect/reconnect cycle...');
    
    console.log('Disconnecting...');
    await page.locator('.call-button.disconnect').click();
    await page.waitForTimeout(2000);
    
    console.log('Reconnecting...');
    const beforeReconnectLogCount = logs.length;
    await page.locator('.call-button.connect').first().click({ force: true });
    await page.waitForTimeout(5000);
    
    // Analyze logs from reconnection
    const reconnectLogs = logs.slice(beforeReconnectLogCount);
    const duplicateWarnings = reconnectLogs.filter(log => 
      log.text.includes('MULTIPLE ACTIVE CONNECTIONS') ||
      log.text.includes('DUPLICATE STREAM') ||
      log.text.includes('duplicate call') ||
      log.text.includes('Already scheduling')
    );
    
    if (duplicateWarnings.length > 0) {
      console.log('🚨 FOUND DUPLICATE STREAM WARNINGS:');
      duplicateWarnings.forEach(log => {
        console.log(`  ${log.timestamp}: ${log.text}`);
      });
    }
    
    // SCENARIO 3: Wait for Gemini to speak and look for audio overlap
    console.log('\n🔍 SCENARIO 3: Monitoring for audio overlap...');
    console.log('Waiting 15 seconds for potential Gemini audio...');
    
    const audioMonitorStart = logs.length;
    await page.waitForTimeout(15000);
    
    const audioLogs = logs.slice(audioMonitorStart).filter(log => 
      log.text.includes('[AudioStreamer]') ||
      log.text.includes('[Audio]') ||
      log.text.includes('PCM16 chunk') ||
      log.text.includes('Playing audio from client')
    );
    
    if (audioLogs.length > 0) {
      console.log('📊 Audio activity detected:');
      audioLogs.forEach(log => {
        console.log(`  ${log.timestamp}: ${log.text}`);
      });
      
      // Look for overlapping audio streams
      const playingLogs = audioLogs.filter(log => 
        log.text.includes('Playing audio from client')
      );
      
      if (playingLogs.length > 1) {
        console.log('\n🚨 POTENTIAL AUDIO OVERLAP DETECTED:');
        playingLogs.forEach(log => {
          console.log(`  ${log.timestamp}: ${log.text}`);
        });
      }
    }
    
    // FINAL ANALYSIS
    console.log('\n📋 FINAL DIAGNOSIS:');
    
    const totalWebSockets = websockets.length;
    const geminiWebSockets = websockets.filter(ws => 
      ws.url.includes('generativelanguage.googleapis.com')
    );
    
    console.log(`WebSocket connections: ${totalWebSockets} total, ${geminiWebSockets.length} to Gemini`);
    
    if (geminiWebSockets.length > 1) {
      console.log('🚨 ISSUE: Multiple Gemini WebSocket connections detected!');
      geminiWebSockets.forEach((ws, i) => {
        console.log(`  Connection ${i + 1}: ${ws.timestamp} - ${ws.url}`);
      });
    }
    
    const allDuplicateWarnings = logs.filter(log => 
      log.text.includes('MULTIPLE') ||
      log.text.includes('DUPLICATE') ||
      log.text.includes('duplicate') ||
      log.text.toLowerCase().includes('overlap')
    );
    
    if (allDuplicateWarnings.length > 0) {
      console.log('\n🚨 ALL DUPLICATE/OVERLAP WARNINGS:');
      allDuplicateWarnings.forEach(log => {
        console.log(`  ${log.timestamp}: ${log.text}`);
      });
    }
    
    // Check for interruption events
    const interruptionLogs = logs.filter(log => 
      log.text.includes('interrupted') ||
      log.text.includes('INTERRUPTION') ||
      log.text.includes('stopAudioStreamer')
    );
    
    if (interruptionLogs.length > 0) {
      console.log('\n🔄 INTERRUPTION EVENTS:');
      interruptionLogs.forEach(log => {
        console.log(`  ${log.timestamp}: ${log.text}`);
      });
    }
    
    console.log('\n✅ Diagnosis complete. Check the logs above for issues.');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the diagnosis
diagnoseAudioInterruption().catch(console.error);
