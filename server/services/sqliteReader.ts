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
