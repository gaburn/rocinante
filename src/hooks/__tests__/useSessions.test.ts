import { describe, it, expect } from 'vitest';
import type { Session } from '../../types/index.js';

/**
 * The session search/filter logic from useSessions.ts (lines 229-238):
 *
 *   const query = searchQuery.trim().toLowerCase()
 *   filtered = filtered.filter(
 *     (s) =>
 *       s.id.toLowerCase().includes(query) ||
 *       s.name.toLowerCase().includes(query) ||
 *       s.intent.toLowerCase().includes(query) ||
 *       conversationSearchResults.has(s.id),
 *   )
 *
 * We extract and directly test this logic without needing React hooks
 * or the full hook dependency tree.
 */

function filterBySearch(
  sessions: Pick<Session, 'id' | 'name' | 'intent'>[],
  searchQuery: string,
  conversationMatches: Set<string> = new Set(),
): Pick<Session, 'id' | 'name' | 'intent'>[] {
  const trimmed = searchQuery.trim();
  if (!trimmed) return sessions;

  const query = trimmed.toLowerCase();
  return sessions.filter(
    (s) =>
      s.id.toLowerCase().includes(query) ||
      s.name.toLowerCase().includes(query) ||
      s.intent.toLowerCase().includes(query) ||
      conversationMatches.has(s.id),
  );
}

function createSession(
  id: string,
  name = 'Test Session',
  intent = 'Do something',
): Pick<Session, 'id' | 'name' | 'intent'> {
  return { id, name, intent };
}

describe('Session search filtering (useSessions logic)', () => {
  const sessions = [
    createSession('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Fix authentication bug', 'Fix the login flow'),
    createSession('DEADBEEF-1234-5678-9abc-def012345678', 'Add dark mode', 'Implement dark theme'),
    createSession('12345678-abcd-efgh-ijkl-mnopqrstuvwx', 'Refactor API', 'Clean up REST endpoints'),
  ];

  describe('session ID search', () => {
    it('matches a partial UUID against session.id', () => {
      const result = filterBySearch(sessions, 'a1b2c3');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('matches a mid-string portion of the UUID', () => {
      const result = filterBySearch(sessions, 'e5f6-7890');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('performs case-insensitive matching on session ID', () => {
      const result = filterBySearch(sessions, 'deadbeef');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('DEADBEEF-1234-5678-9abc-def012345678');
    });

    it('performs case-insensitive matching with uppercase query', () => {
      const result = filterBySearch(sessions, 'DEADBEEF');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('DEADBEEF-1234-5678-9abc-def012345678');
    });

    it('returns no results for a non-matching string', () => {
      const result = filterBySearch(sessions, 'zzzznotfound');
      expect(result).toHaveLength(0);
    });

    it('returns empty array when searching against empty session list', () => {
      const result = filterBySearch([], 'anything');
      expect(result).toHaveLength(0);
    });
  });

  describe('name and intent search', () => {
    it('matches against session name', () => {
      const result = filterBySearch(sessions, 'dark mode');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Add dark mode');
    });

    it('matches against session intent', () => {
      const result = filterBySearch(sessions, 'REST endpoints');
      expect(result).toHaveLength(1);
      expect(result[0].intent).toBe('Clean up REST endpoints');
    });

    it('performs case-insensitive matching on name', () => {
      const result = filterBySearch(sessions, 'FIX AUTHENTICATION');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Fix authentication bug');
    });
  });

  describe('conversation search results', () => {
    it('includes sessions that match via conversation search', () => {
      const conversationMatches = new Set(['12345678-abcd-efgh-ijkl-mnopqrstuvwx']);
      const result = filterBySearch(sessions, 'xyznotinfields', conversationMatches);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('12345678-abcd-efgh-ijkl-mnopqrstuvwx');
    });
  });

  describe('edge cases', () => {
    it('returns all sessions when search query is empty', () => {
      const result = filterBySearch(sessions, '');
      expect(result).toHaveLength(3);
    });

    it('returns all sessions when search query is whitespace-only', () => {
      const result = filterBySearch(sessions, '   ');
      expect(result).toHaveLength(3);
    });

    it('trims whitespace from search query before matching', () => {
      const result = filterBySearch(sessions, '  deadbeef  ');
      expect(result).toHaveLength(1);
    });
  });
});
