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
import type { AgentState, MessageSender, MonitoredProject } from './types.js';

export interface AgentManagerState {
  readonly agents: Map<number, AgentState>;
  readonly fileWatchers: Map<number, fs.FSWatcher>;
  readonly pollingTimers: Map<number, ReturnType<typeof setInterval>>;
  readonly waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
  readonly permissionTimers: Map<number, ReturnType<typeof setTimeout>>;
  readonly jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>;
  readonly knownJsonlFiles: Map<string, Set<string>>;
  readonly projectScanTimers: Map<string, ReturnType<typeof setInterval>>;
  readonly nextAgentId: { current: number };
}

export function createAgentManagerState(): AgentManagerState {
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
  try {
    if (fs.existsSync(sessionDir)) {
      const files = fs
        .readdirSync(sessionDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(sessionDir, f));
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
    }
  } catch {
    /* dir may not exist yet */
  }
  state.knownJsonlFiles.set(projectId, knownFiles);

  // Create agents for active sessions found during seed (skip existing content)
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
    if (!fs.existsSync(sessionDir)) return;
    files = fs
      .readdirSync(sessionDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(sessionDir, f));
  } catch {
    return;
  }

  for (const file of files) {
    if (!knownFiles.has(file)) {
      knownFiles.add(file);

      // Check if this file is recent (created within the last 60 seconds)
      try {
        const stat = fs.statSync(file);
        const ageMs = Date.now() - stat.birthtimeMs;
        if (ageMs > 60_000) {
          // File is old, skip it (was created before we started monitoring)
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

      // Check if there is an active agent on this project that should be reassigned
      // (similar to /clear detection in the original)
      const existingAgent = findActiveAgentForProject(projectId, state);
      if (existingAgent !== null) {
        console.log(
          `[AgentManager] New JSONL detected: ${path.basename(file)}, reassigning to agent ${existingAgent}`,
        );
        reassignAgentToFile(existingAgent, file, state, sendMessage);
      } else {
        // Create new agent for this file
        createAgent(file, project, state, sendMessage);
      }
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
    if (agent.projectDir === projectId && !agent.isWaiting) {
      return id;
    }
  }
  // If no active agent, return any agent for this project
  for (const [id, agent] of state.agents) {
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
  const agentsToRemove: number[] = [];

  for (const [id, agent] of state.agents) {
    if (agent.projectDir === projectId && !currentFileSet.has(agent.jsonlFile)) {
      // JSONL file was deleted -> session ended
      agentsToRemove.push(id);
    }
  }

  for (const id of agentsToRemove) {
    console.log(`[AgentManager] JSONL file removed, closing agent ${id}`);
    removeAgent(id, state);
    sendMessage({ type: 'agentClosed', id });
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
    folderName,
    source: project.source,
  };

  state.agents.set(id, agent);
  console.log(
    `[AgentManager] Agent ${id}: created for ${path.basename(jsonlFile)} (${project.source})`,
  );
  sendMessage({ type: 'agentCreated', id, folderName, source: project.source, projectId: project.id });

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
        if (fs.existsSync(agent.jsonlFile)) {
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
  stopFileWatching(agentId, agent.jsonlFile, state.fileWatchers, state.pollingTimers);

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

  // Stop file watching
  stopFileWatching(agentId, agent.jsonlFile, state.fileWatchers, state.pollingTimers);

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
  const agentMeta: Record<number, { folderName?: string; source: string; projectId?: string }> = {};

  for (const [id, agent] of state.agents) {
    agentIds.push(id);
    agentMeta[id] = {
      folderName: agent.folderName,
      source: agent.source,
      projectId: agent.projectDir,
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
