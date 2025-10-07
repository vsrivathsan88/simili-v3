/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { useLogStore, useSettings, useSceneStore } from '@/lib/state';

// CRITICAL DEBUG: Track active connections to detect duplicates
let activeConnectionCount = 0;

// CRITICAL FIX: Global client and audio streamer singletons to prevent multiple instances
let globalClient: GenAILiveClient | null = null;
let globalAudioStreamer: AudioStreamer | null = null;
let globalClientPromise: Promise<GenAILiveClient> | null = null;

async function getOrCreateClient(model: string): Promise<GenAILiveClient> {
  // If we already have a client with active connection, return it
  if (globalClient && globalClient.status === 'connected') {
    console.log('[SINGLETON] Reusing existing connected global client');
    return globalClient;
  }
  
  // If client exists but not connected, destroy it for fresh start
  if (globalClient && globalClient.status !== 'connected') {
    console.log('[SINGLETON] Existing client not connected, destroying for fresh start');
    destroyGlobalClient();
  }
  
  // If client creation is in progress, wait for it
  if (globalClientPromise) {
    console.log('[SINGLETON] Waiting for client creation in progress...');
    return globalClientPromise;
  }
  
  // Create new client
  console.log('[SINGLETON] Creating new global client...');
  globalClientPromise = (async () => {
    try {
      const res = await fetch('http://localhost:3001/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Token fetch failed (${res.status}): ${errorText}`);
      }
      
      const data = await res.json();
      console.log('[SINGLETON] Token response:', {
        hasToken: !!data.token,
        isFallback: data.fallback,
        isEphemeral: data.ephemeral,
      });
      
      if (!data.token) {
        throw new Error('No token returned from server');
      }
      
      if (data.fallback) {
        console.warn('[SINGLETON] Using API key fallback - not ephemeral token');
      }
      
      // Create the client
      const client = new GenAILiveClient(data.token, model, { apiVersion: 'v1alpha' });
      globalClient = client;
      console.log('[SINGLETON] ✅ Global client created successfully');
      return client;
    } catch (error) {
      // Reset promise on error so we can retry
      globalClientPromise = null;
      throw error;
    }
  })();
  
  return globalClientPromise;
}

function destroyGlobalClient() {
  if (globalClient) {
    console.log('[SINGLETON] Destroying global client');
    try {
      if (globalClient.status === 'connected') {
        globalClient.disconnect();
      }
    } catch (e) {
      console.error('[SINGLETON] Error disconnecting client:', e);
    }
    globalClient = null;
  }
  globalClientPromise = null;
}

