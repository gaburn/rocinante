import { Router } from 'express';
import { execFileSync } from 'node:child_process';
import {
  createLaunch,
  isValidAgentType,
} from '../services/launchManager.js';

const workstreamsRouter = Router();
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production';

// ── Agent detection with TTL cache ───────────────────────────────

interface AgentAvailability {
  copilot: boolean;
  claude: boolean;
}

let agentCache: { data: AgentAvailability; expires: number } | null = null;
const AGENT_CACHE_TTL_MS = 60_000; // 60 seconds

function isBinaryOnPath(binaryName: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(cmd, [binaryName], { stdio: 'pipe', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export function detectAgents(): AgentAvailability {
  const now = Date.now();
  if (agentCache && now < agentCache.expires) {
    return agentCache.data;
  }

  const data: AgentAvailability = {
    copilot: isBinaryOnPath('copilot'),
    claude: isBinaryOnPath('claude'),
  };

  agentCache = { data, expires: now + AGENT_CACHE_TTL_MS };
  if (DEBUG) console.log('[workstreams] Agent detection:', data);
  return data;
}

/** Clear the agent detection cache — useful for testing. */
export function clearAgentCache(): void {
  agentCache = null;
}

// ── GET /api/workstreams/agents ──────────────────────────────────

workstreamsRouter.get('/workstreams/agents', (_req, res) => {
  try {
    const agents = detectAgents();
    return res.json(agents);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[workstreams] Agent detection error:', message);
    return res.status(500).json({ error: 'Agent detection failed' });
  }
});

// ── POST /api/workstreams/launch ─────────────────────────────────

workstreamsRouter.post('/workstreams/launch', (req, res) => {
  try {
    const { repoPath, agentType } = req.body as { repoPath?: string; agentType?: string };

    if (!repoPath || typeof repoPath !== 'string') {
      return res.status(400).json({ error: 'repoPath is required and must be a string' });
    }
    if (!agentType || !isValidAgentType(agentType)) {
      return res.status(400).json({
        error: 'agentType is required and must be one of: copilot, claude, shell',
      });
    }

    // For copilot/claude, verify the binary is actually available
    if (agentType === 'copilot' || agentType === 'claude') {
      const agents = detectAgents();
      if (!agents[agentType]) {
        return res.status(400).json({
          error: `Agent binary not found on PATH: ${agentType}`,
        });
      }
    }

    const record = createLaunch(repoPath, agentType);
    return res.json({
      launchId: record.launchId,
      normalizedPath: record.normalizedPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Path validation errors from launchManager
    if (message.includes('Path does not exist') || message.includes('Path is not a directory')) {
      return res.status(400).json({ error: message });
    }

    console.error('[workstreams] Launch error:', message);
    return res.status(500).json({ error: 'Failed to create launch record' });
  }
});

export default workstreamsRouter;
