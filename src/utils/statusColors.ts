import type { SessionStatus, AgentStatus } from '../types';

/**
 * Status Color Utilities
 * ─────────────────────────────────────────────────────────
 * Maps session / agent statuses to a consistent color
 * language across every surface of the dashboard.
 *
 * Palette rationale
 *   active / running  →  emerald   (alive, progressing)
 *   blocked           →  red       (error, needs attention)
 *   waiting           →  amber     (paused, awaiting input)
 *   completed         →  gray      (done, de-emphasised)
 */

type Status = SessionStatus | AgentStatus;

/* ── colour dot (solid circle indicator) ──────────────── */

const DOT_CLASS: Record<Status, string> = {
  active:    'bg-emerald-400',
  running:   'bg-emerald-400',
  blocked:   'bg-red-400',
  waiting:   'bg-amber-400',
  completed: 'bg-gray-500',
};

export function getStatusDotClass(status: Status): string {
  return DOT_CLASS[status];
}

/* ── text colour ──────────────────────────────────────── */

const TEXT_CLASS: Record<Status, string> = {
  active:    'text-emerald-400',
  running:   'text-emerald-400',
  blocked:   'text-red-400',
  waiting:   'text-amber-400',
  completed: 'text-gray-400',
};

export function getStatusTextClass(status: Status): string {
  return TEXT_CLASS[status];
}

/* ── border colour ────────────────────────────────────── */

const BORDER_CLASS: Record<Status, string> = {
  active:    'border-emerald-500/40',
  running:   'border-emerald-500/40',
  blocked:   'border-red-500/40',
  waiting:   'border-amber-500/40',
  completed: 'border-gray-600/40',
};

export function getStatusBorderClass(status: Status): string {
  return BORDER_CLASS[status];
}

/* ── subtle background (badges / pills) ───────────────── */

const BG_CLASS: Record<Status, string> = {
  active:    'bg-emerald-500/10',
  running:   'bg-emerald-500/10',
  blocked:   'bg-red-500/10',
  waiting:   'bg-amber-500/10',
  completed: 'bg-gray-500/10',
};

export function getStatusBgClass(status: Status): string {
  return BG_CLASS[status];
}

/* ── human-readable label ─────────────────────────────── */

const LABEL: Record<Status, string> = {
  active:    'Active',
  running:   'Running',
  blocked:   'Blocked',
  waiting:   'Waiting for Input',
  completed: 'Completed',
};

export function getStatusLabel(status: Status): string {
  return LABEL[status];
}
