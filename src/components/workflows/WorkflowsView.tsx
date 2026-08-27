import { useState } from 'react';
import { useWorkflows } from '../../hooks/useWorkflows';
import WorkflowList from './WorkflowList';
import WorkflowDetailPanel from './WorkflowDetailPanel';
import CreateWorkflowForm from './CreateWorkflowForm';
import type { WorkflowDetail } from '../../types/workflows';

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <line x1="8" y1="2.5" x2="8" y2="13.5" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" />
    </svg>
  );
}

export default function WorkflowsView() {
  const {
    workflows, errors, isLoading, error, refresh,
    createWorkflow, isCreating, createError, clearCreateError,
  } = useWorkflows();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function handleSelect(id: string) {
    setSelectedId(id);
    setShowCreateForm(false);
  }

  function handleOpenCreate() {
    clearCreateError();
    setShowCreateForm(true);
  }

  function handleCreated(workflow: WorkflowDetail) {
    const id = workflow.id ?? workflow.workflowId ?? null;
    setSelectedId(id);
    setShowCreateForm(false);
  }

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-surface-primary">
      {/* ── Page header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-fg-heading">Workflows</h2>
          <p className="mt-0.5 text-xs text-fg-secondary">
            Guided, server-owned engineering workflows · polls every 10s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="rounded-md bg-surface-tertiary px-3 py-1.5 text-xs text-fg-secondary hover:text-fg-heading hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 rounded-md bg-accent-primary/20 border border-accent-primary/40 px-3 py-1.5 text-xs font-medium text-fg-heading hover:bg-accent-primary/30 transition-colors"
          >
            <PlusIcon />
            New Workflow
          </button>
        </div>
      </div>

      {/* ── Load error banner ── */}
      {error && (
        <div role="alert" className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-6 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Two-pane body: list + detail/create ── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="layout-scrollable min-h-0 overflow-y-auto md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border-default h-[32vh] md:h-auto">
          <WorkflowList
            workflows={workflows}
            errors={errors}
            selectedId={selectedId}
            onSelect={handleSelect}
            isLoading={isLoading}
          />
        </aside>

        <main className="layout-scrollable min-h-0 flex-1 overflow-y-auto">
          {showCreateForm ? (
            <CreateWorkflowForm
              onCreate={createWorkflow}
              isCreating={isCreating}
              createError={createError}
              onCreated={handleCreated}
              onCancel={() => setShowCreateForm(false)}
            />
          ) : selectedId ? (
            <WorkflowDetailPanel key={selectedId} workflowId={selectedId} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="text-sm text-fg-secondary">
                Select a workflow from the list, or create a new one to get started.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
