import { getConfig, isAdoConfigured } from '../config.js';
import type { AdoPullRequest, AdoWorkItem } from '../../src/types/ado.js';

// ---------------------------------------------------------------------------
// Timeout helper — races a promise against a timer so nothing hangs forever
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const CONNECTION_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 10_000;
const CONNECTION_COOLDOWN_MS = 60_000;

// ---------------------------------------------------------------------------
// Pre-loaded SDK modules — populated by warmupMcpSdk(), used by initMcpClient()
// ---------------------------------------------------------------------------

let CachedClient: typeof import('@modelcontextprotocol/sdk/client/index.js').Client | null = null;
let CachedStdioTransport: typeof import('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport | null = null;

/**
 * Pre-import the MCP SDK at startup while the event loop is idle.
 * Call this BEFORE app.listen() so the modules are cached in memory
 * and initMcpClient() never needs a dynamic import under load.
 */
export async function warmupMcpSdk(): Promise<void> {
  try {
    console.log('[MCP]', new Date().toISOString(), 'pre-importing SDK at startup...');
    const clientMod = await import('@modelcontextprotocol/sdk/client/index.js');
    const stdioMod = await import('@modelcontextprotocol/sdk/client/stdio.js');
    CachedClient = clientMod.Client;
    CachedStdioTransport = stdioMod.StdioClientTransport;
    console.log('[MCP]', new Date().toISOString(), 'SDK pre-imported successfully');
  } catch (err) {
    console.log('[MCP]', new Date().toISOString(), 'SDK pre-import failed:', err instanceof Error ? err.message : String(err));
    // Not fatal — getMcpClient will try again lazily, or fall through to REST
  }
}

// ---------------------------------------------------------------------------
// Lightweight interfaces so we don't need the MCP SDK imported at top level.
// ---------------------------------------------------------------------------

interface McpClientHandle {
  callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<ToolResult>;
  close: () => Promise<void>;
  connect: (transport: McpTransportHandle) => Promise<void>;
}

interface McpTransportHandle {
  close: () => Promise<void>;
  onclose?: (() => void) | null;
}

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
}

// ---------------------------------------------------------------------------
// Error type — mirrors AdoApiError from adoClient.ts for consistent handling
// ---------------------------------------------------------------------------

export class McpClientError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'McpClientError';
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Response cache (same pattern as adoClient.ts)
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 300_000; // 5 min

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL) {
    return entry.data as T;
  }
  if (entry) {
    cache.delete(key);
  }
  return undefined;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

export function clearMcpCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Singleton MCP client — lazy init, one per org
// ---------------------------------------------------------------------------

let mcpClient: McpClientHandle | null = null;
let mcpTransport: McpTransportHandle | null = null;
let currentOrg: string | null = null;

// Circuit breaker — after a connection failure, skip retries for a cooldown period
let mcpConnectionFailed = false;
let connectionCooldownTimer: ReturnType<typeof setTimeout> | null = null;

async function getMcpClient(): Promise<McpClientHandle> {
  console.log(`[MCP] ${new Date().toISOString()} getMcpClient called`, { mcpConnectionFailed, hasClient: !!mcpClient, currentOrg });

  if (mcpConnectionFailed) {
    console.log(`[MCP] ${new Date().toISOString()} circuit breaker active — skipping`);
    throw new McpClientError('MCP connection previously failed — skipping (cooldown active)');
  }

  const config = getConfig();
  const org = config.adoOrganization;
  console.log(`[MCP] ${new Date().toISOString()} org:`, org);

  if (!org) {
    throw new McpClientError('Azure DevOps organization is not configured.');
  }

  // If org changed, tear down existing client
  if (mcpClient && currentOrg !== org) {
    console.log(`[MCP] ${new Date().toISOString()} org changed, tearing down existing client`);
    await shutdownMcpClient();
  }

  // Return existing healthy client
  if (mcpClient) {
    console.log(`[MCP] ${new Date().toISOString()} returning existing client`);
    return mcpClient;
  }

  // Wrap the ENTIRE init sequence (import + spawn + connect) in a single timeout
  try {
    const client = await withTimeout(
      initMcpClient(org),
      CONNECTION_TIMEOUT_MS,
      `MCP initialization timed out after ${CONNECTION_TIMEOUT_MS / 1000}s (SDK import or server connection). Run "npx -y @azure-devops/mcp" manually to verify the package installs correctly.`,
    );
    return client;
  } catch (err) {
    mcpClient = null;
    mcpTransport = null;
    currentOrg = null;

    mcpConnectionFailed = true;
    if (connectionCooldownTimer) clearTimeout(connectionCooldownTimer);
    connectionCooldownTimer = setTimeout(() => {
      mcpConnectionFailed = false;
      connectionCooldownTimer = null;
    }, CONNECTION_COOLDOWN_MS);

    const message = err instanceof Error ? err.message : String(err);
    throw new McpClientError(`Failed to start ADO MCP server: ${message}`);
  }
}

