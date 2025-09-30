/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { useLogStore, useMilestoneStore } from '@/lib/state';
import { AudioRecorder } from '../../lib/audio-recorder';
import { ScreenRecorder } from '../../lib/screen-recorder';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Ear, 
  BrainCircuit, 
  Waves,
  Download,
  RotateCcw,
  Unplug,
  MoreVertical,
  MonitorPlay,
  Lock,
  Heart,
  Shield
} from 'lucide-react';
import './AvatarControlTray.css';

interface AvatarControlTrayProps {
  micVolume?: number;
  agentVolume?: number;
}

export default function AvatarControlTray({ micVolume = 0, agentVolume = 0 }: AvatarControlTrayProps) {
  const { connected, connect, disconnect, volume, client } = useLiveAPIContext();
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [screenRecorder] = useState(() => new ScreenRecorder());
  const [muted, setMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activity, setActivity] = useState<'listening' | 'thinking' | 'speaking'>('listening');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [screenDenied, setScreenDenied] = useState(false);
  
  // Tapback Memoji avatars - Apple style!
  const studentAvatar = 'https://www.tapback.co/api/avatar/simili-student.webp';
  const tutorAvatar = '/pi-removebg.png';

  // Use actual volume from LiveAPI context for agent audio
  const actualAgentVolume = volume || agentVolume;
  
  // Determine speaking state based on volume levels
  useEffect(() => {
    if (actualAgentVolume > 0.1) {
      setActivity('speaking');
    } else if (micVolume > 0.1) {
      setActivity('listening');
    } else if (connected) {
      setActivity('thinking');
    } else {
      setActivity('listening');
    }
  }, [micVolume, actualAgentVolume, connected]);

  // Audio recorder setup (same as original ControlTray)
  useEffect(() => {
    const onData = (base64: string) => {
      console.log('[MicInput] Sending audio chunk to Gemini:', base64.substring(0, 20) + '...', base64.length, 'bytes');
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    
    // Stop audio recorder first to prevent sending to old client
    audioRecorder.stop();
    audioRecorder.off('data', onData);
    
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData);
      audioRecorder.start();
    }
    
    return () => {
      audioRecorder.stop();
      audioRecorder.off('data', onData);
    };
  }, [connected, client, muted, audioRecorder]);

  // Screen recorder setup - sends JPEG frames to Gemini Live for vision
  useEffect(() => {
    let lastSendTime = 0;
    const MIN_SEND_INTERVAL = 2000; // Minimum 2 seconds between sends (matches frame interval)
    
    const onVideoData = (base64JpegData: string) => {
      const now = Date.now();
      
      // Throttle to avoid overwhelming the connection
      if (now - lastSendTime < MIN_SEND_INTERVAL) {
        console.log('[Vision] Throttling frame');
        return;
      }
      
      // CRITICAL: Don't send frames while user is speaking (prioritize audio)
      if (micVolume > 0.05) {
        console.log('[Vision] Pausing frames while user speaks');
        return;
      }
      
      // CRITICAL: Don't send frames while Pi is speaking (avoid overwhelming connection)
      if (agentVolume > 0.05) {
        console.log('[Vision] Pausing frames while Pi speaks');
        return;
      }
      
      // Only send if client is connected
      if (connected && client) {
        try {
          lastSendTime = now;
          console.log('[Vision] Sending JPEG frame to Gemini Live');
          
          // Send JPEG frame using correct Gemini Live format
          client.sendRealtimeInput([
            {
              mimeType: 'image/jpeg', // Correct MIME type per Gemini Live API docs
              data: base64JpegData,
            },
          ]);
        } catch (error) {
          console.error('[Vision] Error sending JPEG frame:', error);
        }
      }
    };

    const onStarted = () => {
      setScreenSharing(true);
      console.log('[Vision] Screen sharing started - Pi can see your screen!');
    };

    const onStopped = () => {
      setScreenSharing(false);
      console.log('[Vision] Screen sharing stopped');
    };

    const onError = (error: any) => {
      console.error('[Vision] Screen sharing error:', error);
      setScreenSharing(false);
    };
    
    // Set up listeners
    screenRecorder.on('data', onVideoData);
    screenRecorder.on('started', onStarted);
    screenRecorder.on('stopped', onStopped);
    screenRecorder.on('error', onError);
    
    // Start screen sharing when connected (now using correct JPEG frame approach)
    if (connected && !screenRecorder.isRecording()) {
      // Delay screen sharing to ensure connection is stable
      const startTimer = setTimeout(() => {
        if (connected && !screenRecorder.isRecording()) {
          console.log('[Vision] Starting JPEG frame capture (correct Gemini Live format)');
          screenRecorder.start().catch((err) => {
            console.warn('[Vision] User denied screen sharing or error occurred:', err);
            // Show gentle message about continuing without screen sharing
            setScreenDenied(true);
            // Continue without screen sharing (audio-only mode)
          });
        }
      }, 2000); // Wait 2 seconds for connection to stabilize
      
      return () => {
        clearTimeout(startTimer);
      };
    }
    
    // Only cleanup listeners, don't stop recording on every re-render
    return () => {
      screenRecorder.off('data', onVideoData);
      screenRecorder.off('started', onStarted);
      screenRecorder.off('stopped', onStopped);
      screenRecorder.off('error', onError);
    };
  }, [connected, client, screenRecorder, micVolume, agentVolume]);

  const handleConnectClick = async () => {
    if (!connected) {
      // Show the friendly permission modal first
      setShowPermissionModal(true);
    }
  };

  const handlePermissionConfirm = async () => {
    setShowPermissionModal(false);
    try {
      await connect();
      // Pi will automatically introduce itself based on system prompt
    } catch (error) {
      console.error('Connect failed:', error);
    }
  };

  const handlePermissionCancel = () => {
    setShowPermissionModal(false);
  };

  const handleDisconnectClick = () => {
    // Stop audio and screen recording immediately
    audioRecorder.stop();
    if (screenRecorder.isRecording()) {
      screenRecorder.stop();
    }
    
    // Disconnect from Live API
    disconnect();
    
    // Reset activity state
    setActivity('listening');
    setScreenSharing(false);
  };

  const handleMuteToggle = () => {
    setMuted(!muted);
  };

  const handleExportLogs = () => {
    const { turns } = useLogStore.getState();
    const logData = {
      conversation: turns.map(turn => ({
        ...turn,
        timestamp: turn.timestamp.toISOString(),
      })),
    };

    const jsonString = JSON.stringify(logData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `lesson-transcript-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const handleReset = () => {
    useLogStore.getState().clearTurns();
    useMilestoneStore.getState().resetProgress();
    setShowMenu(false);
  };

  const handleTestMilestone = () => {
    // For testing: achieve next unlocked milestone
    const { milestones, achieveMilestone } = useMilestoneStore.getState();
    const nextMilestone = milestones.find(m => !m.achieved);
    if (nextMilestone) {
      achieveMilestone(nextMilestone.id);
    }
    setShowMenu(false);
  };

  const getStatusIcon = () => {
    switch (activity) {
      case 'listening':
        return <Ear size={16} />;
      case 'thinking':
        return <BrainCircuit size={16} />;
      case 'speaking':
        return <Waves size={16} />;
      default:
        return <Ear size={16} />;
    }
  };

  const getStatusText = () => {
    switch (activity) {
      case 'listening':
        return 'Listening';
      case 'thinking':
        return 'Thinking';
      case 'speaking':
        return 'Speaking';
      default:
        return 'Ready';
    }
  };

  return (
    <>
      {/* Screen Denied Modal - Simple & Positive */}
      {screenDenied && (
        <div className="permission-modal-overlay" onClick={() => setScreenDenied(false)}>
          <div className="permission-modal simple" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="big-emoji">💬</div>
              <h2>No Problem!</h2>
            </div>
            
            <div className="modal-body">
              <p className="modal-intro" style={{ fontSize: '16px', margin: '24px 0' }}>
                We can still learn by talking! 😊
              </p>
            </div>
            
            <div className="modal-actions">
              <button className="modal-button confirm-big" onClick={() => setScreenDenied(false)} style={{ width: '100%' }}>
                Let's Go! 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Modal - Simple & Visual */}
      {showPermissionModal && (
        <div className="permission-modal-overlay" onClick={handlePermissionCancel}>
          <div className="permission-modal simple" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="big-emoji">🎨</div>
              <h2>Learn Fractions with Pi!</h2>
            </div>
            
            <div className="modal-body simple">
              <div className="simple-feature">
                <Lock size={32} />
                <p>Just you and me</p>
              </div>
              
              <div className="simple-feature">
                <Heart size={32} />
                <p>Safe to explore</p>
              </div>
              
              <div className="simple-feature">
                <Waves size={32} />
                <p>Take your time</p>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="modal-button cancel-simple" onClick={handlePermissionCancel}>
                Not Now
              </button>
              <button className="modal-button confirm-big" onClick={handlePermissionConfirm}>
                Start! 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="avatar-control-tray">
      {/* Student Avatar */}
      <div className="avatar-container student">
        <div
          className={`avatar-display ${connected ? 'connected' : 'disconnected'} ${muted ? 'muted' : ''} ${micVolume > 0.1 ? 'active' : ''}`}
          style={{ '--volume': micVolume } as React.CSSProperties}
        >
          <img src={studentAvatar} alt="You" className="avatar-image" />
          <div className="pulse-ring"></div>
          {muted && connected && (
            <div className="muted-indicator">
              <MicOff size={16} />
            </div>
          )}
        </div>
        <div className="avatar-label">You</div>
        <div className="waveform">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{
                '--delay': `${i * 0.1}s`,
                '--height': micVolume > 0.05 ? `${Math.random() * micVolume * 100}%` : '2px'
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {/* Simplified Controls */}
      <div className="center-controls">
        {/* Phone Call Style Controls */}
        <div className="call-controls">
          {!connected ? (
            <button
              className="call-button connect"
              onClick={handleConnectClick}
              aria-label="Connect to start conversation"
              title="Connect"
            >
              <Phone size={20} />
            </button>
          ) : (
            <div className="connected-controls">
              <button
                className={`call-button mute ${muted ? 'active' : ''}`}
                onClick={handleMuteToggle}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                className="call-button disconnect"
                onClick={handleDisconnectClick}
                aria-label="End conversation"
                title="Hang Up"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Private Session Indicator */}
        {connected && screenSharing && (
          <div className="private-session-indicator" title="Your safe space - just you and Pi">
            <Lock size={14} />
            <span className="private-text">Private Session</span>
            <Heart size={12} className="heart-icon" />
          </div>
        )}

        {/* Meatball Menu */}
        <div className="menu-container">
          <button
            className="menu-button"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="More options"
            aria-expanded={showMenu}
          >
            <MoreVertical size={20} />
          </button>
          {showMenu && (
            <div className="menu-dropdown">
              <button onClick={handleExportLogs} className="menu-item">
                <Download size={16} className="menu-icon" />
                <span>Export Transcript</span>
              </button>
              <button onClick={handleTestMilestone} className="menu-item">
                <span className="menu-icon" style={{ fontSize: '16px' }}>💎</span>
                <span>Test Milestone (Dev)</span>
              </button>
              <button onClick={handleReset} className="menu-item">
                <RotateCcw size={16} className="menu-icon" />
                <span>Reset Session</span>
              </button>
              <button onClick={() => disconnect()} className="menu-item">
                <Unplug size={16} className="menu-icon" />
                <span>Disconnect</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pi Avatar */}
      <div className="avatar-container tutor">
        <div
          className={`avatar-display ${activity === 'speaking' ? 'speaking active' : ''}`}
          style={{ '--volume': actualAgentVolume } as React.CSSProperties}
        >
          <img src={tutorAvatar} alt="Pi" className="avatar-image" />
          <div className="pulse-ring"></div>
        </div>
        <div className="avatar-label">Pi</div>
        <div className="waveform">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{
                '--delay': `${i * 0.1}s`,
                '--height': actualAgentVolume > 0.05 ? `${Math.random() * actualAgentVolume * 100}%` : '2px'
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      </div>
    </>
  );
}
