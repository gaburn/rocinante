import { Session, SessionSummary } from '../../../src/types/index.js';

export type SessionSourceName = 'copilot' | 'claude';

export interface SessionSource {
  readonly name: SessionSourceName;
  listSessionSummaries(): SessionSummary[];
  getSession(id: string): Session | null;
  isAvailable(): boolean;
}
