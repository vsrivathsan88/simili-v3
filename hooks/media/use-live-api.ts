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

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type UseLiveApiResults = {
  client: GenAILiveClient;
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
  const [client, setClient] = useState<GenAILiveClient>(() => new GenAILiveClient('temp', model));

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManualDisconnectRef = useRef(false);
  const lastHeartbeatRef = useRef<number>(Date.now());

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Initial empty config - will be populated by LessonLayout with actual system prompt
  const [config, setConfig] = useState<LiveConnectConfig>({
    responseModalities: ['AUDIO'],
  });

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 2000;

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          })
          .catch(err => {
            console.error('Error adding worklet:', err);
          });
      });
    }
  }, [audioStreamerRef]);

  // Fetch token and initialize client
  // Initialize once on mount with initial token
  useEffect(() => {
    (async () => {
      try {
        console.log('[CLIENT] Fetching initial token from server...');
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
        console.log('[CLIENT] Token response:', {
          hasToken: !!data.token,
          isFallback: data.fallback,
          isEphemeral: data.ephemeral,
        });
        
        if (!data.token) {
          throw new Error('No token returned from server');
        }
        
        if (data.fallback) {
          console.warn('[CLIENT] Using API key fallback - not ephemeral token');
        }
        
        // Initialize client with v1alpha for Live API support
        const newClient = new GenAILiveClient(data.token, model, { apiVersion: 'v1alpha' });
        setClient(newClient);
        console.log('[CLIENT] GenAI Live client initialized successfully');
      } catch (e) {
        console.error('[CLIENT] Failed to initialize Live API client:', e);
        // Log additional debugging info
        if (e instanceof Error) {
          console.error('[CLIENT] Error details:', e.message);
          console.error('[CLIENT] Error stack:', e.stack);
        }
      }
    })();
  }, [model]);

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

    const onOpen = () => {
      console.log('[LiveAPI] Connection opened successfully');
      setConnected(true);
      setConnectionStatus('connected');
      setConnectionError(null);
      reconnectAttemptsRef.current = 0; // Reset reconnect counter
      lastHeartbeatRef.current = Date.now();
    };
    
    const onSetupComplete = () => {
      console.log('[LiveAPI] Setup complete - triggering initial greeting');
      // CRITICAL FIX: Send initial message to trigger Gemini's auto-greeting
      // Gemini Live needs a trigger to start the conversation
      // Send empty text with turnComplete to let Gemini know it can start
      setTimeout(() => {
        client.send([{ text: '' }], true);
        console.log('[LiveAPI] Initial trigger sent, Gemini should now greet');
      }, 100);
    };

    const onClose = (event?: any) => {
      console.warn('[LiveAPI] Connection closed', event ? {
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
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };

    const onAudio = async (data: ArrayBuffer) => {
      // Update heartbeat - we're receiving data, connection is alive
      lastHeartbeatRef.current = Date.now();
      
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
          const sceneId = fc.args?.scene_id;
          const reason = fc.args?.reason;
          
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
      // Clean up event listeners
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('error', onError);
      client.off('setupcomplete', onSetupComplete);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('toolcall', onToolCall);
    };
  }, [client, attemptReconnect]);

  // Connection health monitoring
  useEffect(() => {
    if (!connected) return;

    const HEALTH_CHECK_INTERVAL = 30000; // Check every 30 seconds
    const HEARTBEAT_TIMEOUT = 60000; // Consider dead if no activity for 60 seconds

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
    };
  }, []);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    
    setConnectionStatus('connecting');
    setConnectionError(null);
    isManualDisconnectRef.current = false; // Reset manual disconnect flag
    
    // CRITICAL FIX: Get fresh token before each connection attempt
    console.log('[CLIENT] Fetching fresh token before connecting...');
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
      console.log('[CLIENT] Fresh token received:', {
        hasToken: !!data.token,
        isFallback: data.fallback,
        isEphemeral: data.ephemeral,
      });
      
      if (!data.token) {
        throw new Error('No token returned from server');
      }
      
      // Create new client with fresh token
      const freshClient = new GenAILiveClient(data.token, model, { apiVersion: 'v1alpha' });
      setClient(freshClient);
      console.log('[CLIENT] New client created with fresh token');
      
      // Disconnect old client and connect with new one
      client.disconnect();
      await freshClient.connect(config);
      console.log('[CLIENT] Connected successfully with fresh token');
    } catch (error) {
      console.error('[CLIENT] Failed to connect with fresh token:', error);
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      throw error;
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
    
    client.disconnect();
    setConnected(false);
    setConnectionStatus('disconnected');
    setConnectionError(null);
  }, [setConnected, client]);

  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    connectionStatus,
    connectionError,
    disconnect,
    volume,
  };
}