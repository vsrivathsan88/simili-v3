/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import EventEmitter from 'eventemitter3';

/**
 * ScreenRecorder captures the user's screen and extracts JPEG frames
 * to send to Gemini Live for real-time visual understanding.
 * 
 * Uses the correct approach per Gemini Live API docs:
 * - Capture screen with getDisplayMedia()
 * - Extract frames as JPEG images using Canvas
 * - Send as image/jpeg (not video/webm)
 */
export class ScreenRecorder {
  private emitter = new EventEmitter();
  
  // Expose on/off methods
  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);
  
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private captureInterval: NodeJS.Timeout | null = null;
  private recording: boolean = false;

  constructor(
    private width: number = 640,        // Low res to reduce bandwidth
    private height: number = 480,       // Low res to reduce bandwidth
    private frameInterval: number = 3000, // Capture frame every 3 seconds
    private jpegQuality: number = 0.6   // 60% quality for smaller files
  ) {}

  async start() {
    if (this.recording) {
      console.warn('[ScreenRecorder] Already recording');
      return;
    }

    try {
      console.log('[ScreenRecorder] Requesting screen share...');
      
      // Request screen sharing from user - prefer current tab for safety
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false, // We handle audio separately via AudioRecorder
        // Chrome-specific: prefer current tab, don't allow switching
        preferCurrentTab: true,
        surfaceSwitching: 'exclude',
        selfBrowserSurface: 'include'
      } as any); // Cast to any since these are experimental flags

      console.log('[ScreenRecorder] Screen share granted');

      // Create hidden video element to receive the stream
      this.video = document.createElement('video');
      this.video.style.display = 'none';
      this.video.srcObject = this.stream;
      this.video.play();

      // Create hidden canvas for frame extraction
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.context = this.canvas.getContext('2d');

      if (!this.context) {
        throw new Error('Failed to get canvas context');
      }

      // Handle when user stops sharing via browser UI
      this.stream.getVideoTracks()[0].onended = () => {
        console.log('[ScreenRecorder] Screen sharing stopped by user');
        this.stop();
        this.emitter.emit('stopped');
      };

      // Wait for video metadata to load
      await new Promise<void>((resolve) => {
        if (this.video!.readyState >= 2) {
          resolve();
        } else {
          this.video!.onloadedmetadata = () => resolve();
        }
      });

      // Start capturing frames at regular intervals
      this.captureInterval = setInterval(() => {
        this.captureFrame();
      }, this.frameInterval);

      this.recording = true;

      console.log(`[ScreenRecorder] Recording started (${this.width}x${this.height}, ${this.frameInterval}ms interval, ${this.jpegQuality} quality)`);
      this.emitter.emit('started');

      // Capture first frame immediately
      this.captureFrame();

    } catch (error) {
      console.error('[ScreenRecorder] Failed to start screen recording:', error);
      this.emitter.emit('error', error);
      throw error;
    }
  }

  private captureFrame() {
    if (!this.video || !this.canvas || !this.context || !this.recording) {
      return;
    }

    try {
      // Check if video has valid dimensions
      if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
        console.warn('[ScreenRecorder] Video not ready, skipping frame');
        return;
      }

      // Draw current video frame to canvas
      this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Convert canvas to JPEG base64
      const dataUrl = this.canvas.toDataURL('image/jpeg', this.jpegQuality);
      
      // Extract base64 data (remove "data:image/jpeg;base64," prefix)
      const base64Data = dataUrl.split(',')[1].trim();

      if (base64Data) {
        // Emit JPEG frame to be sent to Gemini Live
        this.emitter.emit('data', base64Data);
      }
    } catch (error) {
      console.error('[ScreenRecorder] Error capturing frame:', error);
      this.emitter.emit('error', error);
    }
  }

  stop() {
    if (!this.recording) {
      return;
    }

    console.log('[ScreenRecorder] Stopping screen recording...');

    // Stop frame capture interval
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    // Stop video element
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }

    // Stop all tracks in the stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Clean up canvas
    this.canvas = null;
    this.context = null;

    this.recording = false;
    console.log('[ScreenRecorder] Screen recording stopped');
  }

  isRecording(): boolean {
    return this.recording;
  }
}