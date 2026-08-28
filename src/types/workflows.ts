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
  | 'skipped';

/** Whole-workflow status. Awaiting input is not a distinct status — it is
 * layered on top of a `running` step via that step's `inputRequest`. */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'awaiting-review'
  | 'complete';

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
  canStart: boolean;
  canApprove: boolean;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  steps: WorkflowStepState[];
  optional: boolean;
}

/** A pointer to a specific phase/step, used for currentPhase / nextEligibleStep. */
export interface WorkflowStepPointer {
  phaseId: string;
  phaseName: string;
  stepId: string;
  stepName: string;
  runId: string | null;
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

export interface WorkflowPendingInput {
  requestId: string;
  question: string;
  choices: string[];
  artifactRefs: WorkflowArtifact[];
  phaseId: string;
  phaseName: string;
  stepId: string;
  stepName: string;
  runId: string;
}

export interface WorkflowModeGate {
  phaseId: string;
  stepId: string;
  question: string;
  choices: ArchitectureChoice[];
}

export interface WorkflowApprovalTarget extends WorkflowStepPointer {
  artifact: WorkflowArtifact;
}

/**
 * Server-derived workflow view. The list endpoint returns this same shape
 * (including phases) for each persisted, restorable workflow — there is no
 * separate lightweight summary DTO.
 */
export interface WorkflowSummary {
  id: string;
  name: string;
  goal: string;
  mode: WorkflowMode;
  classification: BugFixClassification | null;
  repositoryTarget: string;
  architectureChoice: ArchitectureChoice | null;
  workflowSession: WorkflowSession | null;
  artifacts: WorkflowArtifact[];
  activity: WorkflowActivityEntry[];
  createdAt: string;
  updatedAt: string;
  status: WorkflowStatus;
  progress: WorkflowProgress;
  currentPhase: WorkflowStepPointer | null;
  nextEligibleStep: WorkflowStepPointer | null;
  recoverableStep: WorkflowStepPointer | null;
  approvableStep: WorkflowApprovalTarget | null;
  pendingInput: WorkflowPendingInput | null;
  modeGate: WorkflowModeGate | null;
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
  message: string;
}

export interface CreateWorkflowRequest {
  name: string;
  goal: string;
  repositoryTarget: string;
  mode: WorkflowMode;
  classification?: BugFixClassification;
  optionalPhaseIds?: string[];
}

export interface RunStepRequest {
  phaseId: string;
  stepId: string;
}

export interface StepRunContext extends RunStepRequest {
  runId: string;
}

export type ResumeStepRequest = StepRunContext;

export interface RegisterOutputRequest extends StepRunContext {
  summary: string;
  artifacts?: string[];
}

export interface ApproveRequest extends StepRunContext {
  artifact: string;
}

export interface ModeGateRequest {
  choice: ArchitectureChoice;
}

export interface InputRequestRequest extends StepRunContext {
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
