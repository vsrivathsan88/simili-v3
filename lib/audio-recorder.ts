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

import { audioContext } from './utils';
import AudioRecordingWorklet from './worklets/audio-processing';
import VolMeterWorket from './worklets/vol-meter';

import { createWorketFromSrc } from './audioworklet-registry';
import EventEmitter from 'eventemitter3';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// FIX: Refactored to use composition over inheritance for EventEmitter
export class AudioRecorder {
  // FIX: Use an internal EventEmitter instance
  private emitter = new EventEmitter();

  // FIX: Expose on/off methods
  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {}

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media');
    }

    // CRITICAL FIX: Prevent multiple concurrent starts
    if (this.starting) {
      console.log('[AudioRecorder] Start already in progress, waiting...');
      await this.starting;
      return;
    }

    if (this.recording) {
      console.log('[AudioRecorder] Already recording, skipping start');
      return;
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        // CRITICAL FIX: Enable echo cancellation, noise suppression, and auto gain
        // This prevents speaker output from being captured by the microphone
        console.log('[AudioRecorder] Requesting microphone permission...');
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: this.sampleRate,
          }
        });

        // CRITICAL FIX: Validate stream before using it
        if (!this.stream || !(this.stream instanceof MediaStream)) {
          throw new Error('Failed to get valid MediaStream from getUserMedia');
        }

        // Debug audio track information
        const audioTrack = this.stream.getAudioTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          console.log('[AudioRecorder] ✅ Got microphone stream!', {
            trackLabel: audioTrack.label,
            trackEnabled: audioTrack.enabled,
            trackMuted: audioTrack.muted,
            trackReadyState: audioTrack.readyState,
            settings: {
              deviceId: settings.deviceId,
              sampleRate: settings.sampleRate,
              channelCount: settings.channelCount,
              echoCancellation: settings.echoCancellation,
              noiseSuppression: settings.noiseSuppression,
              autoGainControl: settings.autoGainControl,
            }
          });
        } else {
          console.error('[AudioRecorder] ❌ No audio track found in stream!');
        }
        // CRITICAL FIX: Create a fresh audio context with proper sample rate
        // Note: Most browsers don't support 16kHz natively, so we'll use the default and resample
        this.audioContext = await audioContext({ id: 'audio-in' });

        // CRITICAL FIX: Validate audio context
        if (!this.audioContext) {
          throw new Error('Failed to create AudioContext');
        }

        console.log('[AudioRecorder] Audio context created:', {
          state: this.audioContext.state,
          sampleRate: this.audioContext.sampleRate,
          targetRate: this.sampleRate
        });

        // Resume if suspended
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
          console.log('[AudioRecorder] Resumed suspended AudioContext');
        }
        
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        console.log('[AudioRecorder] Media stream source created successfully');
      } catch (error) {
        console.error('[AudioRecorder] Failed to initialize audio input:', error);
        reject(error);
        return;
      }

      const workletName = 'audio-recorder-worklet';
      const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

      await this.audioContext.audioWorklet.addModule(src);
      this.recordingWorklet = new AudioWorkletNode(
        this.audioContext,
        workletName
      );

      console.log('[AudioRecorder] Recording worklet created, connecting to source...');

      let dataEventCount = 0;
      this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
        // Worklet processes recording floats and messages converted buffer
        const arrayBuffer = ev.data.data.int16arrayBuffer;

        if (arrayBuffer) {
          dataEventCount++;
          const arrayBufferString = arrayBufferToBase64(arrayBuffer);

          // Debug first few chunks
          if (dataEventCount <= 5) {
            // Check if the buffer contains actual audio
            const int16Array = new Int16Array(arrayBuffer);
            let maxValue = 0;
            for (let i = 0; i < int16Array.length; i++) {
              maxValue = Math.max(maxValue, Math.abs(int16Array[i]));
            }
            console.log('[AudioRecorder] Data event #' + dataEventCount, {
              bufferSize: arrayBuffer.byteLength,
              maxValue: maxValue,
              base64Preview: arrayBufferString.substring(0, 50),
              firstSamples: Array.from(int16Array.slice(0, 10))
            });
          }

          // FIX: Changed this.emit to this.emitter.emit
          this.emitter.emit('data', arrayBufferString);
        }
      };
      this.source.connect(this.recordingWorklet);
      console.log('[AudioRecorder] Connected source to recording worklet');

      // CRITICAL: Send a test message to verify the worklet is responding
      this.recordingWorklet.port.postMessage({ type: 'ping' });

      // vu meter worklet
      const vuWorkletName = 'vu-meter';
      await this.audioContext.audioWorklet.addModule(
        createWorketFromSrc(vuWorkletName, VolMeterWorket)
      );
      this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
      let volumeEventCount = 0;
      this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
        volumeEventCount++;
        const volume = ev.data.volume;

        // Log first few volume events and then periodically
        if (volumeEventCount <= 5 || volumeEventCount % 100 === 0) {
          console.log('[AudioRecorder] Volume event #' + volumeEventCount, {
            volume: volume,
            isLoud: volume > 0.01 ? '🔊 SOUND DETECTED!' : '🔇 silence'
          });
        }

        // FIX: Changed this.emit to this.emitter.emit
        this.emitter.emit('volume', ev.data.volume);
      };

      this.source.connect(this.vuWorklet);
      this.recording = true;
      resolve();
    }).finally(() => {
      // Ensure starting flag is reset on success or failure
      this.starting = null;
    });
    return this.starting;
  }

  stop() {
    if (!this.recording && !this.starting) {
      return;
    }
    console.log('[AudioRecorder] Stopping...');

    const handleStop = () => {
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.recordingWorklet?.disconnect();
      this.vuWorklet?.disconnect();

      this.stream = undefined;
      this.source = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;

      // CRITICAL FIX: Reset recording state
      this.recording = false; 
      console.log('[AudioRecorder] Stopped.');
    };

    if (this.starting) {
      console.log('[AudioRecorder] Stop called while start was in progress. Will stop after start completes.');
      this.starting.then(handleStop).catch(handleStop);
    } else {
      handleStop();
    }
  }

  async destroy() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      console.log('[AudioRecorder] Closing AudioContext.');
      await this.audioContext.close();
      this.audioContext = undefined;
    }
  }
}
