/**
 * WebSocket Manager - Manages WebSocket connections and message broadcasting.
 */

import type { ServerWebSocket } from 'bun';
import type { ServerMessage } from './types.js';

export interface WSManager {
  readonly addClient: (ws: ServerWebSocket<unknown>) => void;
  readonly removeClient: (ws: ServerWebSocket<unknown>) => void;
  readonly broadcast: (message: ServerMessage) => void;
  readonly getClientCount: () => number;
  readonly sendTo: (ws: ServerWebSocket<unknown>, message: ServerMessage) => void;
}

export function createWSManager(): WSManager {
  const clients = new Set<ServerWebSocket<unknown>>();

  function addClient(ws: ServerWebSocket<unknown>): void {
    clients.add(ws);
    console.log(`[WSManager] Client connected (total: ${clients.size})`);
  }

  function removeClient(ws: ServerWebSocket<unknown>): void {
    clients.delete(ws);
    console.log(`[WSManager] Client disconnected (total: ${clients.size})`);
  }

  function broadcast(message: ServerMessage): void {
    const json = JSON.stringify(message);
    const deadClients: ServerWebSocket<unknown>[] = [];

    for (const client of clients) {
      try {
        client.send(json);
      } catch (err) {
        console.log(`[WSManager] Failed to send to client: ${err}`);
        deadClients.push(client);
      }
    }

    // Clean up dead clients
    for (const dead of deadClients) {
      clients.delete(dead);
    }
  }

  function getClientCount(): number {
    return clients.size;
  }

  function sendTo(ws: ServerWebSocket<unknown>, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.log(`[WSManager] Failed to send to specific client: ${err}`);
      clients.delete(ws);
    }
  }

  return {
    addClient,
    removeClient,
    broadcast,
    getClientCount,
    sendTo,
  };
}
