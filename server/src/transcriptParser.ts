import * as path from 'path';

import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from './constants.js';
import {
  cancelPermissionTimer,
  cancelWaitingTimer,
  clearAgentActivity,
  startPermissionTimer,
  startWaitingTimer,
} from './timerManager.js';
import type { AgentState, MessageSender } from './types.js';

export const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion']);

export function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');
  const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '\u2026' : s;
  const name = toolName.toLowerCase();
  switch (name) {
    case 'read':
      return `Reading ${base(input.file_path) || 'file'}`;
    case 'edit':
      return `Editing ${base(input.file_path) || 'file'}`;
    case 'write':
      return `Writing ${base(input.file_path) || 'file'}`;
    case 'bash':
    case 'exec': {
      const cmd = (input.command as string) || '';
      // Extract URL from curl commands for better readability
      if (/^\s*curl\b/.test(cmd)) {
        const urlMatch = cmd.match(/(?:https?:\/\/)\S+/);
        if (urlMatch) {
          const url = urlMatch[0].replace(/['"]+$/g, '');
          return `curl ${truncate(url, 120)}`;
        }
        return 'Running curl';
      }
      return `Running: ${truncate(cmd, BASH_COMMAND_DISPLAY_MAX_LENGTH)}`;
    }
    case 'glob':
      return `Searching files${input.pattern ? `: ${input.pattern}` : ''}`;
    case 'grep':
      return `Searching code${input.pattern ? `: ${input.pattern}` : ''}`;
    case 'webfetch':
    case 'web_fetch': {
      const url = (input.url as string) || '';
      return url ? `Fetching ${truncate(url, 120)}` : 'Fetching web content';
    }
    case 'websearch':
    case 'web_search': {
      const query = (input.query as string) || '';
      return query ? `Searching web: ${truncate(query, 100)}` : 'Searching the web';
    }
    case 'browser': {
      const bUrl = (input.url as string) || '';
      return bUrl ? `Browsing ${truncate(bUrl, 120)}` : 'Browsing web';
    }
    case 'task':
    case 'agent': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc
        ? `Subtask: ${truncate(desc, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH)}`
        : 'Running subtask';
    }
    case 'sessions_spawn':
      return `Spawning agent${input.agentId ? `: ${input.agentId}` : input.agent ? `: ${input.agent}` : ''}`;
    case 'sessions_list':
      return 'Listing sessions';
    case 'sessions_history':
      return 'Reviewing session history';
    case 'session_status':
      return 'Checking session status';
    case 'sessions_yield':
      return 'Yielding session';
    case 'memory_search':
      return 'Searching memory';
    case 'message':
      return 'Sending message';
    case 'cron':
      return 'Managing cron job';
    case 'gateway':
      return 'Using gateway';
    case 'process':
      return 'Managing process';
    case 'agents_list':
      return 'Listing agents';
    case 'askuserquestion':
      return 'Waiting for your answer';
    case 'enterplanmode':
      return 'Planning';
    case 'notebookedit':
      return 'Editing notebook';
    default: {
      // MCP browser/navigation tools: extract URL if present
      if (name.includes('navigate') && input.url) {
        return `Browsing ${truncate(input.url as string, 120)}`;
      }
      return `Using ${toolName}`;
    }
  }
}

export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;
  try {
    const record = JSON.parse(line);

    if (record.type === 'assistant' && Array.isArray(record.message?.content)) {
      // Claude Code format: { type: 'assistant', message: { content: [...] } }
      processAssistantRecord(agentId, record, agent, agents, waitingTimers, permissionTimers, sendMessage);
    } else if (record.type === 'message' && record.message?.role === 'assistant') {
      // OpenClaw format: { type: 'message', message: { role: 'assistant', content: [...] } }
      processAssistantRecord(agentId, record, agent, agents, waitingTimers, permissionTimers, sendMessage);
    } else if (record.type === 'message' && record.message?.role === 'toolResult') {
      // OpenClaw format: { type: 'message', message: { role: 'toolResult', toolCallId: '...' } }
      processOpenclawToolResult(agentId, record, agent, waitingTimers, permissionTimers, sendMessage);
    } else if (record.type === 'progress') {
      processProgressRecord(agentId, record, agents, waitingTimers, permissionTimers, sendMessage);
    } else if (record.type === 'user') {
      processUserRecord(agentId, record, agent, waitingTimers, permissionTimers, sendMessage);
    } else if (record.type === 'message' && record.message?.role === 'user') {
      // OpenClaw format for user messages
      processUserRecord(agentId, { ...record, type: 'user' }, agent, waitingTimers, permissionTimers, sendMessage);
    } else if (record.type === 'system' && record.subtype === 'turn_duration') {
      processTurnDuration(agentId, agent, waitingTimers, permissionTimers, sendMessage);
    }
  } catch {
    // Ignore malformed lines
  }
}

