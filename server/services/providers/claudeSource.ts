import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Session,
  SessionSummary,
  SessionStatus,
  SubAgent,
  TimelineEvent,
} from '../../../src/types/index.js';
import { getConfig } from '../../config.js';
import { SessionSource, SessionSourceName } from './types.js';

/* ── Constants ────────────────────────────────────────────────── */

const SOURCE_PREFIX = 'claude:';
const MAX_NAME_LENGTH = 80;
const MAX_INTENT_LENGTH = 200;
const MAX_ASSISTANT_UPDATES = 20;
const ACTIVITY_BUCKET_COUNT = 20;

/* ── Claude JSONL Types ───────────────────────────────────────── */

interface ClaudeContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ClaudeMessage {
  role: string;
  content: string | ClaudeContentBlock[];
}

interface ClaudeEntry {
  type: string;
  summary?: string;
  leafUuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  message?: ClaudeMessage;
  uuid?: string;
}

/* ── Parser ───────────────────────────────────────────────────── */

export function parseClaudeEntry(line: string): ClaudeEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed) as ClaudeEntry;
  } catch {
    return null;
  }
}

function readJsonlLines(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

function parseAllEntries(filePath: string): ClaudeEntry[] {
  const lines = readJsonlLines(filePath);
  const entries: ClaudeEntry[] = [];
  for (const line of lines) {
    const entry = parseClaudeEntry(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

function parseFirstEntry(filePath: string): ClaudeEntry | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      // Read a generous chunk for the first line
      const buf = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
      if (bytesRead === 0) return null;
      const chunk = buf.toString('utf-8', 0, bytesRead);
      const newlineIdx = chunk.indexOf('\n');
      const firstLine = newlineIdx >= 0 ? chunk.slice(0, newlineIdx) : chunk;
      return parseClaudeEntry(firstLine);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/* ── Discovery ────────────────────────────────────────────────── */

interface DiscoveredFile {
  filePath: string;
  mtimeMs: number;
}

function discoverSessionFiles(claudeDir: string): DiscoveredFile[] {
  const projectsDir = path.join(claudeDir, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  let entries: string[];
  try {
    entries = fs.readdirSync(projectsDir, { recursive: true, encoding: 'utf-8' }) as string[];
  } catch {
    return [];
  }

  const results: DiscoveredFile[] = [];
  for (const relPath of entries) {
    if (!relPath.endsWith('.jsonl')) continue;

    const basename = path.basename(relPath);
    // Exclude agent-* prefix and warmup files
    if (basename.startsWith('agent-')) continue;
    if (basename.toLowerCase().includes('warmup')) continue;

    const absPath = path.join(projectsDir, relPath);
    try {
      const stat = fs.statSync(absPath);
      if (!stat.isFile()) continue;
      results.push({ filePath: absPath, mtimeMs: stat.mtimeMs });
    } catch {
      continue;
    }
  }

  // Sort by mtime descending (newest first)
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function truncate(text: string, maxLength: number): string {
  const normalized = text.trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function stripPrefix(id: string): string {
  return id.startsWith(SOURCE_PREFIX) ? id.slice(SOURCE_PREFIX.length) : id;
}

function getFirstUserContent(entries: ClaudeEntry[]): string | null {
  for (const entry of entries) {
    if (entry.type !== 'user' || !entry.message) continue;
    if (typeof entry.message.content === 'string') {
      const trimmed = entry.message.content.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function getUserMessageContent(entry: ClaudeEntry): string | null {
  if (entry.type !== 'user' || !entry.message) return null;
  if (typeof entry.message.content === 'string') {
    const trimmed = entry.message.content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function countUserEntries(entries: ClaudeEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.type === 'user') count++;
  }
  return count;
}

function getFirstTimestamp(entries: ClaudeEntry[]): string {
  for (const entry of entries) {
    if (entry.timestamp) return entry.timestamp;
  }
  return new Date().toISOString();
}

function getLastTimestamp(entries: ClaudeEntry[], mtimeMs: number): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].timestamp) return entries[i].timestamp!;
  }
  return new Date(mtimeMs).toISOString();
}

function getFirstUserEntry(entries: ClaudeEntry[]): ClaudeEntry | undefined {
  return entries.find(
    (e) => e.type === 'user' && e.message && typeof e.message.content === 'string',
  );
}

/* ── Status derivation ────────────────────────────────────────── */

export function deriveClaudeStatus(
  mtimeMs: number,
): SessionStatus {
  const { staleThresholdMs } = getConfig();
  const ageMs = Date.now() - mtimeMs;
  return ageMs <= staleThresholdMs ? 'active' : 'completed';
}

/* ── Tool event extraction ────────────────────────────────────── */

interface ToolUsePair {
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
  resultContent?: string;
  resultTimestamp?: string;
  isError?: boolean;
}

function collectToolPairs(entries: ClaudeEntry[]): ToolUsePair[] {
  const pendingTools = new Map<string, ToolUsePair>();
  const completed: ToolUsePair[] = [];

  for (const entry of entries) {
    if (!entry.message) continue;

    if (entry.type === 'assistant' && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_use' && block.id && block.name) {
          const pair: ToolUsePair = {
            id: block.id,
            name: block.name,
            input: block.input ?? {},
            timestamp: entry.timestamp ?? new Date().toISOString(),
          };
          pendingTools.set(block.id, pair);
        }
      }
    }

    if (entry.type === 'user' && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const pair = pendingTools.get(block.tool_use_id);
          if (pair) {
            pair.resultContent =
              typeof block.content === 'string' ? block.content : undefined;
            pair.resultTimestamp = entry.timestamp;
            pair.isError = block.is_error ?? false;
            completed.push(pair);
            pendingTools.delete(block.tool_use_id);
          }
        }
      }
    }
  }

  // Add still-pending tools (no result yet)
  for (const pair of pendingTools.values()) {
    completed.push(pair);
  }

  return completed;
}

export function extractToolEvents(entries: ClaudeEntry[]): TimelineEvent[] {
  const pairs = collectToolPairs(entries);
  const events: TimelineEvent[] = [];

  for (const pair of pairs) {
    // Tool start event
    const inputHint = formatToolInputHint(pair.name, pair.input);
    events.push({
      id: `${pair.id}-start`,
      type: 'tool.execution_start',
      timestamp: pair.timestamp,
      parentId: null,
      summary: inputHint ? `${pair.name}(${inputHint})` : `${pair.name}()`,
      toolCallId: pair.id,
    });

    // Tool complete event (if result exists)
    if (pair.resultTimestamp !== undefined) {
      const resultSummary = pair.isError
        ? `Error: ${truncate(pair.resultContent ?? 'unknown error', 120)}`
        : `Tool completed${pair.resultContent ? ': ' + truncate(pair.resultContent, 100) : ''}`;
      events.push({
        id: `${pair.id}-complete`,
        type: 'tool.execution_complete',
        timestamp: pair.resultTimestamp,
        parentId: null,
        summary: truncate(resultSummary, 120),
        toolCallId: pair.id,
      });
    }
  }

  return events;
}

function formatToolInputHint(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const normalized = toolName.toLowerCase();

  if (normalized === 'read' || normalized === 'write') {
    const fp = input.file_path ?? input.path;
    return typeof fp === 'string' ? truncate(fp, 100) : '';
  }

  if (normalized === 'edit' || normalized === 'multiedit') {
    const fp = input.file_path ?? input.path;
    return typeof fp === 'string' ? truncate(fp, 100) : '';
  }

  if (normalized === 'bash') {
    const cmd = input.command;
    return typeof cmd === 'string' ? truncate(cmd, 100) : '';
  }

  if (normalized === 'grep') {
    const pattern = input.pattern;
    return typeof pattern === 'string' ? truncate(pattern, 80) : '';
  }

  if (normalized === 'glob' || normalized === 'ls') {
    const p = input.path ?? input.pattern;
    return typeof p === 'string' ? truncate(String(p), 100) : '';
  }

  // Generic: show first string value
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return truncate(value, 80);
    }
  }

  return '';
}

