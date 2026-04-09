import { SessionSource } from './types.js';
import { CopilotSessionSource } from './copilotSource.js';
import { ClaudeSessionSource } from './claudeSource.js';
import { getConfig, type SessionSourceOption } from '../../config.js';

export type { SessionSource } from './types.js';
export type { SessionSourceName } from './types.js';
export { CopilotSessionSource } from './copilotSource.js';
export { ClaudeSessionSource } from './claudeSource.js';

const sources: SessionSource[] = [
  new CopilotSessionSource(),
  new ClaudeSessionSource(),
];

/**
 * Returns sources that are both configured-on AND available on disk.
 * 'auto' mode returns all sources whose data dirs exist on disk.
 * 'both' returns all sources regardless of availability (may error).
 */
export function getActiveSources(): SessionSource[] {
  const config = getSessionSourcesConfig();
  return sources.filter((s) => {
    if (config === 'auto') return s.isAvailable();
    if (config === 'both') return true;
    if (!s.isAvailable()) return false;
    return s.name === config;
  });
}

export function getSourceByName(name: string): SessionSource | undefined {
  return sources.find(s => s.name === name);
}

export function getSessionSourcesConfig(): SessionSourceOption {
  return getConfig().sessionSources;
}
