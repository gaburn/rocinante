import type {
  WorkflowSummary,
  WorkflowDetail,
  WorkflowListErrorEntry,
  CreateWorkflowRequest,
  RunStepRequest,
  ResumeStepRequest,
  RegisterOutputRequest,
  ApproveRequest,
  ModeGateRequest,
  InputResponseRequest,
} from '../types/workflows';

export interface WorkflowListResult {
  workflows: WorkflowSummary[];
  errors: WorkflowListErrorEntry[];
}

/** Extracts a human-readable message from a failed response body, if any. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const message = record.error ?? record.message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  } catch {
    // Body wasn't JSON (or was empty) — fall through to the generic message.
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Request failed: ${res.status}`));
  }
  return res.json() as Promise<T>;
}

function postAction<T>(workflowId: string, action: string, body: unknown): Promise<T> {
  return request<T>(`/api/workflows/${encodeURIComponent(workflowId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function listWorkflows(): Promise<WorkflowListResult> {
  return request<WorkflowListResult>('/api/workflows');
}

export function getWorkflow(workflowId: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/api/workflows/${encodeURIComponent(workflowId)}`);
}

export function createWorkflow(body: CreateWorkflowRequest): Promise<WorkflowDetail> {
  return request<WorkflowDetail>('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function runStep(workflowId: string, body: RunStepRequest): Promise<WorkflowDetail> {
  return postAction<WorkflowDetail>(workflowId, 'run-step', body);
}

export function resumeStep(workflowId: string, body: ResumeStepRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'resume-step', body);
}

export function registerOutput(workflowId: string, body: RegisterOutputRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'register-output', body);
}

export function approveWorkflow(workflowId: string, body: ApproveRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'approve', body);
}

export function chooseModeGate(workflowId: string, body: ModeGateRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'mode-gate', body);
}

export function respondToInput(workflowId: string, body: InputResponseRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'input-response', body);
}
