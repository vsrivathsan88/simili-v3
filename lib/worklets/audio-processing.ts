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

const AudioRecordingWorklet = `
class AudioProcessingWorklet extends AudioWorkletProcessor {

  // send and clear buffer every 2048 samples,
  // which at 16khz is about 8 times a second
  buffer = new Int16Array(2048);

  // current write index
  bufferWriteIndex = 0;

  // Debug counters
  processCount = 0;
  silentChunks = 0;
  audioChunks = 0;

  // Resampling from browser's native rate (usually 48kHz) to 16kHz
  resampleRatio = sampleRate / 16000; // sampleRate is a global in AudioWorklet
  resampleBuffer = [];

  constructor() {
    super();
    this.hasAudio = false;
    console.log('[AudioWorklet] Initialized with sample rate:', sampleRate, 'Resample ratio:', this.resampleRatio);
  }

  /**
   * @param inputs Float32Array[][] [input#][channel#][sample#] so to access first inputs 1st channel inputs[0][0]
   * @param outputs Float32Array[][]
   */
  process(inputs) {
    this.processCount++;

    // More robust input validation
    if (!inputs || !inputs[0] || !inputs[0][0] || inputs[0][0].length === 0) {
      if (this.processCount % 100 === 0) {
        console.log('[AudioWorklet] No input data available', {
          hasInputs: !!inputs,
          hasFirstInput: !!(inputs && inputs[0]),
          hasChannel: !!(inputs && inputs[0] && inputs[0][0]),
          channelLength: inputs && inputs[0] && inputs[0][0] ? inputs[0][0].length : 0
        });
      }
      return true;
    }

    const channel0 = inputs[0][0];

    // Check if we're getting actual audio or silence
    let maxValue = 0;
    for (let i = 0; i < channel0.length; i++) {
      maxValue = Math.max(maxValue, Math.abs(channel0[i]));
    }

    if (maxValue < 0.001) {
      this.silentChunks++;
      if (this.silentChunks % 100 === 0) {
        console.log('[AudioWorklet] Receiving silence', {
          maxValue,
          silentChunks: this.silentChunks,
          audioChunks: this.audioChunks
        });
      }
    } else {
      this.audioChunks++;
      if (this.audioChunks <= 5 || this.audioChunks % 100 === 0) {
        console.log('[AudioWorklet] ✅ Receiving REAL AUDIO!', {
          maxValue,
          audioChunks: this.audioChunks,
          samples: channel0.slice(0, 10)
        });
      }
    }

    this.processChunk(channel0);
    return true;
  }

  sendAndClearBuffer(){
    // Check if buffer contains actual audio
    let maxBufferValue = 0;
    for (let i = 0; i < this.bufferWriteIndex; i++) {
      maxBufferValue = Math.max(maxBufferValue, Math.abs(this.buffer[i]));
    }

    if (this.audioChunks > 0 && this.audioChunks <= 5) {
      console.log('[AudioWorklet] Sending buffer', {
        maxValue: maxBufferValue,
        bufferSize: this.bufferWriteIndex,
        firstSamples: Array.from(this.buffer.slice(0, 10))
      });
    }

    this.port.postMessage({
      event: "chunk",
      data: {
        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
      },
    });
    this.bufferWriteIndex = 0;
  }

  processChunk(float32Array) {
    const l = float32Array.length;

    // Simple downsampling: take every nth sample where n = resampleRatio
    // This is a basic linear interpolation resampling
    for (let i = 0; i < l; i++) {
      this.resampleBuffer.push(float32Array[i]);
    }

    // Process resampled data
    while (this.resampleBuffer.length >= this.resampleRatio) {
      // Take the average of resampleRatio samples for downsampling
      let sum = 0;
      const samplesToAverage = Math.floor(this.resampleRatio);
      for (let j = 0; j < samplesToAverage; j++) {
        sum += this.resampleBuffer.shift() || 0;
      }
      const avgSample = sum / samplesToAverage;

      // Convert float32 -1 to 1 to int16 -32768 to 32767
      const clamped = Math.max(-1, Math.min(1, avgSample));
      const int16Value = Math.round(clamped * 32767);
      this.buffer[this.bufferWriteIndex++] = int16Value;

      if(this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer();
      }
    }
  }
}
`;

export default AudioRecordingWorklet;
