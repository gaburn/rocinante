import { useMemo, useState } from 'react';
import { useWorkflowDetail } from '../../hooks/useWorkflowDetail';
import { useTerminalContext } from '../../context/TerminalContext';
import type {
  ArchitectureChoice,
  WorkflowArtifact,
  WorkflowDetail,
  WorkflowInputRequest,
  WorkflowPhase,
  WorkflowStepPointer,
  WorkflowStepState,
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

interface LocatedInputRequest {
  phase: WorkflowPhase;
  step: WorkflowStepState;
  request: WorkflowInputRequest;
}

interface LocatedStep {
  phase: WorkflowPhase;
  step: WorkflowStepState;
}

const ARCHITECTURE_CHOICES: { value: ArchitectureChoice; label: string; description: string }[] = [
  { value: 'direct', label: 'Direct', description: 'Implement directly. Specification and Tasks are skipped.' },
  {
    value: 'planned',
    label: 'Specification + Tasks first',
    description: 'Produce a Specification and a Tasks breakdown before implementing.',
  },
];

function findPendingInput(detail: WorkflowDetail): LocatedInputRequest | null {
  for (const phase of detail.phases ?? []) {
    for (const step of phase.steps ?? []) {
      if (step.inputRequest) return { phase, step, request: step.inputRequest };
    }
  }
  return null;
}

function findApprovableStep(detail: WorkflowDetail): LocatedStep | null {
  for (const phase of detail.phases ?? []) {
    for (const step of phase.steps ?? []) {
      if (step.status === 'awaiting-review') return { phase, step };
    }
  }
  return null;
}

/** The Architecture Health Mode Gate has no dynamic choices from the server —
 * it becomes available once Shape completes and no continuation is chosen yet. */
function isModeGatePending(detail: WorkflowDetail): boolean {
  if (detail.mode !== 'architecture-health') return false;
  if ((detail.architectureChoice ?? null) !== null) return false;
  const shape = (detail.phases ?? []).find((p) => p.id === 'shape');
  return shape?.status === 'complete';
}

function matchesPointer(phase: WorkflowPhase, step: WorkflowStepState, pointer: WorkflowStepPointer | null | undefined): boolean {
  return !!pointer && pointer.phaseId === phase.id && pointer.stepId === step.id;
}

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

function StatusBadge({ status }: { status: string | undefined }) {
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

export default function WorkflowDetailPanel({ workflowId }: WorkflowDetailPanelProps) {
  const { openWorkflowTerminal } = useTerminalContext();
  const {
    detail, isLoading, error, actionError, isActing,
    refresh, clearActionError, startStep, approve, chooseGate, answerInput,
  } = useWorkflowDetail(workflowId);

  const pendingInput = detail ? findPendingInput(detail) : null;
  const approvable = detail ? findApprovableStep(detail) : null;
  const showModeGate = detail ? isModeGatePending(detail) : false;
  const nextEligible = detail?.nextEligibleStep ?? null;

  const [answer, setAnswer] = useState('');
  const [gateChoice, setGateChoice] = useState<ArchitectureChoice | ''>('');

  // Reset local form state whenever the underlying request identity changes,
  // computed during render (React's documented "adjust state on prop change"
  // pattern) rather than in an effect, to avoid a redundant render pass.
  const [lastRequestId, setLastRequestId] = useState<string | undefined>(pendingInput?.request.id);
  if (pendingInput?.request.id !== lastRequestId) {
    setLastRequestId(pendingInput?.request.id);
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

  // The single, obvious next action for this workflow.
  let nextActionLabel = 'The current step is running. No action is needed right now.';
  if (pendingInput) nextActionLabel = 'Answer the pending input request below.';
  else if (showModeGate) nextActionLabel = 'Choose how this workflow continues below.';
  else if (approvable) nextActionLabel = `Approve output for "${approvable.step.name}".`;
  else if (nextEligible) nextActionLabel = `Start the next step: "${nextEligible.stepName}".`;
  else if (detail.status === 'complete') nextActionLabel = 'This workflow is complete.';

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
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

      {/* ── Metadata row ── */}
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

      {/* ── Obvious next action ── */}
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
              onClick={() => void approve(approvable.phase.id, approvable.step.id)}
              disabled={isActing}
              className="rounded-md bg-emerald-500/15 border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              {isActing ? 'Approving…' : `Approve "${approvable.step.name}"`}
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

      {/* ── Pending Input Request ── */}
      {pendingInput && (
        <section aria-labelledby="wf-pending-input-heading" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <h3 id="wf-pending-input-heading" className="text-sm font-semibold text-amber-300">
            Input requested — {pendingInput.phase.name} / {pendingInput.step.name}
          </h3>
          <p className="mt-1 text-sm text-fg-heading">{pendingInput.request.question}</p>

          {pendingInput.request.artifactRefs.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {pendingInput.request.artifactRefs.map((a, i) => (
                <li key={`${a.type}:${a.value}:${i}`}>
                  <ArtifactLink artifact={a} />
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!answer) return;
              void answerInput(pendingInput.request.id, answer, pendingInput.phase.id, pendingInput.step.id);
            }}
            className="mt-2 space-y-2"
          >
            {pendingInput.request.choices.length > 0 ? (
              <fieldset>
                <legend className="sr-only">Answer choices</legend>
                <div className="space-y-1.5">
                  {pendingInput.request.choices.map((choice) => (
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
        </section>
      )}

      {/* ── Mode Gate ── */}
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
                {ARCHITECTURE_CHOICES.map((opt) => (
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

      {/* ── Phases / Steps ── */}
      <section aria-labelledby="wf-phases-heading">
        <h3 id="wf-phases-heading" className="text-sm font-semibold text-fg-heading mb-2">
          Phases
        </h3>
        <ol className="space-y-3">
          {(detail.phases ?? []).map((phase) => (
            <li key={phase.id} className={`rounded-lg border border-border-default bg-surface-secondary p-3 ${phase.status === 'skipped' ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-fg-heading">{phase.name}</h4>
                <StatusBadge status={phase.status} />
              </div>

              {phase.steps && phase.steps.length > 0 && (
                <ol className="mt-2 space-y-2 border-l border-border-default pl-3">
                  {phase.steps.map((step) => {
                    const canStart = matchesPointer(phase, step, nextEligible) && !pendingInput && !showModeGate;
                    const canApprove = step.status === 'awaiting-review';
                    return (
                      <li key={step.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-fg-heading">{step.name}</span>
                          <StatusBadge status={step.status} />
                        </div>

                        {step.summary && (
                          <p className="mt-0.5 text-xs text-fg-secondary">{step.summary}</p>
                        )}

                        {step.artifacts && step.artifacts.length > 0 && (
                          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {step.artifacts.map((a, i) => (
                              <li key={`${a.type}:${a.value}:${i}`}>
                                <ArtifactLink artifact={a} />
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
                                className="rounded-md bg-accent-primary/15 border border-accent-primary/40 px-2 py-1 text-[11px] font-medium text-fg-heading hover:bg-accent-primary/25 transition-colors disabled:opacity-50"
                              >
                                Start step
                              </button>
                            )}
                            {canApprove && (
                              <button
                                type="button"
                                onClick={() => void approve(phase.id, step.id)}
                                disabled={isActing}
                                className="rounded-md bg-emerald-500/15 border border-emerald-500/40 px-2 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
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
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
