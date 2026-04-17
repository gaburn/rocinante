import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SESSION_STATE_DIR =
  process.env.SESSION_STATE_DIR || path.join(os.homedir(), '.copilot', 'session-state');

export const SQLITE_DB_PATH =
  process.env.SQLITE_DB_PATH || path.join(os.homedir(), '.copilot', 'session-store.db');

export const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
export const TAIL_BYTES = parseInt(process.env.TAIL_BYTES || '524288', 10); // 512KB
export const STALE_THRESHOLD_MS = parseInt(process.env.STALE_THRESHOLD_MS || '300000', 10); // 5 min
export const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '10000', 10); // 10 sec
export const MAX_TIMELINE_EVENTS = parseInt(process.env.MAX_TIMELINE_EVENTS || '100', 10);

export type SessionSourceOption = 'auto' | 'copilot' | 'claude' | 'both';

export interface RuntimeConfig {
  sessionStateDir: string;
  sqliteDbPath: string;
  apiPort: number;
  tailBytes: number;
  staleThresholdMs: number;
  cacheTtlMs: number;
  maxTimelineEvents: number;
  adoOrganization: string;
  adoProject: string;
  claudeDir: string;
  sessionSources: SessionSourceOption;
}

function parseSessionSources(value: string | undefined): SessionSourceOption {
  if (value === 'copilot' || value === 'claude' || value === 'both') return value;
  return 'auto';
}

// ── ADO config disk persistence ──────────────────────────────────

const ADO_CONFIG_DIR = path.join(os.homedir(), '.rocinante');
const ADO_CONFIG_PATH = path.join(ADO_CONFIG_DIR, 'ado-config.json');

interface AdoDiskConfig {
  organization: string;
  project: string;
}

export function loadAdoConfigFromDisk(): { organization: string | null; project: string | null } {
  try {
    if (!fs.existsSync(ADO_CONFIG_PATH)) {
      return { organization: null, project: null };
    }
    const raw = fs.readFileSync(ADO_CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      const obj = parsed as Record<string, unknown>;
      const organization = typeof obj.organization === 'string' ? obj.organization : null;
      const project = typeof obj.project === 'string' ? obj.project : null;
      if (organization || project) {
        console.log(`[ADO] Loaded config from ~/.rocinante/ado-config.json: org=${organization ?? ''}, project=${project ?? ''}`);
      }
      return { organization, project };
    }
    return { organization: null, project: null };
  } catch {
    return { organization: null, project: null };
  }
}

export function saveAdoConfigToDisk(organization: string, project: string): void {
  try {
    if (!fs.existsSync(ADO_CONFIG_DIR)) {
      fs.mkdirSync(ADO_CONFIG_DIR, { recursive: true });
    }
    const data: AdoDiskConfig = { organization, project };
    fs.writeFileSync(ADO_CONFIG_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error('[ADO] Failed to save config to disk:', err instanceof Error ? err.message : String(err));
  }
}

// ── Runtime config initialization ────────────────────────────────

const diskConfig = loadAdoConfigFromDisk();

const runtimeConfig: RuntimeConfig = {
  sessionStateDir: process.env.SESSION_STATE_DIR || path.join(os.homedir(), '.copilot', 'session-state'),
  sqliteDbPath: process.env.SQLITE_DB_PATH || path.join(os.homedir(), '.copilot', 'session-store.db'),
  apiPort: parseInt(process.env.API_PORT || '3001', 10),
  tailBytes: parseInt(process.env.TAIL_BYTES || '524288', 10),
  staleThresholdMs: parseInt(process.env.STALE_THRESHOLD_MS || '300000', 10),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || '10000', 10),
  maxTimelineEvents: parseInt(process.env.MAX_TIMELINE_EVENTS || '100', 10),
  adoOrganization: process.env.ADO_ORG || diskConfig.organization || '',
  adoProject: process.env.ADO_PROJECT || diskConfig.project || '',
  claudeDir: process.env.CLAUDE_DIR || path.join(os.homedir(), '.claude'),
  sessionSources: parseSessionSources(process.env.SESSION_SOURCES),
};

export function getConfig(): Readonly<RuntimeConfig> {
  return { ...runtimeConfig };
}

export function updateConfig(partial: Partial<RuntimeConfig>): RuntimeConfig {
  const adoChanged =
    ('adoOrganization' in partial && partial.adoOrganization !== runtimeConfig.adoOrganization) ||
    ('adoProject' in partial && partial.adoProject !== runtimeConfig.adoProject);

  Object.assign(runtimeConfig, partial);

  if (adoChanged) {
    saveAdoConfigToDisk(runtimeConfig.adoOrganization, runtimeConfig.adoProject);
  }

  return { ...runtimeConfig };
}

export function isAdoConfigured(): boolean {
  return runtimeConfig.adoOrganization !== ''
    && runtimeConfig.adoProject !== '';
}
