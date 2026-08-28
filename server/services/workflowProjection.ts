import { WORKFLOW_CATALOG } from '../../shared/workflowCatalog.js';
import type {
  WorkflowInputRequestView,
  WorkflowModeGateView,
  WorkflowPhaseData,
  WorkflowState,
  WorkflowStatus,
  WorkflowStepPointer,
  WorkflowView,
} from '../../shared/workflowTypes.js';
import type { WorkflowSessionTransport } from './workflowTransport.js';

export function findNextEligible(state: WorkflowState): WorkflowPhaseData | null {
  if (state.phases.some((phase) => phase.status === 'running' || phase.status === 'awaiting-review')) {
    return null;
  }
  for (const phase of state.phases) {
    if (phase.status === 'complete' || phase.status === 'skipped') continue;
    const gate = WORKFLOW_CATALOG[state.mode].modeGate;
    if (gate && phase.id !== gate.afterPhaseId && state.architectureChoice === null) return null;
    return phase.status === 'pending' ? phase : null;
  }
  return null;
}

export function toWorkflowView(
  state: WorkflowState,
  transport: WorkflowSessionTransport,
): WorkflowView {
  const copy = structuredClone(state);
  const active = copy.phases.find(
    (phase) => phase.status === 'running' || phase.status === 'awaiting-review',
  );
  const next = findNextEligible(copy);
  const recoverable = active?.status === 'running'
    && active.step.runId
    && copy.workflowSession
    && !transport.isActive(copy.id)
    ? phasePointer(active)
    : null;
  const selected = copy.phases.filter((phase) => phase.status !== 'skipped');
  const completed = selected.filter((phase) => phase.status === 'complete').length;
  const status: WorkflowStatus = active?.status === 'awaiting-review'
    ? 'awaiting-review'
    : active?.status === 'running'
      ? 'running'
      : completed === selected.length
        ? 'complete'
        : 'pending';
  const progress = {
    completed,
    total: selected.length,
    percent: selected.length === 0 ? 100 : Math.round((completed / selected.length) * 100),
  };
  const pendingPhase = copy.phases.find((phase) => phase.step.inputRequest !== null);
  const pendingRequest = pendingPhase?.step.inputRequest;
  const pendingInput: WorkflowInputRequestView | null =
    pendingPhase && pendingRequest && pendingPhase.step.runId
      ? {
          requestId: pendingRequest.id,
          question: pendingRequest.question,
          choices: [...pendingRequest.choices],
          artifactRefs: structuredClone(pendingRequest.artifactRefs),
          phaseId: pendingPhase.id,
          phaseName: pendingPhase.name,
          stepId: pendingPhase.step.id,
          stepName: pendingPhase.step.name,
          runId: pendingPhase.step.runId,
        }
      : null;
  const gate = WORKFLOW_CATALOG[copy.mode].modeGate;
  const gatePrerequisite = gate
    ? copy.phases.find((phase) => phase.id === gate.afterPhaseId)
    : null;
  const modeGate: WorkflowModeGateView | null =
    gate
      && copy.architectureChoice === null
      && gatePrerequisite?.status === 'complete'
      ? {
          phaseId: gatePrerequisite.id,
          stepId: gatePrerequisite.step.id,
          question: 'How should this architecture work continue?',
          choices: [...gate.choices],
        }
      : null;
  return {
    ...copy,
    phases: copy.phases.map((phase) => ({
      ...phase,
      optional: WORKFLOW_CATALOG[copy.mode].phases.find(
        (definition) => definition.id === phase.id,
      )?.optional === true,
      steps: [{
        ...structuredClone(phase.step),
        canStart: next?.id === phase.id && next.step.id === phase.step.id,
        canApprove: phase.step.status === 'awaiting-review',
      }],
    })),
    artifacts: structuredClone(copy.artifacts),
    status,
    progress,
    currentPhase: active ? phasePointer(active) : next ? phasePointer(next) : null,
    nextEligibleStep: next ? phasePointer(next) : null,
    recoverableStep: recoverable,
    approvableStep: active?.status === 'awaiting-review' && active.step.artifacts[0]
      ? { ...phasePointer(active), artifact: structuredClone(active.step.artifacts[0]) }
      : null,
    pendingInput,
    modeGate,
  };
}

function phasePointer(phase: WorkflowPhaseData): WorkflowStepPointer {
  return {
    phaseId: phase.id,
    phaseName: phase.name,
    stepId: phase.step.id,
    stepName: phase.step.name,
    runId: phase.step.runId,
  };
}
