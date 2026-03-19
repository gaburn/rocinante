/**
 * Maps timeline event type strings to visual style tokens.
 *
 * Color semantics follow the dashboard-wide palette:
 *   emerald → success / AI activity
 *   amber   → in-progress / pending
 *   indigo  → user-initiated action
 *   red     → error / failure
 *   gray    → neutral lifecycle
 */

export function getEventStyle(eventType: string): {
  colorClass: string;
  label: string;
} {
  const t = eventType.toLowerCase();

  // Errors & failures always take priority regardless of prefix
  if (t.includes('error') || t.includes('failed')) {
    return { colorClass: 'text-red-400', label: 'Error' };
  }

  if (t.startsWith('session.')) {
    return { colorClass: 'text-fg-muted', label: 'Session' };
  }

  if (t === 'user.message') {
    return { colorClass: 'text-indigo-400', label: 'User' };
  }

  if (t.startsWith('assistant.')) {
    return { colorClass: 'text-emerald-400', label: 'Assistant' };
  }

  if (t === 'tool.execution_start') {
    return { colorClass: 'text-amber-400', label: 'Tool' };
  }

  if (t === 'tool.execution_complete') {
    return { colorClass: 'text-emerald-400', label: 'Tool' };
  }

  // Catch-all for unknown event types
  return { colorClass: 'text-fg-muted', label: 'Event' };
}
