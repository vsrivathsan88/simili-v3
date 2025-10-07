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

import {
  createWorketFromSrc,
  registeredWorklets,
} from './audioworklet-registry';

export class AudioStreamer {
  private sampleRate: number = 24000;
  private bufferSize: number = 7680;
  // A queue of audio buffers to be played. Each buffer is a Float32Array.
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;
  // Indicates if the stream has finished playing, e.g., interrupted.
  private isStreamComplete: boolean = false;
  private checkInterval: number | null = null;
  private scheduledTime: number = 0;
  private initialBufferTime: number = 0.1; //0.1 // 100ms initial buffer
  // Web Audio API nodes. source => gain => destination
  public gainNode: GainNode;
  public source: AudioBufferSourceNode;
  // Silent sink for analysis worklets to keep them in the graph without audible output
  private analysisSilence: GainNode;
  // Short fade to avoid clicks at buffer boundaries
  private perSourceFadeSeconds: number = 0.004;
  // Output conditioning nodes to reduce hiss/pops and level spikes
  private outputHighpass: BiquadFilterNode;
  private outputLowpass: BiquadFilterNode;
  private compressor: DynamicsCompressorNode;
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;
  // CRITICAL DEBUG: Track timing to detect duplicate streams
  private lastAddTime: number = 0;
  private sameTimestampCount: number = 0;
  // CRITICAL FIX: Track if we're in an interruption state to prevent audio overlap
  private isInterrupted: boolean = false;

  public onComplete = () => {};

  constructor(public context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.source = this.context.createBufferSource();
    // Build output chain: gain -> highpass -> lowpass -> compressor -> destination
    this.outputHighpass = this.context.createBiquadFilter();
    this.outputHighpass.type = 'highpass';
    this.outputHighpass.frequency.value = 80; // remove low rumble
    this.outputLowpass = this.context.createBiquadFilter();
    this.outputLowpass.type = 'lowpass';
    this.outputLowpass.frequency.value = 8000; // shave off HF hiss
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.gainNode.connect(this.outputHighpass);
    this.outputHighpass.connect(this.outputLowpass);
    this.outputLowpass.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    this.addPCM16 = this.addPCM16.bind(this);

    // Create a silent gain node that analysis worklets can connect to
    this.analysisSilence = this.context.createGain();
    this.analysisSilence.gain.value = 0;
    this.analysisSilence.connect(this.context.destination);
  }

  async addWorklet<T extends (d: any) => void>(
    workletName: string,
    workletSrc: string,
    handler: T
  ): Promise<this> {
    let workletsRecord = registeredWorklets.get(this.context);
    if (workletsRecord && workletsRecord[workletName]) {
      // the worklet already exists on this context
      // add the new handler to it
      workletsRecord[workletName].handlers.push(handler);
      return Promise.resolve(this);
      //throw new Error(`Worklet ${workletName} already exists on context`);
    }

    if (!workletsRecord) {
      registeredWorklets.set(this.context, {});
      workletsRecord = registeredWorklets.get(this.context)!;
    }

    // create new record to fill in as becomes available
    workletsRecord[workletName] = { handlers: [handler] };

    const src = createWorketFromSrc(workletName, workletSrc);
    await this.context.audioWorklet.addModule(src);
    const worklet = new AudioWorkletNode(this.context, workletName);

    //add the node into the map
    workletsRecord[workletName].node = worklet;

    return this;
  }

  /**
   * Converts a Uint8Array of PCM16 audio data into a Float32Array.
   * PCM16 is a common raw audio format, but the Web Audio API generally
   * expects audio data as Float32Arrays with samples normalized between -1.0 and 1.0.
   * This function handles that conversion.
   * @param chunk The Uint8Array containing PCM16 audio data.
   * @returns A Float32Array representing the converted audio data.
   */
  private _processPCM16Chunk(chunk: Uint8Array): Float32Array {
    const float32Array = new Float32Array(chunk.length / 2);
    const dataView = new DataView(chunk.buffer);

    for (let i = 0; i < chunk.length / 2; i++) {
      try {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768;
      } catch (e) {
        console.error(e);
      }
    }
    return float32Array;
  }

