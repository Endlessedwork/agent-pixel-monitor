/**
 * Pixel Agents Monitor - Backend Server
 *
 * Bun + Hono server that:
 * - Serves static files from client/dist (production) or proxies to Vite dev server
 * - Provides REST API for config, project management, and asset loading
 * - WebSocket endpoint for real-time agent updates
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';

import {
  createAgentManagerState,
  disposeAll,
  seedInactiveOpenclawAgents,
  sendExistingAgents,
  startProjectMonitoring,
  stopProjectMonitoring,
} from './agentManager.js';
import { loadFurnitureAssets, loadDefaultLayout } from './assetLoader.js';
import { loadCharacterSprites, loadFloorTiles, loadWallTiles } from './assetLoaderSprites.js';
import {
  addProject,
  loadConfig,
  loadLayout,
  readLayoutFromFile,
  removeProject,
  saveConfig,
  updateAgentAppearance,
  updateShowInactiveAgents,
  updateSoundEnabled,
  watchLayoutFile,
  writeLayoutToFile,
} from './configManager.js';
import {
  CLAUDE_SESSIONS_BASE,
  CLIENT_ASSETS_DIR,
  OPENCLAW_SESSIONS_BASE,
  SERVER_PORT,
} from './constants.js';
import type { AppConfig, ClientMessage, MonitoredProject, ServerMessage } from './types.js';
import { createWSManager } from './wsManager.js';

// ── State ────────────────────────────────────────────────────

let config = loadConfig();
const agentState = createAgentManagerState(config.showInactiveAgents);
const wsManager = createWSManager();

// ── Hono App ─────────────────────────────────────────────────

const app = new Hono();

app.use('/*', cors());

// ── REST API: Config ─────────────────────────────────────────

app.get('/api/config', (c) => {
  return c.json(config);
});

app.post('/api/config/projects', async (c) => {
  try {
    const body = await c.req.json<{
      path: string;
      name?: string;
      source?: 'claude-code' | 'openclaw';
    }>();

    if (!body.path || typeof body.path !== 'string') {
      return c.json({ error: 'path is required' }, 400);
    }

    const projectPath = body.path.replace(/^~/, os.homedir());
    const source = body.source || 'claude-code';
    const name = body.name || path.basename(projectPath);
    const sessionDir = resolveSessionDir(projectPath, source);
    const id = generateProjectId(projectPath, source);

    const project: MonitoredProject = {
      id,
      path: projectPath,
      name,
      source,
      sessionDir,
    };

    config = addProject(config, project);
    startProjectMonitoring(project, agentState, wsManager.broadcast);
    wsManager.broadcast({ type: 'configUpdated', config });

    return c.json({ project });
  } catch (err) {
    console.error('[Server] Error adding project:', err);
    return c.json({ error: 'Failed to add project' }, 500);
  }
});

app.delete('/api/config/projects/:id', (c) => {
  try {
    const projectId = c.req.param('id');
    stopProjectMonitoring(projectId, agentState);
    config = removeProject(config, projectId);
    wsManager.broadcast({ type: 'configUpdated', config });
    return c.json({ success: true });
  } catch (err) {
    console.error('[Server] Error removing project:', err);
    return c.json({ error: 'Failed to remove project' }, 500);
  }
});

// ── REST API: Assets ─────────────────────────────────────────

app.get('/api/assets/characters', async (c) => {
  try {
    const charSprites = await loadCharacterSprites(CLIENT_ASSETS_DIR);
    if (!charSprites) {
      return c.json({ error: 'No character sprites found' }, 404);
    }
    return c.json(charSprites);
  } catch (err) {
    console.error('[Server] Error loading character sprites:', err);
    return c.json({ error: 'Failed to load character sprites' }, 500);
  }
});

app.get('/api/assets/furniture', async (c) => {
  try {
    const assets = await loadFurnitureAssets(CLIENT_ASSETS_DIR);
    if (!assets) {
      return c.json({ error: 'No furniture assets found' }, 404);
    }
    // Convert sprites Map to plain object for JSON serialization
    const spritesObj: Record<string, string[][]> = {};
    for (const [id, spriteData] of assets.sprites) {
      spritesObj[id] = spriteData;
    }
    return c.json({
      catalog: assets.catalog,
      sprites: spritesObj,
    });
  } catch (err) {
    console.error('[Server] Error loading furniture assets:', err);
    return c.json({ error: 'Failed to load furniture assets' }, 500);
  }
});

app.get('/api/assets/walls', async (c) => {
  try {
    const wallTiles = await loadWallTiles(CLIENT_ASSETS_DIR);
    if (!wallTiles) {
      return c.json({ error: 'No wall tiles found' }, 404);
    }
    return c.json(wallTiles);
  } catch (err) {
    console.error('[Server] Error loading wall tiles:', err);
    return c.json({ error: 'Failed to load wall tiles' }, 500);
  }
});

app.get('/api/assets/floors', async (c) => {
  try {
    const floorTiles = await loadFloorTiles(CLIENT_ASSETS_DIR);
    if (!floorTiles) {
      return c.json({ error: 'No floor tiles found' }, 404);
    }
    return c.json(floorTiles);
  } catch (err) {
    console.error('[Server] Error loading floor tiles:', err);
    return c.json({ error: 'Failed to load floor tiles' }, 500);
  }
});

app.get('/api/assets/layout', (c) => {
  try {
    const defaultLayout = loadDefaultLayout(CLIENT_ASSETS_DIR);
    const result = loadLayout(defaultLayout);
    if (!result) {
      return c.json({ layout: null, wasReset: false });
    }
    return c.json(result);
  } catch (err) {
    console.error('[Server] Error loading layout:', err);
    return c.json({ error: 'Failed to load layout' }, 500);
  }
});

app.post('/api/layout', async (c) => {
  try {
    const body = await c.req.json<{ layout: Record<string, unknown> }>();
    if (!body.layout) {
      return c.json({ error: 'layout is required' }, 400);
    }
    layoutWatcher?.markOwnWrite();
    writeLayoutToFile(body.layout);
    return c.json({ success: true });
  } catch (err) {
    console.error('[Server] Error saving layout:', err);
    return c.json({ error: 'Failed to save layout' }, 500);
  }
});

app.post('/api/config/sound', async (c) => {
  try {
    const body = await c.req.json<{ enabled: boolean }>();
    config = updateSoundEnabled(config, body.enabled);
    return c.json({ success: true });
  } catch (err) {
    console.error('[Server] Error updating sound setting:', err);
    return c.json({ error: 'Failed to update sound setting' }, 500);
  }
});

// ── REST API: Agent Appearances ──────────────────────────────

app.get('/api/config/appearances', (c) => {
  const config = loadConfig();
  return c.json(config.agentAppearances ?? {});
});

app.put('/api/config/appearances/:agentKey', async (c) => {
  const agentKey = c.req.param('agentKey');
  const body = await c.req.json();
  config = updateAgentAppearance(config, agentKey, body);
  return c.json({ success: true });
});

// ── REST API: OpenClaw Agents ────────────────────────────────

app.get('/api/openclaw/agents', (c) => {
  const openclawDir = path.join(os.homedir(), '.openclaw');
  const agentsDir = path.join(openclawDir, 'agents');
  if (!fs.existsSync(agentsDir)) return c.json({ agents: [] });

  // Read agent names from config
  let agentNames: Record<string, string> = {};
  try {
    const configPath = path.join(openclawDir, 'openclaw.json');
    if (fs.existsSync(configPath)) {
      const ocConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const list = ocConfig?.agents?.list;
      if (Array.isArray(list)) {
        for (const a of list) {
          if (a.id) agentNames[a.id] = a.name || a.id;
        }
      }
    }
  } catch { /* ignore */ }

  // Scan directories
  const agents: Array<{ id: string; name: string }> = [];
  try {
    for (const dir of fs.readdirSync(agentsDir)) {
      const sessDir = path.join(agentsDir, dir, 'sessions');
      if (fs.existsSync(sessDir)) {
        agents.push({ id: dir, name: agentNames[dir] || dir });
      }
    }
  } catch { /* ignore */ }

  return c.json({ agents });
});

