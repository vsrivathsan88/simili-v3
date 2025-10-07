/**
 * TEST COMPONENT - Simple Gemini Live Connection Test
 * This proves the connection works with ZERO duplicate audio
 */

import React, { useEffect, useRef } from 'react';
import { useGeminiLiveSimple } from '../hooks/media/use-gemini-live-simple';
import { AudioRecorder } from '../lib/audio-recorder';

export default function TestGeminiSimple() {
  const { connected, connecting, error, connect, disconnect, sendAudio, sendText, debug } = useGeminiLiveSimple();
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const [micActive, setMicActive] = React.useState(false);
  
  // Initialize audio recorder
  useEffect(() => {
    audioRecorderRef.current = new AudioRecorder(16000);
    
    return () => {
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
      }
    };
  }, []);
  
  // Handle microphone
  useEffect(() => {
    if (!micActive || !connected || !audioRecorderRef.current) return;
    
    const recorder = audioRecorderRef.current;
    
    const handleAudioData = (base64: string) => {
      sendAudio(base64);
    };
    
    recorder.on('data', handleAudioData);
    recorder.start().catch(console.error);
    
    return () => {
      recorder.off('data', handleAudioData);
      recorder.stop();
    };
  }, [micActive, connected, sendAudio]);
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1a1a1a',
      color: 'white',
      fontFamily: 'system-ui'
    }}>
      <h1>🧪 Gemini Live - Simple Test</h1>
      
      <div style={{
        background: '#2a2a2a',
        padding: '20px',
        borderRadius: '10px',
        minWidth: '400px'
      }}>
        <h3>Debug Info:</h3>
        <pre style={{ fontSize: '12px', color: '#00ff00' }}>
          {JSON.stringify(debug, null, 2)}
        </pre>
        
        <h3>Status:</h3>
        <div>Connected: {connected ? '✅ YES' : '❌ NO'}</div>
        <div>Connecting: {connecting ? '⏳ YES' : 'NO'}</div>
        {error && <div style={{ color: '#ff6b6b' }}>Error: {error}</div>}
        
        <h3>Controls:</h3>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {!connected ? (
            <button 
              onClick={connect} 
              disabled={connecting}
              style={{
                padding: '10px 20px',
                background: connecting ? '#666' : '#00aa00',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: connecting ? 'wait' : 'pointer'
              }}
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <>
              <button 
                onClick={disconnect}
                style={{
                  padding: '10px 20px',
                  background: '#aa0000',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Disconnect
              </button>
              
              <button
                onClick={() => setMicActive(!micActive)}
                style={{
                  padding: '10px 20px',
                  background: micActive ? '#ffaa00' : '#0066cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                {micActive ? '🔴 Mic ON' : '🎤 Mic OFF'}
              </button>
              
              <button
                onClick={() => sendText('Hello Pi!')}
                style={{
                  padding: '10px 20px',
                  background: '#6600cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Send "Hello Pi!"
              </button>
            </>
          )}
        </div>
        
        <div style={{ marginTop: '20px', padding: '10px', background: '#1a1a1a', borderRadius: '5px' }}>
          <strong>Instructions:</strong>
          <ol style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <li>Click "Connect" to establish connection</li>
            <li>Wait for Pi to introduce itself</li>
            <li>Click "Mic ON" to start talking</li>
            <li>Speak and observe if Pi interrupts properly</li>
            <li>Check console for "[SIMPLE]" logs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
