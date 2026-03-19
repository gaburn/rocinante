import type { SubAgent } from '../types';

const MINUTE_IN_SECONDS = 60;
const HOUR_IN_SECONDS = 60 * MINUTE_IN_SECONDS;
const DAY_IN_SECONDS = 24 * HOUR_IN_SECONDS;

function parseIsoDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCompactUnits(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / DAY_IN_SECONDS);
  const hours = Math.floor((totalSeconds % DAY_IN_SECONDS) / HOUR_IN_SECONDS);
  const minutes = Math.floor((totalSeconds % HOUR_IN_SECONDS) / MINUTE_IN_SECONDS);

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

export function formatRelativeTime(isoString: string): string {
  const date = parseIsoDate(isoString);
  if (!date) {
    return 'invalid date';
  }

  const nowMs = Date.now();
  const diffSeconds = Math.floor((date.getTime() - nowMs) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < MINUTE_IN_SECONDS) {
    return 'just now';
  }

  const formatted = formatCompactUnits(absSeconds);

  if (diffSeconds > 0) {
    return `in ${formatted}`;
  }

  return `${formatted} ago`;
}

export function formatDuration(startIso: string, endIso?: string): string {
  const start = parseIsoDate(startIso);
  if (!start) {
    return 'invalid duration';
  }

  const end = endIso ? parseIsoDate(endIso) : new Date();
  if (!end) {
    return 'invalid duration';
  }

  const durationSeconds = Math.floor(Math.abs(end.getTime() - start.getTime()) / 1000);

  if (durationSeconds < MINUTE_IN_SECONDS) {
    return '< 1m';
  }

  if (durationSeconds < HOUR_IN_SECONDS) {
    const minutes = Math.floor(durationSeconds / MINUTE_IN_SECONDS);
    const seconds = durationSeconds % MINUTE_IN_SECONDS;
    return `${minutes}m ${seconds}s`;
  }

  if (durationSeconds < DAY_IN_SECONDS) {
    const hours = Math.floor(durationSeconds / HOUR_IN_SECONDS);
    const minutes = Math.floor((durationSeconds % HOUR_IN_SECONDS) / MINUTE_IN_SECONDS);
    return `${hours}h ${minutes}m`;
  }

  const days = Math.floor(durationSeconds / DAY_IN_SECONDS);
  const hours = Math.floor((durationSeconds % DAY_IN_SECONDS) / HOUR_IN_SECONDS);
  return `${days}d ${hours}h`;
}

export function formatCompactDuration(ms: number): string {
  if (ms < 1000) {
    return '< 1s';
  }

  const totalSeconds = Math.floor(ms / 1000);

  if (totalSeconds < MINUTE_IN_SECONDS) {
    return `${totalSeconds}s`;
  }

  if (totalSeconds < HOUR_IN_SECONDS) {
    const minutes = Math.floor(totalSeconds / MINUTE_IN_SECONDS);
    const seconds = totalSeconds % MINUTE_IN_SECONDS;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(totalSeconds / HOUR_IN_SECONDS);
  const minutes = Math.floor((totalSeconds % HOUR_IN_SECONDS) / MINUTE_IN_SECONDS);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength === 1) {
    return '…';
  }

  const limit = maxLength - 1;
  const candidate = text.slice(0, limit);
  const lastSpaceIndex = candidate.lastIndexOf(' ');
  const truncatedBase =
    lastSpaceIndex > 0 ? candidate.slice(0, lastSpaceIndex).trimEnd() : candidate.trimEnd();

  const safeBase = truncatedBase.length > 0 ? truncatedBase : text.slice(0, limit);
  return `${safeBase}…`;
}

export function countAgents(agent: SubAgent): number {
  return 1 + agent.children.reduce((total, child) => total + countAgents(child), 0);
}
