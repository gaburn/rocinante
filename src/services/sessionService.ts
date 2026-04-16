import type { Session, SessionSummary, SessionPlan, SessionStatus, StatusCounts } from '../types';

export async function getSessions(includeArchived = false, signal?: AbortSignal): Promise<SessionSummary[]> {
  const url = includeArchived ? '/api/sessions?includeArchived=true' : '/api/sessions';
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getSessionById(id: string, signal?: AbortSignal): Promise<Session | undefined> {
  const response = await fetch(`/api/sessions/${id}`, { signal });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getSessionPlan(sessionId: string): Promise<SessionPlan | null> {
  const response = await fetch(`/api/sessions/${sessionId}/plan`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to fetch plan: ${response.status}`);
  return response.json();
}

export const getStatusCounts = (sessions: SessionSummary[]): StatusCounts => {
  const counts = sessions.reduce<StatusCounts>(
    (accumulator, session) => {
      accumulator[session.status] += 1;
      accumulator.total += 1;
      return accumulator;
    },
    {
      active: 0,
      blocked: 0,
      waiting: 0,
      completed: 0,
      total: 0,
    },
  );

  return counts;
};

export const filterSessionsByStatus = (
  sessions: SessionSummary[],
  status: SessionStatus | 'all',
): SessionSummary[] => {
  if (status === 'all') {
    return sessions;
  }

  return sessions.filter((session) => session.status === status);
};
