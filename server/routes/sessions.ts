import { Router } from 'express';
import * as fs from 'node:fs';
import { mapAllSessionSummaries, mapSessionById } from '../services/sessionMapper.js';
import { readSessionPlan } from '../services/planReader.js';
import { generateDemoSessions, getDemoWorkstreams } from '../services/demoData.js';
import { searchConversations } from '../services/sqliteReader.js';
import { getConfig } from '../config.js';
import {
  getArchivedIds,
  setArchivedIds,
  addArchived,
  removeArchived,
  isArchived,
  isInitialized as isArchiveInitialized,
} from '../services/archiveStore.js';
import rateLimit from 'express-rate-limit';
import type { SessionSummary } from '../../src/types/index.js';
import type { SourceStatus } from '../services/providers/types.js';

const sessionsRouter = Router();

// Rate limit all session routes: 100 requests/minute per IP
const limiter = rateLimit({ max: 100, windowMs: 60_000 });
sessionsRouter.use(limiter);
let responseCache: { data: SessionSummary[]; expires: number; includeArchived: boolean } | null = null;

/** Invalidate the response cache (e.g., after a write-path event). */
export function invalidateSessionsCache(): void {
  responseCache = null;
}

sessionsRouter.get('/sessions', async (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      const sessions = generateDemoSessions();
      res.set('Cache-Control', 'no-cache');
      return res.json(sessions);
    }

    const includeArchived = req.query.includeArchived === 'true';
    const now = Date.now();

    // Serve from cache if same includeArchived flag and within TTL
    if (responseCache && now < responseCache.expires && responseCache.includeArchived === includeArchived) {
      res.set('Cache-Control', 'no-cache');
      return res.json(responseCache.data);
    }

    // Build exclude set BEFORE mapping so archived sessions are never processed
    const excludeIds = (!includeArchived && isArchiveInitialized())
      ? new Set(getArchivedIds())
      : undefined;

    const sessions = mapAllSessionSummaries(excludeIds);

    // ADO enrichment disabled — the MCP SDK dynamic import blocks the Node.js
    // event loop under tsx watch, and the REST fallback uses execSync which also
    // blocks. Deliverables are available per-session via the useSessionDeliverables
    // hook and GET /api/ado/session-deliverables?branch=X endpoint instead.
    // TODO: Re-enable when running with compiled JS (node dist/) in production.

    const { cacheTtlMs } = getConfig();
    responseCache = { data: sessions, expires: now + cacheTtlMs, includeArchived };

    res.set('Cache-Control', 'no-cache');
    res.json(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

sessionsRouter.get('/sessions/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q || q.length < 2) {
    return res.json([]);
  }
  if (process.env.DEMO_MODE === 'true') {
    return res.json([]);
  }
  try {
    const results = searchConversations(q);
    // Annotate each result with archive state so frontend can render differently
    const annotated = results.map((r) => ({
      ...r,
      isArchived: isArchived(r.sessionId),
    }));
    res.json(annotated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

/* ── Source status endpoint ────────────────────────────────────── */

sessionsRouter.get('/sessions/status', (_req, res) => {
  try {
    const { sqliteDbPath, sessionStateDir, claudeDir } = getConfig();

    const sqliteAvailable = fs.existsSync(sqliteDbPath);
    const filesystemAvailable = fs.existsSync(sessionStateDir);

    const status: SourceStatus = {
      copilot: {
        available: sqliteAvailable || filesystemAvailable,
        sqliteAvailable,
        filesystemAvailable,
        sessionStateDir,
      },
      claude: {
        available: fs.existsSync(claudeDir),
        claudeDir,
      },
    };

    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

/* ── Archive endpoints ────────────────────────────────────────── */

sessionsRouter.get('/sessions/archive', (_req, res) => {
  res.json({ ids: getArchivedIds() });
});

sessionsRouter.post('/sessions/archive', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.every((v: unknown) => typeof v === 'string')) {
    return res.status(400).json({ error: 'Body must include { ids: string[] }' });
  }
  setArchivedIds(ids);
  invalidateSessionsCache();
  res.json({ ids: getArchivedIds() });
});

sessionsRouter.post('/sessions/archive/add', (req, res) => {
  const { id } = req.body;
  if (typeof id !== 'string' || id.length === 0) {
    return res.status(400).json({ error: 'Body must include { id: string }' });
  }
  addArchived(id);
  invalidateSessionsCache();
  res.json({ ok: true });
});

sessionsRouter.post('/sessions/archive/remove', (req, res) => {
  const { id } = req.body;
  if (typeof id !== 'string' || id.length === 0) {
    return res.status(400).json({ error: 'Body must include { id: string }' });
  }
  removeArchived(id);
  invalidateSessionsCache();
  res.json({ ok: true });
});

sessionsRouter.get('/sessions/:id', (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      const session = generateDemoSessions().find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      return res.json(session);
    }

    const session = mapSessionById(req.params.id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

sessionsRouter.get('/demo/workstreams', (_req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    res.json(getDemoWorkstreams());
  } else {
    res.status(404).json({ error: 'Demo mode is not enabled' });
  }
});

sessionsRouter.get('/sessions/:id/plan', (req, res) => {
  try {
    const plan = readSessionPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'No plan found for this session' });
      return;
    }
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default sessionsRouter;
