/**
 * WebSocket client singleton for communicating with the pixel-agents-monitor server.
 *
 * Replaces VS Code's `acquireVsCodeApi().postMessage()` / `window.addEventListener('message')`
 * with WebSocket equivalents: `send(msg)` / `onMessage(handler)`.
 */

type MessageHandler = (msg: unknown) => void;

interface WsClient {
  send: (msg: unknown) => void;
  onMessage: (handler: MessageHandler) => () => void;
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
}

// In development, connect directly to the backend server port.
// In production, use the same host/port as the page.
const DEV_WS_PORT = 3456;
const isDevMode = window.location.port === '5173';
const WS_URL = isDevMode
  ? `ws://${window.location.hostname}:${DEV_WS_PORT}/ws`
  : `ws://${window.location.host}/ws`;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_DELAY_MS;
let handlers: Set<MessageHandler> = new Set();
let connected = false;
let intentionalDisconnect = false;
let pendingMessages: unknown[] = [];

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalDisconnect) return;
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectInternal();
  }, reconnectDelay);
  // Exponential backoff capped at max
  reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
}

function flushPendingMessages(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const toSend = [...pendingMessages];
  pendingMessages = [];
  for (const msg of toSend) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error('[WS] Failed to send pending message:', err);
    }
  }
}

function connectInternal(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error('[WS] Failed to create WebSocket:', err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectDelay = RECONNECT_DELAY_MS;
    console.log('[WS] Connected to', WS_URL);
    flushPendingMessages();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch (err) {
          console.error('[WS] Message handler error:', err);
        }
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
    }
  };

  ws.onclose = () => {
    connected = false;
    ws = null;
    if (!intentionalDisconnect) {
      console.log('[WS] Connection closed, reconnecting...');
      scheduleReconnect();
    }
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
    // onclose will fire after onerror
  };
}

function send(msg: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error('[WS] Failed to send:', err);
      pendingMessages.push(msg);
    }
  } else {
    // Queue message to send when connected
    pendingMessages.push(msg);
  }
}

function onMessage(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

function connect(): void {
  intentionalDisconnect = false;
  connectInternal();
}

function disconnect(): void {
  intentionalDisconnect = true;
  clearReconnectTimer();
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
}

function isConnected(): boolean {
  return connected;
}

export const wsClient: WsClient = {
  send,
  onMessage,
  connect,
  disconnect,
  isConnected,
};
