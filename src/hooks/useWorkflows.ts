import { useCallback, useEffect, useRef, useState } from 'react';
import { listWorkflows, createWorkflow as createWorkflowRequest } from '../services/workflowService';
import type {
  WorkflowSummary,
  WorkflowListErrorEntry,
  CreateWorkflowRequest,
  WorkflowDetail,
} from '../types/workflows';

const POLL_INTERVAL = 10_000;

export interface UseWorkflowsResult {
  workflows: WorkflowSummary[];
  /** Visible corruption/error entries surfaced alongside the persisted list. */
  errors: WorkflowListErrorEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  createWorkflow: (body: CreateWorkflowRequest) => Promise<WorkflowDetail>;
  isCreating: boolean;
  createError: string | null;
  clearCreateError: () => void;
}

/** Lists persisted workflows from the server and polls for updates. No localStorage. */
export function useWorkflows(): UseWorkflowsResult {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [errors, setErrors] = useState<WorkflowListErrorEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchWorkflows = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const result = await listWorkflows();
      setWorkflows(result.workflows);
      setErrors(result.errors);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows.');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchWorkflows();
    }, POLL_INTERVAL);
    return () => window.clearInterval(id);
  }, [fetchWorkflows]);

  const refresh = useCallback(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  const createWorkflow = useCallback(
    async (body: CreateWorkflowRequest) => {
      setIsCreating(true);
      setCreateError(null);
      try {
        const created = await createWorkflowRequest(body);
        await fetchWorkflows();
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create workflow.';
        setCreateError(message);
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [fetchWorkflows],
  );

  const clearCreateError = useCallback(() => setCreateError(null), []);

  return {
    workflows,
    errors,
    isLoading,
    error,
    refresh,
    createWorkflow,
    isCreating,
    createError,
    clearCreateError,
  };
}