function processAssistantRecord(
  agentId: number,
  record: Record<string, unknown>,
  agent: AgentState,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  const message = record.message as Record<string, unknown>;
  const blocks = message.content as Array<{
    type: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  // Support both Claude Code ('tool_use') and OpenClaw ('toolCall') formats
  const hasToolUse = blocks.some((b) => b.type === 'tool_use' || b.type === 'toolCall');

  if (hasToolUse) {
    cancelWaitingTimer(agentId, waitingTimers);
    agent.isWaiting = false;
    agent.hadToolsInTurn = true;
    sendMessage({ type: 'agentStatus', id: agentId, status: 'active' });
    let hasNonExemptTool = false;
    for (const block of blocks) {
      if ((block.type === 'tool_use' || block.type === 'toolCall') && block.id) {
        const toolName = block.name || '';
        const input = (block as Record<string, unknown>).input || (block as Record<string, unknown>).arguments || {};
        const status = formatToolStatus(toolName, input as Record<string, unknown>);
        console.log(`[Pixel Agents] Agent ${agentId} tool start: ${block.id} ${status}`);
        agent.activeToolIds.add(block.id);
        agent.activeToolStatuses.set(block.id, status);
        agent.activeToolNames.set(block.id, toolName);
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptTool = true;
        }
        sendMessage({
          type: 'agentToolStart',
          id: agentId,
          toolId: block.id,
          status,
        });
      }
    }
    if (hasNonExemptTool) {
      startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sendMessage);
    }
  } else if (blocks.some((b) => b.type === 'text') && !agent.hadToolsInTurn) {
    startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers, sendMessage);
  }
}

function processUserRecord(
  agentId: number,
  record: Record<string, unknown>,
  agent: AgentState,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (Array.isArray(content)) {
    const blocks = content as Array<{ type: string; tool_use_id?: string }>;
    const hasToolResult = blocks.some((b) => b.type === 'tool_result');
    if (hasToolResult) {
      for (const block of blocks) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          console.log(`[Pixel Agents] Agent ${agentId} tool done: ${block.tool_use_id}`);
          const completedToolId = block.tool_use_id;
          const completedToolName = agent.activeToolNames.get(completedToolId);
          if (completedToolName === 'Task' || completedToolName === 'Agent') {
            agent.activeSubagentToolIds.delete(completedToolId);
            agent.activeSubagentToolNames.delete(completedToolId);
            sendMessage({
              type: 'subagentClear',
              id: agentId,
              parentToolId: completedToolId,
            });
          }
          agent.activeToolIds.delete(completedToolId);
          agent.activeToolStatuses.delete(completedToolId);
          agent.activeToolNames.delete(completedToolId);
          const toolId = completedToolId;
          setTimeout(() => {
            sendMessage({
              type: 'agentToolDone',
              id: agentId,
              toolId,
            });
          }, TOOL_DONE_DELAY_MS);
        }
      }
      if (agent.activeToolIds.size === 0) {
        agent.hadToolsInTurn = false;
      }
    } else {
      cancelWaitingTimer(agentId, waitingTimers);
      clearAgentActivity(agent, agentId, permissionTimers, sendMessage);
      agent.hadToolsInTurn = false;
    }
  } else if (typeof content === 'string' && content.trim()) {
    cancelWaitingTimer(agentId, waitingTimers);
    clearAgentActivity(agent, agentId, permissionTimers, sendMessage);
    agent.hadToolsInTurn = false;
  }
}

/** Handle OpenClaw toolResult records (role: 'toolResult' at message level, not nested in content) */
function processOpenclawToolResult(
  agentId: number,
  record: Record<string, unknown>,
  agent: AgentState,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  const message = record.message as Record<string, unknown> | undefined;
  if (!message) return;
  const toolCallId = message.toolCallId as string | undefined;
  if (!toolCallId) return;

  console.log(`[Pixel Agents] Agent ${agentId} tool done: ${toolCallId}`);
  const completedToolName = agent.activeToolNames.get(toolCallId);
  if (completedToolName === 'Task' || completedToolName === 'Agent') {
    agent.activeSubagentToolIds.delete(toolCallId);
    agent.activeSubagentToolNames.delete(toolCallId);
    sendMessage({ type: 'subagentClear', id: agentId, parentToolId: toolCallId });
  }
  agent.activeToolIds.delete(toolCallId);
  agent.activeToolStatuses.delete(toolCallId);
  agent.activeToolNames.delete(toolCallId);
  const toolId = toolCallId;
  setTimeout(() => {
    sendMessage({ type: 'agentToolDone', id: agentId, toolId });
  }, TOOL_DONE_DELAY_MS);

  if (agent.activeToolIds.size === 0) {
    agent.hadToolsInTurn = false;
  }
}

