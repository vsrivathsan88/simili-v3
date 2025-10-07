import { useContext } from 'react';
import { LiveAPIContext, UseLiveApiResults } from '../../contexts/LiveAPIContext';

// Custom hook to use the LiveAPI context
export function useLiveAPIContext(): UseLiveApiResults {
  const context = useContext(LiveAPIContext);
  if (context === undefined) {
    throw new Error('useLiveAPIContext must be used within a LiveAPIProvider');
  }
  return context;
}
