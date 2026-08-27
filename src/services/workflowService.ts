import type {
  WorkflowSummary,
  WorkflowDetail,
  WorkflowListErrorEntry,
  CreateWorkflowRequest,
  RunStepRequest,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A corrupt/unreadable persisted workflow is distinguished by its unique `sourceFile` field. */
function isCorruptEntry(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.sourceFile === 'string';
}

/** GET /api/workflows */
export async function listWorkflows(): Promise<WorkflowListResult> {
  const data = await request<{ workflows: unknown[]; errors: unknown[] }>('/api/workflows');
  const items = [...data.workflows, ...data.errors];

  const workflows: WorkflowSummary[] = [];
  const errors: WorkflowListErrorEntry[] = [];

  for (const item of items) {
    if (isCorruptEntry(item)) {
      const errorField = isRecord(item.error) ? item.error : undefined;
      const message =
        typeof errorField?.message === 'string' && errorField.message.trim()
          ? errorField.message
          : 'This workflow entry could not be read.';
      errors.push({
        ...(item as Record<string, unknown>),
        id: typeof item.id === 'string' ? item.id : String(item.id ?? 'unknown'),
        message,
      } as WorkflowListErrorEntry);
    } else if (isRecord(item)) {
      workflows.push(item as unknown as WorkflowSummary);
    }
  }

  return { workflows, errors };
}

/** GET /api/workflows/:id */
export function getWorkflow(workflowId: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/api/workflows/${encodeURIComponent(workflowId)}`);
}

/** POST /api/workflows */
export function createWorkflow(body: CreateWorkflowRequest): Promise<WorkflowDetail> {
  return request<WorkflowDetail>('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** POST /api/workflows/:id/run-step — start the next eligible step. */
export async function runStep(workflowId: string, body: RunStepRequest): Promise<WorkflowDetail> {
  return postAction<WorkflowDetail>(workflowId, 'run-step', body);
}

/** POST /api/workflows/:id/register-output */
export function registerOutput(workflowId: string, body: RegisterOutputRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'register-output', body);
}

/** POST /api/workflows/:id/approve — human approval of awaiting-review output. */
export function approveWorkflow(workflowId: string, body: ApproveRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'approve', body);
}

/** POST /api/workflows/:id/mode-gate — choose a catalogued continuation. */
export function chooseModeGate(workflowId: string, body: ModeGateRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'mode-gate', body);
}

/** POST /api/workflows/:id/input-response — answer a pending Input Request. */
export function respondToInput(workflowId: string, body: InputResponseRequest): Promise<WorkflowDetail> {
  return postAction(workflowId, 'input-response', body);
}