// Separate async function so we can wrap it in withTimeout
async function initMcpClient(org: string): Promise<McpClientHandle> {
  let Client: typeof import('@modelcontextprotocol/sdk/client/index.js').Client;
  let StdioClientTransport: typeof import('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport;

  if (CachedClient && CachedStdioTransport) {
    console.log(`[MCP] ${new Date().toISOString()} using pre-imported SDK`);
    Client = CachedClient;
    StdioClientTransport = CachedStdioTransport;
  } else {
    console.log(`[MCP] ${new Date().toISOString()} importing SDK (not pre-cached)...`);
    const clientMod = await import('@modelcontextprotocol/sdk/client/index.js');
    const stdioMod = await import('@modelcontextprotocol/sdk/client/stdio.js');
    Client = clientMod.Client;
    StdioClientTransport = stdioMod.StdioClientTransport;
    console.log(`[MCP] ${new Date().toISOString()} SDK imported`);
  }

  console.log(`[MCP] ${new Date().toISOString()} creating transport...`);
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@azure-devops/mcp', org, '-d', 'core', 'repositories', 'work-items'],
  });

  const client = new Client({
    name: 'rocinante',
    version: '1.0.0',
  });

  transport.onclose = () => {
    mcpClient = null;
    mcpTransport = null;
    currentOrg = null;
  };

  console.log(`[MCP] ${new Date().toISOString()} connecting...`);
  await client.connect(transport);
  console.log(`[MCP] ${new Date().toISOString()} connected!`);

  mcpClient = client as unknown as McpClientHandle;
  mcpTransport = transport as unknown as McpTransportHandle;
  currentOrg = org;
  return mcpClient;
}

export async function shutdownMcpClient(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // Best-effort shutdown
    }
  }
  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch {
      // Best-effort shutdown
    }
  }
  mcpClient = null;
  mcpTransport = null;
  currentOrg = null;
  mcpConnectionFailed = false;
  if (connectionCooldownTimer) {
    clearTimeout(connectionCooldownTimer);
    connectionCooldownTimer = null;
  }
  cache.clear();
}

// ---------------------------------------------------------------------------
// Tool-call helpers
// ---------------------------------------------------------------------------

