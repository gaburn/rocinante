import { Router } from 'express';
import { getConfig, isAdoConfigured, updateConfig } from '../config.js';
import {
  clearAdoCache,
  clearTokenCache,
  getAuthenticatedUserDisplayName,
  getPullRequestsByBranches,
  getWorkItems,
  getWorkItemsForPullRequest,
  testAdoConnection,
} from '../services/adoClient.js';
import {
  mcpListPullRequests,
  mcpGetPullRequest,
  mcpGetWorkItemsBatch,
} from '../services/adoMcpClient.js';

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
    repository: config.adoRepository,
    filterByCreator: config.adoFilterByCreator,
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

  const repositoryParam = typeof req.query.repository === 'string' ? req.query.repository.trim() : '';
  const config = getConfig();
  const repository = repositoryParam || config.adoRepository || '';

  try {
    const pullRequests = await getPullRequestsByBranches(branches, repository || undefined);
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

  const allowedKeys = new Set(['organization', 'project', 'repository', 'filterByCreator']);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      res.status(400).json({ error: `Unknown config field: ${key}` });
      return;
    }
  }

  const patch: {
    adoOrganization?: string;
    adoProject?: string;
    adoRepository?: string;
    adoFilterByCreator?: boolean;
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

  if ('repository' in body) {
    if (typeof body.repository !== 'string') {
      res.status(400).json({ error: 'repository must be a string.' });
      return;
    }
    patch.adoRepository = body.repository.trim();
  }

  if ('filterByCreator' in body) {
    if (typeof body.filterByCreator !== 'boolean') {
      res.status(400).json({ error: 'filterByCreator must be a boolean.' });
      return;
    }
    patch.adoFilterByCreator = body.filterByCreator;
  }

  const updated = updateConfig(patch);
  clearAdoCache();
  clearTokenCache();
  res.json({
    configured: isAdoConfigured(),
    organization: updated.adoOrganization,
    project: updated.adoProject,
    repository: updated.adoRepository,
    filterByCreator: updated.adoFilterByCreator,
  });
});

adoRouter.get('/ado/session-deliverables', async (req, res) => {
  console.log(`[ADO] ${new Date().toISOString()} session-deliverables hit, branch:`, req.query.branch);

  if (!isAdoConfigured()) {
    res.status(403).json({ error: 'Azure DevOps is not configured.' });
    return;
  }

  const branch = req.query.branch;
  if (typeof branch !== 'string' || branch.trim() === '') {
    res.status(400).json({ error: 'branch query parameter is required.' });
    return;
  }

  const config = getConfig();
  const trimmedBranch = branch.trim();

  // Per-session overrides: query param → global config → error/empty
  const orgParam = typeof req.query.organization === 'string' ? req.query.organization.trim() : '';
  const projParam = typeof req.query.project === 'string' ? req.query.project.trim() : '';
  const organization = orgParam || config.adoOrganization;
  const project = projParam || config.adoProject;

  // Resolve repository: query param → config → empty (no filter)
  const repositoryParam = typeof req.query.repository === 'string' ? req.query.repository.trim() : '';
  const repository = repositoryParam || config.adoRepository || '';

  // Try MCP path first, fall back to direct REST on failure
  console.log(`[ADO] ${new Date().toISOString()} trying MCP path...`);
  let result: { pullRequests: import('../../src/types/ado.js').AdoPullRequest[]; workItems: import('../../src/types/ado.js').AdoWorkItem[] } | null = null;

  try {
    result = await fetchDeliverablesViaMcp(project, trimmedBranch, repository, organization);
    console.log(`[ADO] ${new Date().toISOString()} MCP path succeeded:`, result.pullRequests.length, 'PRs,', result.workItems.length, 'WIs');
  } catch (err) {
    console.log(`[ADO] ${new Date().toISOString()} MCP path failed:`, err instanceof Error ? err.message : String(err));
  }

  if (!result) {
    console.log(`[ADO] ${new Date().toISOString()} trying REST path...`);
    try {
      result = await fetchDeliverablesViaRest(trimmedBranch, repository, organization, project);
      console.log(`[ADO] ${new Date().toISOString()} REST path succeeded:`, result.pullRequests.length, 'PRs,', result.workItems.length, 'WIs');
    } catch (error) {
      console.log(`[ADO] ${new Date().toISOString()} REST path failed:`, error instanceof Error ? error.message : String(error));
      const message = error instanceof Error ? error.message : String(error);
      const status = isLikelyUpstreamError(error) ? 502 : 500;
      res.status(status).json({ error: message });
      return;
    }
  }

  // Apply creator filter if enabled
  if (config.adoFilterByCreator) {
    const userName = await getAuthenticatedUserDisplayName();
    if (userName) {
      result.pullRequests = result.pullRequests.filter(pr => pr.createdBy === userName);
    }
  }

  res.json(result);
});

async function fetchDeliverablesViaMcp(project: string, branch: string, repository: string, organization?: string) {
  const opts: Parameters<typeof mcpListPullRequests>[0] = {
    project,
    sourceRefName: `refs/heads/${branch}`,
    status: 'All',
    organization,
  };
  if (repository) {
    opts.repositoryId = repository;
  }
  const pullRequests = await mcpListPullRequests(opts);

  // For each PR with a repository, fetch linked work item IDs
  const workItemIdResults = await Promise.allSettled(
    pullRequests
      .filter((pr) => pr.repositoryId)
      .map((pr) =>
        mcpGetPullRequest({
          project,
          repositoryId: pr.repositoryId!,
          pullRequestId: pr.id,
          includeWorkItemRefs: true,
          organization,
        }),
      ),
  );

  const allWorkItemIds = new Set<number>();
  for (const result of workItemIdResults) {
    if (result.status === 'fulfilled') {
      for (const id of result.value.workItemIds) {
        allWorkItemIds.add(id);
      }
    }
  }

  const workItems = allWorkItemIds.size > 0
    ? await mcpGetWorkItemsBatch(project, Array.from(allWorkItemIds))
    : [];

  return { pullRequests, workItems };
}

async function fetchDeliverablesViaRest(branch: string, repository: string, organization: string, project: string) {
  const pullRequests = await getPullRequestsByBranches([branch], repository || undefined, organization, project);

  const workItemResults = await Promise.allSettled(
    pullRequests
      .filter((pr) => pr.repositoryId)
      .map((pr) => getWorkItemsForPullRequest(pr.repositoryId!, pr.id, organization, project)),
  );

  const workItemMap = new Map<number, import('../../src/types/ado.js').AdoWorkItem>();
  for (const result of workItemResults) {
    if (result.status === 'fulfilled') {
      for (const wi of result.value) {
        workItemMap.set(wi.id, wi);
      }
    }
  }

  return { pullRequests, workItems: Array.from(workItemMap.values()) };
}

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

