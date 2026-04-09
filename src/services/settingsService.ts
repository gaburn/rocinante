export type SessionSourceOption = 'auto' | 'copilot' | 'claude' | 'both';

export interface ServerConfig {
  sessionStateDir: string;
  tailBytes: number;
  staleThresholdMs: number;
  maxTimelineEvents: number;
  claudeDir: string;
  sessionSources: SessionSourceOption;
}

export async function getServerConfig(): Promise<ServerConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export async function updateServerConfig(partial: Partial<ServerConfig>): Promise<ServerConfig> {
  const res = await fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `Failed to update config: ${res.status}`);
  }
  return res.json();
}
