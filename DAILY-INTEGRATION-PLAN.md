# Daily.co + Gemini Live Integration Plan

## ⚠️ Current Status (Updated October 1, 2025)

### ✅ Setup Complete
- **Daily.co SDK Version:** `0.84.0` (Safe from Chrome breaking change requiring v0.83.1+)
- **API Key:** Added to `.env` as `DAILY_API_KEY` ✅
- **Test Room:** `simili-test-v1` (Private - requires meeting token)

### 🔐 Private Room Configuration
Your room `simili-test-v1` is configured as **private**, meaning:
- Users need a **meeting token** (not just the room URL) to join
- Meeting tokens are generated server-side using your API key
- This is GOOD for security - prevents unauthorized access

### 📝 Important Notes
- **Chrome Breaking Change:** Daily.co notified about upcoming Chrome changes affecting video/audio tracks
- **Our Status:** We're on v0.84.0, which already includes the fix ✅
- **Deadline:** September 2nd deadline is already passed, but we're safe
- **Your Daily Domain:** You'll need to find your Daily domain (e.g., `yourcompany.daily.co`) from the dashboard to construct room URLs

### 🔍 Finding Your Daily Domain
1. Go to https://dashboard.daily.co/
2. Click on "Rooms" in the sidebar
3. Look at your room `simili-test-v1` - the URL will be like `https://YOURDOMAIN.daily.co/simili-test-v1`
4. Copy `YOURDOMAIN.daily.co` and update it in the code where you see `yourdomain.daily.co`

---

## Architecture Overview

### Current Setup (What Works)
```
[Browser] --WebSocket--> [Gemini Live API]
- Direct audio streaming to/from Gemini
- Screen sharing via WebRTC
- Works but browser-dependent
```

### Target Setup (Production-Ready)
```
[Browser] --Daily.co--> [Your Server] --WebSocket--> [Gemini Live API]
- Daily.co handles ALL browser/device audio complexity
- Your server bridges Daily.co ↔ Gemini Live
- Reliable across all devices
```

---

## Phase 1: Basic Daily.co Audio (Week 1)

### Goal: Get Daily.co audio working alongside current setup

### Step 1: Create Daily.co Account
1. Go to https://dashboard.daily.co/signup
2. Get your API key from dashboard
3. Add to `.env`:
   ```
   DAILY_API_KEY=your_api_key_here
   ```

### Step 2: Create Room Management Endpoint
**File:** `server/daily-rooms.js` (NEW)

```javascript
import fetch from 'node-fetch';

// Create a new Daily room (for dynamic room creation)
export async function createDailyRoom() {
  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DAILY_API_KEY}`
    },
    body: JSON.stringify({
      properties: {
        enable_screenshare: true,
        enable_chat: false,
        enable_knocking: false,
        max_participants: 2, // Just kid + Pi
        exp: Math.round(Date.now() / 1000) + 3600, // 1 hour expiry
      }
    })
  });
  
  const room = await response.json();
  return room.url; // e.g., https://yourdomain.daily.co/room-name
}

// Generate meeting token for private rooms (like "simili-test-v1")
export async function generateMeetingToken(roomName, isOwner = false) {
  const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DAILY_API_KEY}`
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName, // e.g., "simili-test-v1"
        is_owner: isOwner,   // Owner can eject others, change settings
        exp: Math.round(Date.now() / 1000) + 3600, // Token expires in 1 hour
        enable_screenshare: true,
        // Add user metadata for tracking
        user_name: `user_${Date.now()}`,
      }
    })
  });
  
  const tokenData = await response.json();
  return tokenData.token; // This token is used to join the private room
}
```

**Important:** For private rooms like `simili-test-v1`, you MUST generate a meeting token before joining.

### Step 3: Add Room & Token Endpoints
**File:** `server/index.js` (MODIFY)

Add these routes:
```javascript
import { createDailyRoom, generateMeetingToken } from './daily-rooms.js';

// Create a new room
async function handleRoomRequest(req, res) {
  if (req.method === 'OPTIONS') {
    return sendNoContent(res, 204);
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const roomUrl = await createDailyRoom();
    return sendJson(res, 200, { roomUrl });
  } catch (err) {
    console.error('[ERROR] Failed to create Daily room:', err);
    return sendJson(res, 500, { error: 'Failed to create room' });
  }
}

// Generate meeting token for existing room (needed for private rooms)
async function handleMeetingTokenRequest(req, res) {
  if (req.method === 'OPTIONS') {
    return sendNoContent(res, 204);
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      const { roomName, isOwner } = JSON.parse(body);
      
      if (!roomName) {
        return sendJson(res, 400, { error: 'roomName is required' });
      }
      
      const token = await generateMeetingToken(roomName, isOwner || false);
      return sendJson(res, 200, { token });
    });
  } catch (err) {
    console.error('[ERROR] Failed to generate meeting token:', err);
    return sendJson(res, 500, { error: 'Failed to generate token' });
  }
}

// In the server request handler:
if (req.url === '/room') {
  return handleRoomRequest(req, res);
}
if (req.url === '/meeting-token') {
  return handleMeetingTokenRequest(req, res);
}
```

