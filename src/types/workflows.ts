/**
 * Rocinante Workflow types
 * ─────────────────────────────────────────────────────────
 * Mirrors the server-owned Workflow domain contract exposed by
 * server/services/workflowService.ts and server/routes/workflows.ts
 * (see docs/specs/rocinante-workflow-types.md for the approved design).
 * Kept slightly permissive (index signatures, optional aliases) so an
 * evolving backend field still renders instead of failing a strict type
 * check, but field names below reflect the actual landed contract.
 */

/** The five bounded, opinionated workflow modes. No general/user-authored graphs. */
export type WorkflowMode =
  | 'simple'
  | 'full'
  | 'bug-fix'
  | 'architecture-health'
  | 'wayfinding';

/** Required classification when creating a Bug Fix workflow. */
export type BugFixClassification = 'confirmed' | 'unverified-external';

/** The Architecture Health Mode Gate's two catalogued continuations. */
export type ArchitectureChoice = 'direct' | 'planned';

export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting-review'
  | 'complete'
  | 'skipped'
  | (string & {});

/** Whole-workflow status. Awaiting input is not a distinct status — it is
 * layered on top of a `running` step via that step's `inputRequest`. */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'awaiting-review'
  | 'complete'
  | (string & {});

export interface WorkflowArtifact {
  /** `path` artifacts are repository-relative under the Repository Target; `url` artifacts are HTTPS. */
  type: 'url' | 'path';
  value: string;
}

/** A paused step's persisted question. Answering resumes the same step (not a separate status). */
export interface WorkflowInputRequest {
  id: string;
  question: string;
  choices: string[];
  artifactRefs: WorkflowArtifact[];
  createdAt: string;
}

export interface WorkflowStepState {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  requiresApproval: boolean;
  runId: string | null;
  summary: string | null;
  artifacts: WorkflowArtifact[];
  inputRequest: WorkflowInputRequest | null;
  startedAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  [key: string]: unknown;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  steps: WorkflowStepState[];
  [key: string]: unknown;
}

/** A pointer to a specific phase/step, used for currentPhase / nextEligibleStep. */
export interface WorkflowStepPointer {
  phaseId: string;
  phaseName: string;
  stepId: string;
  stepName: string;
}

export interface WorkflowSession {
  id: string;
  transport: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface WorkflowActivityEntry {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

/**
 * Server-derived workflow view. The list endpoint returns this same shape
 * (including phases) for each persisted, restorable workflow — there is no
 * separate lightweight summary DTO.
 */
export interface WorkflowSummary {
  id: string;
  /** Older/alternate id alias some callers may use; prefer `id`. */
  workflowId?: string;
  name: string;
  goal: string;
  mode: WorkflowMode | (string & {});
  classification?: BugFixClassification | null;
  repositoryTarget: string;
  architectureChoice?: ArchitectureChoice | null;
  workflowSession?: WorkflowSession | null;
  artifacts?: WorkflowArtifact[];
  activity?: WorkflowActivityEntry[];
  createdAt?: string;
  updatedAt?: string;
  status: WorkflowStatus;
  progress?: WorkflowProgress;
  currentPhase?: WorkflowStepPointer | null;
  nextEligibleStep?: WorkflowStepPointer | null;
  [key: string]: unknown;
}

/** Full detail payload — identical shape to the list entries, but always includes phases. */
export interface WorkflowDetail extends WorkflowSummary {
  phases: WorkflowPhase[];
}

/** A visibly-surfaced corrupt/unreadable persisted workflow entry from the list endpoint. */
export interface WorkflowListErrorEntry {
  id: string;
  status?: 'error';
  sourceFile?: string;
  error?: { code?: string; message: string };
  /** Normalized, always-present human-readable message for display. */
  message: string;
  [key: string]: unknown;
}

/* ── Request / response bodies ───────────────────────────────── */

export interface CreateWorkflowRequest {
  name: string;
  goal: string;
  repositoryTarget: string;
  mode: WorkflowMode;
  classification?: BugFixClassification;
}

export interface RunStepRequest {
  phaseId: string;
  stepId: string;
}

/** Preferred run-step envelope; older servers may return the workflow fields at the top level. */
export interface RunStepEnvelope {
  runId: string;
  workflowSessionId: string;
  workflow: WorkflowDetail;
}

export type RunStepResult =
  | RunStepEnvelope
  | (WorkflowDetail & { runId: string; workflowSessionId: string });

export interface RegisterOutputRequest {
  phaseId: string;
  stepId: string;
  runId: string;
  summary: string;
  artifacts?: string[];
}

export interface ApproveRequest {
  phaseId?: string;
  stepId?: string;
  runId?: string;
  artifact?: string;
  artifacts?: string[];
}

export interface ModeGateRequest {
  choice: ArchitectureChoice;
}

export interface InputRequestRequest {
  phaseId: string;
  stepId: string;
  runId: string;
  requestId: string;
  question: string;
  choices?: string[];
  artifactRefs?: string[];
}

export interface InputResponseRequest {
  requestId: string;
  answer: string;
  phaseId?: string;
  stepId?: string;
  runId?: string;
}
