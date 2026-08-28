import type {
  ArchitectureChoice,
  BugFixClassification,
  WorkflowMode,
} from './workflowCatalog.js';

export const WORKFLOW_STEP_STATUSES = [
  'pending',
  'running',
  'awaiting-review',
  'complete',
  'skipped',
] as const;

export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];
export type WorkflowStatus = Exclude<WorkflowStepStatus, 'skipped'>;

export interface WorkflowArtifact {
  type: 'url' | 'path';
  value: string;
}

export interface WorkflowInputRequest {
  id: string;
  question: string;
  choices: string[];
  artifactRefs: WorkflowArtifact[];
  createdAt: string;
}

export interface WorkflowStepData {
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
}

export interface WorkflowPhaseData {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  step: WorkflowStepData;
}

export interface WorkflowSessionMetadata {
  id: string;
  transport: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowActivity {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface WorkflowState {
  schemaVersion: number;
  id: string;
  name: string;
  goal: string;
  mode: WorkflowMode;
  classification: BugFixClassification | null;
  repositoryTarget: string;
  architectureChoice: ArchitectureChoice | null;
  workflowSession: WorkflowSessionMetadata | null;
  phases: WorkflowPhaseData[];
  artifacts: WorkflowArtifact[];
  inputRequestIds: string[];
  activity: WorkflowActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepPointer {
  phaseId: string;
  phaseName: string;
  stepId: string;
  stepName: string;
  runId: string | null;
}

export interface WorkflowStepView extends WorkflowStepData {
  canStart: boolean;
  canApprove: boolean;
}

export interface WorkflowPhaseView extends Omit<WorkflowPhaseData, 'step'> {
  optional: boolean;
  steps: WorkflowStepView[];
}

export interface WorkflowInputRequestView {
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

export interface WorkflowModeGateView {
  phaseId: string;
  stepId: string;
  question: string;
  choices: ArchitectureChoice[];
}

export interface WorkflowApprovalTarget extends WorkflowStepPointer {
  artifact: WorkflowArtifact;
}

export interface WorkflowView extends Omit<WorkflowState, 'phases' | 'artifacts'> {
  phases: WorkflowPhaseView[];
  artifacts: WorkflowArtifact[];
  status: WorkflowStatus;
  progress: {
    completed: number;
    total: number;
    percent: number;
  };
  currentPhase: WorkflowStepPointer | null;
  nextEligibleStep: WorkflowStepPointer | null;
  recoverableStep: WorkflowStepPointer | null;
  approvableStep: WorkflowApprovalTarget | null;
  pendingInput: WorkflowInputRequestView | null;
  modeGate: WorkflowModeGateView | null;
}

export interface CorruptWorkflowView {
  id: string;
  message: string;
  status: 'error';
  sourceFile: string;
  error: {
    code: 'invalid-state' | 'unsupported-version';
    message: string;
  };
}
