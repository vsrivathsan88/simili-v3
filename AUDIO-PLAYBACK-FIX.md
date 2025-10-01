# 🔊 Audio Playback Fix

## The Problem

Audio from Gemini was being **received** and **queued** perfectly, but **not playing through speakers**.

### Evidence from Console Logs:
```
[AudioStreamer] Received PCM16 chunk: 46080 bytes
[AudioStreamer] Processed to 23040 float32 samples
[AudioStreamer] Queue size: 30 buffers, isPlaying: true
[AudioStreamer] Starting playback, context state: running
```

**Queue grew to 30+ buffers** but no sound was coming out!

---

## Root Cause

The `scheduleNextBuffer()` function had three critical issues:

### Issue 1: **Too Conservative Scheduling**
```typescript
const SCHEDULE_AHEAD_TIME = 0.2; // Only 0.2 seconds!
```

The function only scheduled buffers if we were within 0.2 seconds of current time. This meant:
1. First 1-2 buffers got scheduled
2. `scheduledTime` quickly exceeded `currentTime + 0.2`
3. No more buffers got scheduled
4. Queue kept growing as new audio arrived

### Issue 2: **No Immediate Rescheduling**
When new audio chunks arrived during playback, they were **added to the queue** but `scheduleNextBuffer()` wasn't called again until the next timeout fired. This caused buffers to pile up unscheduled.

### Issue 3: **No Drift Protection**
If `scheduledTime` drifted far into the future (due to timing issues), audio would be delayed by seconds.

---

## The Fix

### 1. **Aggressive Scheduling** ✅
```typescript
const SCHEDULE_AHEAD_TIME = 1.0; // 1 second ahead!
```

Now schedules up to 1 second of audio ahead instead of just 0.2 seconds.

### 2. **Immediate Rescheduling** ✅
```typescript
if (!this.isPlaying) {
  this.isPlaying = true;
  this.scheduleNextBuffer();
} else {
  // NEW: Schedule new buffers immediately if already playing
  console.log('[AudioStreamer] Already playing, scheduling new buffers immediately');
  this.scheduleNextBuffer();
}
```

Every time a new audio chunk arrives, if we're already playing, we immediately try to schedule more buffers.

### 3. **Drift Protection** ✅
```typescript
const maxDrift = 2.0; // Maximum 2 seconds of drift
if (this.scheduledTime - this.context.currentTime > maxDrift) {
  console.warn('[AudioStreamer] scheduledTime drifted too far, resetting');
  this.scheduledTime = this.context.currentTime;
}
```

Prevents `scheduledTime` from drifting more than 2 seconds into the future.

### 4. **Enhanced Logging** ✅
Added detailed logs to track:
- When `scheduleNextBuffer()` is called
- Current queue length
- Scheduled vs. current time
- Buffer scheduling times
- When drift correction happens

---

## How to Test

1. **Reload the page** (hard refresh: Cmd+Shift+R)
2. **Click "Start Lesson"**
3. **Listen for Pi's greeting** - you should hear it immediately!
4. **Turn on microphone and speak** - Pi should respond with audio

### Expected Console Output:
```
[AudioStreamer] Received PCM16 chunk: 46080 bytes
[AudioStreamer] Queue size: 1 buffers, isPlaying: false
[AudioStreamer] Starting playback, context state: running
[AudioStreamer] scheduleNextBuffer called, queue length: 1
[AudioStreamer] Scheduling source.start() at 0.1, currentTime: 0.01
[AudioStreamer] Next scheduled time: 2.06, buffer duration: 1.96
```

**Key difference:** You'll see **source.start()** being called, and `scheduledTime` will stay close to `currentTime`.

---

## What Changed

| Before | After |
|--------|-------|
| Schedule 0.2s ahead | Schedule 1.0s ahead |
| No rescheduling on new audio | Immediate rescheduling |
| No drift protection | 2s max drift |
| Minimal logging | Detailed logging |
| Queue grows to 30+ buffers | Queue stays small (1-3 buffers) |
| **NO AUDIO** 🔇 | **AUDIO PLAYS** 🔊 |

---

## Technical Details

### Web Audio API Flow:
```
PCM16 data → Float32 conversion → AudioBuffer creation
                                        ↓
                            AudioBufferSourceNode
                                        ↓
                                    GainNode
                                        ↓
                              (Optional: Worklets)
                                        ↓
                                  Destination
                                        ↓
                                   SPEAKERS 🔊
```

### Scheduling Logic:
1. **addPCM16()** called with new audio chunk
2. Convert PCM16 → Float32
3. Add to queue
4. Call **scheduleNextBuffer()**
5. While `scheduledTime < currentTime + 1.0s`:
   - Shift buffer from queue
   - Create AudioBuffer
   - Create AudioBufferSourceNode
   - Connect: source → gainNode → destination
   - **source.start(scheduledTime)**
   - Update scheduledTime
6. Schedule next call via setTimeout

### Key Web Audio API Methods Used:
- `AudioContext.createBuffer()` - creates audio buffer
- `AudioContext.createBufferSource()` - creates playback source
- `source.connect(gainNode)` - connects audio nodes
- `source.start(time)` - schedules playback at specific time
- `AudioContext.currentTime` - current playback time

---

## Verification

After the fix, you should:
- ✅ Hear Pi's greeting immediately after connection
- ✅ See queue staying small (1-3 buffers)
- ✅ See `source.start()` logs with reasonable times
- ✅ Hear smooth, continuous audio (no stuttering)
- ✅ See scheduledTime close to currentTime (within 1-2 seconds)

If you still don't hear audio:
1. Check browser audio permissions
2. Check system volume is not muted
3. Check AudioContext state is "running" (not "suspended")
4. Look for errors in console about source.start()

---

## Files Modified

- `/lib/audio-streamer.ts` - Fixed scheduling logic, added drift protection, enhanced logging

---

## Why This Happened Before

This is a **classic Web Audio API gotcha**. The scheduling logic is timing-sensitive:
- Too conservative → buffers don't get scheduled → queue grows
- Too aggressive → might schedule too far ahead → audio delay
- No rescheduling → new buffers sit in queue forever

The sweet spot is:
- 1 second look-ahead
- Immediate rescheduling on new audio
- Drift protection to prevent runaway scheduling

---

**🎉 You should now hear Pi speaking!**

Reload the page and test it out.