/* ── Assistant updates extraction ─────────────────────────────── */

function extractAssistantUpdates(entries: ClaudeEntry[]): string[] | undefined {
  const updates: string[] = [];
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    if (!Array.isArray(entry.message.content)) continue;

    for (const block of entry.message.content) {
      if (block.type === 'text' && block.text && block.text.trim().length > 0) {
        updates.push(block.text.trim());
      }
    }
  }

  if (updates.length === 0) return undefined;
  return updates.slice(-MAX_ASSISTANT_UPDATES);
}

/* ── Activity buckets ─────────────────────────────────────────── */

function buildActivityBuckets(entries: ClaudeEntry[]): number[] {
  const timestamps: number[] = [];
  for (const entry of entries) {
    if (entry.timestamp) {
      const ms = Date.parse(entry.timestamp);
      if (Number.isFinite(ms)) timestamps.push(ms);
    }
  }

  if (timestamps.length === 0) {
    return Array.from({ length: ACTIVITY_BUCKET_COUNT }, () => 0);
  }

  const startMs = Math.min(...timestamps);
  const endMs = Math.max(...timestamps);

  if (endMs <= startMs) {
    const buckets = Array.from({ length: ACTIVITY_BUCKET_COUNT }, () => 0);
    buckets[Math.floor(ACTIVITY_BUCKET_COUNT / 2)] = timestamps.length;
    return buckets;
  }

  const bucketWidth = (endMs - startMs) / ACTIVITY_BUCKET_COUNT;
  const buckets = Array.from({ length: ACTIVITY_BUCKET_COUNT }, () => 0);

  for (const ts of timestamps) {
    const rawIndex = Math.floor((ts - startMs) / bucketWidth);
    const idx = Math.min(Math.max(rawIndex, 0), ACTIVITY_BUCKET_COUNT - 1);
    buckets[idx] += 1;
  }

  return buckets;
}

