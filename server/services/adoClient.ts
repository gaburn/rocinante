import { getConfig, isAdoConfigured } from '../config.js';
import type { AdoPullRequest, AdoWorkItem } from '../../src/types/ado.js';

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 300_000;
let cachedToken: { token: string; expiresAt: number } | null = null;

class AdoApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'AdoApiError';
    this.status = status;
    this.details = details;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type AdoApiScope = 'project' | 'organization';

function buildAdoApiUrl(path: string, scope: AdoApiScope = 'project'): string {
  const config = getConfig();
  const organization = encodeURIComponent(config.adoOrganization);
  const project = encodeURIComponent(config.adoProject);
  if (scope === 'organization') {
    return `https://dev.azure.com/${organization}/_apis/${path}`;
  }
  return `https://dev.azure.com/${organization}/${project}/_apis/${path}`;
}

function extractAdoErrorMessage(response: Response, payload: unknown, rawText: string): string {
  if (isObject(payload)) {
    const maybeMessage = payload.message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') {
      return maybeMessage;
    }
  }

  const trimmed = rawText.trim();
  if (trimmed !== '') {
    return trimmed.replace(/\s+/g, ' ').slice(0, 300);
  }

  return response.statusText || 'Unknown Azure DevOps error';
}

async function getAdoToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  const { execSync } = await import('node:child_process');
  try {
    const result = execSync(
      'az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --output json',
      { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const parsed = JSON.parse(result) as { accessToken?: string; expiresOn?: string };
    if (!parsed.accessToken || !parsed.expiresOn) {
      throw new Error('Azure CLI returned an invalid token payload.');
    }

    cachedToken = {
      token: parsed.accessToken,
      expiresAt: new Date(parsed.expiresOn).getTime(),
    };
    return cachedToken.token;
  } catch (err) {
    throw new Error(`Failed to get Azure AD token. Run "az login" first. Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function adoFetch<T>(path: string, scope: AdoApiScope = 'project'): Promise<T> {
  if (!isAdoConfigured()) {
    throw new AdoApiError('Azure DevOps is not configured.');
  }

  const requestUrl = buildAdoApiUrl(path, scope);
  const token = await getAdoToken();

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AdoApiError(`Failed to reach Azure DevOps (${requestUrl}): ${message}`);
  }

  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    rawText = '';
  }

  let payload: unknown = null;
  if (rawText.trim() !== '') {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const apiMessage = extractAdoErrorMessage(response, payload, rawText);
    throw new AdoApiError(
      `Azure DevOps request failed (${response.status}): ${apiMessage}`,
      response.status,
      {
        url: requestUrl,
        payload,
        rawText: rawText.slice(0, 4000),
      },
    );
  }

  return payload as T;
}

async function cachedFetch<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data as T;
  }

  const data = await adoFetch<T>(path);
  cache.set(path, { data, fetchedAt: Date.now() });
  return data;
}

type WorkItemResponse = {
  value?: Array<{
    id?: number;
    _links?: {
      html?: {
        href?: string;
      };
    };
    fields?: {
      'System.Title'?: string;
      'System.State'?: string;
      'System.WorkItemType'?: string;
      'System.AssignedTo'?: {
        displayName?: string;
      } | string;
    };
  }>;
};

export async function getWorkItems(ids: number[]): Promise<AdoWorkItem[]> {
  if (ids.length === 0) {
    return [];
  }

  const response = await cachedFetch<WorkItemResponse>(
    `wit/workitems?ids=${ids.join(',')}&$expand=none&api-version=7.1`,
  );
  const config = getConfig();

  return (response.value ?? [])
    .filter((item): item is NonNullable<WorkItemResponse['value']>[number] => typeof item?.id === 'number')
    .map((item) => {
      const assignedToRaw = item.fields?.['System.AssignedTo'];
      const assignedTo = typeof assignedToRaw === 'string'
        ? assignedToRaw
        : assignedToRaw?.displayName ?? null;

      return {
        id: item.id as number,
        title: item.fields?.['System.Title'] ?? '',
        state: item.fields?.['System.State'] ?? '',
        assignedTo,
        workItemType: item.fields?.['System.WorkItemType'] ?? '',
        url: item._links?.html?.href
          ?? `https://dev.azure.com/${config.adoOrganization}/${config.adoProject}/_workitems/edit/${item.id}`,
      };
    });
}

