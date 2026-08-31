import { useEffect, useMemo, useState } from 'react';
import { useWorkflowDetail } from '../../hooks/useWorkflowDetail';
import { useTerminalContext } from '../../context/TerminalContext';
import { getSessionById } from '../../services/sessionService';
import { renderInlineMarkdown } from '../../utils/inlineMarkdown';
import type { WorkflowPhase } from '../../types/workflows';
import type {
  ArchitectureChoice,
  WorkflowArtifact,
  WorkflowStatus,
  WorkflowStepStatus,
} from '../../types/workflows';
import {
  getWorkflowStatusBgClass,
  getWorkflowStatusBorderClass,
  getWorkflowStatusDotClass,
  getWorkflowStatusLabel,
  getWorkflowStatusTextClass,
  shouldWorkflowStatusPulse,
} from '../../utils/workflowStatusColors';

interface WorkflowDetailPanelProps {
  workflowId: string;
}

const ARCHITECTURE_CHOICES: { value: ArchitectureChoice; label: string; description: string }[] = [
  { value: 'direct', label: 'Direct', description: 'Implement directly. Specification and Tasks are skipped.' },
  {
    value: 'planned',
    label: 'Specification + Tasks first',
    description: 'Produce a Specification and a Tasks breakdown before implementing.',
  },
];

function ArtifactLink({ artifact }: { artifact: WorkflowArtifact }) {
  if (artifact.type === 'url') {
    return (
      <a
        href={artifact.value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-accent-primary underline underline-offset-2 hover:text-accent-primary/80 break-all"
      >
        {artifact.value}
      </a>
    );
  }
  return (
    <code className="text-xs font-mono text-fg-secondary break-all" title={artifact.value}>
      {artifact.value}
    </code>
  );
}

function StatusBadge({ status }: { status: WorkflowStatus | WorkflowStepStatus | 'error' }) {
  const s = status ?? 'pending';
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium
        ${getWorkflowStatusBgClass(s)} ${getWorkflowStatusTextClass(s)} ${getWorkflowStatusBorderClass(s)}
      `}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${getWorkflowStatusDotClass(s)} ${shouldWorkflowStatusPulse(s) ? 'animate-pulse' : ''}`}
      />
      {getWorkflowStatusLabel(s)}
    </span>
  );
}

function PhaseAgentUpdates({ sessionId }: { sessionId: string }) {
  const [updates, setUpdates] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const session = await getSessionById(sessionId, controller.signal);
        setUpdates(session?.assistantUpdates ?? []);
        setError(session ? null : 'Agent session is still indexing.');
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agent updates.');
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [sessionId]);

  if (error) {
    return <p role="alert" className="text-xs text-red-400">{error}</p>;
  }
  if (updates === null) {
    return <div className="h-14 animate-pulse rounded-md bg-surface-tertiary" aria-label="Loading agent updates" />;
  }
  if (updates.length === 0) {
    return <p className="text-xs text-fg-secondary">Waiting for the agent's first update.</p>;
  }

  return (
    <div aria-live="polite" className="max-h-64 space-y-2 overflow-y-auto">
      {[...updates].reverse().map((update, index) => (
        <p
          key={`${index}:${update}`}
          className="whitespace-pre-wrap rounded-md bg-surface-tertiary px-3 py-2 text-xs leading-relaxed text-fg-heading"
        >
          {renderInlineMarkdown(update)}
        </p>
      ))}
    </div>
  );
}

interface WorkflowPhaseItemProps {
  phase: WorkflowPhase;
  sessionId?: string;
  isActing: boolean;
  startStep: (phaseId: string, stepId: string) => Promise<void>;
  approve: (phaseId: string, stepId: string, runId: string, artifact: string) => Promise<void>;
}

