import React, { useState, useEffect, useRef } from 'react';
import { useLiveAPIContext } from '../../hooks/media/use-live-api-context';
import { Volume2, Loader } from 'lucide-react';
import { AudioRecorder } from '../../lib/audio-recorder';
import './AvatarControlTray.css';

// Sound effect helper - use global audioContext to avoid autoplay blocks
const playSound = (frequency: number, duration: number, type: 'success' | 'start' | 'yourTurn' | 'error' = 'success') => {
  try {
    // Use the global audioContext from utils
    const audioContext = (window as any).audioContext;
    if (!audioContext) return;

    // Resume if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (err) {
    // Silently fail - sound effects are nice-to-have
    console.warn('[Sound] Failed to play sound:', err);
  }
};

const sounds = {
  connected: () => {
    // Cheerful ascending chime
    playSound(523.25, 0.1, 'success'); // C
    setTimeout(() => playSound(659.25, 0.15, 'success'), 100); // E
  },
  piStartsSpeaking: () => {
    // Gentle bloop
    playSound(440, 0.1, 'start');
  },
  yourTurn: () => {
    // Encouraging ding
    playSound(880, 0.2, 'yourTurn');
  },
  error: () => {
    // Gentle descending tone
    playSound(440, 0.15, 'error');
    setTimeout(() => playSound(349.23, 0.2, 'error'), 150);
  }
};

