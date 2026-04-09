import { Router } from 'express';
import fs from 'node:fs';
import { getConfig, updateConfig, type SessionSourceOption } from '../config.js';
import { clearCache } from '../services/eventTailReader.js';

type ConfigResponse = {
  sessionStateDir: string;
  tailBytes: number;
  staleThresholdMs: number;
  maxTimelineEvents: number;
  claudeDir: string;
  sessionSources: SessionSourceOption;
};

type ConfigPatch = Partial<ConfigResponse>;

const ALLOWED_TAIL_BYTES = [262144, 524288, 1048576, 2097152];
const ALLOWED_STALE_THRESHOLD_MS = [60000, 300000, 900000, 1800000];
const ALLOWED_MAX_TIMELINE_EVENTS = [50, 100, 200, 500];
const ALLOWED_SESSION_SOURCES: SessionSourceOption[] = ['auto', 'copilot', 'claude', 'both'];
const ALLOWED_KEYS = new Set<keyof ConfigResponse>([
  'sessionStateDir',
  'tailBytes',
  'staleThresholdMs',
  'maxTimelineEvents',
  'claudeDir',
  'sessionSources',
]);

const configRouter = Router();

function toConfigResponse(config: ReturnType<typeof getConfig>): ConfigResponse {
  return {
    sessionStateDir: config.sessionStateDir,
    tailBytes: config.tailBytes,
    staleThresholdMs: config.staleThresholdMs,
    maxTimelineEvents: config.maxTimelineEvents,
    claudeDir: config.claudeDir,
    sessionSources: config.sessionSources,
  };
}

configRouter.get('/config', (req, res) => {
  res.json(toConfigResponse(getConfig()));
});

configRouter.patch('/config', (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object.' });
    return;
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key as keyof ConfigResponse)) {
      res.status(400).json({ error: `Unknown config field: ${key}` });
      return;
    }
  }

  const patch: ConfigPatch = {};

  if ('sessionStateDir' in body) {
    const sessionStateDir = body.sessionStateDir;
    if (typeof sessionStateDir !== 'string' || sessionStateDir.trim() === '') {
      res.status(400).json({ error: 'sessionStateDir must be a non-empty string.' });
      return;
    }

    try {
      if (!fs.existsSync(sessionStateDir)) {
        res.status(400).json({ error: 'sessionStateDir path does not exist.' });
        return;
      }

      if (!fs.statSync(sessionStateDir).isDirectory()) {
        res.status(400).json({ error: 'sessionStateDir must be an existing directory.' });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: `Invalid sessionStateDir: ${message}` });
      return;
    }

    patch.sessionStateDir = sessionStateDir;
  }

  if ('tailBytes' in body) {
    const tailBytes = body.tailBytes;
    if (!ALLOWED_TAIL_BYTES.includes(tailBytes)) {
      res.status(400).json({
        error: `tailBytes must be one of: ${ALLOWED_TAIL_BYTES.join(', ')}`,
      });
      return;
    }
    patch.tailBytes = tailBytes;
  }

  if ('staleThresholdMs' in body) {
    const staleThresholdMs = body.staleThresholdMs;
    if (!ALLOWED_STALE_THRESHOLD_MS.includes(staleThresholdMs)) {
      res.status(400).json({
        error: `staleThresholdMs must be one of: ${ALLOWED_STALE_THRESHOLD_MS.join(', ')}`,
      });
      return;
    }
    patch.staleThresholdMs = staleThresholdMs;
  }

  if ('maxTimelineEvents' in body) {
    const maxTimelineEvents = body.maxTimelineEvents;
    if (!ALLOWED_MAX_TIMELINE_EVENTS.includes(maxTimelineEvents)) {
      res.status(400).json({
        error: `maxTimelineEvents must be one of: ${ALLOWED_MAX_TIMELINE_EVENTS.join(', ')}`,
      });
      return;
    }
    patch.maxTimelineEvents = maxTimelineEvents;
  }

  if ('claudeDir' in body) {
    const claudeDir = body.claudeDir;
    if (typeof claudeDir !== 'string' || claudeDir.trim() === '') {
      res.status(400).json({ error: 'claudeDir must be a non-empty string.' });
      return;
    }
    patch.claudeDir = claudeDir;
  }

  if ('sessionSources' in body) {
    const sessionSources = body.sessionSources;
    if (!ALLOWED_SESSION_SOURCES.includes(sessionSources)) {
      res.status(400).json({
        error: `sessionSources must be one of: ${ALLOWED_SESSION_SOURCES.join(', ')}`,
      });
      return;
    }
    patch.sessionSources = sessionSources;
  }

  const currentConfig = getConfig();
  const updatedConfig = updateConfig(patch);

  const shouldClearCache =
    (patch.tailBytes !== undefined && patch.tailBytes !== currentConfig.tailBytes) ||
    (patch.sessionStateDir !== undefined && patch.sessionStateDir !== currentConfig.sessionStateDir);

  if (shouldClearCache) {
    clearCache();
  }

  res.json(toConfigResponse(updatedConfig));
});

export default configRouter;