type PullRequestResponse = {
  value?: Array<{
    pullRequestId?: number;
    title?: string;
    status?: string;
    isDraft?: boolean;
    sourceRefName?: string;
    targetRefName?: string;
    repository?: {
      name?: string;
      webUrl?: string;
    };
    createdBy?: {
      displayName?: string;
    };
    reviewers?: Array<{
      displayName?: string;
      vote?: number;
    }>;
  }>;
};

function normalizeBranch(refName: string | undefined): string {
  if (!refName) {
    return '';
  }
  return refName.replace(/^refs\/heads\//, '');
}

export async function getPullRequestsByBranches(branches: string[]): Promise<AdoPullRequest[]> {
  if (branches.length === 0) {
    return [];
  }

  const uniqueBranches = Array.from(new Set(branches));

  const settled = await Promise.allSettled(
    uniqueBranches.map((branch) => cachedFetch<PullRequestResponse>(
      `git/pullrequests?searchCriteria.sourceRefName=refs/heads/${branch}&searchCriteria.status=all&api-version=7.1`,
    )),
  );

  const deduped = new Map<number, AdoPullRequest>();

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      continue;
    }

    for (const pr of result.value.value ?? []) {
      if (typeof pr.pullRequestId !== 'number') {
        continue;
      }

      deduped.set(pr.pullRequestId, {
        id: pr.pullRequestId,
        title: pr.title ?? '',
        status: pr.isDraft ? 'draft' : String(pr.status ?? '').toLowerCase() as AdoPullRequest['status'],
        sourceBranch: normalizeBranch(pr.sourceRefName),
        targetBranch: normalizeBranch(pr.targetRefName),
        repositoryName: pr.repository?.name ?? '',
        createdBy: pr.createdBy?.displayName ?? '',
        reviewers: (pr.reviewers ?? []).map((reviewer) => ({
          displayName: reviewer.displayName ?? '',
          vote: typeof reviewer.vote === 'number' ? reviewer.vote : 0,
        })),
        url: `${pr.repository?.webUrl ?? ''}/pullrequest/${pr.pullRequestId}`,
      });
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.id - a.id);
}

export type AdoConnectionTestResult = {
  ok: boolean;
  message: string;
  checkedUrl: string;
  status?: number;
  details?: unknown;
};

export async function testAdoConnection(): Promise<AdoConnectionTestResult> {
  const path = 'wit/workitems?ids=1&api-version=7.1';
  const checkedUrl = buildAdoApiUrl(path, 'project');

  try {
    const { execSync } = await import('node:child_process');
    execSync('az --version', { stdio: 'pipe', timeout: 5000 });
  } catch {
    return {
      ok: false,
      message: 'Azure CLI (az) is not installed or not on PATH',
      checkedUrl,
    };
  }

  try {
    await getAdoToken();
  } catch {
    return {
      ok: false,
      message: 'Not logged in. Run "az login" first.',
      checkedUrl,
    };
  }

  try {
    await adoFetch(path);
    return {
      ok: true,
      message: 'Connected',
      checkedUrl,
    };
  } catch (error) {
    if (error instanceof AdoApiError) {
      if (error.status === 404) {
        return {
          ok: true,
          message: 'Connected',
          checkedUrl,
          status: error.status,
          details: error.details,
        };
      }
      if (error.status === 401 || error.status === 403) {
        return {
          ok: false,
          message: 'Authentication failed — run "az login" and verify Azure DevOps access',
          checkedUrl,
          status: error.status,
          details: error.details,
        };
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof AdoApiError ? error.status : undefined;
    const details = error instanceof AdoApiError ? error.details : undefined;
    return {
      ok: false,
      message,
      checkedUrl,
      status,
      details,
    };
  }
}

export function clearAdoCache(): void {
  cache.clear();
}

export function clearTokenCache(): void {
  cachedToken = null;
}