function parseToolResult(result: ToolResult): unknown {
  // MCP SDK result has .content array with typed content blocks
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  const textParts = content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c)
    .map((c) => c.text);

  if (textParts.length === 0) {
    return null;
  }

  const joined = textParts.join('');
  try {
    return JSON.parse(joined);
  } catch {
    return joined;
  }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  console.log(`[MCP] ${new Date().toISOString()} callTool: ${name}`, JSON.stringify(args).slice(0, 200));
  const client = await getMcpClient();
  console.log(`[MCP] ${new Date().toISOString()} callTool: ${name} — client acquired, calling...`);
  try {
    const result = await withTimeout(
      client.callTool({ name, arguments: args }),
      CALL_TIMEOUT_MS,
      `MCP tool "${name}" timed out after ${CALL_TIMEOUT_MS / 1000}s`,
    );
    console.log(`[MCP] ${new Date().toISOString()} callTool: ${name} — got result`);
    return parseToolResult(result);
  } catch (err) {
    // If it timed out, tear down the client so next call retries fresh
    if (err instanceof Error && err.message.includes('timed out')) {
      console.log(`[MCP] ${new Date().toISOString()} callTool: ${name} — timed out, tearing down client`);
      await shutdownMcpClient();
    }
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[MCP] ${new Date().toISOString()} callTool: ${name} — failed:`, message);
    throw new McpClientError(`MCP tool "${name}" failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Branch helper
// ---------------------------------------------------------------------------

function normalizeBranch(refName: string | undefined): string {
  if (!refName) return '';
  return refName.replace(/^refs\/heads\//, '');
}

// ---------------------------------------------------------------------------
// Typed wrapper methods
// ---------------------------------------------------------------------------

/**
 * List pull requests, optionally filtered by source branch / status.
 */
export async function mcpListPullRequests(opts: {
  project: string;
  repositoryId?: string;
  sourceRefName?: string;
  status?: string;
  top?: number;
}): Promise<AdoPullRequest[]> {
  const cacheKey = `listPRs:${JSON.stringify(opts)}`;
  const cached = getCached<AdoPullRequest[]>(cacheKey);
  if (cached) return cached;

  const args: Record<string, unknown> = { project: opts.project };
  if (opts.repositoryId) args.repositoryId = opts.repositoryId;
  if (opts.sourceRefName) args.sourceRefName = opts.sourceRefName;
  if (opts.status) args.status = opts.status;
  if (opts.top) args.top = opts.top;

  const raw = await callTool('list_pull_requests_by_repo_or_project', args);

  // MCP response is typically { value: [...] } or a direct array
  const items = Array.isArray(raw) ? raw : (isObj(raw) && Array.isArray(raw.value) ? raw.value : []);

  const prs: AdoPullRequest[] = items
    .filter((item: Record<string, unknown>) => typeof item.pullRequestId === 'number')
    .map((item: Record<string, unknown>) => mapPullRequest(item));

  setCache(cacheKey, prs);
  return prs;
}

/**
 * Get a single pull request with optional work-item refs.
 */
export async function mcpGetPullRequest(opts: {
  project: string;
  repositoryId: string;
  pullRequestId: number;
  includeWorkItemRefs?: boolean;
}): Promise<{ pr: AdoPullRequest; workItemIds: number[] }> {
  const cacheKey = `getPR:${opts.repositoryId}:${opts.pullRequestId}:${opts.includeWorkItemRefs}`;
  const cached = getCached<{ pr: AdoPullRequest; workItemIds: number[] }>(cacheKey);
  if (cached) return cached;

  const args: Record<string, unknown> = {
    project: opts.project,
    repositoryId: opts.repositoryId,
    pullRequestId: opts.pullRequestId,
  };
  if (opts.includeWorkItemRefs) {
    args.includeWorkItemRefs = true;
  }

  const raw = await callTool('get_pull_request_by_id', args);
  const data = isObj(raw) ? raw : {};

  const pr = mapPullRequest(data);
  let workItemIds: number[] = [];

  if (opts.includeWorkItemRefs && Array.isArray(data.workItemRefs)) {
    workItemIds = data.workItemRefs
      .map((ref: Record<string, unknown>) => Number(ref.id))
      .filter((id: number) => Number.isInteger(id) && id > 0);
  }

  const result = { pr, workItemIds };
  setCache(cacheKey, result);
  return result;
}

/**
 * Batch-fetch work items by IDs.
 */
export async function mcpGetWorkItemsBatch(
  project: string,
  ids: number[],
): Promise<AdoWorkItem[]> {
  if (ids.length === 0) return [];

  const sortedIds = [...ids].sort((a, b) => a - b);
  const cacheKey = `workItems:${project}:${sortedIds.join(',')}`;
  const cached = getCached<AdoWorkItem[]>(cacheKey);
  if (cached) return cached;

  const raw = await callTool('get_work_items_batch_by_ids', {
    project,
    ids: sortedIds,
  });

  const items = Array.isArray(raw) ? raw : (isObj(raw) && Array.isArray(raw.value) ? raw.value : []);
  const config = getConfig();

  const workItems: AdoWorkItem[] = items
    .filter((item: Record<string, unknown>) => typeof item.id === 'number')
    .map((item: Record<string, unknown>) => {
      const fields = isObj(item.fields) ? item.fields : {};
      const assignedToRaw = fields['System.AssignedTo'];
      const assignedTo = typeof assignedToRaw === 'string'
        ? assignedToRaw
        : (isObj(assignedToRaw) ? (assignedToRaw as Record<string, unknown>).displayName as string ?? null : null);

      const links = isObj(item._links) ? item._links : {};
      const html = isObj(links.html) ? links.html : {};

      return {
        id: item.id as number,
        title: (fields['System.Title'] as string) ?? '',
        state: (fields['System.State'] as string) ?? '',
        assignedTo: assignedTo ?? null,
        workItemType: (fields['System.WorkItemType'] as string) ?? '',
        url: (html.href as string)
          ?? `https://dev.azure.com/${config.adoOrganization}/${config.adoProject}/_workitems/edit/${item.id}`,
      };
    });

  setCache(cacheKey, workItems);
  return workItems;
}

/**
 * Test connectivity by calling list_projects.
 */
export async function mcpTestConnection(
  project: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isAdoConfigured()) {
    return { ok: false, message: 'Azure DevOps is not configured.' };
  }

  try {
    await callTool('list_projects', { project });
    return { ok: true, message: 'Connected via MCP' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `MCP connection failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mapPullRequest(item: Record<string, unknown>): AdoPullRequest {
  const repo = isObj(item.repository) ? item.repository : {};
  const createdBy = isObj(item.createdBy) ? item.createdBy : {};
  const reviewersRaw = Array.isArray(item.reviewers) ? item.reviewers : [];

  const isDraft = item.isDraft === true;
  const rawStatus = typeof item.status === 'string' ? item.status.toLowerCase() : 'active';
  const status = isDraft ? 'draft' : rawStatus as AdoPullRequest['status'];

  return {
    id: (item.pullRequestId as number) ?? 0,
    title: (item.title as string) ?? '',
    status,
    sourceBranch: normalizeBranch(item.sourceRefName as string | undefined),
    targetBranch: normalizeBranch(item.targetRefName as string | undefined),
    repositoryId: (repo.id as string) ?? undefined,
    repositoryName: (repo.name as string) ?? '',
    createdBy: (createdBy.displayName as string) ?? '',
    reviewers: reviewersRaw.map((r: Record<string, unknown>) => ({
      displayName: (r.displayName as string) ?? '',
      vote: typeof r.vote === 'number' ? r.vote : 0,
    })),
    url: repo.webUrl
      ? `${repo.webUrl}/pullrequest/${item.pullRequestId}`
      : '',
  };
}
