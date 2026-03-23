import { getConfig, isAdoConfigured } from '../config.js';
import type { AdoPullRequest, AdoWorkItem } from '../../src/types/ado.js';

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 300_000;

class AdoApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AdoApiError';
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function adoFetch<T>(path: string): Promise<T> {
  if (!isAdoConfigured()) {
    throw new AdoApiError('Azure DevOps is not configured.');
  }

  const config = getConfig();
  const baseUrl = `https://dev.azure.com/${config.adoOrganization}/${config.adoProject}/_apis/${path}`;
  const auth = Buffer.from(`:${config.adoPat}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(baseUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AdoApiError(`Failed to reach Azure DevOps: ${message}`);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    let apiMessage = response.statusText || 'Unknown Azure DevOps error';
    if (isObject(payload)) {
      const maybeMessage = payload.message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') {
        apiMessage = maybeMessage;
      }
    }
    throw new AdoApiError(
      `Azure DevOps request failed (${response.status}): ${apiMessage}`,
      response.status,
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

export async function testAdoConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await adoFetch('projects?$top=1&api-version=7.1');
    return { ok: true, message: 'Connected' };
  } catch (error) {
    if (error instanceof AdoApiError && (error.status === 401 || error.status === 403)) {
      return { ok: false, message: 'Authentication failed' };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}

export function clearAdoCache(): void {
  cache.clear();
}

