/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import './LessonLayout.css';

interface Scene {
  id: string;
  title: string;
  description: string;
  image: string;
  prompts: string[];
}

interface LessonLayoutProps {
  onSceneChange?: (scene: Scene | null) => void;
}

export default function LessonLayout({ onSceneChange }: LessonLayoutProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load available scenes
    fetch('/scenes/scenes.json')
      .then(res => res.json())
      .then((data: Scene[]) => {
        setScenes(data);
        setCurrentScene(data[0] || null); // Default to first scene
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load scenes:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    onSceneChange?.(currentScene);
  }, [currentScene, onSceneChange]);

  if (loading) {
    return (
      <div className="lesson-layout loading">
        <div className="loading-message">Loading lesson...</div>
      </div>
    );
  }

  return (
    <div className="lesson-layout">
      <div className="lesson-header">
        <h1>Simili</h1>
      </div>
      <div className="lesson-content">
        {/* Left Container - Scene Image */}
        <div className="scene-container">
          {/* Scene Picker */}
          <div className="scene-picker">
            <label htmlFor="scene-select">Lesson visual aid</label>
            <select
              id="scene-select"
              value={currentScene?.id || ''}
              onChange={(e) => {
                const scene = scenes.find(s => s.id === e.target.value);
                setCurrentScene(scene || null);
              }}
            >
              <option value="">Select a scene...</option>
              {scenes.map(scene => (
                <option key={scene.id} value={scene.id}>
                  {scene.title}
                </option>
              ))}
            </select>
          </div>
          
          {currentScene && (
            <div className="scene-image-container">
              <img
                src={currentScene.image}
                alt={currentScene.title}
                className="scene-image"
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
    </div>
  );
}
