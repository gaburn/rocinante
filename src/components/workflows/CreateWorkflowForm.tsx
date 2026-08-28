import { useMemo, useState } from 'react';
import type { BugFixClassification, CreateWorkflowRequest, WorkflowDetail, WorkflowMode } from '../../types/workflows';
import { BUG_FIX_CLASSIFICATIONS, WORKFLOW_MODE_CATALOG, getModeCatalogEntry, isPhaseInitiallySkipped } from '../../data/workflowModeCatalog';

interface CreateWorkflowFormProps {
  onCreate: (body: CreateWorkflowRequest) => Promise<WorkflowDetail>;
  isCreating: boolean;
  createError: string | null;
  onCreated: (workflow: WorkflowDetail) => void;
  onCancel: () => void;
  defaultRepositoryTarget?: string;
}

export default function CreateWorkflowForm({
  onCreate,
  isCreating,
  createError,
  onCreated,
  onCancel,
  defaultRepositoryTarget,
}: CreateWorkflowFormProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [repositoryTarget, setRepositoryTarget] = useState(defaultRepositoryTarget ?? '');
  const [mode, setMode] = useState<WorkflowMode>('simple');
  const [classification, setClassification] = useState<BugFixClassification | ''>('');
  const [includedOptionalPhases, setIncludedOptionalPhases] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const catalogEntry = useMemo(() => getModeCatalogEntry(mode), [mode]);
  const isBugFix = mode === 'bug-fix';

  const previewPhases = useMemo(() => catalogEntry.phases, [catalogEntry]);
  const effectiveClassification = isBugFix && classification ? classification : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedGoal = goal.trim();
    const trimmedTarget = repositoryTarget.trim();
    const nextErrors: Record<string, string> = {};

    if (!trimmedName) nextErrors.name = 'Name is required.';
    if (!trimmedGoal) nextErrors.goal = 'Goal is required.';
    if (!trimmedTarget) nextErrors.repositoryTarget = 'Repository target path is required.';
    if (isBugFix && !classification) nextErrors.classification = 'Choose a Bug Fix classification.';

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const body: CreateWorkflowRequest = {
      name: trimmedName,
      goal: trimmedGoal,
      repositoryTarget: trimmedTarget,
      mode,
      ...(isBugFix && classification ? { classification } : {}),
      ...(includedOptionalPhases.length > 0
        ? { optionalPhaseIds: includedOptionalPhases }
        : {}),
    };

    try {
      const created = await onCreate(body);
      onCreated(created);
    } catch {
      // createError is surfaced below; nothing further to do here.
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="text-lg font-semibold text-fg-heading">New Workflow</h2>
      <p className="mt-0.5 text-xs text-fg-secondary">
        Choose a bounded, opinionated mode. Its path is fixed by the catalog below — there is no free-form graph.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
        <div>
          <label htmlFor="wf-name" className="block text-xs font-medium text-fg-secondary mb-1">
            Name
          </label>
          <input
            id="wf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fix flaky retry logic"
            autoComplete="off"
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'wf-name-error' : undefined}
            className={`
              w-full rounded-lg border bg-surface-tertiary px-3 py-1.5 text-sm text-fg-heading
              placeholder:text-fg-secondary/50 focus:outline-none focus:ring-1
              ${fieldErrors.name ? 'border-red-500/60 focus:ring-red-500/40' : 'border-border-default focus:ring-border-active'}
            `}
          />
          {fieldErrors.name && (
            <p id="wf-name-error" className="mt-1 text-xs text-red-400">{fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="wf-goal" className="block text-xs font-medium text-fg-secondary mb-1">
            Goal
          </label>
          <textarea
            id="wf-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What outcome should this workflow reach?"
            rows={3}
            aria-invalid={!!fieldErrors.goal}
            aria-describedby={fieldErrors.goal ? 'wf-goal-error' : undefined}
            className={`
              w-full rounded-lg border bg-surface-tertiary px-3 py-1.5 text-sm text-fg-heading
              placeholder:text-fg-secondary/50 focus:outline-none focus:ring-1 resize-y
              ${fieldErrors.goal ? 'border-red-500/60 focus:ring-red-500/40' : 'border-border-default focus:ring-border-active'}
            `}
          />
          {fieldErrors.goal && (
            <p id="wf-goal-error" className="mt-1 text-xs text-red-400">{fieldErrors.goal}</p>
          )}
        </div>

        <div>
          <label htmlFor="wf-repo" className="block text-xs font-medium text-fg-secondary mb-1">
            Repository target path
          </label>
          <input
            id="wf-repo"
            type="text"
            value={repositoryTarget}
            onChange={(e) => setRepositoryTarget(e.target.value)}
            placeholder="/path/to/repository"
            autoComplete="off"
            aria-invalid={!!fieldErrors.repositoryTarget}
            aria-describedby={fieldErrors.repositoryTarget ? 'wf-repo-error' : undefined}
            className={`
              w-full rounded-lg border bg-surface-tertiary px-3 py-1.5 text-sm font-mono text-fg-heading
              placeholder:text-fg-secondary/50 focus:outline-none focus:ring-1
              ${fieldErrors.repositoryTarget ? 'border-red-500/60 focus:ring-red-500/40' : 'border-border-default focus:ring-border-active'}
            `}
          />
          {fieldErrors.repositoryTarget && (
            <p id="wf-repo-error" className="mt-1 text-xs text-red-400">{fieldErrors.repositoryTarget}</p>
          )}
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-fg-secondary mb-2">Mode</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WORKFLOW_MODE_CATALOG.map((entry) => (
              <label
                key={entry.mode}
                className={`
                  flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors
                  ${mode === entry.mode
                    ? 'border-border-active bg-surface-hover'
                    : 'border-border-default bg-surface-secondary hover:bg-surface-hover'}
                `}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="wf-mode"
                    value={entry.mode}
                    checked={mode === entry.mode}
                    onChange={() => {
                      setMode(entry.mode);
                      if (entry.mode !== 'bug-fix') setClassification('');
                      setIncludedOptionalPhases([]);
                    }}
                    className="accent-border-active"
                  />
                  <span className="text-sm font-medium text-fg-heading">{entry.label}</span>
                </span>
                <span className="pl-5 text-[11px] text-fg-secondary">{entry.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {isBugFix && (
          <fieldset>
            <legend className="text-xs font-medium text-fg-secondary mb-2">
              Bug Fix classification <span className="text-red-400">(required)</span>
            </legend>
            <div className="space-y-1.5">
              {BUG_FIX_CLASSIFICATIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="wf-classification"
                    value={opt.value}
                    checked={classification === opt.value}
                    onChange={() => setClassification(opt.value)}
                    className="mt-0.5 accent-border-active"
                    aria-describedby={fieldErrors.classification ? 'wf-classification-error' : undefined}
                  />
                  <span className="text-xs text-fg-secondary">
                    <span className="font-medium text-fg-heading">{opt.label}</span> — {opt.description}
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.classification && (
              <p id="wf-classification-error" className="mt-1 text-xs text-red-400">{fieldErrors.classification}</p>
            )}
          </fieldset>
        )}

        {catalogEntry.phases.some((phase) => phase.optional) && (
          <fieldset>
            <legend className="text-xs font-medium text-fg-secondary mb-2">Optional phases</legend>
            {catalogEntry.phases.filter((phase) => phase.optional).map((phase) => (
              <label key={phase.id} className="flex items-center gap-2 text-xs text-fg-heading">
                <input
                  type="checkbox"
                  checked={includedOptionalPhases.includes(phase.id)}
                  onChange={(event) => setIncludedOptionalPhases((current) =>
                    event.target.checked
                      ? [...current, phase.id]
                      : current.filter((id) => id !== phase.id))}
                  className="accent-border-active"
                />
                Include {phase.title}
              </label>
            ))}
          </fieldset>
        )}


        <div className="rounded-lg border border-border-default bg-surface-secondary p-3">
          <h3 className="text-xs font-semibold text-fg-heading">
            {catalogEntry.label} path preview
          </h3>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${catalogEntry.label} bounded phase path`}>
            {previewPhases.map((phase, i) => {
              const skipped = isPhaseInitiallySkipped(phase, effectiveClassification)
                && !includedOptionalPhases.includes(phase.id);
              return (
                <li key={phase.id} className="flex items-center gap-1.5">
                  <span
                    className={`
                      rounded-full border px-2 py-0.5 text-[11px] font-mono
                      ${skipped
                        ? 'border-border-default text-fg-secondary/70 bg-surface-tertiary/50 line-through'
                        : 'border-border-active/40 text-fg-heading bg-surface-tertiary'}
                    `}
                  >
                    {phase.title}
                    {skipped ? ' (skipped)' : ''}
                    {!skipped && phase.skippableByModeGate ? ' (may skip)' : ''}
                  </span>
                  {i < previewPhases.length - 1 && (
                    <span aria-hidden="true" className="text-fg-secondary/40">→</span>
                  )}
                </li>
              );
            })}
          </ol>
          {mode === 'architecture-health' && (
            <p className="mt-2 text-[11px] text-fg-secondary">
              After Shape completes, a Mode Gate lets you choose Direct (skips Specification and Tasks) or
              Specification + Tasks first.
            </p>
          )}
        </div>

        {createError && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {createError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCreating}
            className="px-3 py-1.5 rounded-lg bg-surface-tertiary text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating}
            className="
              px-3 py-1.5 rounded-lg border transition-colors
              bg-border-active/15 border-border-active/40 text-fg-heading
              hover:bg-border-active/25
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {isCreating ? 'Creating…' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
