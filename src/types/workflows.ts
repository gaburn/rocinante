import type {
  ArchitectureChoice,
  BugFixClassification,
  WorkflowMode,
} from '../../shared/workflowCatalog.js';
import type {
  CorruptWorkflowView,
  WorkflowActivity,
  WorkflowInputRequestView,
  WorkflowModeGateView,
  WorkflowPhaseView,
  WorkflowSessionMetadata,
  WorkflowStepView,
  WorkflowView,
} from '../../shared/workflowTypes.js';

export type {
  ArchitectureChoice,
  BugFixClassification,
  WorkflowMode,
} from '../../shared/workflowCatalog.js';
export type {
  WorkflowApprovalTarget,
  WorkflowArtifact,
  WorkflowInputRequest,
  WorkflowStepPointer,
  WorkflowStepStatus,
  WorkflowStatus,
} from '../../shared/workflowTypes.js';

export type WorkflowStepState = WorkflowStepView;
export type WorkflowPhase = WorkflowPhaseView;
export type WorkflowSession = WorkflowSessionMetadata;
export type WorkflowProgress = WorkflowView['progress'];
export type WorkflowActivityEntry = WorkflowActivity;
export type WorkflowPendingInput = WorkflowInputRequestView;
export type WorkflowModeGate = WorkflowModeGateView;
export type WorkflowSummary = WorkflowView;
export type WorkflowDetail = WorkflowView;
export type WorkflowListErrorEntry = CorruptWorkflowView;

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
