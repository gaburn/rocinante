import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWorkflow,
  runStep,
  resumeStep,
  approveWorkflow,
  chooseModeGate,
  respondToInput,
} from '../services/workflowService';
import type { ArchitectureChoice, WorkflowDetail } from '../types/workflows';

const POLL_INTERVAL = 5_000;

export interface UseWorkflowDetailResult {
  detail: WorkflowDetail | null;
  isLoading: boolean;
  /** Load error — clears once a subsequent fetch succeeds. */
  error: string | null;
  /** Error from the last workflow action. */
  actionError: string | null;
  isActing: boolean;
  refresh: () => void;
  clearActionError: () => void;
  startStep: (phaseId: string, stepId: string) => Promise<void>;
  resumeStep: (phaseId: string, stepId: string, runId: string) => Promise<void>;
  approve: (phaseId: string, stepId: string, runId: string, artifact: string) => Promise<void>;
  chooseGate: (choice: ArchitectureChoice) => Promise<void>;
  answerInput: (requestId: string, answer: string, phaseId?: string, stepId?: string) => Promise<void>;
}

/** Loads and polls one workflow's server-derived detail. No localStorage. */
export function useWorkflowDetail(workflowId: string | null): UseWorkflowDetailResult {
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const inFlight = useRef(false);

  const fetchDetail = useCallback(async (id: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const data = await getWorkflow(id);
      setDetail(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow.');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, []);

  // Reset and reload whenever the selected workflow changes.
  useEffect(() => {
    setDetail(null);
    setError(null);
    setActionError(null);
    if (!workflowId) return;
    void fetchDetail(workflowId);
  }, [workflowId, fetchDetail]);

  useEffect(() => {
    if (!workflowId) return;
    const id = window.setInterval(() => {
      void fetchDetail(workflowId);
    }, POLL_INTERVAL);
    return () => window.clearInterval(id);
  }, [workflowId, fetchDetail]);

  const refresh = useCallback(() => {
    if (workflowId) void fetchDetail(workflowId);
  }, [workflowId, fetchDetail]);

  const clearActionError = useCallback(() => setActionError(null), []);

  const runAction = useCallback(
    async (fn: () => Promise<WorkflowDetail>) => {
      setIsActing(true);
      setActionError(null);
      try {
        const updated = await fn();
        setDetail(updated);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setIsActing(false);
      }
    },
    [],
  );

  const startStep = useCallback(
    (phaseId: string, stepId: string) => {
      if (!workflowId) return Promise.resolve();
      return runAction(() => runStep(workflowId, { phaseId, stepId }));
    },
    [runAction, workflowId],
  );

  const resume = useCallback(
    (phaseId: string, stepId: string, runId: string) => {
      if (!workflowId) return Promise.resolve();
      return runAction(() => resumeStep(workflowId, { phaseId, stepId, runId }));
    },
    [runAction, workflowId],
  );

  const approve = useCallback(
    (phaseId: string, stepId: string, runId: string, artifact: string) => {
      if (!workflowId) return Promise.resolve();
      return runAction(() => approveWorkflow(workflowId, { phaseId, stepId, runId, artifact }));
    },
    [runAction, workflowId],
  );

  const chooseGate = useCallback(
    (choice: ArchitectureChoice) => {
      if (!workflowId) return Promise.resolve();
      return runAction(() => chooseModeGate(workflowId, { choice }));
    },
    [runAction, workflowId],
  );

  const answerInput = useCallback(
    (requestId: string, answer: string, phaseId?: string, stepId?: string) => {
      if (!workflowId) return Promise.resolve();
      return runAction(() => respondToInput(workflowId, { requestId, answer, phaseId, stepId }));
    },
    [runAction, workflowId],
  );

  return {
    detail,
    isLoading,
    error,
    actionError,
    isActing,
    refresh,
    clearActionError,
    startStep,
    resumeStep: resume,
    approve,
    chooseGate,
    answerInput,
  };
}
