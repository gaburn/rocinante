import { Session, SessionSummary } from '../../../src/types/index.js';

export type SessionSourceName = 'copilot' | 'claude';

export interface SessionSource {
  readonly name: SessionSourceName;
  listSessionSummaries(excludeIds?: Set<string>): SessionSummary[];
  getSession(id: string): Session | null;
  isAvailable(): boolean;
}
