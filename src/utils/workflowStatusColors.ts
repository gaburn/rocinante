import type { WorkflowStatus } from '../types/workflows';

type VisibleWorkflowStatus = WorkflowStatus | 'skipped' | 'error';

const STATUS_STYLE: Record<VisibleWorkflowStatus, {
  dot: string;
  text: string;
  background: string;
  border: string;
  label: string;
  pulse?: boolean;
}> = {
  pending: { dot: 'bg-gray-500', text: 'text-gray-400', background: 'bg-gray-500/10', border: 'border-gray-600/40', label: 'Pending' },
  running: { dot: 'bg-emerald-400', text: 'text-emerald-400', background: 'bg-emerald-500/10', border: 'border-emerald-500/40', label: 'Running', pulse: true },
  'awaiting-review': { dot: 'bg-amber-400', text: 'text-amber-400', background: 'bg-amber-500/10', border: 'border-amber-500/40', label: 'Awaiting Review', pulse: true },
  complete: { dot: 'bg-blue-400', text: 'text-blue-400', background: 'bg-blue-500/10', border: 'border-blue-500/40', label: 'Complete' },
  skipped: { dot: 'bg-gray-600', text: 'text-gray-500', background: 'bg-gray-600/10', border: 'border-gray-600/40', label: 'Skipped' },
  error: { dot: 'bg-red-400', text: 'text-red-400', background: 'bg-red-500/10', border: 'border-red-500/40', label: 'Error' },
};

export const getWorkflowStatusDotClass = (status: VisibleWorkflowStatus) => STATUS_STYLE[status].dot;
export const getWorkflowStatusTextClass = (status: VisibleWorkflowStatus) => STATUS_STYLE[status].text;
export const getWorkflowStatusBgClass = (status: VisibleWorkflowStatus) => STATUS_STYLE[status].background;
export const getWorkflowStatusBorderClass = (status: VisibleWorkflowStatus) => STATUS_STYLE[status].border;
export const getWorkflowStatusLabel = (status: VisibleWorkflowStatus) => STATUS_STYLE[status].label;
export const shouldWorkflowStatusPulse = (status: VisibleWorkflowStatus) => STATUS_STYLE[status].pulse === true;