### Step 4: Create Daily Client Component
**File:** `hooks/use-daily-audio.ts` (NEW)

```typescript
import { useState, useEffect, useRef } from 'react';
import DailyIframe from '@daily-co/daily-js';

export function useDailyAudio() {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const callRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Create a new room (public)
  const createRoom = async () => {
    console.log('[Daily] Creating room...');
    const res = await fetch('http://localhost:3001/room', {
      method: 'POST',
    });
    const data = await res.json();
    setRoomUrl(data.roomUrl);
    return data.roomUrl;
  };

  // Get meeting token for private room (like "simili-test-v1")
  const getMeetingToken = async (roomName: string, isOwner = false) => {
    console.log('[Daily] Getting meeting token for room:', roomName);
    const res = await fetch('http://localhost:3001/meeting-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomName, isOwner }),
    });
    const data = await res.json();
    return data.token;
  };

  // Join a room with optional token (required for private rooms)
  const joinRoom = async (url: string, token?: string) => {
    console.log('[Daily] Joining room:', url, token ? '(with token)' : '(public)');
    
    // Create Daily call object
    callRef.current = DailyIframe.createCallObject({
      audioSource: true,
      videoSource: false, // Audio-only for now
    });

    // Set up event listeners
    callRef.current.on('joined-meeting', () => {
      console.log('[Daily] ✅ Joined meeting');
      setIsJoined(true);
    });

    callRef.current.on('participant-joined', (event: any) => {
      console.log('[Daily] Participant joined:', event.participant.user_id);
    });

    callRef.current.on('error', (event: any) => {
      console.error('[Daily] Error:', event);
    });

    // Join the room (with token if private)
    const joinOptions: any = { url };
    if (token) {
      joinOptions.token = token; // Required for private rooms
    }
    
    await callRef.current.join(joinOptions);
  };

  // Convenience: Join private room (gets token automatically)
  const joinPrivateRoom = async (roomName: string, isOwner = false) => {
    const token = await getMeetingToken(roomName, isOwner);
    const url = `https://yourdomain.daily.co/${roomName}`; // Replace with your actual domain
    await joinRoom(url, token);
  };

  const leave = () => {
    if (callRef.current) {
      callRef.current.leave();
      callRef.current.destroy();
      callRef.current = null;
      setIsJoined(false);
      setRoomUrl(null);
    }
  };

  // Get the audio track for sending to Gemini
  const getAudioTrack = () => {
    if (!callRef.current) return null;
    const localParticipant = callRef.current.participants().local;
    return localParticipant?.tracks?.audio?.persistentTrack;
  };

  return {
    roomUrl,
    isJoined,
    createRoom,
    getMeetingToken,
    joinRoom,
    joinPrivateRoom,  // NEW: Easy way to join private rooms
    leave,
    getAudioTrack,
    callObject: callRef.current,
  };
}
```

### Step 5: Test Daily.co Only (Before Gemini)
**File:** `components/demo/daily-test.tsx` (NEW - temporary test component)

```typescript
import React from 'react';
import { useDailyAudio } from '../../hooks/use-daily-audio';

export default function DailyTest() {
  const { roomUrl, isJoined, joinPrivateRoom, leave } = useDailyAudio();

  // Test with your existing private room
  const handleJoinTestRoom = async () => {
    await joinPrivateRoom('simili-test-v1', false);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Daily.co Audio Test</h1>
      
      {!isJoined ? (
        <button onClick={handleJoinTestRoom}>
          Join simili-test-v1 (Private Room)
        </button>
      ) : (
        <div>
          <p>✅ Connected to Daily.co</p>
          <p>Room: simili-test-v1</p>
          <p>Speak into your mic - you should hear yourself (local audio)</p>
          <button onClick={leave}>Leave</button>
        </div>
      )}
    </div>
  );
}
```

**Testing Checkpoint:** 
1. You should be able to join `simili-test-v1` without errors
2. Microphone should activate
3. You should hear yourself speaking (local audio feedback)
4. Console should show: `[Daily] ✅ Joined meeting`

**Note:** Your private room requires a meeting token, which is automatically generated when you call `joinPrivateRoom()`.

---

## Phase 2: Bridge Daily.co Audio to Gemini (Week 2)

### Goal: Route audio through Daily.co but still use Gemini Live

### Architecture:
```
[Browser] 
  ↓ Daily.co (reliable transport)
