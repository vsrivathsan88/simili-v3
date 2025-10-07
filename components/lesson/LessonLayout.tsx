/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import './LessonLayout.css';
import { useLiveAPIContext } from '../../hooks/media/use-live-api-context';
import { useSettings, useTools, useLogStore, useSceneStore, useMilestoneStore, Scene } from '@/lib/state';
import { Modality } from '@google/genai';
import { MessageCircle, X, Mic, Diamond, Circle, Shield } from 'lucide-react';
import AvatarControlTray from './AvatarControlTray';

// Screen sharing is now handled by ScreenRecorder in AvatarControlTray

interface LessonLayoutProps {
  onSceneChange?: (scene: Scene | null) => void;
}

export default function LessonLayout({ onSceneChange }: LessonLayoutProps) {
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [sceneChanging, setSceneChanging] = useState(false);

  // Tapback Memoji avatars for dialogue
  const studentAvatar = 'https://www.tapback.co/api/avatar/simili-student.webp';
  const tutorAvatar = '/pi-removebg.png';
  const systemAvatar = 'https://www.tapback.co/api/avatar/simili-system.webp';

  // Live API wiring (same as console): provide config from settings + tools
  const { setConfig, client, connected } = useLiveAPIContext();
  const { systemPrompt, voice } = useSettings();
  const { tools } = useTools();
  const turns = useLogStore(state => state.turns);
  
  // Milestone progress for header display
  const milestones = useMilestoneStore(state => state.milestones);

  // Scene management from store
  const { currentSceneId, availableScenes, setCurrentScene, loadScenes, getCurrentScene } = useSceneStore();
  const currentScene = getCurrentScene();

  useEffect(() => {
    // Load available scenes
    fetch('/scenes/scenes.json')
      .then(res => res.json())
      .then((data: Scene[]) => {
        loadScenes(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load scenes:', err);
        setLoading(false);
      });
  }, [loadScenes]);

  // Mirror console config: audio modality, voice, systemPrompt, tools
  // Inject current scene context dynamically
  useEffect(() => {
    const enabledTools = tools
      .filter(tool => tool.isEnabled)
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));

    // Use the full system prompt from settings
    let dynamicSystemPrompt = systemPrompt;
    
    if (currentScene) {
      const sceneContext = `

---

## CURRENT SCENE CONTEXT

**Student is currently viewing:** ${currentScene.title}

**Scene Description:** ${currentScene.description}

**Representation Type:** ${currentScene.representation || 'mixed'}

${currentScene.fraction ? `**Fraction Shown:** ${currentScene.fraction}` : ''}

${currentScene.equal_partitions !== undefined ? `**Equal Partitions:** ${currentScene.equal_partitions ? 'Yes' : 'No (this is a non-example)'}` : ''}

**Suggested Focusing Prompts for This Scene:**
${currentScene.prompts.map(p => `- ${p}`).join('\n')}

${currentScene.reasoning_notes ? `\n**Pedagogical Notes:** ${currentScene.reasoning_notes}` : ''}

${currentScene.milestone_fit && currentScene.milestone_fit.length > 0 ? `\n**Best for Milestones:** ${currentScene.milestone_fit.join(', ')}` : ''}

${currentScene.targets_misconceptions && currentScene.targets_misconceptions.length > 0 ? `\n**Addresses Misconceptions:** ${currentScene.targets_misconceptions.join(', ')}` : ''}

**IMPORTANT:** Always refer to what the student can see in THIS scene. Ask them to describe, observe, and reason about THIS specific visual. Use the focusing prompts above as guidance.

---
`;
      dynamicSystemPrompt = systemPrompt + sceneContext;
    }

    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
        // CRITICAL: Force English language for speech output
        languageCode: 'en-US',
      },
      // Enable VAD with optimized settings
      realtimeInputConfig: {
        automaticActivityDetection: {
          enabled: true, // Enable automatic speech detection
          speechStartThreshold: 0.5, // Default sensitivity
          voiceActivityTimeout: 2000, // Default timeout (2 seconds)
        },
      },
      // CRITICAL: Force English transcription for input and output
      inputAudioTranscription: {
        languageCode: 'en-US',
      },
      outputAudioTranscription: {
        languageCode: 'en-US',
      },
      systemInstruction: {
        parts: [{ text: dynamicSystemPrompt }],
      },
      tools: enabledTools,
    };

    console.log('[LessonLayout] Setting config with system prompt length:', dynamicSystemPrompt.length);
    console.log('[LessonLayout] System prompt preview:', dynamicSystemPrompt.substring(0, 200) + '...');
    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice, currentScene]);

  useEffect(() => {
    onSceneChange?.(currentScene);
    
    // Trigger scene change animation
    if (currentScene) {
      setSceneChanging(true);
      const timer = setTimeout(() => setSceneChanging(false), 800);
      return () => clearTimeout(timer);
    }
  }, [currentScene, onSceneChange]);

  // Note: Screen sharing is now handled by ScreenRecorder in AvatarControlTray
  // Pi can see the entire screen in real-time, including scene images and canvas drawings

  if (loading) {
    return (
      <div className="lesson-layout loading">
        <div className="loading-message">Loading lesson...</div>
      </div>
    );
  }

  return (
    <div className="lesson-layout" style={{ flex: 1, minHeight: 0 }}>
      <div className="lesson-header">
        <div className="header-left">
          <h1>
          <img src="/simili-logo.png" alt="Simili" style={{ width: '32px', height: '32px', marginRight: '4px' }} />
          Simili
        </h1>
        </div>
        <div className="header-right">
          {/* Milestone Progress Gems */}
          <div className="header-milestone-gems">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`header-gem ${milestone.achieved ? 'achieved' : 'locked'}`}
                title={`${milestone.name}${milestone.achieved ? ' ✓' : ''}`}
                aria-label={`${milestone.name} milestone ${milestone.achieved ? 'achieved' : 'not achieved'}`}
              >
                {milestone.achieved ? <Diamond size={16} fill="currentColor" /> : <Circle size={16} />}
              </div>
              ))}
            </div>

            {/* Safe Space Badge */}
            {connected && (
              <div className="safe-space-badge" title="Your private learning space">
                <Shield size={14} />
                <span>Safe Space</span>
              </div>
            )}
            
            <button
              className="dialogue-toggle"
              onClick={() => setShowTranscript(v => !v)}
              aria-expanded={showTranscript}
              aria-controls="dialogue-panel"
            >
              {showTranscript ? <X size={18} /> : <MessageCircle size={18} />}
              <span className="toggle-text">Dialogue View</span>
            </button>
          </div>
        </div>
      <div className="lesson-content">
        {/* Left Container - Scene Image */}
        <div className="scene-container">
          {/* Scene Picker */}
          <div className="scene-picker">
            <label htmlFor="scene-select">Lesson visual aid</label>
            <select
              id="scene-select"
              value={currentSceneId || ''}
              onChange={(e) => {
                const sceneId = e.target.value;
                if (sceneId) {
                  setCurrentScene(sceneId);
                }
              }}
            >
              <option value="">Select a scene...</option>
              {availableScenes.map(scene => (
                <option key={scene.id} value={scene.id}>
                  {scene.title}
                </option>
              ))}
            </select>
          </div>
          
          {currentScene && (
            <div className={`scene-image-container ${sceneChanging ? 'scene-switching' : ''}`}>
              <img
                src={currentScene.image}
                alt={currentScene.title}
                className={`scene-image ${sceneChanging ? 'scene-switching' : ''}`}
                onError={(e) => {
                  // Fallback for missing images
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
                }}
              />
            </div>
          )}
        </div>

        {/* Right Container - Drawing Canvas */}
        <div className="canvas-container-wrapper">
          <div className="canvas-container">
            <Tldraw
              persistenceKey="lesson-canvas"
              hideUi={false}
              onMount={(editor) => {
                // Configure editor for lesson use
                editor.updateInstanceState({ isDebugMode: false });
              }}
            />
          </div>
        </div>
      </div>

      {/* Dialogue View - Collapsible Side Panel */}
      <aside
        id="dialogue-panel"
        className={`dialogue-panel ${showTranscript ? 'open' : ''}`}
        role="log"
        aria-live="polite"
      >
        <div className="dialogue-header">
          <MessageCircle size={24} className="header-icon" />
          <span className="header-title">Dialogue View</span>
          <button
            className="close-button"
            onClick={() => setShowTranscript(false)}
            aria-label="Close dialogue view"
          >
            <X size={18} />
          </button>
        </div>
        <div className="dialogue-body">
          {turns.length === 0 ? (
            <div className="dialogue-empty">
              <Mic size={48} className="empty-icon" strokeWidth={1.5} />
              <p>Start a conversation with Pi!</p>
              <p className="empty-hint">Your dialogue will appear here</p>
            </div>
          ) : (
            <ul className="dialogue-list">
              {turns.map((t, idx) => (
                <li key={idx} className={`turn ${t.role}`}>
                  <div className="turn-avatar">
                    <img 
                      src={t.role === 'user' ? studentAvatar : t.role === 'agent' ? tutorAvatar : systemAvatar}
                      alt={t.role === 'user' ? 'You' : t.role === 'agent' ? 'Pi' : 'System'}
                      className="turn-avatar-image"
                    />
                  </div>
                  <div className="turn-content">
                    <div className="turn-meta">
                      <span className="turn-role">{t.role === 'user' ? 'You' : t.role === 'agent' ? 'Pi' : 'System'}</span>
                      <span className="turn-time">{t.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <div className="turn-text">{t.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Audio Control Tray - Fixed at bottom */}
      <AvatarControlTray />
    </div>
  );
}
