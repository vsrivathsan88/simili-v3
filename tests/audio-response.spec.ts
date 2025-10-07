import { test, expect } from '@playwright/test';

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test('should receive and process audio from Gemini', async ({ page, context }) => {
  await context.grantPermissions(['microphone'], { origin: 'http://localhost:3000' });

  const consoleLogs: { type: string; text: string; timestamp: number }[] = [];
  page.on('console', msg => {
    consoleLogs.push({ 
      type: msg.type(), 
      text: msg.text(),
      timestamp: Date.now()
    });
  });

  await page.goto('http://localhost:3000');
  await page.waitForSelector('.lesson-layout', { timeout: 10000 });

  // Wait for and answer Pi's call
  await page.waitForSelector('.incoming-call-overlay', { timeout: 10000 });
  await page.locator('.incoming-call-avatar').click({ force: true });
  
  console.log('⏳ Waiting for connection to establish...');
  await page.waitForTimeout(5000);

  console.log('\n=== CONNECTION STATUS ===');
  const connected = consoleLogs.some(log => 
    log.text.includes('Connection opened successfully') ||
    log.text.includes('Connected successfully with fresh token')
  );
  console.log('Connected:', connected ? '✅' : '❌');

  if (!connected) {
    console.log('❌ Cannot test audio - not connected');
    throw new Error('Failed to connect');
  }

  // Wait longer and watch for any Gemini responses
  console.log('\n=== MONITORING FOR GEMINI ACTIVITY ===');
  console.log('Waiting 15 seconds to see if Gemini auto-greets or responds...');
  
  const startTime = Date.now();
  await page.waitForTimeout(15000);

  // Check what Gemini sent
  console.log('\n=== GEMINI RESPONSE ANALYSIS ===');
  
  const modelTurnLogs = consoleLogs.filter(log => 
    log.text.includes('[LiveClient] Received modelTurn')
  );
  console.log('Model turns received:', modelTurnLogs.length);
  
  const audioParts = consoleLogs.filter(log => 
    log.text.includes('[LiveClient] Audio parts:')
  );
  console.log('Audio parts messages:', audioParts.length);
  
  if (audioParts.length > 0) {
    audioParts.forEach(log => {
      console.log('  -', log.text);
    });
  }

  const outputTranscription = consoleLogs.filter(log => 
    log.text.includes('outputTranscription')
  );
  console.log('Output transcriptions:', outputTranscription.length);
  
  if (outputTranscription.length > 0) {
    console.log('Gemini spoke (transcription detected):');
    outputTranscription.forEach(log => {
      console.log('  -', log.text);
    });
  }

  const audioReceived = consoleLogs.filter(log => 
    log.text.includes('[Audio] Received audio data from Gemini')
  );
  console.log('Audio data received:', audioReceived.length);
  
  if (audioReceived.length > 0) {
    console.log('✅ Audio data was received from Gemini:');
    audioReceived.forEach(log => {
      console.log('  -', log.text);
    });
  }

  const audioStreamerLogs = consoleLogs.filter(log => 
    log.text.includes('[AudioStreamer]')
  );
  console.log('AudioStreamer logs:', audioStreamerLogs.length);
  
  if (audioStreamerLogs.length > 0) {
    console.log('AudioStreamer activity:');
    audioStreamerLogs.forEach(log => {
      console.log('  -', log.text);
    });
  }

  // Check for setup complete
  const setupComplete = consoleLogs.some(log => 
    log.text.includes('setupcomplete')
  );
  console.log('\nSetup complete event:', setupComplete ? '✅' : '❌');

  // Check for errors
  const errors = consoleLogs.filter(log => log.type === 'error');
  if (errors.length > 0) {
    console.log('\n=== ERRORS DETECTED ===');
    errors.forEach(log => {
      console.log('❌', log.text);
    });
  }

  // DIAGNOSIS
  console.log('\n=== DIAGNOSIS ===');
  
  if (modelTurnLogs.length === 0) {
    console.log('🔴 ISSUE: Gemini is not responding at all');
    console.log('   Possible causes:');
    console.log('   - System prompt might be telling it to wait');
    console.log('   - API configuration issue');
    console.log('   - Gemini waiting for user input first');
  } else if (audioParts.length === 0) {
    console.log('🔴 ISSUE: Gemini responding but no audio parts detected');
    console.log('   Possible causes:');
    console.log('   - responseModalities not set to AUDIO');
    console.log('   - Gemini returning text instead of audio');
  } else {
    const hasAudio = audioParts.some(log => {
      const match = log.text.match(/Audio parts: (\d+)/);
      return match && parseInt(match[1]) > 0;
    });
    
    if (!hasAudio) {
      console.log('🔴 ISSUE: Gemini model turns contain 0 audio parts');
      console.log('   Gemini is responding with TEXT, not AUDIO');
      console.log('   This means responseModalities config is not being respected');
    } else if (audioReceived.length === 0) {
      console.log('🔴 ISSUE: Audio parts detected but not received by handler');
      console.log('   Event listener might not be properly attached');
    } else if (audioStreamerLogs.length === 0) {
      console.log('🔴 ISSUE: Audio received but AudioStreamer not processing it');
      console.log('   AudioStreamer might not be initialized');
    } else {
      console.log('✅ Full audio pipeline working!');
    }
  }

  // Show all LiveClient logs for debugging
  const liveClientLogs = consoleLogs.filter(log => 
    log.text.includes('[LiveClient]') || log.text.includes('[Audio]')
  );
  
  if (liveClientLogs.length > 0) {
    console.log('\n=== ALL AUDIO-RELATED LOGS ===');
    liveClientLogs.forEach(log => {
      console.log(log.text);
    });
  }
});
