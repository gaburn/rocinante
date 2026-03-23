import type { AdoWorkItem, AdoPullRequest, AdoStatus } from '../types/ado';

export async function getAdoStatus(): Promise<AdoStatus> {
  const res = await fetch('/api/ado/status');
  if (!res.ok) throw new Error(`Failed to fetch ADO status: ${res.status}`);
  return res.json();
}

export async function getWorkItems(ids: number[]): Promise<AdoWorkItem[]> {
  if (ids.length === 0) return [];
  const res = await fetch(`/api/ado/workitems?ids=${ids.join(',')}`);
  if (!res.ok) throw new Error(`Failed to fetch work items: ${res.status}`);
  return res.json();
}

export async function getPullRequests(branches: string[]): Promise<AdoPullRequest[]> {
  if (branches.length === 0) return [];
  const res = await fetch(`/api/ado/pullrequests?branches=${branches.map(encodeURIComponent).join(',')}`);
  if (!res.ok) throw new Error(`Failed to fetch pull requests: ${res.status}`);
  return res.json();
}

export async function updateAdoConfig(config: { organization?: string; project?: string; pat?: string }): Promise<AdoStatus> {
  const res = await fetch('/api/ado/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function testAdoConnection(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/ado/test', { method: 'POST' });
  if (!res.ok) throw new Error(`Test failed: ${res.status}`);
  return res.json();
}
