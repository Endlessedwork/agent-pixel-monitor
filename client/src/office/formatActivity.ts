/** Clean up verbose tool names (especially MCP tools) into readable labels */
function formatToolLabel(raw: string): string {
  // MCP tools: "mcp__Claude_Preview__preview_screenshot" → "screenshot"
  if (raw.startsWith('mcp__')) {
    const parts = raw.slice(5).split('__');
    // Use the last segment as the action (most descriptive)
    const action = parts[parts.length - 1].replace(/_/g, ' ');
    return action;
  }
  // ToolSearch → "Tool Search", TodoWrite → "Todo Write"
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Map status prefix to a short icon + label */
export function formatActivity(status: string): { icon: string; label: string } {
  if (status.startsWith('Reading ')) return { icon: '\u{1F4D6}', label: status.slice(8) };
  if (status.startsWith('Editing ')) return { icon: '\u{270F}\u{FE0F}', label: status.slice(8) };
  if (status.startsWith('Writing ')) return { icon: '\u{1F4DD}', label: status.slice(8) };
  if (status.startsWith('Running:')) return { icon: '\u{1F4BB}', label: status.slice(9).trim() };
  if (status.startsWith('Running subtask') || status.startsWith('Subtask:'))
    return { icon: '\u{1F916}', label: status.startsWith('Subtask:') ? status.slice(9).trim() : 'subtask' };
  if (status === 'Searching files') return { icon: '\u{1F50D}', label: 'files' };
  if (status === 'Searching code') return { icon: '\u{1F50D}', label: 'code' };
  if (status === 'Fetching web content') return { icon: '\u{1F310}', label: 'fetch' };
  if (status === 'Searching the web') return { icon: '\u{1F310}', label: 'web' };
  if (status === 'Waiting for your answer') return { icon: '\u{2753}', label: 'waiting' };
  if (status === 'Planning') return { icon: '\u{1F4CB}', label: 'plan' };
  if (status === 'Editing notebook') return { icon: '\u{1F4D3}', label: 'notebook' };
  if (status.startsWith('Using ')) {
    const raw = status.slice(6);
    return { icon: '\u{1F527}', label: formatToolLabel(raw) };
  }
  return { icon: '\u{2699}\u{FE0F}', label: status };
}
