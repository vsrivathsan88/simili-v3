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

import AvatarControlTray from './components/lesson/AvatarControlTray';
import ErrorScreen from './components/demo/ErrorScreen';
import LessonLayout from './components/lesson/LessonLayout';
import ConnectionStatus from './components/ConnectionStatus';
import { LiveAPIProvider, useLiveAPIContext } from './contexts/LiveAPIContext';

// Client no longer reads API keys from env; tokens fetched server-side in LiveAPI hook

/**
 * Inner App component that has access to LiveAPI context
 */
function AppContent() {
  const { connectionStatus, connectionError } = useLiveAPIContext();
  
  return (
    <>
      <ConnectionStatus status={connectionStatus} error={connectionError} />
      <div className="App" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #fdfbf7 0%, #f8f9fa 100%)',
      border: '3px solid rgba(139, 92, 246, 0.12)',
      borderRadius: '24px',
      boxShadow: 'inset 0 0 40px rgba(139, 92, 246, 0.03), 0 0 60px rgba(139, 92, 246, 0.05)'
    }}>
        <ErrorScreen />
        
        <div className="lesson-mode" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden'
        }}>
          <LessonLayout />
          <div className="lesson-controls" style={{
            flexShrink: 0,
            padding: '0 40px 40px 40px',
            display: 'flex',
            justifyContent: 'center',
            background: 'transparent'
          }}>
            <AvatarControlTray />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Simili - Voice-first Socratic tutor for 3rd grade fractions
 * Lesson mode with integrated dialogue view
 */
function App() {
  return (
    <LiveAPIProvider>
      <AppContent />
    </LiveAPIProvider>
  );
}

export default App;
