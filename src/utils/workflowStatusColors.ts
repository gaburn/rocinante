import type { WorkflowStatus } from '../types/workflows';

/**
 * Status color utilities for Workflow / Phase / Step statuses. Kept separate
 * from utils/statusColors.ts (SessionStatus | AgentStatus) since the
 * workflow status vocabulary differs (pending, running, awaiting-input,
 * awaiting-review, complete, skipped, optional, error, ...) and the server
 * may still send values outside that set while it lands.
 */

const DOT_CLASS: Record<string, string> = {
  pending: 'bg-gray-500',
  running: 'bg-emerald-400',
  'awaiting-input': 'bg-amber-400',
  'awaiting-review': 'bg-amber-400',
  complete: 'bg-blue-400',
  skipped: 'bg-gray-600',
  optional: 'bg-gray-600',
  error: 'bg-red-400',
};

const TEXT_CLASS: Record<string, string> = {
  pending: 'text-gray-400',
  running: 'text-emerald-400',
  'awaiting-input': 'text-amber-400',
  'awaiting-review': 'text-amber-400',
  complete: 'text-blue-400',
  skipped: 'text-gray-500',
  optional: 'text-gray-500',
  error: 'text-red-400',
};

const BG_CLASS: Record<string, string> = {
  pending: 'bg-gray-500/10',
  running: 'bg-emerald-500/10',
  'awaiting-input': 'bg-amber-500/10',
  'awaiting-review': 'bg-amber-500/10',
  complete: 'bg-blue-500/10',
  skipped: 'bg-gray-600/10',
  optional: 'bg-gray-600/10',
  error: 'bg-red-500/10',
};

const BORDER_CLASS: Record<string, string> = {
  pending: 'border-gray-600/40',
  running: 'border-emerald-500/40',
  'awaiting-input': 'border-amber-500/40',
  'awaiting-review': 'border-amber-500/40',
  complete: 'border-blue-500/40',
  skipped: 'border-gray-600/40',
  optional: 'border-gray-600/40',
  error: 'border-red-500/40',
};

const LABEL: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  'awaiting-input': 'Awaiting Input',
  'awaiting-review': 'Awaiting Review',
  complete: 'Complete',
  skipped: 'Skipped',
  optional: 'Optional',
  error: 'Error',
};

const FALLBACK_KEY = 'pending';
const PULSING = new Set(['running', 'awaiting-input', 'awaiting-review']);

export function getWorkflowStatusDotClass(status: WorkflowStatus): string {
  return DOT_CLASS[status] ?? DOT_CLASS[FALLBACK_KEY];
}

export function getWorkflowStatusTextClass(status: WorkflowStatus): string {
  return TEXT_CLASS[status] ?? TEXT_CLASS[FALLBACK_KEY];
}

export function getWorkflowStatusBgClass(status: WorkflowStatus): string {
  return BG_CLASS[status] ?? BG_CLASS[FALLBACK_KEY];
}

export function getWorkflowStatusBorderClass(status: WorkflowStatus): string {
  return BORDER_CLASS[status] ?? BORDER_CLASS[FALLBACK_KEY];
}

export function getWorkflowStatusLabel(status: WorkflowStatus): string {
  return LABEL[status] ?? (status ? String(status) : 'Unknown');
}

export function shouldWorkflowStatusPulse(status: WorkflowStatus): boolean {
  return PULSING.has(status);
}
