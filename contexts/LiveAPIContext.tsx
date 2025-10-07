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

import { createContext, FC, ReactNode, useContext } from 'react';
import { useLiveApi, UseLiveApiResults } from '../hooks/media/use-live-api';

// Export the type so other modules can use it
export type { UseLiveApiResults };

// Create the context with a default undefined value
export const LiveAPIContext = createContext<UseLiveApiResults | undefined>(
  undefined
);

// Custom hook to use the LiveAPI context has been moved to hooks/media/use-live-api-context.ts

export interface LiveAPIProviderProps {
  children: ReactNode;
}

// Provider component
export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  children,
}) => {
  const liveAPI = useLiveApi();

  return (
    <LiveAPIContext.Provider value={liveAPI}>
      {children}
    </LiveAPIContext.Provider>
  );
};