[Server - Audio Bridge]
  ↓ Process audio
[Gemini Live API]
  ↓ Receive & respond
[Server - Audio Bridge]
  ↓ Daily.co (reliable transport)
[Browser]
```

### Step 1: Create Audio Bridge Server
**File:** `server/audio-bridge.js` (NEW)

```javascript
import { GenAILiveClient } from '../lib/genai-live-client.js';
import { Readable, Writable } from 'stream';

export class AudioBridge {
  constructor(apiKey) {
    this.geminiClient = new GenAILiveClient(apiKey, 'gemini-2.5-flash-native-audio-preview-09-2025');
    this.dailyAudioIn = new Writable({
      write(chunk, encoding, callback) {
        // Forward audio from Daily to Gemini
        this.geminiClient.sendRealtimeInput([{
          mimeType: 'audio/pcm;rate=16000',
          data: chunk.toString('base64')
        }]);
        callback();
      }
    });
  }

  async start(config) {
    await this.geminiClient.connect(config);
    
    // Listen for Gemini audio responses
    this.geminiClient.on('audio', (audioData) => {
      // This will be sent back to Daily
      this.emit('gemini-audio', audioData);
    });
  }

  // Receive audio from Daily
  receiveAudioFromDaily(audioChunk) {
    this.dailyAudioIn.write(audioChunk);
  }

  stop() {
    this.geminiClient.disconnect();
  }
}
```

### Step 2: WebSocket Server for Real-time Bridging
**File:** `server/websocket-bridge.js` (NEW)

```javascript
import { WebSocketServer } from 'ws';
import { AudioBridge } from './audio-bridge.js';

export function createBridgeServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/audio-bridge' });

  wss.on('connection', async (ws) => {
    console.log('[Bridge] Client connected');
    
    const bridge = new AudioBridge(process.env.GEMINI_API_KEY);
    
    // Start Gemini connection
    await bridge.start({
      responseModalities: ['AUDIO'],
      // ... rest of config
    });

    // Handle incoming audio from browser (via Daily)
    ws.on('message', (data) => {
      // Data is audio from Daily.co
      bridge.receiveAudioFromDaily(data);
    });

    // Send Gemini audio back to browser
    bridge.on('gemini-audio', (audioData) => {
      ws.send(audioData);
    });

    ws.on('close', () => {
      console.log('[Bridge] Client disconnected');
      bridge.stop();
    });
  });
}
```

### Step 3: Update Client to Use Bridge
**File:** `hooks/use-daily-gemini-bridge.ts` (NEW)

```typescript
import { useEffect, useRef } from 'react';
import { useDailyAudio } from './use-daily-audio';

export function useDailyGeminiBridge() {
  const daily = useDailyAudio();
  const bridgeWs = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!daily.isJoined) return;

    // Connect to bridge server
    bridgeWs.current = new WebSocket('ws://localhost:3001/audio-bridge');
    
    bridgeWs.current.onopen = () => {
      console.log('[Bridge] Connected to audio bridge');
      
      // Start capturing audio from Daily
      const audioTrack = daily.getAudioTrack();
      if (audioTrack) {
        startAudioCapture(audioTrack);
      }
    };

    bridgeWs.current.onmessage = (event) => {
      // Receive audio from Gemini, play via Daily
      playAudioFromGemini(event.data);
    };

    return () => {
      bridgeWs.current?.close();
    };
  }, [daily.isJoined]);

  const startAudioCapture = (audioTrack: MediaStreamTrack) => {
    // Capture audio from Daily and send to bridge
    const stream = new MediaStream([audioTrack]);
    // Process and send chunks via bridgeWs
  };

  const playAudioFromGemini = (audioData: ArrayBuffer) => {
    // Play audio through Daily's audio system
  };

  return daily;
}
```

---

## Phase 3: Switch Over (Week 3)

### Goal: Replace direct Gemini connection with Daily-based connection

### Step 1: Feature Flag
**File:** `lib/state.ts` (MODIFY)

Add a feature flag:
```typescript
export const useFeatureFlags = create((set) => ({
  useDailyTransport: false, // Toggle this to switch
  setUseDailyTransport: (value: boolean) => set({ useDailyTransport: value }),
}));
```

### Step 2: Conditional Hook Usage
**File:** `components/lesson/LessonLayout.tsx` (MODIFY)

```typescript
import { useDailyGeminiBridge } from '../../hooks/use-daily-gemini-bridge';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { useFeatureFlags } from '@/lib/state';