// ── Static Files (production) ────────────────────────────────

const clientDistPath = path.join(path.dirname(path.dirname(__dirname)), 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  // Serve static files with absolute path using rewriteRequestPath
  app.use('/*', serveStatic({
    root: '/',
    rewriteRequestPath: (reqPath) => path.join(clientDistPath, reqPath),
  }));
  // SPA fallback - serve index.html for non-API, non-asset routes
  app.get('*', (c) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      return c.html(html);
    }
    return c.text('Not Found', 404);
  });
}

// ── Helper Functions ─────────────────────────────────────────

function resolveSessionDir(projectPath: string, source: 'claude-code' | 'openclaw'): string {
  if (source === 'openclaw') {
    return OPENCLAW_SESSIONS_BASE;
  }
  // Claude Code: ~/.claude/projects/<path-hash>/
  // Strip trailing slashes to match Claude Code's own directory naming
  const normalized = projectPath.replace(/\/+$/, '');
  const dirName = normalized.replace(/[^a-zA-Z0-9-]/g, '-');
  return path.join(CLAUDE_SESSIONS_BASE, dirName);
}

function generateProjectId(projectPath: string, source: string): string {
  const hash = projectPath.replace(/[^a-zA-Z0-9]/g, '_');
  return `${source}_${hash}`;
}

// ── Layout Watcher ───────────────────────────────────────────

const layoutWatcher = watchLayoutFile((layout) => {
  console.log('[Server] External layout change detected, broadcasting to clients');
  // Broadcast to all WS clients is not a ServerMessage type for layout,
  // so clients should handle this through API polling or we add a WS message type
});