/* ── Agent tree (flat — Claude has no sub-agents) ─────────────── */

export function buildClaudeAgentTree(
  entries: ClaudeEntry[],
  status: SessionStatus,
  name: string,
  startedAt: string,
): SubAgent {
  const pairs = collectToolPairs(entries);
  const toolCalls = pairs.slice(-5).map((p) => ({
    name: p.name,
    summary: formatToolInputHint(p.name, p.input) || p.name,
    status: (p.resultTimestamp !== undefined ? 'completed' : 'running') as
      | 'running'
      | 'completed',
    timestamp: p.timestamp,
  }));

  const root: SubAgent = {
    id: 'root',
    name: 'claude',
    status: status === 'completed' ? 'completed' : 'running',
    task: name,
    startedAt,
    children: [],
  };

  if (toolCalls.length > 0) {
    root.toolCalls = toolCalls;
  }

  return root;
}

/* ── File → Session ID mapping cache ──────────────────────────── */

interface FileSessionMeta {
  id: string;
  leafUuid?: string;
  filenameStem: string;
  filePath: string;
  mtimeMs: number;
}

function buildFileMeta(discovered: DiscoveredFile): FileSessionMeta | null {
  const firstEntry = parseFirstEntry(discovered.filePath);
  const stem = path.basename(discovered.filePath, '.jsonl');
  const leafUuid =
    firstEntry?.type === 'summary' ? firstEntry.leafUuid : undefined;
  const id = leafUuid ? `${SOURCE_PREFIX}${leafUuid}` : `${SOURCE_PREFIX}${stem}`;

  return {
    id,
    leafUuid,
    filenameStem: stem,
    filePath: discovered.filePath,
    mtimeMs: discovered.mtimeMs,
  };
}

/* ── ClaudeSessionSource ──────────────────────────────────────── */

export class ClaudeSessionSource implements SessionSource {
  readonly name: SessionSourceName = 'claude';

  isAvailable(): boolean {
    const { claudeDir } = getConfig();
    const projectsDir = path.join(claudeDir, 'projects');
    return fs.existsSync(projectsDir);
  }

  listSessionSummaries(excludeIds?: Set<string>): SessionSummary[] {
    const { claudeDir } = getConfig();
    const discovered = discoverSessionFiles(claudeDir);
    const summaries: SessionSummary[] = [];

    for (const file of discovered) {
      try {
        // Pre-filter: skip archived sessions before expensive file parsing
        if (excludeIds && excludeIds.size > 0 && excludeIds.has(SOURCE_PREFIX + file.sessionId)) {
          continue;
        }
        const summary = this.buildSummaryFromFile(file);
        if (summary) summaries.push(summary);
      } catch (error) {
        console.warn('[ClaudeSessionSource] Failed to build summary. Skipping.', {
          file: file.filePath,
          error,
        });
      }
    }

    summaries.sort(
      (a, b) => toEpochMs(b.lastActivityAt) - toEpochMs(a.lastActivityAt),
    );

    return summaries;
  }

  getSession(id: string): Session | null {
    const fileMeta = this.findFileForId(id);
    if (!fileMeta) return null;

    try {
      return this.buildSessionFromFile(fileMeta);
    } catch (error) {
      console.warn('[ClaudeSessionSource] Failed to build session.', {
        id,
        error,
      });
      return null;
    }
  }

  /* ── Private helpers ─────────────────────────────────── */

