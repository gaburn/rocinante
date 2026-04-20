import { Session, SessionSummary } from '../../../src/types/index.js';

export type SessionSourceName = 'copilot' | 'claude';

export interface SessionSource {
  readonly name: SessionSourceName;
  listSessionSummaries(excludeIds?: Set<string>): SessionSummary[];
  getSession(id: string): Session | null;
  isAvailable(): boolean;
}

export interface SourceStatus {
  copilot: {
    available: boolean;
    sqliteAvailable: boolean;
    filesystemAvailable: boolean;
    sessionStateDir: string;
  };
  claude: {
    available: boolean;
    claudeDir: string;
  };
}