export default function LessonLayout() {
  const { useDailyTransport } = useFeatureFlags();
  
  // Use Daily or direct connection based on feature flag
  const liveAPI = useDailyTransport 
    ? useDailyGeminiBridge() 
    : useLiveAPIContext();

  // Rest of component stays the same!
  // ...
}
```

### Step 3: Test Both Modes
1. Test with `useDailyTransport: false` (current direct mode)
2. Test with `useDailyTransport: true` (Daily mode)
3. Compare reliability, latency, quality

### Step 4: Rollout Strategy
- Week 3: Test internally with Daily
- Week 4: Beta test with 5 kids (Daily)
- Week 5: Monitor metrics, compare
- Week 6: Full switch if Daily is better

---

## Rollback Plan

If something goes wrong at any phase:

### Phase 1 Issue:
- Simply don't use the Daily components
- Current setup still works

### Phase 2 Issue:
- Keep feature flag `useDailyTransport: false`
- Daily code exists but isn't used

### Phase 3 Issue:
- Set `useDailyTransport: false`
- Instant rollback to working state

---

## Success Metrics

Compare these between Direct vs Daily:

1. **Connection Success Rate**: % of successful connections
2. **Time to Connect**: Seconds from click to audio
3. **Audio Quality Issues**: Dropouts, glitches per session
4. **Device Coverage**: Works on iPad/Chromebook/etc
5. **Parent Complaints**: Before vs after

---

## Cost Estimation

### Daily.co Pricing:
- Free tier: 10,000 minutes/month (enough for testing)
- Scale tier: $0.002/minute = $0.12/hour
- 100 kids × 1 hour/week × 4 weeks = 400 hours/month = $48/month

### Development Time:
- Phase 1: 2-3 days (setup & test)
- Phase 2: 3-5 days (bridge implementation)
- Phase 3: 2-3 days (integration & testing)
- **Total: 1-2 weeks of focused work**

---

## Gotchas & Tips

### 1. Audio Format Conversion
- Daily uses different sample rates than Gemini
- You'll need to resample audio in the bridge
- Use a library like `@alexanderolsen/resample-audio`

### 2. Latency Considerations
- Daily adds ~50-100ms of latency
- Bridge processing adds ~10-20ms
- Total: ~60-120ms extra (still acceptable)

### 3. Error Handling
- Daily handles reconnection automatically
- But you need to handle Gemini disconnections
- Bridge server needs to be robust

### 4. Testing on Real Devices
- Don't just test on your Mac
- Test on:
  - Old iPad (Safari)
  - Chromebook (Chrome)
  - Windows laptop (Edge)
  - Parent's phone (Mobile browsers)

---

## Next Immediate Steps

### ✅ Phase 1 Complete:
1. ✅ Install Daily.co SDK (v0.84.0 - Chrome-safe)
2. ✅ Create Daily.co account and get API key
3. ✅ Add `DAILY_API_KEY` to `.env`
4. ✅ Create test room: `simili-test-v1` (private)
5. ✅ Create `server/daily-rooms.js`
6. ✅ Add endpoints to `server/index.js`
7. ✅ Create `hooks/use-daily-audio.ts`
8. ✅ Create `components/demo/daily-test.tsx`
9. ✅ Test page: `http://localhost:3000/?test=daily`

### ✅ Phase 2 Complete:
10. ✅ Create `server/audio-bridge.js` (Gemini bridge)
11. ✅ Create `server/websocket-bridge.js` (WebSocket server)
12. ✅ Create `hooks/use-daily-gemini-bridge.ts` (client hook)
13. ✅ Create `components/demo/daily-gemini-test.tsx` (test UI)
14. ✅ Server running with WebSocket bridge
15. ✅ Test page: `http://localhost:3000/?test=gemini`

### 🚀 Ready for Phase 3:
16. **Add feature flag** to toggle Daily vs Direct mode
17. **Update LessonLayout** to use Daily conditionally
18. **A/B test** with real users
19. **Compare metrics** and make final decision

---

## Questions to Consider

1. **Hosting**: Where will your bridge server run?
   - Heroku, Railway, Render, Fly.io?
   - Daily.co can run in browser, but bridge must be server-side

2. **Scaling**: As you grow
   - One bridge instance can handle ~10-20 concurrent sessions
   - Daily.co handles scaling automatically

3. **Monitoring**: How will you know if things break?
   - Daily.co dashboard shows connection quality
   - Add logging to bridge server
   - Consider Sentry or similar for error tracking

Ready to start? I can help implement Phase 1, Step 2 (Create Room Management Endpoint) right now.
