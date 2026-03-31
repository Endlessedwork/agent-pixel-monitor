/** Clean up verbose tool names (especially MCP tools) into readable labels */
function formatToolLabel(raw: string): string {
  // MCP tools: "mcp__Claude_Preview__preview_screenshot" → "Claude Preview: screenshot"
  if (raw.startsWith('mcp__')) {
    const parts = raw.slice(5).split('__');
    if (parts.length >= 2) {
      const server = parts.slice(0, -1).join('/').replace(/_/g, ' ');
      const action = parts[parts.length - 1].replace(/_/g, ' ');
      return `${server}: ${action}`;
    }
    return parts[0].replace(/_/g, ' ');
  }
  // ToolSearch → "Tool Search", TodoWrite → "Todo Write"
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Map status prefix to a short icon + label */
export function formatActivity(status: string): { icon: string; label: string } {
  if (status.startsWith('Reading ')) return { icon: '\u{1F4D6}', label: `Read ${status.slice(8)}` || 'Reading...' };
  if (status.startsWith('Editing ')) return { icon: '\u{270F}\u{FE0F}', label: `Edit ${status.slice(8)}` || 'Editing...' };
  if (status.startsWith('Writing ')) return { icon: '\u{1F4DD}', label: `Write ${status.slice(8)}` || 'Writing...' };
  if (status.startsWith('Running:')) return { icon: '\u{1F4BB}', label: `Run: ${status.slice(9).trim()}` };
  if (status.startsWith('Subtask:'))
    return { icon: '\u{1F916}', label: `Subtask: ${status.slice(9).trim()}` };
  if (status.startsWith('Running subtask'))
    return { icon: '\u{1F916}', label: 'Running subtask' };
  if (status.startsWith('Searching files')) return { icon: '\u{1F50D}', label: `Glob: ${status.slice(16).trim() || 'files'}` };
  if (status.startsWith('Searching code')) return { icon: '\u{1F50D}', label: `Grep: ${status.slice(15).trim() || 'code'}` };
  if (status === 'Fetching web content') return { icon: '\u{1F310}', label: 'Fetch web content' };
  if (status.startsWith('Fetching ')) return { icon: '\u{1F310}', label: `Fetch ${status.slice(9)}` };
  if (status === 'Searching the web') return { icon: '\u{1F310}', label: 'Web search' };
  if (status.startsWith('Searching web: ')) return { icon: '\u{1F310}', label: `Search: ${status.slice(15)}` };
  if (status === 'Waiting for your answer') return { icon: '\u{2753}', label: 'Waiting for answer' };
  if (status === 'Planning') return { icon: '\u{1F4CB}', label: 'Planning mode' };
  if (status === 'Editing notebook') return { icon: '\u{1F4D3}', label: 'Edit notebook' };
  if (status.startsWith('Spawning agent')) return { icon: '\u{1F680}', label: `Spawn agent: ${status.slice(16) || 'agent'}` };
  if (status === 'Yielding session') return { icon: '\u{23F8}\u{FE0F}', label: 'Yield session' };
  if (status === 'Sending message') return { icon: '\u{1F4E8}', label: 'Send message' };
  if (status === 'Listing sessions') return { icon: '\u{1F4CB}', label: 'List sessions' };
  if (status === 'Listing agents') return { icon: '\u{1F4CB}', label: 'List agents' };
  if (status.startsWith('Reviewing ')) return { icon: '\u{1F4C4}', label: `Review ${status.slice(10)}` };
  if (status.startsWith('Checking ')) return { icon: '\u{1F50D}', label: `Check ${status.slice(9)}` };
  if (status === 'Searching memory') return { icon: '\u{1F9E0}', label: 'Search memory' };
  if (status.startsWith('Browsing')) return { icon: '\u{1F310}', label: `Browse ${status.slice(9).trim() || 'web'}` };
  if (status.startsWith('Managing ')) return { icon: '\u{2699}\u{FE0F}', label: `Manage ${status.slice(9)}` };
  if (status.startsWith('curl ')) return { icon: '\u{1F310}', label: `curl ${status.slice(5)}` };
  if (status === 'Running curl') return { icon: '\u{1F310}', label: 'Running curl' };
  if (status.startsWith('Using ')) {
    const raw = status.slice(6);
    return { icon: '\u{1F527}', label: formatToolLabel(raw) };
  }
  return { icon: '\u{2699}\u{FE0F}', label: status };
}