function processTurnDuration(
  agentId: number,
  agent: AgentState,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  cancelWaitingTimer(agentId, waitingTimers);
  cancelPermissionTimer(agentId, permissionTimers);

  if (agent.activeToolIds.size > 0) {
    agent.activeToolIds.clear();
    agent.activeToolStatuses.clear();
    agent.activeToolNames.clear();
    agent.activeSubagentToolIds.clear();
    agent.activeSubagentToolNames.clear();
    sendMessage({ type: 'agentToolsClear', id: agentId });
  }

  agent.isWaiting = true;
  agent.permissionSent = false;
  agent.hadToolsInTurn = false;
  sendMessage({
    type: 'agentStatus',
    id: agentId,
    status: 'waiting',
  });
}

function processProgressRecord(
  agentId: number,
  record: Record<string, unknown>,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  const dataType = data.type as string | undefined;
  if (dataType === 'bash_progress' || dataType === 'mcp_progress') {
    if (agent.activeToolIds.has(parentToolId)) {
      startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sendMessage);
    }
    return;
  }

  const parentToolName = agent.activeToolNames.get(parentToolId);
  if (parentToolName !== 'Task' && parentToolName !== 'Agent') return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === 'assistant') {
    processSubagentAssistant(agentId, parentToolId, content, agent, agents, permissionTimers, sendMessage);
  } else if (msgType === 'user') {
    processSubagentUser(agentId, parentToolId, content, agent, agents, permissionTimers, sendMessage);
  }
}

function processSubagentAssistant(
  agentId: number,
  parentToolId: string,
  content: Array<Record<string, unknown>>,
  agent: AgentState,
  agents: Map<number, AgentState>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  let hasNonExemptSubTool = false;
  for (const block of content) {
    if (block.type === 'tool_use' && block.id) {
      const toolName = (block.name as string) || '';
      const status = formatToolStatus(toolName, (block.input as Record<string, unknown>) || {});
      console.log(
        `[Pixel Agents] Agent ${agentId} subagent tool start: ${block.id} ${status} (parent: ${parentToolId})`,
      );

      let subTools = agent.activeSubagentToolIds.get(parentToolId);
      if (!subTools) {
        subTools = new Set();
        agent.activeSubagentToolIds.set(parentToolId, subTools);
      }
      subTools.add(block.id as string);

      let subNames = agent.activeSubagentToolNames.get(parentToolId);
      if (!subNames) {
        subNames = new Map();
        agent.activeSubagentToolNames.set(parentToolId, subNames);
      }
      subNames.set(block.id as string, toolName);

      if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
        hasNonExemptSubTool = true;
      }

      sendMessage({
        type: 'subagentToolStart',
        id: agentId,
        parentToolId,
        toolId: block.id as string,
        status,
      });
    }
  }
  if (hasNonExemptSubTool) {
    startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sendMessage);
  }
}

function processSubagentUser(
  agentId: number,
  parentToolId: string,
  content: Array<Record<string, unknown>>,
  agent: AgentState,
  agents: Map<number, AgentState>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendMessage: MessageSender,
): void {
  for (const block of content) {
    if (block.type === 'tool_result' && block.tool_use_id) {
      console.log(
        `[Pixel Agents] Agent ${agentId} subagent tool done: ${block.tool_use_id} (parent: ${parentToolId})`,
      );

      const subTools = agent.activeSubagentToolIds.get(parentToolId);
      if (subTools) {
        subTools.delete(block.tool_use_id as string);
      }
      const subNames = agent.activeSubagentToolNames.get(parentToolId);
      if (subNames) {
        subNames.delete(block.tool_use_id as string);
      }

      const toolId = block.tool_use_id as string;
      setTimeout(() => {
        sendMessage({
          type: 'subagentToolDone',
          id: agentId,
          parentToolId,
          toolId,
        });
      }, TOOL_DONE_DELAY_MS);
    }
  }

  let stillHasNonExempt = false;
  for (const [, subNames] of agent.activeSubagentToolNames) {
    for (const [, toolName] of subNames) {
      if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
        stillHasNonExempt = true;
        break;
      }
    }
    if (stillHasNonExempt) break;
  }
  if (stillHasNonExempt) {
    startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sendMessage);
  }
}