function getOrCreateAudioStreamer(audioCtx: AudioContext): AudioStreamer {
  if (!globalAudioStreamer) {
    console.log('[SINGLETON] Creating global audio streamer');
    globalAudioStreamer = new AudioStreamer(audioCtx);
  }
  return globalAudioStreamer;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type UseLiveApiResults = {
  client: GenAILiveClient | null;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  volume: number;
};

export function useLiveApi(): UseLiveApiResults {
  const { model } = useSettings();
  const [client, setClient] = useState<GenAILiveClient | null>(null);
  
  // CRITICAL DEBUG: Track hook instances
  const hookInstanceId = useRef(`hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  // Commented out to prevent console spam - uncomment only for debugging re-render issues
  // console.log(`[useLiveApi] Hook instance ${hookInstanceId.current} initialized`);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManualDisconnectRef = useRef(false);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const isConnectingRef = useRef(false); // CRITICAL: Prevent simultaneous connection attempts

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Default config with basic settings for immediate connection
  // Can be overridden by LessonLayout or other components via setConfig
  const [config, setConfig] = useState<LiveConnectConfig>({
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Puck',
        },
      },
      // CRITICAL: Force English language for speech output
      languageCode: 'en-US',
    },
    realtimeInputConfig: {
      automaticActivityDetection: {
        enabled: true,
      },
    },
    // CRITICAL: Force English transcription for input and output
    inputAudioTranscription: {
      languageCode: 'en-US',
    },
    outputAudioTranscription: {
      languageCode: 'en-US',
    },
    systemInstruction: {
      parts: [{
        text: 'You are Pi, a helpful AI assistant.\n\nCRITICAL INSTRUCTION: You MUST respond ONLY in English. Always speak in clear, natural English regardless of what language you detect in the input audio. If you hear unclear audio or noise, politely ask "Sorry, I didn\'t catch that. Could you please repeat?" in English.\n\nNever respond in any language other than English, even if the input appears to be in another language.'
      }],
    },
  });

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 2000;

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        // Use singleton audio streamer to prevent multiple instances
        audioStreamerRef.current = getOrCreateAudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            console.log('[AUDIO] Successfully added volume meter worklet');
          })
          .catch(err => {
            console.error('[AUDIO] Error adding worklet:', err);
          });
      });
    }
  }, []);

  // CRITICAL FIX: Use singleton client to prevent multiple instances
  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      // CRITICAL: Only create client if we don't have one already
      if (client) {
        console.log(`[CLIENT] Client already exists for hook ${hookInstanceId.current}, skipping initialization`);
        return;
      }
      
      try {
        console.log(`[CLIENT] Getting or creating client for hook ${hookInstanceId.current}...`);
        const singletonClient = await getOrCreateClient(model);
        
        // CRITICAL: Only set client if component is still mounted
        if (isMounted && !client) {
          setClient(singletonClient);
          console.log(`[CLIENT] ✅ Singleton client assigned to hook ${hookInstanceId.current}`);
        } else if (!isMounted) {
          console.log(`[CLIENT] Component unmounted, skipping client assignment for hook ${hookInstanceId.current}`);
        } else {
          console.log(`[CLIENT] Client already assigned to hook ${hookInstanceId.current}, skipping`);
        }
      } catch (e) {
        console.error(`[CLIENT] Failed to get client for hook ${hookInstanceId.current}:`, e);
        // Log additional debugging info
        if (e instanceof Error) {
          console.error('[CLIENT] Error details:', e.message);
          console.error('[CLIENT] Error stack:', e.stack);
        }
      }
    })();
    
    // Cleanup function
    return () => {
      isMounted = false;
      console.log(`[CLIENT] Hook ${hookInstanceId.current} unmounting`);
    };
  }, []); // CRITICAL: Empty dependency array - only run once on mount

  // Auto-reconnect function
  const attemptReconnect = useCallback(async () => {
    if (isManualDisconnectRef.current) {
      console.log('[LiveAPI] Manual disconnect - skipping reconnect');
      return;
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[LiveAPI] Max reconnection attempts reached');
      setConnectionStatus('error');
      setConnectionError('Failed to reconnect after multiple attempts');
      return;
    }

    reconnectAttemptsRef.current += 1;
    console.log(`[LiveAPI] Reconnection attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
    setConnectionStatus('reconnecting');
    setConnectionError(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);

    reconnectTimeoutRef.current = setTimeout(async () => {
      try {
        if (!config) {
          throw new Error('No config available for reconnection');
        }
        await connect();
        console.log('[LiveAPI] ✅ Reconnection successful');
        reconnectAttemptsRef.current = 0;
        setConnectionError(null);
      } catch (error) {
        console.error('[LiveAPI] Reconnection failed:', error);
        attemptReconnect(); // Try again
      }
    }, RECONNECT_DELAY_MS * reconnectAttemptsRef.current); // Exponential backoff
  }, [config, MAX_RECONNECT_ATTEMPTS, RECONNECT_DELAY_MS]);

  // Set up event listeners when client changes
  useEffect(() => {
    // CRITICAL FIX: Only set up event listeners if we have a valid client
    if (!client) {
      console.log('[LiveAPI] No client available, skipping event listener setup');
      return;
    }
    
    // CRITICAL FIX: Add client instance tracking to prevent event listener overlap
    const currentClientId = `client-${Date.now()}`;
    console.log('[LiveAPI] Setting up event listeners for client:', currentClientId);

    const onOpen = () => {
      console.log('[LiveAPI] Connection opened successfully for client:', currentClientId);
      setConnected(true);
      setConnectionStatus('connected');
      setConnectionError(null);
      reconnectAttemptsRef.current = 0; // Reset reconnect counter
      lastHeartbeatRef.current = Date.now();
    };
    
    const onSetupComplete = () => {
      console.log('[LiveAPI] Setup complete - waiting for screen share before greeting');
      // DO NOT trigger greeting here - wait for screen share to be accepted
      // The greeting will be triggered from AvatarControlTray after screen share starts
    };

    const onClose = (event?: any) => {
      activeConnectionCount = Math.max(0, activeConnectionCount - 1);
      console.warn(`[LiveAPI] Connection closed for client ${currentClientId} (Active connections: ${activeConnectionCount})`, event ? {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      } : 'no event data');
      setConnected(false);
      
      // Auto-reconnect unless it was a manual disconnect
      if (!isManualDisconnectRef.current) {
        setConnectionStatus('reconnecting');
        attemptReconnect();
      } else {
        setConnectionStatus('disconnected');
      }
    };

    const onError = (error: any) => {
      console.error('[LiveAPI] Connection error:', error);
      setConnectionError(error.message || 'Connection error occurred');
      setConnectionStatus('error');
    };

    const stopAudioStreamer = () => {
      console.log('[LiveAPI] 🛑 INTERRUPTION DETECTED - Immediately stopping all audio');
      if (audioStreamerRef.current) {
        // CRITICAL FIX: Immediate audio cutoff for proper barge-in
        audioStreamerRef.current.stop();
        // Additional safety: set gain to 0 immediately to cut audio
        audioStreamerRef.current.gainNode.gain.setValueAtTime(0, audioStreamerRef.current.context.currentTime);
        console.log('[LiveAPI] ✅ Audio streamer stopped and muted immediately');
        
        // DON'T call resume() here - let the next audio chunk handle it
        // The isInterrupted flag in audio-streamer will prevent audio until a new response
      }
    };

    const onAudio = async (data: ArrayBuffer) => {
      // Update heartbeat - we're receiving data, connection is alive
      lastHeartbeatRef.current = Date.now();
      
      // CRITICAL FIX: Track which client is sending audio to detect duplicates
      console.log(`[Audio] Received audio data from client ${currentClientId}:`, data.byteLength, 'bytes');
      
      if (audioStreamerRef.current) {
        // Only resume audio context if it's suspended, NOT on every chunk
        if (audioStreamerRef.current.context.state === 'suspended') {
          try {
            await audioStreamerRef.current.context.resume();
            console.log('[Audio] Resumed suspended audio context');
          } catch (err) {
            console.warn('[Audio] Failed to resume audio context:', err);
          }
        }
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
        console.log(`[Audio] Playing audio from client ${currentClientId}:`, data.byteLength, 'bytes');
      } else {
        console.error('[Audio] No audio streamer available to play audio');
      }
    };

    // Bind event listeners
    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('error', onError);
    client.on('setupcomplete', onSetupComplete);
    client.on('interrupted', stopAudioStreamer);
    client.on('audio', onAudio);

    const onToolCall = (toolCall: LiveServerToolCall) => {
      const functionResponses: any[] = [];

      for (const fc of toolCall.functionCalls) {
        // Log the function call trigger
        const triggerMessage = `Triggering function call: **${
          fc.name
        }**\n\`\`\`json\n${JSON.stringify(fc.args, null, 2)}\n\`\`\``;
        useLogStore.getState().addTurn({
          role: 'system',
          text: triggerMessage,
          isFinal: true,
        });

        // Execute tool-specific logic
        let responseData: any = { result: 'ok' };

        if (fc.name === 'switch_scene') {
          const sceneId = fc.args?.scene_id as string;
          const reason = fc.args?.reason as string;
          
          if (sceneId) {
            const sceneStore = useSceneStore.getState();
            const targetScene = sceneStore.availableScenes.find(s => s.id === sceneId);
            
            if (targetScene) {
              sceneStore.setCurrentScene(sceneId);
              responseData = {
                result: 'success',
                scene_id: sceneId,
                scene_title: targetScene.title,
                scene_description: targetScene.description,
                reason: reason || 'Scene switched',
              };
            } else {
              responseData = {
                result: 'error',
                message: `Scene with id "${sceneId}" not found`,
                available_scenes: sceneStore.availableScenes.map(s => s.id),
              };
            }
          } else {
            responseData = {
              result: 'error',
              message: 'scene_id parameter is required',
            };
          }
        }

        // Prepare the response
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: responseData,
        });
      }

      // Log the function call response
      if (functionResponses.length > 0) {
        const responseMessage = `Function call response:\n\`\`\`json\n${JSON.stringify(
          functionResponses,
          null,
          2,
        )}\n\`\`\``;
        useLogStore.getState().addTurn({
          role: 'system',
          text: responseMessage,
          isFinal: true,
        });
      }

      client.sendToolResponse({ functionResponses: functionResponses });
    };

    client.on('toolcall', onToolCall);

    return () => {
      // CRITICAL FIX: Enhanced cleanup with client tracking
      console.log('[LiveAPI] Cleaning up event listeners for client:', currentClientId);
      
      // Clean up event listeners
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('error', onError);
      client.off('setupcomplete', onSetupComplete);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('toolcall', onToolCall);
      
      // Stop any ongoing audio to prevent overlap
      if (audioStreamerRef.current) {
        console.log('[LiveAPI] Stopping audio streamer during cleanup for client:', currentClientId);
        audioStreamerRef.current.stop();
      }
    };
  }, [client, attemptReconnect]);

  // Connection health monitoring
  useEffect(() => {
    if (!connected) return;

    const HEALTH_CHECK_INTERVAL = 60000; // Check every 60 seconds
    const HEARTBEAT_TIMEOUT = 300000; // Consider dead if no activity for 5 minutes (voice chat has pauses!)

    const healthCheck = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;
      
      if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
        console.warn('[LiveAPI] Connection appears unhealthy - no activity for', timeSinceLastHeartbeat, 'ms');
        console.log('[LiveAPI] Triggering reconnection...');
        // Force disconnect and reconnect
        client.disconnect();
      } else {
        console.log('[LiveAPI] Health check passed - connection is alive');
      }
    }, HEALTH_CHECK_INTERVAL);

    return () => {
      clearInterval(healthCheck);
    };
  }, [connected, client]);

  // Cleanup reconnect timeout on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Clean up singleton when last hook instance unmounts
      console.log(`[CLIENT] Hook ${hookInstanceId.current} final cleanup`);
    };
  }, []);

  const connect = useCallback(async () => {
    // CRITICAL: Prevent simultaneous connection attempts
    if (isConnectingRef.current) {
      console.log('[CLIENT] Connection already in progress, skipping duplicate request');
      return;
    }
    
    if (!config) {
      throw new Error('config has not been set');
    }
    
    isConnectingRef.current = true;
    
    try {
      // CRITICAL FIX: Get or create client and use it directly (don't rely on state)
      let activeClient = client;
      if (!activeClient) {
        console.log('[CLIENT] No client yet, getting or creating one...');
        activeClient = await getOrCreateClient(model);
        setClient(activeClient);
      }
      
      // Check if already connected
      if (activeClient.status === 'connected') {
        console.log('[CLIENT] Already connected, skipping connection');
        setConnected(true);
        setConnectionStatus('connected');
        return;
      }
      
      setConnectionStatus('connecting');
      setConnectionError(null);
      isManualDisconnectRef.current = false; // Reset manual disconnect flag
      
      // CRITICAL FIX: Use singleton client for connection
      console.log('[CLIENT] Connecting with singleton client (status:', activeClient.status, ')');
      
      // STEP 1: Stop any existing audio output to prevent overlap
      if (audioStreamerRef.current) {
        console.log('[CLIENT] Stopping audio streamer to prevent overlap...');
        audioStreamerRef.current.stop();
        // Don't call resume here - let the audio handler manage it
      }
      
      // STEP 2: Connect with the singleton client
      console.log('[CLIENT] Connecting to Gemini Live...');
      console.log('[CLIENT] Using config with system prompt:',
        config.systemInstruction?.parts?.[0]?.text?.substring(0, 100) + '...');
      await activeClient.connect(config);

      activeConnectionCount = 1; // Reset to 1 since we're using singleton
      console.log(`[CLIENT] ✅ Connected successfully (Status: ${activeClient.status})`);

      // CRITICAL FIX: Resume audio immediately after connection
      if (audioStreamerRef.current) {
        console.log('[CLIENT] Resuming audio playback after connection...');
        audioStreamerRef.current.resume();
        console.log('[CLIENT] ✅ Audio playback restored');
      }
      
    } catch (error) {
      console.error('[CLIENT] Failed to connect:', error);
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      // On error, destroy client for fresh start next time
      destroyGlobalClient();
      setClient(null);
      throw error;
    } finally {
      isConnectingRef.current = false;
    }
  }, [client, config, model]);

  const disconnect = useCallback(async () => {
    console.log('[CLIENT] Manual disconnect initiated');
    isManualDisconnectRef.current = true; // Prevent auto-reconnect
    
    // Clear any pending reconnect attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    
    // CRITICAL FIX: Stop audio streamer before disconnecting client
    if (audioStreamerRef.current) {
      console.log('[CLIENT] Stopping audio streamer during disconnect...');
      audioStreamerRef.current.stop();
    }
    
    // CRITICAL FIX: Use singleton disconnect
    if (client) {
      client.disconnect();
      activeConnectionCount = Math.max(0, activeConnectionCount - 1);
    }
    
    // Don't destroy global client on manual disconnect - keep it for reconnection
    // Only destroy on app shutdown or error conditions
    
    setConnected(false);
    setConnectionStatus('disconnected');
    setConnectionError(null);
    
    console.log(`[CLIENT] ✅ Disconnect complete (Active connections: ${activeConnectionCount})`);
  }, [setConnected, client]);

  // CRITICAL FIX: Memoize the return value to prevent constant re-renders
  return useMemo(() => ({
    client: client || null, // Return null if client doesn't exist yet
    config,
    setConfig,
    connect,
    connected,
    connectionStatus,
    connectionError,
    disconnect,
    volume,
  } as UseLiveApiResults), [
    client,
    config,
    setConfig,
    connect,
    connected,
    connectionStatus,
    connectionError,
    disconnect,
    volume
  ]);
}