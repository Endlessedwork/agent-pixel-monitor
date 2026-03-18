import { useEffect, useRef, useState } from 'react';

import { wsClient } from '../wsClient.js';

export interface UseWebSocketResult {
  isConnected: boolean;
}

/**
 * React hook that manages the WebSocket lifecycle.
 *
 * - Connects on mount, disconnects on unmount.
 * - Tracks connection state for UI indicators.
 * - Replaces the VS Code webview messaging channel.
 */
export function useWebSocket(): UseWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Track connection state via periodic polling
    // (wsClient is a singleton so we can't hook into its internal events directly)
    const checkConnection = () => {
      if (mountedRef.current) {
        setIsConnected(wsClient.isConnected());
      }
    };

    // Register a no-op message handler just to receive connection notifications
    const unsubscribe = wsClient.onMessage(() => {
      checkConnection();
    });

    // Connect
    wsClient.connect();
    checkConnection();

    // Poll connection state periodically for reconnect detection
    const interval = setInterval(checkConnection, 2000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      unsubscribe();
      wsClient.disconnect();
    };
  }, []);

  return { isConnected };
}
