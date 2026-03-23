import { Router } from 'express';
import { getConfig, isAdoConfigured, updateConfig } from '../config.js';
import {
  clearAdoCache,
  getPullRequestsByBranches,
  getWorkItems,
  testAdoConnection,
} from '../services/adoClient.js';

const adoRouter = Router();

function isLikelyUpstreamError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Azure DevOps') || message.includes('Failed to reach Azure DevOps');
}

adoRouter.get('/ado/status', (req, res) => {
  const config = getConfig();
  res.json({
    configured: isAdoConfigured(),
    organization: config.adoOrganization,
    project: config.adoProject,
  });
});

adoRouter.get('/ado/workitems', async (req, res) => {
  if (!isAdoConfigured()) {
    res.status(403).json({ error: 'Azure DevOps is not configured.' });
    return;
  }

  const idsParam = req.query.ids;
  if (typeof idsParam !== 'string' || idsParam.trim() === '') {
    res.status(400).json({ error: 'ids query parameter is required.' });
    return;
  }

  const rawIds = idsParam.split(',').map((id) => id.trim()).filter((id) => id !== '');
  if (rawIds.length === 0) {
    res.status(400).json({ error: 'ids must contain at least one numeric id.' });
    return;
  }

  const ids = rawIds.map((id) => Number(id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    res.status(400).json({ error: 'ids must be a comma-separated list of positive integers.' });
    return;
  }

  try {
    const workItems = await getWorkItems(ids);
    res.json(workItems);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = isLikelyUpstreamError(error) ? 502 : 500;
    res.status(status).json({ error: message });
  }
});

adoRouter.get('/ado/pullrequests', async (req, res) => {
  if (!isAdoConfigured()) {
    res.status(403).json({ error: 'Azure DevOps is not configured.' });
    return;
  }

  const branchesParam = req.query.branches;
  if (typeof branchesParam !== 'string' || branchesParam.trim() === '') {
    res.status(400).json({ error: 'branches query parameter is required.' });
    return;
  }

  const branches = branchesParam
    .split(',')
    .map((branch) => branch.trim())
    .filter((branch) => branch !== '');

  if (branches.length === 0) {
    res.status(400).json({ error: 'branches must contain at least one branch name.' });
    return;
  }

  try {
    const pullRequests = await getPullRequestsByBranches(branches);
    res.json(pullRequests);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = isLikelyUpstreamError(error) ? 502 : 500;
    res.status(status).json({ error: message });
  }
});

adoRouter.patch('/ado/config', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object.' });
    return;
  }

  const allowedKeys = new Set(['organization', 'project', 'pat']);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      res.status(400).json({ error: `Unknown config field: ${key}` });
      return;
    }
  }

  const patch: {
    adoOrganization?: string;
    adoProject?: string;
    adoPat?: string;
  } = {};

  if ('organization' in body) {
    if (typeof body.organization !== 'string') {
      res.status(400).json({ error: 'organization must be a string.' });
      return;
    }
    patch.adoOrganization = body.organization.trim();
  }

  if ('project' in body) {
    if (typeof body.project !== 'string') {
      res.status(400).json({ error: 'project must be a string.' });
      return;
    }
    patch.adoProject = body.project.trim();
  }

  if ('pat' in body) {
    if (typeof body.pat !== 'string') {
      res.status(400).json({ error: 'pat must be a string.' });
      return;
    }
    patch.adoPat = body.pat.trim();
  }

  const updated = updateConfig(patch);
  clearAdoCache();
  res.json({
    configured: isAdoConfigured(),
    organization: updated.adoOrganization,
    project: updated.adoProject,
  });
});

adoRouter.post('/ado/test', async (req, res) => {
  if (!isAdoConfigured()) {
    res.status(403).json({ error: 'Azure DevOps is not configured.' });
    return;
  }

  try {
    const result = await testAdoConnection();
    if (result.ok) {
      res.json(result);
      return;
    }
    res.status(502).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = isLikelyUpstreamError(error) ? 502 : 500;
    res.status(status).json({
      ok: false,
      message,
      rawError: error,
    });
  }
});

export default adoRouter;

