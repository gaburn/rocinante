import type { WorkflowListErrorEntry, WorkflowSummary } from '../../types/workflows';
import {
  getWorkflowStatusBgClass,
  getWorkflowStatusBorderClass,
  getWorkflowStatusDotClass,
  getWorkflowStatusLabel,
  getWorkflowStatusTextClass,
  shouldWorkflowStatusPulse,
} from '../../utils/workflowStatusColors';

interface WorkflowListProps {
  workflows: WorkflowSummary[];
  errors: WorkflowListErrorEntry[];
  selectedId: string | null;
  onSelect: (workflowId: string) => void;
  isLoading: boolean;
}

function progressOf(w: WorkflowSummary): number | null {
  const pct = w.progress?.percent;
  if (typeof pct !== 'number' || Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export default function WorkflowList({ workflows, errors, selectedId, onSelect, isLoading }: WorkflowListProps) {
  const isEmpty = workflows.length === 0 && errors.length === 0;

  return (
    <nav aria-label="Workflows" className="p-3 space-y-2">
      {isLoading && workflows.length === 0 && errors.length === 0 && (
        <div className="flex items-center gap-2 px-2 py-3 text-xs text-fg-secondary">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" aria-hidden="true" />
          Loading workflows…
        </div>
      )}

      {isEmpty && !isLoading && (
        <p className="px-2 py-3 text-xs text-fg-secondary">
          No workflows yet. Create one to get started.
        </p>
      )}

      <ul className="space-y-2">
        {workflows.map((w) => {
          const id = w.id;
          const isSelected = id === selectedId;
          const pct = progressOf(w);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`
                  w-full rounded-lg border px-3 py-2.5 text-left transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active
                  ${isSelected
                    ? 'bg-surface-hover border-border-active'
                    : 'bg-surface-secondary border-border-default hover:bg-surface-hover'}
                `}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-fg-heading">{w.name || 'Untitled workflow'}</span>
                  <span
                    className={`
                      shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium
                      ${getWorkflowStatusBgClass(w.status)} ${getWorkflowStatusTextClass(w.status)} ${getWorkflowStatusBorderClass(w.status)}
                    `}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${getWorkflowStatusDotClass(w.status)} ${shouldWorkflowStatusPulse(w.status) ? 'animate-pulse' : ''}`}
                    />
                    {getWorkflowStatusLabel(w.status)}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-secondary">
                  <span className="font-mono uppercase tracking-wide">{w.mode}</span>
                  {w.repositoryTarget && (
                    <span className="truncate font-mono" title={w.repositoryTarget}>
                      {w.repositoryTarget}
                    </span>
                  )}
                </div>

                {pct !== null && (
                  <div
                    className="mt-2 h-1 w-full rounded-full bg-surface-tertiary"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${w.name || 'Workflow'} progress`}
                  >
                    <div className="h-1 rounded-full bg-accent-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {errors.length > 0 && (
        <div className="pt-2">
          <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-red-400/80">
            Unreadable workflows
          </h3>
          <ul className="mt-1 space-y-1.5">
            {errors.map((e, i) => (
              <li
                key={e.id || i}
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-400"
              >
                {e.id ? <span className="font-mono">{e.id}: </span> : null}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
