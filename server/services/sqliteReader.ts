import fs from 'node:fs';
import Database from 'better-sqlite3';

import { getConfig } from '../config.js';

export interface SqliteSession {
  id: string;
  cwd: string | null;
  repository: string | null;
  branch: string | null;
  summary: string | null;
  host_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  sessionId: string;
  matchType: 'user_message' | 'assistant_response' | 'fts';
  snippet: string;
  turnIndex: number;
}

interface CountRow {
  count: number;
}

interface FirstMessageRow {
  user_message: string | null;
}

let db: InstanceType<typeof Database> | null = null;
let databaseUnavailable = false;

function getDatabase(): InstanceType<typeof Database> | null {
  if (databaseUnavailable || db === null) {
    console.warn('[sqliteReader] Database unavailable. Returning empty result.');
    return null;
  }

  return db;
}

export function initDatabase(): void {
  const { sqliteDbPath } = getConfig();

  if (db !== null) {
    return;
  }

  if (!fs.existsSync(sqliteDbPath)) {
    console.warn(`[sqliteReader] SQLite database file not found at ${sqliteDbPath}. Reader will return empty results.`);
    databaseUnavailable = true;
    return;
  }

  try {
    db = new Database(sqliteDbPath, { readonly: true, fileMustExist: true });
    databaseUnavailable = false;
  } catch (error) {
    console.warn('[sqliteReader] Failed to open SQLite database in read-only mode. Reader will return empty results.', error);
    db = null;
    databaseUnavailable = true;
  }
}

export function getAllSessions(): SqliteSession[] {
  const database = getDatabase();
  if (!database) {
    return [];
  }

  try {
    const statement = database.prepare(`
      SELECT id, cwd, repository, branch, summary, host_type, created_at, updated_at
      FROM sessions
      ORDER BY updated_at DESC
    `);

    return statement.all() as SqliteSession[];
  } catch (error) {
    console.warn('[sqliteReader] Failed to read all sessions.', error);
    return [];
  }
}

export function getSessionById(id: string): SqliteSession | undefined {
  const database = getDatabase();
  if (!database) {
    return undefined;
  }

  try {
    const statement = database.prepare(`
      SELECT id, cwd, repository, branch, summary, host_type, created_at, updated_at
      FROM sessions
      WHERE id = ?
    `);

    return statement.get(id) as SqliteSession | undefined;
  } catch (error) {
    console.warn(`[sqliteReader] Failed to read session by id: ${id}`, error);
    return undefined;
  }
}

export function getFirstUserMessage(sessionId: string): string | null {
  const database = getDatabase();
  if (!database) {
    return null;
  }

  try {
    const statement = database.prepare(`
      SELECT user_message
      FROM turns
      WHERE session_id = ?
      ORDER BY turn_index ASC
      LIMIT 1
    `);

    const row = statement.get(sessionId) as FirstMessageRow | undefined;
    return row?.user_message ?? null;
  } catch (error) {
    console.warn(`[sqliteReader] Failed to read first user message for session: ${sessionId}`, error);
    return null;
  }
}

export function getLastUserMessage(sessionId: string): string | null {
  const database = getDatabase();
  if (!database) {
    return null;
  }

  try {
    const statement = database.prepare(`
      SELECT user_message
      FROM turns
      WHERE session_id = ?
      ORDER BY turn_index DESC
      LIMIT 1
    `);

    const row = statement.get(sessionId) as FirstMessageRow | undefined;
    return row?.user_message ?? null;
  } catch (error) {
    console.warn(`[sqliteReader] Failed to read last user message for session: ${sessionId}`, error);
    return null;
  }
}

export function getTurnCount(sessionId: string): number {
  const database = getDatabase();
  if (!database) {
    return 0;
  }

  try {
    const statement = database.prepare(`
      SELECT COUNT(*) as count
      FROM turns
      WHERE session_id = ?
    `);

    const row = statement.get(sessionId) as CountRow | undefined;
    return row?.count ?? 0;
  } catch (error) {
    console.warn(`[sqliteReader] Failed to read turn count for session: ${sessionId}`, error);
    return 0;
  }
}

function extractSnippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const pos = lower.indexOf(query.toLowerCase());
  if (pos === -1) {
    return text.slice(0, 100) + (text.length > 100 ? '...' : '');
  }
  const start = Math.max(0, pos - 50);
  const end = Math.min(text.length, pos + query.length + 50);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

export function searchConversations(query: string): SearchResult[] {
  const database = getDatabase();
  if (!database) {
    return [];
  }

  const seen = new Map<string, SearchResult>();

  // 1. Try FTS5 search_index
  try {
    const ftsQuery = query.includes(' ') ? `"${query.replace(/"/g, '""')}"` : query.replace(/[^\w\s]/g, '');
    if (ftsQuery.length > 0) {
      const ftsStmt = database.prepare(`
        SELECT session_id, content, source_type
        FROM search_index
        WHERE search_index MATCH ?
        LIMIT 50
      `);
      const ftsRows = ftsStmt.all(ftsQuery) as Array<{ session_id: string; content: string; source_type: string }>;
      for (const row of ftsRows) {
        if (!seen.has(row.session_id)) {
          seen.set(row.session_id, {
            sessionId: row.session_id,
            matchType: 'fts',
            snippet: extractSnippet(row.content, query),
            turnIndex: 0,
          });
        }
      }
    }
  } catch {
    // FTS5 table may not exist in all databases — fall through to LIKE search
  }

  // 2. Direct turns search via LIKE
  try {
    const likePattern = `%${query}%`;
    const turnsStmt = database.prepare(`
      SELECT session_id, turn_index, user_message, assistant_response
      FROM turns
      WHERE user_message LIKE ? OR assistant_response LIKE ?
      LIMIT 50
    `);
    const turnRows = turnsStmt.all(likePattern, likePattern) as Array<{
      session_id: string;
      turn_index: number;
      user_message: string | null;
      assistant_response: string | null;
    }>;

    for (const row of turnRows) {
      if (seen.has(row.session_id)) continue;

      const userMatch = row.user_message && row.user_message.toLowerCase().includes(query.toLowerCase());
      const matchType: SearchResult['matchType'] = userMatch ? 'user_message' : 'assistant_response';
      const matchText = userMatch ? row.user_message! : row.assistant_response!;

      seen.set(row.session_id, {
        sessionId: row.session_id,
        matchType,
        snippet: extractSnippet(matchText, query),
        turnIndex: row.turn_index,
      });
    }
  } catch (error) {
    console.warn('[sqliteReader] Failed to search turns.', error);
  }

  return Array.from(seen.values()).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}

export function closeDatabase(): void {
  if (db === null) {
    return;
  }

  try {
    db.close();
  } catch (error) {
    console.warn('[sqliteReader] Failed to close SQLite database connection.', error);
  } finally {
    db = null;
  }
}
