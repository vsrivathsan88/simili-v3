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

import { useState } from 'react';
import ControlTray from './components/console/control-tray/ControlTray';
import AvatarControlTray from './components/lesson/AvatarControlTray';
import ErrorScreen from './components/demo/ErrorScreen';
import StreamingConsole from './components/demo/streaming-console/StreamingConsole';
import LessonLayout from './components/lesson/LessonLayout';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { LiveAPIProvider } from './contexts/LiveAPIContext';

// Client no longer reads API keys from env; tokens fetched server-side in LiveAPI hook

/**
 * Main application component that provides a streaming interface for Live API.
 * Manages video streaming state and provides controls for webcam/screen capture.
 */
function App() {
  const [viewMode, setViewMode] = useState<'console' | 'lesson'>('lesson');

  return (
    <div className="App">
      {/* Mode Toggle */}
        <div className="mode-toggle" style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          gap: '4px',
          background: 'white',
          borderRadius: '8px',
          padding: '4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}>
          <button
            className={viewMode === 'console' ? 'active' : ''}
            onClick={() => setViewMode('console')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: viewMode === 'console' ? '#3b82f6' : 'transparent',
              color: viewMode === 'console' ? 'white' : '#6b7280',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Console
          </button>
          <button
            className={viewMode === 'lesson' ? 'active' : ''}
            onClick={() => setViewMode('lesson')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: viewMode === 'lesson' ? '#3b82f6' : 'transparent',
              color: viewMode === 'lesson' ? 'white' : '#6b7280',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Lesson
          </button>
        </div>

      <LiveAPIProvider>
        <ErrorScreen />
        
        {viewMode === 'console' ? (
          <>
            <Header />
            <Sidebar />
            <div className="streaming-console">
              <main>
                <div className="main-app-area">
                  <StreamingConsole />
                </div>
                <ControlTray></ControlTray>
              </main>
            </div>
          </>
        ) : (
          <div className="lesson-mode" style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <LessonLayout />
            <div className="lesson-controls" style={{
              margin: '0 20px 20px 20px',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <AvatarControlTray />
            </div>
          </div>
        )}
      </LiveAPIProvider>

    </div>
  );
}

export default App;
