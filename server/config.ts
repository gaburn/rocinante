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

export interface RuntimeConfig {
  sessionStateDir: string;
  sqliteDbPath: string;
  apiPort: number;
  tailBytes: number;
  staleThresholdMs: number;
  cacheTtlMs: number;
  maxTimelineEvents: number;
}

const runtimeConfig: RuntimeConfig = {
  sessionStateDir: process.env.SESSION_STATE_DIR || path.join(os.homedir(), '.copilot', 'session-state'),
  sqliteDbPath: process.env.SQLITE_DB_PATH || path.join(os.homedir(), '.copilot', 'session-store.db'),
  apiPort: parseInt(process.env.API_PORT || '3001', 10),
  tailBytes: parseInt(process.env.TAIL_BYTES || '524288', 10),
  staleThresholdMs: parseInt(process.env.STALE_THRESHOLD_MS || '300000', 10),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || '10000', 10),
  maxTimelineEvents: parseInt(process.env.MAX_TIMELINE_EVENTS || '100', 10),
};

export function getConfig(): Readonly<RuntimeConfig> {
  return { ...runtimeConfig };
}

export function updateConfig(partial: Partial<RuntimeConfig>): RuntimeConfig {
  Object.assign(runtimeConfig, partial);
  return { ...runtimeConfig };
}
