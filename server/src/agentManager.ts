/**
 * Agent Manager - Manages agent lifecycle through JSONL file discovery.
 * Replaces VS Code Terminal-based agent management with file-system scanning.
 */

import * as fs from 'fs';
import * as path from 'path';

import { JSONL_POLL_INTERVAL_MS, PROJECT_SCAN_INTERVAL_MS } from './constants.js';
import { readNewLines, startFileWatching, stopFileWatching } from './fileWatcher.js';
import {
  cancelPermissionTimer,
  cancelWaitingTimer,
  clearAgentActivity,
} from './timerManager.js';
import type { ActivityRecord, AgentState, MessageSender, MonitoredProject } from './types.js';

// Extract the OpenClaw agent ID from a JSONL file path.
// Path format: ~/.openclaw/agents/<AGENT_ID>/sessions/<uuid>.jsonl
function extractOpenclawAgentId(jsonlFile: string): string | undefined {
  const match = jsonlFile.match(/\/agents\/([^/]+)\/sessions\//);
  return match ? match[1] : undefined;
}

// Read the display name for an OpenClaw agent from openclaw.json.
function readOpenclawAgentName(openclawDir: string, agentId: string): string | undefined {
  try {
    const configPath = path.join(openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return undefined;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const agents = config?.agents?.list;
    if (!Array.isArray(agents)) return undefined;
    const agent = agents.find((a: { id?: string }) => a.id === agentId);
    return agent?.name || undefined;
  } catch {
    return undefined;
  }
}

// Read the agent identity from workspace/IDENTITY.md.
// Returns parsed name and gender if the file exists.
interface AgentIdentity {
  name?: string;
  gender?: 'male' | 'female' | 'any';
}

function readAgentIdentity(openclawDir: string, agentId: string): AgentIdentity {
  const identity: AgentIdentity = {};
  try {
    // OpenClaw workspace paths:
    //   main agent  → <openclawDir>/workspace/IDENTITY.md
    //   other agents → <openclawDir>/workspace-<agentId>/IDENTITY.md
    //   fallback    → <openclawDir>/agents/<agentId>/workspace/IDENTITY.md
    const candidates = agentId === 'main'
      ? [
          path.join(openclawDir, 'workspace', 'IDENTITY.md'),
          path.join(openclawDir, 'agents', agentId, 'workspace', 'IDENTITY.md'),
        ]
      : [
          path.join(openclawDir, 'workspace-' + agentId, 'IDENTITY.md'),
          path.join(openclawDir, 'agents', agentId, 'workspace', 'IDENTITY.md'),
        ];
    const identityPath = candidates.find((p) => fs.existsSync(p));
    if (!identityPath) return identity;
    const content = fs.readFileSync(identityPath, 'utf-8');

    // Parse **Name:** value (skip placeholder text like "*(pick something...)*")
    const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      const raw = nameMatch[1].trim();
      // Ignore empty or placeholder values
      if (raw && !raw.startsWith('*(') && !raw.startsWith('_(') && !raw.startsWith('(')) {
        identity.name = raw;
      }
    }

    // Parse **Gender:** value — map Thai/English to male/female/any
    const genderMatch = content.match(/\*\*Gender:\*\*\s*(.+)/);
    if (genderMatch) {
      const raw = genderMatch[1].toLowerCase();
      if (raw.includes('ผู้หญิง') || raw.includes('female') || raw.includes('woman') || raw.includes('หญิง')) {
        identity.gender = 'female';
      } else if (raw.includes('ผู้ชาย') || raw.includes('male') || raw.includes('man') || raw.includes('ชาย')) {
        identity.gender = 'male';
      }
    }
  } catch { /* ignore */ }
  return identity;
}

// Find the internal agent ID for a virtual agent by its OpenClaw agent ID.
function findVirtualAgentByOpenclawId(openclawAgentId: string, state: AgentManagerState): number | null {
  for (const [id, agent] of state.agents) {
    if (agent.openclawAgentId === openclawAgentId && agent.isVirtual) return id;
  }
  return null;
}

// Find the internal agent ID for an active (non-virtual) agent by its OpenClaw agent ID.
function findActiveAgentByOpenclawId(openclawAgentId: string, state: AgentManagerState): number | null {
  for (const [id, agent] of state.agents) {
    if (agent.openclawAgentId === openclawAgentId && !agent.isVirtual) return id;
  }
  return null;
}

// Create a virtual (inactive) agent that appears on the dashboard without an active session.
function createVirtualAgent(
  openclawAgentId: string,
  agentName: string | undefined,
  project: MonitoredProject,
  state: AgentManagerState,
  sendMessage: MessageSender,
  identityGender?: 'male' | 'female' | 'any',
): number {
  const id = state.nextAgentId.current++;
  const agent: AgentState = {
    id,
    projectDir: project.id,
    jsonlFile: null,
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    folderName: agentName || openclawAgentId,
    source: 'openclaw',
    isVirtual: true,
    openclawAgentId,
    agentName,
    identityGender,
  };
  state.agents.set(id, agent);
  console.log(`[AgentManager] Virtual agent ${id}: ${agentName || openclawAgentId} (inactive)${identityGender ? ` [${identityGender}]` : ''}`);
  sendMessage({ type: 'agentCreated', id, folderName: agent.folderName, source: 'openclaw', projectId: project.id, openclawAgentId, agentName, isActive: false, identityGender });
  return id;
}

// Upgrade a virtual agent to a real (active) agent when a session starts.
function upgradeVirtualAgent(
  existingId: number,
  jsonlFile: string,
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  const agent = state.agents.get(existingId);
  if (!agent) return;
  agent.jsonlFile = jsonlFile;
  agent.fileOffset = 0;
  agent.lineBuffer = '';
  agent.isVirtual = false;
  console.log(`[AgentManager] Agent ${existingId}: activated (${path.basename(jsonlFile)})`);
  sendMessage({ type: 'agentActivated', id: existingId });

  // Start file watching
  if (fs.existsSync(jsonlFile)) {
    startFileWatching(
      existingId,
      jsonlFile,
      state.agents,
      state.fileWatchers,
      state.pollingTimers,
      state.waitingTimers,
      state.permissionTimers,
      sendMessage,
    );
    readNewLines(existingId, state.agents, state.waitingTimers, state.permissionTimers, sendMessage);
  }
}

/**
 * Seed virtual agents for all OpenClaw agents that are not already tracked.
 */
export function seedInactiveOpenclawAgents(
  project: MonitoredProject,
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  if (!state.showInactiveAgents.current) return;
  const openclawDir = project.sessionDir; // ~/.openclaw/
  const agentsDir = path.join(openclawDir, 'agents');
  if (!fs.existsSync(agentsDir)) return;

  // Read agent names from openclaw.json
  let agentNames: Record<string, string> = {};
  try {
    const configPath = path.join(openclawDir, 'openclaw.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const list = config?.agents?.list;
      if (Array.isArray(list)) {
        for (const a of list) {
          if (a.id) agentNames[a.id] = a.name || a.id;
        }
      }
    }
  } catch { /* ignore */ }

  try {
    for (const dir of fs.readdirSync(agentsDir)) {
      const sessDir = path.join(agentsDir, dir, 'sessions');
      if (!fs.existsSync(sessDir)) continue;

      // Check if agent with this openclawAgentId already exists
      let exists = false;
      for (const agent of state.agents.values()) {
        if (agent.openclawAgentId === dir) { exists = true; break; }
      }
      if (exists) continue;

      // Read identity from workspace/IDENTITY.md
      const identity = readAgentIdentity(openclawDir, dir);
      const name = identity.name || agentNames[dir];
      createVirtualAgent(dir, name, project, state, sendMessage, identity.gender);
    }
  } catch { /* ignore */ }
}

// Find all .jsonl files in a session directory.
// For OpenClaw, sessions live under agents/<name>/sessions/, so we scan recursively.
// For Claude Code, sessions are flat in the directory.
function findJsonlFiles(sessionDir: string, source: string): string[] {
  if (!fs.existsSync(sessionDir)) return [];
  if (source === 'openclaw') {
    // Scan agents/*/sessions/*.jsonl
    const agentsDir = path.join(sessionDir, 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    const results: string[] = [];
    try {
      for (const agent of fs.readdirSync(agentsDir)) {
        const sessDir = path.join(agentsDir, agent, 'sessions');
        if (!fs.existsSync(sessDir)) continue;
        for (const f of fs.readdirSync(sessDir)) {
          if (f.endsWith('.jsonl')) results.push(path.join(sessDir, f));
        }
      }
    } catch { /* ignore */ }
    return results;
  }
  // Claude Code: flat directory
  try {
    return fs.readdirSync(sessionDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(sessionDir, f));
  } catch { return []; }
}

export interface AgentManagerState {
  readonly agents: Map<number, AgentState>;
  readonly fileWatchers: Map<number, fs.FSWatcher>;
  readonly pollingTimers: Map<number, ReturnType<typeof setInterval>>;
  readonly waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
  readonly permissionTimers: Map<number, ReturnType<typeof setTimeout>>;
  readonly activityLog: ActivityRecord[];
  readonly jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>;
  readonly knownJsonlFiles: Map<string, Set<string>>;
  readonly projectScanTimers: Map<string, ReturnType<typeof setInterval>>;
  readonly nextAgentId: { current: number };
  readonly showInactiveAgents: { current: boolean };
}

export function createAgentManagerState(showInactiveAgents = true): AgentManagerState {
  return {
    agents: new Map(),
    fileWatchers: new Map(),
    pollingTimers: new Map(),
    waitingTimers: new Map(),
    permissionTimers: new Map(),
    jsonlPollTimers: new Map(),
    knownJsonlFiles: new Map(),
    projectScanTimers: new Map(),
    nextAgentId: { current: 1 },
    showInactiveAgents: { current: showInactiveAgents },
    activityLog: [],
  };
}

/**
 * Start monitoring a project directory for JSONL session files.
 */
export function startProjectMonitoring(
  project: MonitoredProject,
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  const { sessionDir, id: projectId } = project;

  // Already monitoring this project
  if (state.projectScanTimers.has(projectId)) return;

  console.log(`[AgentManager] Starting monitoring for project: ${project.name} (${sessionDir})`);

  // Seed known files and detect active sessions
  const knownFiles = new Set<string>();
  const activeFiles: string[] = [];
  const files = findJsonlFiles(sessionDir, project.source);
  for (const f of files) {
    knownFiles.add(f);
    // If modified within last 5 minutes, treat as active session
    try {
      const stat = fs.statSync(f);
      const modifiedAgoMs = Date.now() - stat.mtimeMs;
      if (modifiedAgoMs < 5 * 60 * 1000) {
        activeFiles.push(f);
      }
    } catch {
      /* ignore */
    }
  }
  state.knownJsonlFiles.set(projectId, knownFiles);

  // Seed virtual agents for inactive OpenClaw agents FIRST
  // (so createAgent can find and upgrade them instead of creating duplicates)
  if (project.source === 'openclaw') {
    seedInactiveOpenclawAgents(project, state, sendMessage);
  }

  // Create/upgrade agents for active sessions found during seed (skip existing content)
  for (const file of activeFiles) {
    createAgent(file, project, state, sendMessage, true);
  }

  // Scan for new JSONL files at the determined session directory
  const scanTimer = setInterval(() => {
    scanForNewJsonlFiles(project, state, sendMessage);
  }, PROJECT_SCAN_INTERVAL_MS);
  state.projectScanTimers.set(projectId, scanTimer);

  // Initial scan
  scanForNewJsonlFiles(project, state, sendMessage);
}

/**
 * Stop monitoring a project directory.
 */
export function stopProjectMonitoring(
  projectId: string,
  state: AgentManagerState,
): void {
  const scanTimer = state.projectScanTimers.get(projectId);
  if (scanTimer) {
    clearInterval(scanTimer);
    state.projectScanTimers.delete(projectId);
  }
  state.knownJsonlFiles.delete(projectId);

  // Remove all agents belonging to this project
  const agentsToRemove: number[] = [];
  for (const [id, agent] of state.agents) {
    if (agent.projectDir === projectId || isAgentInProject(agent, projectId, state)) {
      agentsToRemove.push(id);
    }
  }
  for (const id of agentsToRemove) {
    removeAgent(id, state);
  }

  console.log(`[AgentManager] Stopped monitoring project: ${projectId}`);
}

function isAgentInProject(
  agent: AgentState,
  projectId: string,
  state: AgentManagerState,
): boolean {
  if (agent.jsonlFile === null) return false;
  const knownFiles = state.knownJsonlFiles.get(projectId);
  return knownFiles ? knownFiles.has(agent.jsonlFile) : false;
}

function scanForNewJsonlFiles(
  project: MonitoredProject,
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  const { sessionDir, id: projectId, source } = project;
  const knownFiles = state.knownJsonlFiles.get(projectId);
  if (!knownFiles) return;

  let files: string[];
  try {
    files = findJsonlFiles(sessionDir, source);
  } catch {
    return;
  }

  for (const file of files) {
    if (!knownFiles.has(file)) {
      knownFiles.add(file);

      // Check if this file is recent (modified within the last 60 seconds)
      try {
        const stat = fs.statSync(file);
        const modifiedAgoMs = Date.now() - stat.mtimeMs;
        if (modifiedAgoMs > 60_000) {
          // File hasn't been modified recently, skip it
          continue;
        }
      } catch {
        continue;
      }

      // Check if any existing agent is already tracking this file
      let alreadyTracked = false;
      for (const agent of state.agents.values()) {
        if (agent.jsonlFile === file) {
          alreadyTracked = true;
          break;
        }
      }
      if (alreadyTracked) continue;

      // For OpenClaw: check if this file belongs to a virtual agent that should be upgraded
      if (source === 'openclaw') {
        const openclawAgentId = extractOpenclawAgentId(file);
        if (openclawAgentId) {
          const virtualId = findVirtualAgentByOpenclawId(openclawAgentId, state);
          if (virtualId !== null) {
            upgradeVirtualAgent(virtualId, file, state, sendMessage);
            continue;
          }
          // Check if this agent already has an active session (reassign on /clear)
          const existingActiveId = findActiveAgentByOpenclawId(openclawAgentId, state);
          if (existingActiveId !== null) {
            console.log(
              `[AgentManager] New JSONL detected: ${path.basename(file)}, reassigning to agent ${existingActiveId}`,
            );
            reassignAgentToFile(existingActiveId, file, state, sendMessage);
            continue;
          }
        }
      } else {
        // Claude Code: check if there is an active agent that should be reassigned
        const existingAgent = findActiveAgentForProject(projectId, state);
        if (existingAgent !== null) {
          console.log(
            `[AgentManager] New JSONL detected: ${path.basename(file)}, reassigning to agent ${existingAgent}`,
          );
          reassignAgentToFile(existingAgent, file, state, sendMessage);
          continue;
        }
      }
      // Create new agent for this file
      createAgent(file, project, state, sendMessage);
    }
  }

  // Check for deleted JSONL files (agent sessions that ended)
  checkForClosedSessions(projectId, files, state, sendMessage);
}

function findActiveAgentForProject(
  projectId: string,
  state: AgentManagerState,
): number | null {
  for (const [id, agent] of state.agents) {
    if (agent.isVirtual) continue;
    if (agent.projectDir === projectId && !agent.isWaiting) {
      return id;
    }
  }
  // If no active agent, return any non-virtual agent for this project
  for (const [id, agent] of state.agents) {
    if (agent.isVirtual) continue;
    if (agent.projectDir === projectId) {
      return id;
    }
  }
  return null;
}

function checkForClosedSessions(
  projectId: string,
  currentFiles: string[],
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  const currentFileSet = new Set(currentFiles);
  const agentsToClose: number[] = [];

  for (const [id, agent] of state.agents) {
    if (agent.isVirtual) continue;
    if (agent.projectDir === projectId && agent.jsonlFile !== null && !currentFileSet.has(agent.jsonlFile)) {
      // JSONL file was deleted -> session ended
      agentsToClose.push(id);
    }
  }

  for (const id of agentsToClose) {
    const agent = state.agents.get(id);
    if (!agent) continue;

    if (agent.source === 'openclaw' && state.showInactiveAgents.current) {
      // Revert to virtual instead of removing
      console.log(`[AgentManager] JSONL file removed, reverting agent ${id} to virtual`);
      if (agent.jsonlFile !== null) {
        stopFileWatching(id, agent.jsonlFile, state.fileWatchers, state.pollingTimers);
      }
      clearAgentActivity(agent, id, state.permissionTimers, sendMessage);
      cancelWaitingTimer(id, state.waitingTimers);
      cancelPermissionTimer(id, state.permissionTimers);
      agent.jsonlFile = null;
      agent.isVirtual = true;
      agent.fileOffset = 0;
      agent.lineBuffer = '';
      sendMessage({ type: 'agentDeactivated', id });
    } else {
      // Normal close
      console.log(`[AgentManager] JSONL file removed, closing agent ${id}`);
      removeAgent(id, state);
      sendMessage({ type: 'agentClosed', id });
    }
  }
}

/**
 * Create a new agent for a JSONL file.
 */
export function createAgent(
  jsonlFile: string,
  project: MonitoredProject,
  state: AgentManagerState,
  sendMessage: MessageSender,
  skipExistingContent = false,
): number {
  const id = state.nextAgentId.current++;
  const folderName = project.name;

  // For existing sessions, skip to end of file so we only see new activity
  let initialOffset = 0;
  if (skipExistingContent) {
    try {
      const stat = fs.statSync(jsonlFile);
      initialOffset = stat.size;
    } catch {
      /* file may not exist yet */
    }
  }

  // Extract OpenClaw agent identity if applicable
  let openclawAgentId: string | undefined;
  let agentName: string | undefined;
  let identityGender: 'male' | 'female' | 'any' | undefined;
  if (project.source === 'openclaw') {
    openclawAgentId = extractOpenclawAgentId(jsonlFile);
    if (openclawAgentId) {
      // Check if a virtual agent already exists for this OpenClaw agent
      const existingVirtualId = findVirtualAgentByOpenclawId(openclawAgentId, state);
      if (existingVirtualId !== null) {
        upgradeVirtualAgent(existingVirtualId, jsonlFile, state, sendMessage);
        return existingVirtualId;
      }

      // Derive the openclaw root dir from the jsonlFile path:
      // <root>/agents/<id>/sessions/<file> → go up 3 levels from the sessions dir
      const openclawDir = path.resolve(path.dirname(jsonlFile), '..', '..', '..');
      agentName = readOpenclawAgentName(openclawDir, openclawAgentId);

      // Read identity from workspace IDENTITY.md (may override name)
      const identity = readAgentIdentity(openclawDir, openclawAgentId);
      if (identity.name) agentName = identity.name;
      if (identity.gender) identityGender = identity.gender;

      if (agentName) {
        console.log(`[AgentManager] Agent ${id}: OpenClaw agent "${agentName}" (${openclawAgentId})${identityGender ? ` [${identityGender}]` : ''}`);
      }
    }
  }

  const agent: AgentState = {
    id,
    projectDir: project.id,
    jsonlFile,
    fileOffset: initialOffset,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    folderName: agentName || folderName,
    source: project.source,
    isVirtual: false,
    openclawAgentId,
    agentName,
    identityGender,
  };

  state.agents.set(id, agent);
  console.log(
    `[AgentManager] Agent ${id}: created for ${path.basename(jsonlFile)} (${project.source})`,
  );
  sendMessage({ type: 'agentCreated', id, folderName: agentName || folderName, source: project.source, projectId: project.id, openclawAgentId, agentName, isActive: true, identityGender });

  // Start watching the file if it exists, otherwise poll for it
  if (fs.existsSync(jsonlFile)) {
    startFileWatching(
      id,
      jsonlFile,
      state.agents,
      state.fileWatchers,
      state.pollingTimers,
      state.waitingTimers,
      state.permissionTimers,
      sendMessage,
    );
    readNewLines(id, state.agents, state.waitingTimers, state.permissionTimers, sendMessage);
  } else {
    const pollTimer = setInterval(() => {
      try {
        if (agent.jsonlFile !== null && fs.existsSync(agent.jsonlFile)) {
          console.log(
            `[AgentManager] Agent ${id}: found JSONL file ${path.basename(agent.jsonlFile)}`,
          );
          clearInterval(pollTimer);
          state.jsonlPollTimers.delete(id);
          startFileWatching(
            id,
            agent.jsonlFile,
            state.agents,
            state.fileWatchers,
            state.pollingTimers,
            state.waitingTimers,
            state.permissionTimers,
            sendMessage,
          );
          readNewLines(id, state.agents, state.waitingTimers, state.permissionTimers, sendMessage);
        }
      } catch {
        /* file may not exist yet */
      }
    }, JSONL_POLL_INTERVAL_MS);
    state.jsonlPollTimers.set(id, pollTimer);
  }

  return id;
}

/**
 * Reassign an existing agent to a new JSONL file (e.g., after /clear).
 */
function reassignAgentToFile(
  agentId: number,
  newFilePath: string,
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  const agent = state.agents.get(agentId);
  if (!agent) return;

  // Stop old file watching
  if (agent.jsonlFile !== null) {
    stopFileWatching(agentId, agent.jsonlFile, state.fileWatchers, state.pollingTimers);
  }

  // Clear activity
  cancelWaitingTimer(agentId, state.waitingTimers);
  cancelPermissionTimer(agentId, state.permissionTimers);
  clearAgentActivity(agent, agentId, state.permissionTimers, sendMessage);

  // Swap to new file
  agent.jsonlFile = newFilePath;
  agent.fileOffset = 0;
  agent.lineBuffer = '';

  // Start watching new file
  startFileWatching(
    agentId,
    newFilePath,
    state.agents,
    state.fileWatchers,
    state.pollingTimers,
    state.waitingTimers,
    state.permissionTimers,
    sendMessage,
  );
  readNewLines(agentId, state.agents, state.waitingTimers, state.permissionTimers, sendMessage);
}

/**
 * Remove an agent and clean up all resources.
 */
export function removeAgent(
  agentId: number,
  state: AgentManagerState,
): void {
  const agent = state.agents.get(agentId);
  if (!agent) return;

  // Stop JSONL poll timer
  const jpTimer = state.jsonlPollTimers.get(agentId);
  if (jpTimer) {
    clearInterval(jpTimer);
  }
  state.jsonlPollTimers.delete(agentId);

  // Stop file watching (only if agent has a real file)
  if (agent.jsonlFile !== null) {
    stopFileWatching(agentId, agent.jsonlFile, state.fileWatchers, state.pollingTimers);
  }

  // Cancel timers
  cancelWaitingTimer(agentId, state.waitingTimers);
  cancelPermissionTimer(agentId, state.permissionTimers);

  // Remove from maps
  state.agents.delete(agentId);
}

/**
 * Send existing agents to a newly connected client.
 */
export function sendExistingAgents(
  state: AgentManagerState,
  sendMessage: MessageSender,
): void {
  const agentIds: number[] = [];
  const agentMeta: Record<number, { folderName?: string; source: string; projectId?: string; openclawAgentId?: string; agentName?: string; isActive?: boolean; identityGender?: 'male' | 'female' | 'any' }> = {};

  for (const [id, agent] of state.agents) {
    agentIds.push(id);
    agentMeta[id] = {
      folderName: agent.folderName,
      source: agent.source,
      projectId: agent.projectDir,
      openclawAgentId: agent.openclawAgentId,
      agentName: agent.agentName,
      isActive: !agent.isVirtual,
      identityGender: agent.identityGender,
    };
  }
  agentIds.sort((a, b) => a - b);

  sendMessage({
    type: 'existingAgents',
    agents: agentIds,
    agentMeta,
  });

  // Re-send current agent statuses
  for (const [agentId, agent] of state.agents) {
    for (const [toolId, status] of agent.activeToolStatuses) {
      sendMessage({
        type: 'agentToolStart',
        id: agentId,
        toolId,
        status,
      });
    }
    if (agent.isWaiting) {
      sendMessage({
        type: 'agentStatus',
        id: agentId,
        status: 'waiting',
      });
    }
  }
}

/**
 * Dispose all agents and timers.
 */
export function disposeAll(state: AgentManagerState): void {
  // Stop all project scan timers
  for (const [, timer] of state.projectScanTimers) {
    clearInterval(timer);
  }
  state.projectScanTimers.clear();

  // Remove all agents
  for (const id of [...state.agents.keys()]) {
    removeAgent(id, state);
  }
}
