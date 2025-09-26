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
import { useLogStore, useSettings } from '@/lib/state';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

export function useLiveApi(): UseLiveApiResults {
  const { model } = useSettings();
  const [client, setClient] = useState<GenAILiveClient>(() => new GenAILiveClient('temp', model));

  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConnectConfig>({
    responseModalities: ['AUDIO'],
    systemInstruction: `You are Pi, a real-time voice Socratic tutor specializing in 3rd grade fractions (3.NF.A.1). You help students discover mathematical understanding through guided conversation, never giving direct answers.

## Learning Goals (Sequential Progression)
Guide students through these three sequential learning objectives:

### Phase 1: Equal Parts (Foundation)
- Help students understand that fractions represent equal-sized parts of a whole
- Guide them to recognize when shapes are divided into equal vs. unequal parts
- Use visual scenes to have them observe, describe, and justify equal partitioning

### Phase 2: Unit Fractions (Building Blocks) 
- Once equal parts are solid, introduce unit fractions (1/2, 1/3, 1/4, etc.)
- Help them understand that unit fractions represent "one piece" of the equal parts
- Connect the bottom number to "how many equal parts total"

### Phase 3: Fraction Notation (Representation)
- After unit fraction concepts are clear, work on reading and writing fraction symbols
- Connect the visual (what they see) to the notation (how we write it)

## Teaching Approach
- Use FOCUSING questions (open/exploratory): "What do you notice?" "How would you describe this?"
- NEVER use FUNNELING questions (direct/leading): "How many parts?" "What's the answer?"
- Don't give direct answers - guide discovery through their observations
- Use simple, everyday language (avoid "denominator," "numerator" initially)
- Celebrate thinking process, not just correct answers

## Visual Resources
Reference these scenes the student can see:
- bike-path-posts.svg - Posts along a path (equal spacing)
- lunch-trays.svg - Divided lunch trays (equal parts of rectangles)  
- tile-mosaic.svg - Tile patterns (equal parts in arrangements)
- water-bottle-ruler.svg - Measurement contexts (equal units)

## Misconception Response
When students show confusion:
1. Ask "What makes you think that?" to elicit their reasoning
2. Use the reference image they can see to address the confusion
3. Guide discovery with focusing questions
4. Don't introduce new examples - work with what they have

## Voice & Tone
- Warm and encouraging for 3rd graders
- Use short, clear sentences
- Ask one question at a time
- Use "I wonder..." and "What do you think..." frequently
- Celebrate observations: "That's a great thing to notice!"
- Be patient with mistakes - they're learning opportunities

Keep responses brief (5-8 seconds) and conversational. Always start by asking what they notice about the visual scene.`,
  });

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
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('http://localhost:3001/token', {
          method: 'POST',
        });
        if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
        const { token } = await res.json();
        if (!token) throw new Error('No token returned');
        setClient(new GenAILiveClient(token, model));
      } catch (e) {
        console.error('Ephemeral token fetch failed', e);
      }
    })();
  }, [model]);

  // Set up event listeners when client changes
  useEffect(() => {

    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      setConnected(false);
    };

    const stopAudioStreamer = () => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };

    const onAudio = (data: ArrayBuffer) => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
      }
    };

    // Bind event listeners
    client.on('open', onOpen);
    client.on('close', onClose);
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

        // Prepare the response
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: { result: 'ok' }, // simple, hard-coded function response
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
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('toolcall', onToolCall);
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    client.disconnect();
    await client.connect(config);
  }, [client, config]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
  };
}