// ── WebSocket Handler ────────────────────────────────────────

function handleWsMessage(data: string): void {
  try {
    const message = JSON.parse(data) as ClientMessage;
    switch (message.type) {
      case 'saveLayout': {
        layoutWatcher?.markOwnWrite();
        writeLayoutToFile(message.layout);
        break;
      }
      case 'setSoundEnabled': {
        config = updateSoundEnabled(config, message.enabled);
        break;
      }
      case 'setShowInactiveAgents': {
        config = updateShowInactiveAgents(config, message.enabled);
        agentState.showInactiveAgents.current = message.enabled;
        if (!message.enabled) {
          // Remove all virtual agents
          for (const [id, agent] of [...agentState.agents]) {
            if (agent.isVirtual) {
              agentState.agents.delete(id);
              wsManager.broadcast({ type: 'agentClosed', id });
            }
          }
        } else {
          // Re-seed inactive agents for all openclaw projects
          for (const p of config.projects) {
            if (p.source === 'openclaw') {
              seedInactiveOpenclawAgents(p, agentState, wsManager.broadcast);
            }
          }
        }
        break;
      }
      case 'webviewReady': {
        // Client ready - existing agents are sent per-connection in the open handler
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[Server] Error handling WS message:', err);
  }
}

// ── Start Monitoring Configured Projects ─────────────────────

function startConfiguredProjects(): void {
  for (const project of config.projects) {
    startProjectMonitoring(project, agentState, wsManager.broadcast);
  }
  console.log(`[Server] Monitoring ${config.projects.length} configured project(s)`);
}

// ── Bun Server with WebSocket ────────────────────────────────

const server = Bun.serve({
  port: SERVER_PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Delegate to Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    async open(ws) {
      wsManager.addClient(ws);
      const sendToClient = (msg: ServerMessage) => wsManager.sendTo(ws, msg);

      // Send assets first so client can build catalog before layout arrives
      try {
        const [charSprites, furnitureAssets, wallTiles, floorTiles] = await Promise.all([
          loadCharacterSprites(CLIENT_ASSETS_DIR),
          loadFurnitureAssets(CLIENT_ASSETS_DIR),
          loadWallTiles(CLIENT_ASSETS_DIR),
          loadFloorTiles(CLIENT_ASSETS_DIR),
        ]);

        if (charSprites) {
          sendToClient({ type: 'characterSpritesLoaded', characters: charSprites.characters } as ServerMessage);
        }
        if (floorTiles) {
          sendToClient({ type: 'floorTilesLoaded', sprites: floorTiles.sprites } as ServerMessage);
        }
        if (wallTiles) {
          sendToClient({ type: 'wallTilesLoaded', sets: wallTiles.sets } as ServerMessage);
        }
        if (furnitureAssets) {
          const spritesObj: Record<string, string[][]> = {};
          for (const [id, spriteData] of furnitureAssets.sprites) {
            spritesObj[id] = spriteData;
          }
          sendToClient({
            type: 'furnitureAssetsLoaded',
            catalog: furnitureAssets.catalog,
            sprites: spritesObj,
          } as ServerMessage);
        }
      } catch (err) {
        console.error('[Server] Error sending assets to client:', err);
      }

      // Send layout
      try {
        const defaultLayout = loadDefaultLayout(CLIENT_ASSETS_DIR);
        const layoutResult = loadLayout(defaultLayout);
        sendToClient({
          type: 'layoutLoaded',
          layout: layoutResult?.layout ?? defaultLayout,
          wasReset: layoutResult?.wasReset ?? false,
        } as ServerMessage);
      } catch (err) {
        console.error('[Server] Error sending layout to client:', err);
      }

      // Send existing agents
      sendExistingAgents(agentState, sendToClient);

      // Send current config and settings
      wsManager.sendTo(ws, { type: 'configUpdated', config });
      sendToClient({ type: 'settingsLoaded', soundEnabled: config.soundEnabled } as ServerMessage);
    },
    message(ws, data) {
      handleWsMessage(typeof data === 'string' ? data : data.toString());
    },
    close(ws) {
      wsManager.removeClient(ws);
    },
  },
});

// ── Startup ──────────────────────────────────────────────────

startConfiguredProjects();

console.log(`[Pixel Agents Monitor] Server running at http://localhost:${server.port}`);
console.log(`[Pixel Agents Monitor] WebSocket available at ws://localhost:${server.port}/ws`);
console.log(`[Pixel Agents Monitor] Assets dir: ${CLIENT_ASSETS_DIR}`);

// ── Graceful Shutdown ────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n[Pixel Agents Monitor] Shutting down...');
  disposeAll(agentState);
  layoutWatcher?.dispose();
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Pixel Agents Monitor] Shutting down...');
  disposeAll(agentState);
  layoutWatcher?.dispose();
  server.stop();
  process.exit(0);
});