  addPCM16(chunk: Uint8Array) {
    const timestamp = Date.now();
    console.log(`[AudioStreamer] Received PCM16 chunk at ${timestamp}:`, chunk.length, 'bytes');
    
    // CRITICAL FIX: If we were interrupted and now getting new audio, reset for the new stream
    if (this.isInterrupted) {
      console.log('[AudioStreamer] 🔄 New audio stream detected after interruption - resetting');
      this.isInterrupted = false;
      this.isStreamComplete = false;
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
      // Clear any old audio from the queue
      this.audioQueue = [];
    }
    
    // FIXED: Adjusted threshold - Gemini Live legitimately sends chunks 0-10ms apart
    // Only warn if we get suspiciously many chunks in a very short time window
    const timeSinceLastAdd = timestamp - (this.lastAddTime || 0);
    if (this.lastAddTime && timeSinceLastAdd === 0) {
      // Multiple chunks in the exact same millisecond might indicate an issue
      this.sameTimestampCount = (this.sameTimestampCount || 0) + 1;
      if (this.sameTimestampCount > 5) {
        console.warn(`[AudioStreamer] ⚠️  POTENTIAL DUPLICATE STREAM: ${this.sameTimestampCount} chunks at same timestamp!`);
      }
    } else {
      this.sameTimestampCount = 0; // Reset counter when timestamps differ
    }
    this.lastAddTime = timestamp;
    
    // Reset the stream complete flag when a new chunk is added.
    this.isStreamComplete = false;
    // Process the chunk into a Float32Array
    let processingBuffer = this._processPCM16Chunk(chunk);
    console.log('[AudioStreamer] Processed to', processingBuffer.length, 'float32 samples');
    // Add the processed buffer to the queue if it's larger than the buffer size.
    // This is to ensure that the buffer is not too large.
    while (processingBuffer.length >= this.bufferSize) {
      const buffer = processingBuffer.slice(0, this.bufferSize);
      this.audioQueue.push(buffer);
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }
    // Add the remaining buffer to the queue if it's not empty.
    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer);
    }
    console.log('[AudioStreamer] Queue size:', this.audioQueue.length, 'buffers, isPlaying:', this.isPlaying);
    // Start playing if not already playing.
    if (!this.isPlaying) {
      console.log('[AudioStreamer] Starting playback, context state:', this.context.state);
      this.isPlaying = true;
      // Initialize scheduledTime only when we start playing
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      this.scheduleNextBuffer();
    }
    // NOTE: Removed the else clause that was causing duplicate scheduling
    // The scheduleNextBuffer method already handles queuing properly
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(
      1,
      audioData.length,
      this.sampleRate
    );
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  private isScheduling = false;
  
  private scheduleNextBuffer() {
    // Prevent concurrent scheduling to avoid duplicate buffers
    if (this.isScheduling) {
      console.log('[AudioStreamer] Already scheduling, skipping duplicate call');
      return;
    }
    
    this.isScheduling = true;
    
    // CRITICAL FIX: More aggressive scheduling (1 second ahead instead of 0.2)
    const SCHEDULE_AHEAD_TIME = 1.0;
    
    console.log('[AudioStreamer] scheduleNextBuffer called, queue length:', this.audioQueue.length, 'scheduledTime:', this.scheduledTime, 'currentTime:', this.context.currentTime);

    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = this.audioQueue.shift()!;
      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();
      const sourceGain = this.context.createGain();

      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) {
          this.endOfQueueAudioSource.onended = null;
        }
        this.endOfQueueAudioSource = source;
        source.onended = () => {
          if (
            !this.audioQueue.length &&
            this.endOfQueueAudioSource === source
          ) {
            this.endOfQueueAudioSource = null;
            this.onComplete();
          }
        };
      }

      source.buffer = audioBuffer;
      
      // Proper audio routing with per-buffer fade to avoid clicks
      // Route: source → sourceGain (per-chunk fade) → gainNode → destination
      source.connect(sourceGain);
      sourceGain.connect(this.gainNode);

      const worklets = registeredWorklets.get(this.context);

      if (worklets) {
        // Route source to analysis worklets ONLY for metering; keep them silent
        Object.entries(worklets).forEach(([workletName, graph]) => {
          const { node, handlers } = graph;
          if (node) {
            // Connect source to worklet for analysis
            source.connect(node);
            node.port.onmessage = function (ev: MessageEvent) {
              handlers.forEach(handler => {
                handler.call(node.port, ev);
              });
            };
            // Keep analysis path silent but active in the graph
            node.connect(this.analysisSilence);
          }
        });
      }
      
      // CRITICAL FIX: Ensure we start playback immediately if context is running
      // Don't let scheduledTime drift too far into the future
      const maxDrift = 2.0; // Maximum 2 seconds of drift
      if (this.scheduledTime - this.context.currentTime > maxDrift) {
        console.warn('[AudioStreamer] scheduledTime drifted too far, resetting:', this.scheduledTime - this.context.currentTime, 'seconds');
        this.scheduledTime = this.context.currentTime;
      }
      
      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      const endTime = startTime + audioBuffer.duration;
      const fade = Math.min(this.perSourceFadeSeconds, audioBuffer.duration / 4);

      // Apply micro fade in/out to avoid clicks at chunk boundaries
      try {
        sourceGain.gain.setValueAtTime(0, startTime);
        sourceGain.gain.linearRampToValueAtTime(1, startTime + fade);
        sourceGain.gain.setValueAtTime(1, endTime - fade);
        sourceGain.gain.linearRampToValueAtTime(0, endTime);
      } catch (e) {
        // Guard against state errors on very short buffers
      }

      console.log('[AudioStreamer] Scheduling source.start() at', startTime, 'currentTime:', this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = endTime;
      console.log('[AudioStreamer] Next scheduled time:', this.scheduledTime, 'buffer duration:', audioBuffer.duration);
    }

    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false;
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      } else {
        if (!this.checkInterval) {
          this.checkInterval = window.setInterval(() => {
            if (this.audioQueue.length > 0) {
              this.scheduleNextBuffer();
              // Clear the interval once we've scheduled
              if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
              }
            }
          }, 100) as unknown as number;
        }
      }
    } else {
      const nextCheckTime =
        (this.scheduledTime - this.context.currentTime) * 1000;
      setTimeout(
        () => this.scheduleNextBuffer(),
        Math.max(0, nextCheckTime - 50)
      );
    }
    
    // Reset scheduling flag when done
    this.isScheduling = false;
  }

  stop() {
    console.log('[AudioStreamer] 🛑 STOP called - immediate audio cutoff');
    this.isPlaying = false;
    this.isStreamComplete = true;
    this.isInterrupted = true; // CRITICAL: Mark as interrupted to prevent new audio
    
    // CRITICAL FIX: Immediately clear the queue to prevent any buffered audio from playing
    this.audioQueue = [];
    this.scheduledTime = this.context.currentTime;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // CRITICAL FIX: Immediate gain cutoff (no ramp) for instant silence during interruption
    try {
      this.gainNode.gain.setValueAtTime(0, this.context.currentTime);
      console.log('[AudioStreamer] ✅ Audio gain set to 0 immediately');
    } catch (e) {
      // Guard against timing issues
      console.warn('[AudioStreamer] Failed to set immediate gain:', e);
    }

    // CRITICAL FIX: Stop all currently playing audio sources immediately
    if (this.endOfQueueAudioSource) {
      try {
        this.endOfQueueAudioSource.stop(this.context.currentTime);
        console.log('[AudioStreamer] ✅ Stopped end-of-queue audio source');
      } catch (e) {
        // Source may already be stopped
      }
      this.endOfQueueAudioSource = null;
    }

    // Reset scheduling flag to prevent any pending operations
    this.isScheduling = false;

    setTimeout(() => {
      try {
        this.gainNode.disconnect();
        this.gainNode = this.context.createGain();
        this.gainNode.connect(this.outputHighpass);
        // Reset gain to 1 for next audio session
        this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
        console.log('[AudioStreamer] ✅ Audio nodes reset and reconnected');
      } catch (e) {
        console.warn('[AudioStreamer] Error during node reset:', e);
      }
    }, 50); // Reduced timeout for faster recovery
  }

  async resume() {
    // Only resume the audio context if it's suspended
    // Don't reset interrupted state here - that's handled in addPCM16 when new audio arrives
    if (this.context.state === 'suspended') {
      await this.context.resume();
      console.log('[AudioStreamer] Audio context resumed from suspended state');
    }
  }

  complete() {
    this.isStreamComplete = true;
    this.onComplete();
  }
}

// // Usage example:
// const audioStreamer = new AudioStreamer();
//
// // In your streaming code:
// function handleChunk(chunk: Uint8Array) {
//   audioStreamer.handleChunk(chunk);
// }
//
// // To start playing (call this in response to a user interaction)
// await audioStreamer.resume();
//
// // To stop playing
// // audioStreamer.stop();