export function WorkflowPhaseItem({
  phase,
  sessionId,
  isActing,
  startStep,
  approve,
}: WorkflowPhaseItemProps) {
  const [expanded, setExpanded] = useState(phase.status === 'running');
  const panelId = `workflow-phase-${phase.id}`;

  return (
    <li className={`rounded-lg border border-border-default bg-surface-secondary ${phase.status === 'skipped' ? 'opacity-60' : ''}`}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg p-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-3.5 shrink-0 text-fg-secondary transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m6 3 5 5-5 5" />
        </svg>
        <h4 className="text-sm font-medium text-fg-heading">{phase.name}</h4>
        <span className="ml-auto"><StatusBadge status={phase.status} /></span>
      </button>

      {expanded && (
        <div id={panelId} className="space-y-3 border-t border-border-default p-3">
          {phase.status === 'running' && sessionId && (
            <section aria-label={`${phase.name} agent updates`} className="space-y-2">
              <h5 className="text-xs font-medium text-fg-heading">{phase.name} agent updates</h5>
              <PhaseAgentUpdates sessionId={sessionId} />
            </section>
          )}

          {phase.steps.length > 0 && (
            <ol className="space-y-2 border-l border-border-default pl-3">
              {phase.steps.map((step) => {
                const canStart = step.canStart;
                const approvalArtifact = step.artifacts[0]?.value;
                const canApprove = step.canApprove && approvalArtifact !== undefined;
                return (
                  <li key={step.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-fg-heading">{step.name}</span>
                      <StatusBadge status={step.status} />
                    </div>

                    {step.summary && (
                      <p className="mt-0.5 text-xs text-fg-secondary">{step.summary}</p>
                    )}

                    {step.artifacts.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {step.artifacts.map((artifact, index) => (
                          <li key={`${artifact.type}:${artifact.value}:${index}`}>
                            <ArtifactLink artifact={artifact} />
                          </li>
                        ))}
                      </ul>
                    )}

                    {(canStart || canApprove) && (
                      <div className="mt-1.5 flex gap-2">
                        {canStart && (
                          <button
                            type="button"
                            onClick={() => void startStep(phase.id, step.id)}
                            disabled={isActing}
                            className="rounded-md border border-accent-primary/40 bg-accent-primary/15 px-2 py-1 text-[11px] font-medium text-fg-heading transition-colors hover:bg-accent-primary/25 disabled:opacity-50"
                          >
                            Start step
                          </button>
                        )}
                        {canApprove && (
                          <button
                            type="button"
                            onClick={() => {
                              if (step.runId && approvalArtifact) {
                                void approve(phase.id, step.id, step.runId, approvalArtifact);
                              }
                            }}
                            disabled={isActing}
                            className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

export default function WorkflowDetailPanel({ workflowId }: WorkflowDetailPanelProps) {
  const { openWorkflowTerminal } = useTerminalContext();
  const {
    detail, isLoading, error, actionError, isActing,
    refresh, clearActionError, startStep, resumeStep, approve, chooseGate, answerInput,
  } = useWorkflowDetail(workflowId);

  const pendingInput = detail?.pendingInput ?? null;
  const approvable = detail?.approvableStep ?? null;
  const modeGate = detail?.modeGate ?? null;
  const showModeGate = modeGate !== null;
  const nextEligible = detail?.nextEligibleStep ?? null;
  const recoverable = detail?.recoverableStep ?? null;
  const visiblePhases = detail?.mode === 'bug-fix'
    ? detail.phases.filter((phase) => phase.status !== 'skipped')
    : detail?.phases ?? [];

  const [answer, setAnswer] = useState('');
  const [gateChoice, setGateChoice] = useState<ArchitectureChoice | ''>('');

  const [lastRequestId, setLastRequestId] = useState<string | undefined>(pendingInput?.requestId);
  if (pendingInput?.requestId !== lastRequestId) {
    setLastRequestId(pendingInput?.requestId);
    setAnswer('');
  }

  const gateKey = `${detail?.id ?? ''}:${showModeGate ? 'open' : 'closed'}`;
  const [lastGateKey, setLastGateKey] = useState(gateKey);
  if (gateKey !== lastGateKey) {
    setLastGateKey(gateKey);
    setGateChoice('');
  }

  const pct = useMemo(() => {
    const raw = detail?.progress?.percent;
    if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [detail?.progress?.percent]);

  if (isLoading && !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
          <span className="text-sm text-fg-secondary">Loading workflow…</span>
        </div>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <span role="alert" className="text-sm text-red-400">{error}</span>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md bg-surface-tertiary px-3 py-1.5 text-xs text-fg-secondary hover:text-fg-heading hover:bg-surface-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const sessionId = detail.workflowSession?.id;

  let nextActionLabel = 'The current step is running. No action is needed right now.';
  if (recoverable) nextActionLabel = `Resume interrupted step: "${recoverable.stepName}".`;
  else if (pendingInput) nextActionLabel = 'Answer the pending input request below.';
  else if (showModeGate) nextActionLabel = 'Choose how this workflow continues below.';
  else if (approvable) nextActionLabel = `Approve output for "${approvable.stepName}".`;
  else if (nextEligible) nextActionLabel = `Start the next step: "${nextEligible.stepName}".`;
  else if (detail.status === 'complete') nextActionLabel = 'This workflow is complete.';

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg-heading truncate">{detail.name}</h2>
          {detail.goal && <p className="mt-0.5 text-xs text-fg-secondary">{detail.goal}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={detail.status} />
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="rounded-md bg-surface-tertiary px-2.5 py-1 text-xs text-fg-secondary hover:text-fg-heading hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <dt className="text-fg-secondary">Mode</dt>
          <dd className="mt-0.5 font-mono uppercase text-fg-heading">{detail.mode}</dd>
        </div>
        <div>
          <dt className="text-fg-secondary">Workflow Session ID</dt>
          <dd className="mt-0.5 truncate font-mono text-fg-heading" title={sessionId ?? undefined}>
            {sessionId ?? '—'}
          </dd>
          {sessionId && detail.status !== 'complete' && (
            <button
              type="button"
              onClick={() => openWorkflowTerminal(detail.id, detail.name, detail.repositoryTarget)}
              className="mt-1 text-xs text-accent-primary hover:underline"
            >
              Attach terminal
            </button>
          )}
        </div>
        <div>
          <dt className="text-fg-secondary">Repository target</dt>
          <dd className="mt-0.5 truncate font-mono text-fg-heading" title={detail.repositoryTarget}>
            {detail.repositoryTarget ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-fg-secondary">Progress</dt>
          <dd className="mt-0.5 text-fg-heading">
            {pct !== null ? `${pct}%` : '—'}
            {detail.progress && (
              <span className="ml-1 text-fg-secondary">
                ({detail.progress.completed}/{detail.progress.total} phases)
              </span>
            )}
          </dd>
        </div>
        {detail.mode === 'bug-fix' && (
          <div>
            <dt className="text-fg-secondary">Classification</dt>
            <dd className="mt-0.5 text-fg-heading">{detail.classification ?? '—'}</dd>
          </div>
        )}
        {detail.mode === 'architecture-health' && (
          <div>
            <dt className="text-fg-secondary">Architecture choice</dt>
            <dd className="mt-0.5 text-fg-heading">{detail.architectureChoice ?? 'Not yet chosen'}</dd>
          </div>
        )}
      </dl>

      {pct !== null && (
        <div
          className="h-1.5 w-full rounded-full bg-surface-tertiary"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Workflow progress"
        >
          <div className="h-1.5 rounded-full bg-accent-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div
        aria-live="polite"
        className="rounded-lg border border-border-active/40 bg-surface-hover px-3 py-2.5 text-sm text-fg-heading"
      >
        <span className="font-semibold">Next: </span>
        {nextActionLabel}
        {!pendingInput && !showModeGate && !approvable && nextEligible && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void startStep(nextEligible.phaseId, nextEligible.stepId)}
              disabled={isActing}
              className="rounded-md bg-accent-primary/20 border border-accent-primary/40 px-3 py-1.5 text-xs font-medium text-fg-heading hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
            >
              {isActing ? 'Starting…' : `Start "${nextEligible.stepName}"`}
            </button>
          </div>
        )}
        {!pendingInput && !showModeGate && approvable && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                if (approvable.runId) {
                  void approve(
                    approvable.phaseId,
                    approvable.stepId,
                    approvable.runId,
                    approvable.artifact.value,
                  );
                }
              }}
              disabled={isActing}
              className="rounded-md bg-emerald-500/15 border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              {isActing ? 'Approving…' : `Approve "${approvable.stepName}"`}
            </button>
          </div>
        )}
        {!showModeGate && !approvable && recoverable && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                if (recoverable.runId) void resumeStep(recoverable.phaseId, recoverable.stepId, recoverable.runId);
              }}
              disabled={isActing}
              className="rounded-md bg-amber-500/20 border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {isActing ? 'Resuming…' : `Resume "${recoverable.stepName}"`}
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span>{actionError}</span>
          <button type="button" onClick={clearActionError} className="shrink-0 text-red-300 hover:text-red-200" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {pendingInput && (
        <section aria-labelledby="wf-pending-input-heading" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <h3 id="wf-pending-input-heading" className="text-sm font-semibold text-amber-300">
            Input requested — {pendingInput.phaseName} / {pendingInput.stepName}
          </h3>
          <p className="mt-1 text-sm text-fg-heading">{pendingInput.question}</p>

          {pendingInput.artifactRefs.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {pendingInput.artifactRefs.map((a, i) => (
                <li key={`${a.type}:${a.value}:${i}`}>
                  <ArtifactLink artifact={a} />
                </li>
              ))}
            </ul>
          )}

          {recoverable ? (
            <p className="mt-2 text-xs text-amber-300">
              Resume the interrupted Step before answering this request.
            </p>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!answer) return;
              void answerInput(pendingInput.requestId, answer, pendingInput.phaseId, pendingInput.stepId);
            }}
            className="mt-2 space-y-2"
          >
            {pendingInput.choices.length > 0 ? (
              <fieldset>
                <legend className="sr-only">Answer choices</legend>
                <div className="space-y-1.5">
                  {pendingInput.choices.map((choice) => (
                    <label key={choice} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="wf-input-answer"
                        value={choice}
                        checked={answer === choice}
                        onChange={() => setAnswer(choice)}
                        className="accent-amber-500"
                      />
                      <span className="text-xs text-fg-heading">{choice}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div>
                <label htmlFor="wf-input-freeform" className="sr-only">Your answer</label>
                <input
                  id="wf-input-freeform"
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type an answer…"
                  className="w-full rounded-lg border border-border-default bg-surface-tertiary px-3 py-1.5 text-sm text-fg-heading placeholder:text-fg-secondary/50 focus:outline-none focus:ring-1 focus:ring-border-active"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={isActing || !answer}
              className="rounded-md bg-amber-500/20 border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isActing ? 'Submitting…' : 'Submit answer'}
            </button>
          </form>
          )}
        </section>
      )}

      {showModeGate && (
        <section aria-labelledby="wf-mode-gate-heading" className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3">
          <h3 id="wf-mode-gate-heading" className="text-sm font-semibold text-blue-300">
            Choose continuation
          </h3>
          <p className="mt-1 text-sm text-fg-heading">
            Shape is complete. How should this Architecture Health workflow continue?
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!gateChoice) return;
              void chooseGate(gateChoice);
            }}
            className="mt-2 space-y-2"
          >
            <fieldset>
              <legend className="sr-only">Continuation choices</legend>
              <div className="space-y-1.5">
                {ARCHITECTURE_CHOICES.filter((option) => modeGate?.choices.includes(option.value)).map((opt) => (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="wf-gate-choice"
                      value={opt.value}
                      checked={gateChoice === opt.value}
                      onChange={() => setGateChoice(opt.value)}
                      className="mt-0.5 accent-blue-500"
                    />
                    <span className="text-xs text-fg-heading">
                      <span className="font-medium">{opt.label}</span> — {opt.description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={isActing || !gateChoice}
              className="rounded-md bg-blue-500/20 border border-blue-500/50 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isActing ? 'Choosing…' : 'Choose continuation'}
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="wf-phases-heading">
        <h3 id="wf-phases-heading" className="text-sm font-semibold text-fg-heading mb-2">
          Phases
        </h3>
        <ol className="space-y-3">
          {visiblePhases.map((phase) => (
            <WorkflowPhaseItem
              key={phase.id}
              phase={phase}
              sessionId={sessionId}
              isActing={isActing}
              startStep={startStep}
              approve={approve}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
