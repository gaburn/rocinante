export const WORKFLOW_MODES = [
  'simple',
  'full',
  'bug-fix',
  'architecture-health',
  'wayfinding',
] as const;

export type WorkflowMode = (typeof WORKFLOW_MODES)[number];
export type BugFixClassification = 'confirmed' | 'unverified-external';
export type ArchitectureChoice = 'direct' | 'planned';

export interface WorkflowPhaseDefinition {
  id: string;
  name: string;
  stepId: string;
  stepName: string;
  requiresApproval: boolean;
  requiresArtifact: boolean;
  initiallySkipped?: boolean;
  skippedForClassifications?: readonly BugFixClassification[];
}

export interface WorkflowModeDefinition {
  id: WorkflowMode;
  name: string;
  phases: readonly WorkflowPhaseDefinition[];
  requiresClassification?: boolean;
  modeGate?: {
    afterPhaseId: string;
    choices: readonly ArchitectureChoice[];
    skippedPhases: Readonly<Partial<Record<ArchitectureChoice, readonly string[]>>>;
  };
}

function phase(
  id: string,
  name: string,
  requiresApproval = false,
  options: Pick<WorkflowPhaseDefinition, 'initiallySkipped' | 'skippedForClassifications'> = {},
): WorkflowPhaseDefinition {
  return {
    id,
    name,
    stepId: id,
    stepName: name,
    requiresApproval,
    requiresArtifact: true,
    ...options,
  };
}

export const WORKFLOW_CATALOG: Readonly<Record<WorkflowMode, WorkflowModeDefinition>> = {
  simple: {
    id: 'simple',
    name: 'Simple',
    phases: [
      phase('research', 'Research'),
      phase('implement', 'Implement', true),
      phase('pr', 'PR', true, { initiallySkipped: true }),
    ],
  },
  full: {
    id: 'full',
    name: 'Full',
    phases: [
      phase('research', 'Research'),
      phase('prototype', 'Prototype'),
      phase('plan', 'Plan'),
      phase('implement', 'Implement', true),
      phase('formal-review', 'Formal Review', true),
      phase('finalize', 'Finalize', true),
      phase('pr', 'PR', true),
    ],
  },
  'bug-fix': {
    id: 'bug-fix',
    name: 'Bug Fix',
    requiresClassification: true,
    phases: [
      phase('intake', 'Intake / Verification', false, {
        skippedForClassifications: ['confirmed'],
      }),
      phase('diagnose', 'Diagnose'),
      phase('fix', 'Fix', true),
      phase('formal-review', 'Formal Review', true),
      phase('finalize', 'Finalize', true),
      phase('pr', 'PR', true),
    ],
  },
  'architecture-health': {
    id: 'architecture-health',
    name: 'Architecture Health',
    modeGate: {
      afterPhaseId: 'shape',
      choices: ['direct', 'planned'],
      skippedPhases: {
        direct: ['specification', 'tasks'],
      },
    },
    phases: [
      phase('shape', 'Shape'),
      phase('specification', 'Specification'),
      phase('tasks', 'Tasks'),
      phase('implement', 'Implement', true),
      phase('formal-review', 'Formal Review', true),
      phase('finalize', 'Finalize', true),
      phase('pr', 'PR', true),
    ],
  },
  wayfinding: {
    id: 'wayfinding',
    name: 'Wayfinding',
    phases: [
      phase('wayfind', 'Wayfind / Workflow Map', true),
      phase('specification', 'Specification'),
      phase('tasks', 'Tasks'),
      phase('implement', 'Implement', true),
      phase('formal-review', 'Formal Review', true),
      phase('finalize', 'Finalize', true),
      phase('pr', 'PR', true),
    ],
  },
};

export function parseWorkflowMode(value: unknown): WorkflowMode | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return WORKFLOW_MODES.includes(normalized as WorkflowMode)
    ? normalized as WorkflowMode
    : null;
}

export function parseBugFixClassification(value: unknown): BugFixClassification | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (normalized === 'confirmed' || normalized === 'unverified-external') {
    return normalized;
  }
  return null;
}
