/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { useLogStore } from '@/lib/state';
import { AudioRecorder } from '../../lib/audio-recorder';
import './AvatarControlTray.css';

interface AvatarControlTrayProps {
  micVolume?: number;
  agentVolume?: number;
}

export default function AvatarControlTray({ micVolume = 0, agentVolume = 0 }: AvatarControlTrayProps) {
  const { connected, connect, disconnect, volume, client } = useLiveAPIContext();
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activity, setActivity] = useState<'listening' | 'thinking' | 'speaking'>('listening');

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

  const handleConnectClick = async () => {
    if (!connected) {
      try {
        await connect();
      } catch (error) {
        console.error('Connect failed:', error);
      }
    }
  };

  const handleDisconnectClick = () => {
    disconnect();
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
    setShowMenu(false);
  };

  const getStatusIcon = () => {
    switch (activity) {
      case 'listening':
        return '👂';
      case 'thinking':
        return '💭';
      case 'speaking':
        return '🌊';
      default:
        return '👂';
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
    <div className="avatar-control-tray">
      {/* Student Avatar */}
      <div className="avatar-container student">
        <div
          className={`avatar-display ${connected ? 'connected' : 'disconnected'} ${muted ? 'muted' : ''}`}
          style={{ '--volume': micVolume } as React.CSSProperties}
        >
          <div className="avatar-emoji">🧒</div>
          <div className="pulse-ring"></div>
          {muted && connected && (
            <div className="muted-indicator">
              <span>🔇</span>
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

      {/* Status and Controls */}
      <div className="center-controls">
        <div className="status-chip">
          <span className="status-icon">{getStatusIcon()}</span>
          <span className="status-text">{getStatusText()}</span>
        </div>
        
        {/* Phone Call Style Controls */}
        <div className="call-controls">
          {!connected ? (
            <button
              className="call-button connect"
              onClick={handleConnectClick}
              aria-label="Connect to start conversation"
              title="Connect"
            >
              <span className="call-icon">📞</span>
            </button>
          ) : (
            <div className="connected-controls">
              <button
                className={`call-button mute ${muted ? 'active' : ''}`}
                onClick={handleMuteToggle}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                title={muted ? 'Unmute' : 'Mute'}
              >
                <span className="call-icon">{muted ? '🔇' : '🎤'}</span>
              </button>
              <button
                className="call-button disconnect"
                onClick={handleDisconnectClick}
                aria-label="End conversation"
                title="Hang Up"
              >
                <span className="call-icon">📵</span>
              </button>
            </div>
          )}
        </div>
        
        <div className="connection-status">
          {connected ? (
            <div className="connected-badge">
              <div className="status-dot"></div>
              <span>Live</span>
            </div>
          ) : (
            <div className="connecting-badge">
              <div className="spinner"></div>
              <span>Ready to Connect</span>
            </div>
          )}
        </div>

        {/* Meatball Menu */}
        <div className="menu-container">
          <button
            className="menu-button"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="More options"
            aria-expanded={showMenu}
          >
            ⋯
          </button>
          {showMenu && (
            <div className="menu-dropdown">
              <button onClick={handleExportLogs} className="menu-item">
                <span className="menu-icon">📥</span>
                Export Transcript
              </button>
              <button onClick={handleReset} className="menu-item">
                <span className="menu-icon">🔄</span>
                Reset Session
              </button>
              <button onClick={() => disconnect()} className="menu-item">
                <span className="menu-icon">🔌</span>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tutor Avatar */}
      <div className="avatar-container tutor">
        <div
          className={`avatar-display ${activity === 'speaking' ? 'speaking' : ''}`}
          style={{ '--volume': actualAgentVolume } as React.CSSProperties}
        >
          <div className="avatar-emoji">🤖</div>
          <div className="pulse-ring"></div>
        </div>
        <div className="avatar-label">Tutor</div>
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
  );
}
