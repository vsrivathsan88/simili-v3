import { useEffect, useState, useCallback } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';

// This is the simplest possible implementation of a Gemini Live connection hook.
export function useGeminiLiveSimple() {
  const [client, setClient] = useState<GenAILiveClient | null>(null);
  const [audioStreamer, setAudioStreamer] = useState<AudioStreamer | null>(null);
  const [connected, setConnected] = useState(false);

  // Initialize client and streamer on mount
  useEffect(() => {
    console.log('[HOOK] Initializing resources...');
    let streamer: AudioStreamer;

    const init = async () => {
      try {
        const audioCtx = await audioContext({ id: 'audio-out' });
        streamer = new AudioStreamer(audioCtx);
        setAudioStreamer(streamer);

        const res = await fetch('http://localhost:3001/token', { method: 'POST' });
        if (!res.ok) throw new Error('Token fetch failed');
        const { token } = await res.json();

        const liveClient = new GenAILiveClient(token, 'models/gemini-2.0-flash-exp');
        
        liveClient.on('connect', () => {
          console.log('[HOOK] Client connected event received.');
          setConnected(true);
        });

        liveClient.on('audio', (audioData: ArrayBuffer) => {
          console.log('[HOOK] Received audio data:', audioData.byteLength);
          streamer.addPCM16(new Uint8Array(audioData));
        });
        liveClient.on('interrupted', () => {
          console.log('[HOOK] Interrupted.');
          streamer.stop();
        });
        setClient(liveClient);
        console.log('[HOOK] Resources initialized.');
      } catch (error) {
        console.error('[HOOK] Initialization failed:', error);
      }
    };
    init();

    return () => {
      console.log('[HOOK] Cleaning up resources...');
      client?.disconnect();
      streamer?.stop();
    };
  }, []);

  const connect = useCallback(async () => {
    if (!client) return;
    console.log('[HOOK] Connecting...');
    await client.connect({});
    // State is now set by the 'connect' event listener
    console.log('[HOOK] Connection process initiated.');
  }, [client]);

  const disconnect = useCallback(() => {
    if (!client) return;
    console.log('[HOOK] Disconnecting...');
    client.disconnect();
    setConnected(false);
    console.log('[HOOK] Disconnected.');
  }, [client]);

  const sendAudio = useCallback((base64Audio: string) => {
    if (!client || !connected) return;
    console.log('[HOOK] Sending audio...');
    client.sendRealtimeInput([{
      mimeType: 'audio/pcm;rate=16000',
      data: base64Audio
    }]);
  }, [client, connected]);

  return { connect, disconnect, sendAudio, connected };
}
