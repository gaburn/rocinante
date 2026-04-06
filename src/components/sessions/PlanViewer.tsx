import { useEffect, useRef, useState } from 'react';
import { getSessionPlan } from '../../services/sessionService';
import { usePlanStatus } from '../../hooks/usePlanStatus';
import type { SessionPlan, PlanSection } from '../../types';

interface PlanViewerProps {
  sessionId: string;
}

/* ── Skeleton ──────────────────────────────────────────────── */

function PlanSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-3 px-4 py-3">
      {/* Fake section header */}
      <div className="h-2 w-32 rounded bg-surface-tertiary" />
      {/* Fake task rows */}
      <div className="flex items-center gap-2">
        <div className="size-3 shrink-0 rounded-sm bg-surface-tertiary" />
        <div className="h-2.5 w-48 rounded bg-surface-tertiary" />
      </div>
      <div className="flex items-center gap-2">
        <div className="size-3 shrink-0 rounded-sm bg-surface-tertiary" />
        <div className="h-2.5 w-56 rounded bg-surface-tertiary" />
      </div>
      <div className="flex items-center gap-2">
        <div className="size-3 shrink-0 rounded-sm bg-surface-tertiary" />
        <div className="h-2.5 w-40 rounded bg-surface-tertiary" />
      </div>
    </div>
  );
}

/* ── Task Row ──────────────────────────────────────────────── */

function TaskRow({
  taskId,
  title,
  description,
  checked,
  onToggle,
}: {
  taskId: string;
  title: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      htmlFor={`plan-task-${taskId}`}
      className="flex cursor-pointer items-start gap-2 px-4 py-1 transition-colors duration-100 hover:bg-surface-hover/30"
    >
      <input
        id={`plan-task-${taskId}`}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 shrink-0 accent-border-active"
      />
      <span className="min-w-0">
        <span
          className={`block text-sm leading-snug ${
            checked ? 'text-fg/40 line-through' : 'text-fg/70'
          }`}
        >
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-fg/40">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/* ── Section ───────────────────────────────────────────────── */

function Section({
  section,
  sessionId,
  planStatus,
}: {
  section: PlanSection;
  sessionId: string;
  planStatus: ReturnType<typeof usePlanStatus>;
}) {
  return (
    <div>
      <h3 className="mt-3 mb-1 px-4 font-mono text-xs uppercase tracking-widest text-fg/55">
        {section.title}
      </h3>
      {section.tasks.map((task) => {
        const checked = planStatus.isTaskChecked(sessionId, task.id);
        return (
          <TaskRow
            key={task.id}
            taskId={task.id}
            title={task.title}
            description={task.description}
            checked={checked}
            onToggle={() => planStatus.toggleTask(sessionId, task.id)}
          />
        );
      })}
    </div>
  );
}

/* ── PlanViewer ─────────────────────────────────────────────── */

export default function PlanViewer({ sessionId }: PlanViewerProps) {
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const planStatus = usePlanStatus();
  const abortRef = useRef<AbortController | null>(null);

  /* ── Fetch plan on mount / sessionId change ────────────── */
  useEffect(() => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    getSessionPlan(sessionId)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPlan(data ?? null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load plan',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [sessionId]);

  /* ── Nothing to show ───────────────────────────────────── */
  if (!isLoading && !error && plan === null) return null;

  /* ── Progress stats ────────────────────────────────────── */
  const totalTasks =
    plan?.sections.reduce((sum, s) => sum + s.tasks.length, 0) ?? 0;
  const progress = planStatus.getProgress(sessionId, totalTasks);

  return (
    <div className="rounded-lg border border-border-default bg-surface-secondary">
      {/* ── Header ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 pt-4 pb-3 text-left"
        aria-expanded={isExpanded}
      >
        <h2 className="font-mono text-sm font-semibold text-fg-heading">
          Session Plan
          {!isLoading && plan && (
            <span className="ml-2 font-normal text-fg/50">
              ({progress.checked}/{progress.total} completed)
            </span>
          )}
        </h2>

        <span
          aria-hidden="true"
          className={`inline-block text-base text-fg/30 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>

      {isExpanded && (
        <>
          {/* ── Divider ──────────────────────────────────────── */}
          <div className="h-px bg-border-default" />

          {/* ── Body ─────────────────────────────────────────── */}
          {isLoading ? (
            <PlanSkeleton />
          ) : error ? (
            <p className="px-4 py-3 font-mono text-xs text-red-400">
              {error}
            </p>
          ) : plan ? (
            <div
              className="max-h-[400px] overflow-y-auto pb-2"
              style={{
                boxShadow:
                  'inset 0 8px 10px -8px rgba(0,0,0,.45), inset 0 -8px 10px -8px rgba(0,0,0,.45)',
              }}
            >
              {plan.sections.map((section, i) => (
                <Section
                  key={i}
                  section={section}
                  sessionId={sessionId}
                  planStatus={planStatus}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
