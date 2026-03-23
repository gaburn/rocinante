import { getConfig, isAdoConfigured } from '../config.js';
import type { AdoPullRequest, AdoWorkItem } from '../../src/types/ado.js';

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 300_000;

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

async function adoFetch<T>(path: string, scope: AdoApiScope = 'project'): Promise<T> {
  if (!isAdoConfigured()) {
    throw new AdoApiError('Azure DevOps is not configured.');
  }

  const config = getConfig();
  const requestUrl = buildAdoApiUrl(path, scope);
  const auth = Buffer.from(`:${config.adoPat}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
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
  const path = 'wit/queries?$depth=0&api-version=7.1';
  const checkedUrl = buildAdoApiUrl(path, 'project');
  try {
    await adoFetch(path);
    return {
      ok: true,
      message: 'Connected',
      checkedUrl,
    };
  } catch (error) {
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

