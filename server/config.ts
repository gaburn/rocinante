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

export interface LaunchCommands {
  copilot: string;
  claude: string;
  shell: string;
}

export const DEFAULT_LAUNCH_COMMANDS: Readonly<LaunchCommands> = {
  copilot: 'copilot',
  claude: 'claude',
  shell: '',
};

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
  adoRepository: string;
  adoFilterByCreator: boolean;
  claudeDir: string;
  sessionSources: SessionSourceOption;
  launchCommands: LaunchCommands;
}

function parseSessionSources(value: string | undefined): SessionSourceOption {
  if (value === 'copilot' || value === 'claude' || value === 'both') return value;
  return 'auto';
}

// ── Shared config directory ───────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.rocinante');

// ── Launch commands disk persistence ─────────────────────────────

const LAUNCH_COMMANDS_PATH = path.join(CONFIG_DIR, 'launch-commands.json');

export function loadLaunchCommandsFromDisk(): Partial<LaunchCommands> {
  try {
    if (!fs.existsSync(LAUNCH_COMMANDS_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(LAUNCH_COMMANDS_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const result: Partial<LaunchCommands> = {};
      for (const key of ['copilot', 'claude', 'shell'] as const) {
        if (typeof obj[key] === 'string') {
          result[key] = obj[key] as string;
        }
      }
      if (Object.keys(result).length > 0) {
        console.log(`[Config] Loaded launch commands from disk: ${JSON.stringify(result)}`);
      }
      return result;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveLaunchCommandsToDisk(commands: LaunchCommands): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(LAUNCH_COMMANDS_PATH, JSON.stringify(commands, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error('[Config] Failed to save launch commands to disk:', err instanceof Error ? err.message : String(err));
  }
}

// ── ADO config disk persistence ──────────────────────────────────

const ADO_CONFIG_DIR = CONFIG_DIR;
const ADO_CONFIG_PATH = path.join(ADO_CONFIG_DIR, 'ado-config.json');

interface AdoDiskConfig {
  organization: string;
  project: string;
  repository?: string;
  filterByCreator?: boolean;
}

export function loadAdoConfigFromDisk(): { organization: string | null; project: string | null; repository: string | null; filterByCreator: boolean | null } {
  try {
    if (!fs.existsSync(ADO_CONFIG_PATH)) {
      return { organization: null, project: null, repository: null, filterByCreator: null };
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
      const repository = typeof obj.repository === 'string' ? obj.repository : null;
      const filterByCreator = typeof obj.filterByCreator === 'boolean' ? obj.filterByCreator : null;
      if (organization || project) {
        console.log(`[ADO] Loaded config from ~/.rocinante/ado-config.json: org=${organization ?? ''}, project=${project ?? ''}`);
      }
      return { organization, project, repository, filterByCreator };
    }
    return { organization: null, project: null, repository: null, filterByCreator: null };
  } catch {
    return { organization: null, project: null, repository: null, filterByCreator: null };
  }
}

export function saveAdoConfigToDisk(organization: string, project: string, repository: string, filterByCreator: boolean): void {
  try {
    if (!fs.existsSync(ADO_CONFIG_DIR)) {
      fs.mkdirSync(ADO_CONFIG_DIR, { recursive: true });
    }
    const data: AdoDiskConfig = { organization, project, repository, filterByCreator };
    fs.writeFileSync(ADO_CONFIG_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error('[ADO] Failed to save config to disk:', err instanceof Error ? err.message : String(err));
  }
}

// ── Runtime config initialization ────────────────────────────────

const diskConfig = loadAdoConfigFromDisk();
const diskLaunchCommands = loadLaunchCommandsFromDisk();

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
  adoRepository: process.env.ADO_REPOSITORY || diskConfig.repository || '',
  adoFilterByCreator: process.env.ADO_FILTER_BY_CREATOR === 'true' || diskConfig.filterByCreator || false,
  claudeDir: process.env.CLAUDE_DIR || path.join(os.homedir(), '.claude'),
  sessionSources: parseSessionSources(process.env.SESSION_SOURCES),
  launchCommands: { ...DEFAULT_LAUNCH_COMMANDS, ...diskLaunchCommands },
};

export function getConfig(): Readonly<RuntimeConfig> {
  return { ...runtimeConfig };
}

export function updateConfig(partial: Partial<RuntimeConfig>): RuntimeConfig {
  const adoChanged =
    ('adoOrganization' in partial && partial.adoOrganization !== runtimeConfig.adoOrganization) ||
    ('adoProject' in partial && partial.adoProject !== runtimeConfig.adoProject) ||
    ('adoRepository' in partial && partial.adoRepository !== runtimeConfig.adoRepository) ||
    ('adoFilterByCreator' in partial && partial.adoFilterByCreator !== runtimeConfig.adoFilterByCreator);

  const launchCommandsChanged =
    'launchCommands' in partial && partial.launchCommands !== undefined;

  Object.assign(runtimeConfig, partial);

  if (adoChanged) {
    saveAdoConfigToDisk(runtimeConfig.adoOrganization, runtimeConfig.adoProject, runtimeConfig.adoRepository, runtimeConfig.adoFilterByCreator);
  }

  if (launchCommandsChanged) {
    saveLaunchCommandsToDisk(runtimeConfig.launchCommands);
  }

  return { ...runtimeConfig };
}

export function isAdoConfigured(): boolean {
  return runtimeConfig.adoOrganization !== ''
    && runtimeConfig.adoProject !== '';
}