export default function AvatarControlTray() {
  const { connect, disconnect, client, connected } = useLiveAPIContext();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeakingStateRef = useRef(false);
  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasGreetedRef = useRef(false);
  const sendingAudioRef = useRef(false); // Track if audio is being sent
  const volumeLogCountRef = useRef(0); // Track volume log count
  const audioChunkCountRef = useRef(0); // Track audio chunk count
  const [audioRecorder] = useState(() => new AudioRecorder(16000)); // 16kHz required for Gemini Live input

  // Memoji URLs
  const studentAvatar = 'https://www.tapback.co/api/avatar/simili-student.webp';
  const piAvatar = '/pi-removebg.png';

  // Phone ringing sound
  const playRingSound = () => {
    // Classic phone ring pattern: two-tone
    playSound(800, 0.2, 'success');
    setTimeout(() => playSound(900, 0.2, 'success'), 250);
  };

  // Start ringing when component mounts
  useEffect(() => {
    setIsRinging(true);
    playRingSound();

    // Ring every 3 seconds
    ringIntervalRef.current = setInterval(() => {
      playRingSound();
    }, 3000);

    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
      }
    };
  }, []);

  // Handle connection: stop ringing, play sound, request screen share FIRST, then greet
  useEffect(() => {
    console.log('[AvatarControlTray] Connection state:', { connected, hasClient: !!client });
    if (connected) {
      // Stop ringing
      setIsRinging(false);
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }

      sounds.connected();

      // Session setup with proper greeting trigger
      const setupSession = async () => {
        if (!hasGreetedRef.current) {
          hasGreetedRef.current = true;

          // Small delay for connection to stabilize
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Don't send any message - let Pi initiate based on system prompt
          console.log('[AvatarControlTray] Waiting for Pi to initiate greeting...');

          // TEMPORARILY DISABLED: Screen sharing to debug dialogue issues
          // setTimeout(() => {
          //   console.log('[AvatarControlTray] Starting screen share with delay...');
          //   startScreenShare();
          // }, 5000); // 5 second delay after greeting
          console.log('[AvatarControlTray] Screen sharing DISABLED for debugging');
        }
      };

      setupSession();
    }
  }, [connected, client]);

  // CRITICAL: Start audio recording when connected (so Pi can hear you!)
  useEffect(() => {
    // Reset counters when effect runs
    audioChunkCountRef.current = 0;
    volumeLogCountRef.current = 0;
    let volumeSamples: number[] = [];

    const onData = (base64: string) => {
      if (!client || !connected) {
        console.log('[AvatarControlTray] No client available, skipping audio chunk');
        return;
      }

      // Mark that we're sending audio
      sendingAudioRef.current = true;
      audioChunkCountRef.current++;

      // Log EVERY chunk to see if audio is being sent at all
      console.log(`[Audio] Sending chunk #${audioChunkCountRef.current} (16kHz PCM, size: ${base64.length} bytes)`);

      if (audioChunkCountRef.current === 1) {
        console.log('[Audio] FIRST CHUNK SENT - Pi should be able to hear now!');
        console.log('[Audio] Base64 sample (first 100 chars):', base64.substring(0, 100));
      }

      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);

      // Clear the flag after a short delay
      setTimeout(() => {
        sendingAudioRef.current = false;
      }, 50);
    };

    const onVolume = (volume: number) => {
      volumeSamples.push(volume);
      if (volumeSamples.length > 50) {
        volumeSamples.shift();
      }

      volumeLogCountRef.current++;
      // Log first few volume events, then periodically, and whenever there's significant volume
      if (volumeLogCountRef.current <= 5 || volumeLogCountRef.current % 100 === 0 || volume > 0.01) {
        const avgVolume = volumeSamples.reduce((a, b) => a + b, 0) / volumeSamples.length;
        console.log(`[Audio Volume] Event #${volumeLogCountRef.current}:`, {
          current: volume.toFixed(4),
          average: avgVolume.toFixed(4),
          status: volume > 0.1 ? '🎤 SPEAKING' : volume > 0.01 ? '🔊 sound' : '🔇 silence'
        });
      }
    };

    // Stop audio recorder first to prevent overlap
    audioRecorder.stop();
    audioRecorder.off('data', onData);
    audioRecorder.off('volume', onVolume);

    if (connected && audioRecorder && client) {
      console.log('[AvatarControlTray] Starting audio recording for 16kHz input...');
      console.log('[AvatarControlTray] AudioRecorder instance:', audioRecorder);
      console.log('[AvatarControlTray] Client instance:', client);
      console.log('[AvatarControlTray] Connected status:', connected);

      audioRecorder.on('data', onData);
      audioRecorder.on('volume', onVolume);

      audioRecorder.start().then(() => {
        console.log('[AvatarControlTray] ✅ Audio recording started successfully');
        console.log('[AvatarControlTray] Microphone is now active - speak now!');
      }).catch((err) => {
        console.error('[AvatarControlTray] ❌ CRITICAL: Failed to start audio recording:', err);
        alert('Microphone access failed! Please allow microphone access and refresh.');
      });
    } else {
      console.error('[AvatarControlTray] ❌ CANNOT START AUDIO:', {
        connected,
        hasRecorder: !!audioRecorder,
        hasClient: !!client
      });
    }

    return () => {
      audioRecorder.stop();
      audioRecorder.off('data', onData);
      audioRecorder.off('volume', onVolume);
    };
  }, [connected, client, audioRecorder]);

  // Listen for audio events to show visual feedback + play sounds
  useEffect(() => {
    if (!client) return;

    const handleAudio = () => {
      // Play sound only when Pi starts speaking (not on every audio chunk)
      if (!lastSpeakingStateRef.current) {
        sounds.piStartsSpeaking();
        lastSpeakingStateRef.current = true;
      }
      setIsSpeaking(true);
      // Don't reset here - let turncomplete handle it
    };

    const handleInputTranscription = (data: any) => {
      // Log to debug VAD detection
      console.log('[AvatarControlTray] Input transcription detected:', data);
      setIsListening(true);
    };

    const handleTurnComplete = () => {
      console.log('[AvatarControlTray] Turn complete - resetting states');
      setIsListening(false);
      setIsSpeaking(false);
      lastSpeakingStateRef.current = false;
      // Play "your turn" sound
      sounds.yourTurn();
    };

    client.on('audio', handleAudio);
    client.on('inputTranscription', handleInputTranscription);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('audio', handleAudio);
      client.off('inputTranscription', handleInputTranscription);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client]);

  // Screen sharing with proper throttling to prevent breaking audio
  const startScreenShare = async () => {
    if (!connected || !client) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Request lower resolution to reduce bandwidth
          width: { ideal: 768 },
          height: { ideal: 768 }
        },
      });
      screenStreamRef.current = stream;
      console.log('[ScreenShare] Started with 1 FPS throttling');

      // CRITICAL FIX: Resume audio context after permission dialog
      const audioContext = (window as any).audioContext;
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('[ScreenShare] Audio context resumed after dialog');
      }

      // Setup video capture with optimized settings
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Send frames at 1 FPS as per Gemini Live API specs
      let frameCount = 0;
      screenIntervalRef.current = setInterval(() => {
        if (!video.videoWidth || !video.videoHeight) return;

        frameCount++;
        console.log(`[ScreenShare] Capturing frame #${frameCount}`);

        // Resize to 768x768 as recommended for Gemini Live
        const targetSize = 768;
        canvas.width = targetSize;
        canvas.height = targetSize;

        // Calculate crop/scale to fit
        const scale = Math.max(targetSize / video.videoWidth, targetSize / video.videoHeight);
        const scaledWidth = video.videoWidth * scale;
        const scaledHeight = video.videoHeight * scale;
        const offsetX = (targetSize - scaledWidth) / 2;
        const offsetY = (targetSize - scaledHeight) / 2;

        ctx.drawImage(video, offsetX, offsetY, scaledWidth, scaledHeight);

        // Convert to JPEG with lower quality to reduce size
        canvas.toBlob((blob) => {
          if (blob && client && connected) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];

              // Check if audio is being sent
              const sendFrame = () => {
                // If audio is being sent, wait a bit and try again
                if (sendingAudioRef.current) {
                  console.log('[ScreenShare] Deferring frame - audio in progress');
                  setTimeout(sendFrame, 100);
                  return;
                }

                // Send screen frame when audio is not active
                console.log(`[ScreenShare] Sending frame #${frameCount} (768x768, ${blob.size} bytes)`);
                client.sendRealtimeInput([{
                  mimeType: 'image/jpeg',
                  data: base64
                }]);
              };

              sendFrame();
            };
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', 0.5); // Lower quality to reduce bandwidth
      }, 1000); // 1 FPS as per API documentation

      // Handle stream end (don't disconnect lesson)
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
        console.log('[ScreenShare] Stream ended - lesson continues without vision');
      };
    } catch (err) {
      console.log('[ScreenShare] User cancelled or not available - continuing without vision');
      // Don't stop the lesson if screen share fails
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    console.log('[ScreenShare] Stopped');
  };

  // Cleanup screen share on unmount
  useEffect(() => {
    return () => {
      stopScreenShare();
    };
  }, []);

  const handleAnswerCall = async () => {
    // Stop ringing immediately on click
    setIsRinging(false);
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }

    setIsConnecting(true);
    await connect();
    setIsConnecting(false);
  };

  const handleEndLesson = () => {
    console.log('[AvatarControlTray] Ending lesson...');
    stopScreenShare();
    disconnect();
    hasGreetedRef.current = false; // Reset for next session
  };

  return (
    <>
      {/* Full-Screen Incoming Call Popup */}
      {(isRinging || isConnecting) && (
        <div className={`incoming-call-overlay ${isConnecting ? 'answering' : ''}`}>
          <div className="incoming-call-content">
            {/* Large Pi Avatar */}
            <div
              className={`incoming-call-avatar ${isRinging ? 'ringing' : ''} ${isConnecting ? 'connecting' : ''}`}
              onClick={!isConnecting ? handleAnswerCall : undefined}
              style={{ cursor: !isConnecting ? 'pointer' : 'default' }}
            >
              <img src={piAvatar} alt="Pi" className="avatar-image" />
              {isRinging && <div className="ring-indicator-large">📞</div>}
              {isConnecting && <Loader size={48} className="spinning connecting-loader-large" />}
            </div>

            {/* Call Status */}
            <div className="incoming-call-text">
              {isRinging && (
                <>
                  <h1 className="call-title">Pi is calling...</h1>
                  <p className="call-subtitle">Click Pi to answer</p>
                </>
              )}
              {isConnecting && (
                <>
                  <h1 className="call-title">Answering...</h1>
                  <p className="call-subtitle">Getting ready for your lesson</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Control Tray (only visible when connected) */}
      {connected && (
        <div className="avatar-control-tray-redesign">

          {/* Student Avatar - Left */}
          <div className="avatar-container student">
            <div className={`avatar-circle ${isListening ? 'listening' : ''}`}>
              <img src={studentAvatar} alt="You" className="avatar-image" />
              {isListening && (
                <>
                  <div className="pulse-ring" />
                  <div className="audio-visualizer">
                    <div className="audio-bar" />
                    <div className="audio-bar" />
                    <div className="audio-bar" />
                    <div className="audio-bar" />
                    <div className="audio-bar" />
                  </div>
                </>
              )}
            </div>
            <span className="avatar-label">You</span>
          </div>

          {/* Center Control */}
          <div className="center-control">
            <button onClick={handleEndLesson} className="end-lesson-button">
              End Lesson
            </button>
          </div>

          {/* Pi Avatar - Right */}
          <div className="avatar-container pi">
            <div className={`avatar-circle ${isSpeaking ? 'speaking' : ''} ${connected ? 'connected' : ''}`}>
              <img src={piAvatar} alt="Pi" className="avatar-image" />
              {isSpeaking && <div className="pulse-ring" />}
            </div>
            <span className="avatar-label">Pi</span>
          </div>
        </div>
      )}
    </>
  );
}
