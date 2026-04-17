import { Router } from 'express';
import { mapAllSessionSummaries, mapSessionById } from '../services/sessionMapper.js';
import { readSessionPlan } from '../services/planReader.js';
import { generateDemoSessions, getDemoWorkstreams } from '../services/demoData.js';
import { searchConversations } from '../services/sqliteReader.js';
import { getConfig, isAdoConfigured } from '../config.js';
import { mcpListPullRequests, mcpGetPullRequest } from '../services/adoMcpClient.js';
import { getPullRequestsByBranches, getWorkItemsForPullRequest } from '../services/adoClient.js';
import type { AdoPullRequest } from '../../src/types/ado.js';
import {
  getArchivedIds,
  setArchivedIds,
  addArchived,
  removeArchived,
  isArchived,
  isInitialized as isArchiveInitialized,
} from '../services/archiveStore.js';
import type { SessionSummary } from '../../src/types/index.js';

const sessionsRouter = Router();

/* ── ADO enrichment for session summaries ─────────────────────── */
const ADO_ENRICHMENT_TIMEOUT_MS = 10_000;

/**
 * Enrich session summaries with ADO PR and work-item counts.
 * Mutates sessions in place. Uses MCP client first, falls back to REST.
 */
async function enrichSessionsWithAdoCounts(sessions: SessionSummary[]): Promise<void> {
  const branchSet = new Set<string>();
  for (const s of sessions) {
    if (s.branch) branchSet.add(s.branch);
  }
  if (branchSet.size === 0) {
    console.log(`[ENRICH] ${new Date().toISOString()} no branches to enrich — skipping`);
    return;
  }

  const config = getConfig();
  const project = config.adoProject;
  const branches = Array.from(branchSet);
  console.log(`[ENRICH] ${new Date().toISOString()} starting ADO enrichment for ${branches.length} branches`);

  // Step 1: Fetch PRs per branch (MCP first, REST fallback) — all branches in parallel
  console.log(`[ENRICH] ${new Date().toISOString()} step 1: fetching PRs per branch...`);
  const branchPrResults = await Promise.allSettled(
    branches.map(async (branch): Promise<{ branch: string; prs: AdoPullRequest[] }> => {
      try {
        const prs = await mcpListPullRequests({
          project,
          sourceRefName: `refs/heads/${branch}`,
          status: 'All',
        });
        return { branch, prs };
      } catch {
        const prs = await getPullRequestsByBranches([branch]);
        return { branch, prs };
      }
    }),
  );
  console.log(`[ENRICH] ${new Date().toISOString()} step 1 complete: ${branchPrResults.filter((r) => r.status === 'fulfilled').length}/${branchPrResults.length} succeeded`);

  // Step 2: For each branch's PRs, fetch work-item IDs — all branches in parallel
  console.log(`[ENRICH] ${new Date().toISOString()} step 2: fetching work-item IDs...`);
  const countResults = await Promise.allSettled(
    branchPrResults
      .filter((r): r is PromiseFulfilledResult<{ branch: string; prs: AdoPullRequest[] }> =>
        r.status === 'fulfilled')
      .map(async (r) => {
        const { branch, prs } = r.value;
        const workItemIds = new Set<number>();

        const wiResults = await Promise.allSettled(
          prs
            .filter((pr) => pr.repositoryId)
            .map(async (pr) => {
              try {
                const detail = await mcpGetPullRequest({
                  project,
                  repositoryId: pr.repositoryId!,
                  pullRequestId: pr.id,
                  includeWorkItemRefs: true,
                });
                return detail.workItemIds;
              } catch {
                const items = await getWorkItemsForPullRequest(pr.repositoryId!, pr.id);
                return items.map((wi) => wi.id);
              }
            }),
        );

        for (const wiResult of wiResults) {
          if (wiResult.status === 'fulfilled') {
            for (const id of wiResult.value) {
              workItemIds.add(id);
            }
          }
        }

        return { branch, prCount: prs.length, workItemCount: workItemIds.size };
      }),
  );
  console.log(`[ENRICH] ${new Date().toISOString()} step 2 complete: ${countResults.filter((r) => r.status === 'fulfilled').length}/${countResults.length} succeeded`);

  // Step 3: Build branch → counts map and stamp sessions
  const branchCountMap = new Map<string, { prCount: number; workItemCount: number }>();
  for (const result of countResults) {
    if (result.status === 'fulfilled') {
      branchCountMap.set(result.value.branch, {
        prCount: result.value.prCount,
        workItemCount: result.value.workItemCount,
      });
    }
  }

  for (const session of sessions) {
    if (session.branch) {
      const counts = branchCountMap.get(session.branch);
      if (counts) {
        session.adoPrCount = counts.prCount;
        session.adoWorkItemCount = counts.workItemCount;
      }
    }
  }
  console.log(`[ENRICH] ${new Date().toISOString()} enrichment complete — stamped ${branchCountMap.size} branches`);
}

/* ── Response cache for GET /api/sessions ─────────────────────── */
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

    // Enrich with ADO deliverable counts when configured
    if (isAdoConfigured()) {
      console.log(`[ENRICH] ${new Date().toISOString()} GET /api/sessions — ADO configured, starting enrichment (timeout ${ADO_ENRICHMENT_TIMEOUT_MS}ms)`);
      try {
        await Promise.race([
          enrichSessionsWithAdoCounts(sessions),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('ADO enrichment timeout')), ADO_ENRICHMENT_TIMEOUT_MS),
          ),
        ]);
        console.log(`[ENRICH] ${new Date().toISOString()} GET /api/sessions — enrichment finished within timeout`);
      } catch (enrichErr) {
        console.log(`[ENRICH] ${new Date().toISOString()} GET /api/sessions — enrichment failed/timed out:`, enrichErr instanceof Error ? enrichErr.message : String(enrichErr));
      }
    }

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
  const q = req.query.q as string;
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
