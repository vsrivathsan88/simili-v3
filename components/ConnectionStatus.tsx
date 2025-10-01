import React from 'react';
import { ConnectionStatus as Status } from '../hooks/media/use-live-api';

interface ConnectionStatusProps {
  status: Status;
  error: string | null;
}

export default function ConnectionStatus({ status, error }: ConnectionStatusProps) {
  // Don't show anything when connected
  if (status === 'connected') {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'connecting':
        return {
          bg: '#2196F3',
          text: '🔄 Connecting to Pi...',
          show: true,
        };
      case 'reconnecting':
        return {
          bg: '#FF9800',
          text: `🔄 ${error || 'Reconnecting to Pi...'}`,
          show: true,
        };
      case 'error':
        return {
          bg: '#f44336',
          text: `❌ ${error || 'Connection error'}`,
          show: true,
        };
      case 'disconnected':
      default:
        return {
          bg: '#9E9E9E',
          text: '⚪ Not connected',
          show: false, // Don't show when manually disconnected
        };
    }
  };

  const config = getStatusConfig();

  if (!config.show) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: config.bg,
        color: 'white',
        padding: '12px',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        animation: 'slideDown 0.3s ease-out',
      }}
    >
      {config.text}
      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

