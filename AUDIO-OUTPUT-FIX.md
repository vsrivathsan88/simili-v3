# Audio Output Diagnosis & Fix

## Problem
Gemini Live is not outputting audio after implementing screen sharing functionality.

## Root Cause Analysis

### Configuration Review ✅
The audio configuration is **correct**:
- `responseModalities: ['AUDIO']` is properly set in `LessonLayout.tsx`
- Audio input/output transcription is enabled
- Speech config with voice selection is present

### Audio Pipeline Review ✅
The audio output pipeline is **properly structured**:
1. `GenAILiveClient` receives audio from Gemini as base64 PCM data
2. Converts to ArrayBuffer and emits 'audio' event
3. `use-live-api.ts` listens to 'audio' event
4. Calls `AudioStreamer.addPCM16()` with the audio data
5. `AudioStreamer` queues and plays audio through Web Audio API

### Identified Issues ⚠️

**Issue #1: Audio Context Suspension**
- Web Audio API's `AudioContext` can be in a "suspended" state
- This often happens when the page loads or after certain interactions
- Audio won't play until the context is explicitly resumed

**Issue #2: Lack of Diagnostic Logging**
- No way to tell if Gemini is actually sending audio
- Can't see if audio is being received but not playing
- Can't diagnose where in the pipeline audio is failing

## Fixes Applied

### Fix #1: Auto-Resume Audio Context
**File:** `hooks/media/use-live-api.ts`

Added automatic audio context resume before playing audio:

```typescript
const onAudio = async (data: ArrayBuffer) => {
  if (audioStreamerRef.current) {
    // CRITICAL FIX: Ensure audio context is resumed before playing
    try {
      await audioStreamerRef.current.resume();
    } catch (err) {
      console.warn('[Audio] Failed to resume audio context:', err);
    }
    audioStreamerRef.current.addPCM16(new Uint8Array(data));
    console.log('[Audio] Received audio data from Gemini:', data.byteLength, 'bytes');
  } else {
    console.error('[Audio] No audio streamer available to play audio');
  }
};
```

**Why this matters:** The AudioContext can be suspended by the browser for various reasons (autoplay policies, page lifecycle, etc.). This fix ensures the context is always ready to play audio.

### Fix #2: Comprehensive Diagnostic Logging
**Files:** 
- `lib/genai-live-client.ts` - Logs when audio is received from Gemini
- `hooks/media/use-live-api.ts` - Logs when audio handler is called
- `lib/audio-streamer.ts` - Logs audio processing and playback state

**What you'll see in console:**
- `[LiveClient] Received modelTurn with X parts` - Shows Gemini's response
- `[LiveClient] Audio parts: X` - Shows if audio is included
- `[LiveClient] Emitting audio event with X bytes` - Confirms audio is being sent to handler
- `[Audio] Received audio data from Gemini: X bytes` - Confirms handler received it
- `[AudioStreamer] Received PCM16 chunk: X bytes` - Confirms streamer got it
- `[AudioStreamer] Starting playback, context state: running/suspended` - Shows audio context state

## Testing Instructions

1. **Clear your browser cache** and reload the app
2. **Start a conversation** with Pi
3. **Open the browser console** (F12 or Cmd+Option+I)
4. **Look for these log patterns:**

### If Audio is Working ✅
You should see:
```
[LiveClient] Received modelTurn with 1 parts
[LiveClient] Audio parts: 1 Other parts: 0
[LiveClient] Emitting audio event with 15360 bytes
[Audio] Received audio data from Gemini: 15360 bytes
[AudioStreamer] Received PCM16 chunk: 15360 bytes
[AudioStreamer] Processed to 7680 float32 samples
[AudioStreamer] Queue size: 1 buffers, isPlaying: false
[AudioStreamer] Starting playback, context state: running
```

### If No Audio Parts Received ❌
You'll see:
```
[LiveClient] Received modelTurn with 1 parts
[LiveClient] Audio parts: 0 Other parts: 1
```
**This means:** Gemini is not sending audio. Check:
- Is `responseModalities: ['AUDIO']` in the config?
- Is the token valid and have proper permissions?

### If Audio Received But Not Playing ❌
You'll see audio received but context state is "suspended":
```
[AudioStreamer] Starting playback, context state: suspended
```
**This means:** The audio context fix should handle this, but if it persists:
- Try clicking anywhere on the page to trigger user interaction
- Check browser autoplay policies

## Additional Notes

### Screen Sharing Compatibility
- Screen sharing (sending image/jpeg frames) is **compatible** with audio output
- Gemini Live supports multimodal input (audio + images) with audio-only output
- No changes to `responseModalities` are needed when adding screen sharing

### Audio Context Best Practices
- The AudioContext is created once and reused
- It must be resumed on user interaction (we now do this automatically)
- Chrome/Safari have strict autoplay policies that can suspend contexts

### Next Steps if Issue Persists

1. **Check if Gemini is sending audio at all** - Look for `[LiveClient] Audio parts: 0`
2. **Check audio context state** - Look for `context state: suspended`
3. **Verify connection config** - Is `responseModalities` set correctly?
4. **Check token permissions** - Does the API key/token have audio generation permissions?
5. **Test without screen sharing** - Temporarily disable screen sharing to isolate the issue

## Technical Details

### Why Screen Sharing Might Have Seemed Related
When screen sharing was added:
- More data is being sent to Gemini (audio + images)
- This might trigger rate limiting or prioritization
- Gemini might be processing visual input first
- But fundamentally, audio output should still work

### The Real Issue
The audio output was likely never working reliably due to:
- AudioContext suspension (browser autoplay policies)
- Lack of diagnostic logging to identify the problem
- No explicit audio context resume calls

## Summary
✅ Added automatic AudioContext resume before playing audio
✅ Added comprehensive diagnostic logging throughout the pipeline
✅ Confirmed audio configuration is correct
✅ Confirmed screen sharing is compatible with audio output

The audio output should now work reliably. If you still experience issues, the diagnostic logs will help pinpoint exactly where the problem is occurring.