  private buildSummaryFromFile(file: DiscoveredFile): SessionSummary | null {
    // Read only the first line for the summary entry,
    // but we need at least a few more lines for metadata
    const entries = parseAllEntries(file.filePath);
    if (entries.length === 0) return null;

    const summaryEntry = entries[0]?.type === 'summary' ? entries[0] : undefined;
    const meta = buildFileMeta(file);
    if (!meta) return null;

    const firstUserContent = getFirstUserContent(entries);
    const firstUser = getFirstUserEntry(entries);
    const status = deriveClaudeStatus(file.mtimeMs);
    const startedAt = getFirstTimestamp(entries);
    const lastActivityAt = getLastTimestamp(entries, file.mtimeMs);

    // Name: prefer summary text, fall back to first user message
    const rawName = summaryEntry?.summary ?? firstUserContent ?? 'Claude session';
    const name = truncate(rawName, MAX_NAME_LENGTH);

    // Intent: first user message content
    const intent = firstUserContent
      ? truncate(firstUserContent, MAX_INTENT_LENGTH)
      : name;

    // Latest user message (last user entry with string content)
    let latestUserMessage: string | undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      const msg = getUserMessageContent(entries[i]);
      if (msg) {
        if (msg !== firstUserContent) {
          latestUserMessage = truncate(msg, MAX_INTENT_LENGTH);
        }
        break;
      }
    }

    const assistantUpdates = extractAssistantUpdates(entries);
    const lastAssistantUpdate =
      assistantUpdates && assistantUpdates.length > 0
        ? assistantUpdates[assistantUpdates.length - 1]
        : undefined;

    return {
      id: meta.id,
      name,
      intent,
      status,
      source: 'claude',
      startedAt,
      lastActivityAt,
      cwd: firstUser?.cwd ?? null,
      repository: firstUser?.cwd ? path.basename(firstUser.cwd) : null,
      branch: firstUser?.gitBranch ?? null,
      agentCount: 1,
      turnCount: countUserEntries(entries),
      latestUserMessage,
      lastAssistantUpdate,
      compacted: false,
      compactionCount: 0,
    };
  }

  private buildSessionFromFile(meta: FileSessionMeta): Session {
    const entries = parseAllEntries(meta.filePath);
    const conversational = entries.filter(
      (e) => e.type === 'user' || e.type === 'assistant',
    );

    const summaryEntry = entries[0]?.type === 'summary' ? entries[0] : undefined;
    const firstUserContent = getFirstUserContent(entries);
    const firstUser = getFirstUserEntry(entries);
    const status = deriveClaudeStatus(meta.mtimeMs);
    const startedAt = getFirstTimestamp(entries);
    const lastActivityAt = getLastTimestamp(entries, meta.mtimeMs);

    const rawName = summaryEntry?.summary ?? firstUserContent ?? 'Claude session';
    const name = truncate(rawName, MAX_NAME_LENGTH);
    const intent = firstUserContent
      ? truncate(firstUserContent, MAX_INTENT_LENGTH)
      : name;

    const rootAgent = buildClaudeAgentTree(conversational, status, name, startedAt);
    const toolEvents = extractToolEvents(conversational);
    const activityBuckets = buildActivityBuckets(entries);
    const assistantUpdates = extractAssistantUpdates(conversational);

    let latestUserMessage: string | undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      const msg = getUserMessageContent(entries[i]);
      if (msg) {
        if (msg !== firstUserContent) {
          latestUserMessage = truncate(msg, MAX_INTENT_LENGTH);
        }
        break;
      }
    }

    return {
      id: meta.id,
      name,
      intent,
      status,
      source: 'claude',
      startedAt,
      lastActivityAt,
      cwd: firstUser?.cwd ?? null,
      repository: firstUser?.cwd ? path.basename(firstUser.cwd) : null,
      branch: firstUser?.gitBranch ?? null,
      agentCount: 1,
      turnCount: countUserEntries(entries),
      rootAgent,
      events: toolEvents.sort(
        (a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp),
      ),
      activityBuckets,
      assistantUpdates,
      latestUserMessage,
      lastAssistantUpdate:
        assistantUpdates && assistantUpdates.length > 0
          ? assistantUpdates[assistantUpdates.length - 1]
          : undefined,
      compacted: false,
      compactionCount: 0,
    };
  }

  private findFileForId(id: string): FileSessionMeta | null {
    const rawId = stripPrefix(id);
    const { claudeDir } = getConfig();
    const discovered = discoverSessionFiles(claudeDir);

    for (const file of discovered) {
      const meta = buildFileMeta(file);
      if (!meta) continue;

      // Match by leafUuid or filename stem
      if (meta.leafUuid === rawId || meta.filenameStem === rawId) {
        return meta;
      }
    }

    return null;
  }
}
