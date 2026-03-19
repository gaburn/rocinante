import type { Session, SessionStatus, StatusCounts } from '../types';

export async function getSessions(): Promise<Session[]> {
  const response = await fetch('/api/sessions');
  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getSessionById(id: string): Promise<Session | undefined> {
  const response = await fetch(`/api/sessions/${id}`);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export const getStatusCounts = (sessions: Session[]): StatusCounts => {
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
  sessions: Session[],
  status: SessionStatus | 'all',
): Session[] => {
  if (status === 'all') {
    return sessions;
  }

  return sessions.filter((session) => session.status === status);
};
