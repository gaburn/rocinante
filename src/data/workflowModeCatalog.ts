import type { BugFixClassification, WorkflowMode } from '../types/workflows';
import {
  WORKFLOW_CATALOG,
  WORKFLOW_MODES,
} from '../../server/services/workflowCatalog';

/** Client projection of the server-owned catalog used by the creation preview. */
export interface CatalogPhasePreview {
  id: string;
  title: string;
  requiresApproval?: boolean;
  /** Present when this phase is always skipped for the mode (e.g. Simple's PR). */
  alwaysSkipped?: boolean;
  /** Present when classification === 'confirmed' skips this phase (Bug Fix only). */
  skippedWhenConfirmed?: boolean;
  /** Present when the Architecture Health Mode Gate can skip this phase. */
  skippableByModeGate?: boolean;
}

export interface ModeCatalogEntry {
  mode: WorkflowMode;
  label: string;
  description: string;
  phases: CatalogPhasePreview[];
}

const MODE_DESCRIPTIONS: Record<WorkflowMode, string> = {
  simple:
    'A short, direct path for well-scoped work: research the change, then implement it. The Pull Request phase is skipped automatically.',
  full:
    'The complete engineering path for substantial changes: prototype and plan before implementing, then a formal review before finalizing.',
  'bug-fix':
    'Diagnose and fix a defect. Unverified or externally-reported bugs add an Intake / Verification phase first.',
  'architecture-health':
    'Shape the change, then a Mode Gate chooses to implement directly or produce a Specification and Tasks first.',
  wayfinding:
    'Explore direction before committing: wayfind, write a specification, break it into tasks, then implement and review.',
};

export const WORKFLOW_MODE_CATALOG: ModeCatalogEntry[] = WORKFLOW_MODES.map((mode) => {
  const definition = WORKFLOW_CATALOG[mode];
  const modeGateSkipped = new Set(
    Object.values(definition.modeGate?.skippedPhases ?? {}).flat(),
  );
  return {
    mode,
    label: definition.name,
    description: MODE_DESCRIPTIONS[mode],
    phases: definition.phases.map((phase) => ({
      id: phase.id,
      title: phase.name,
      requiresApproval: phase.requiresApproval,
      alwaysSkipped: phase.initiallySkipped,
      skippedWhenConfirmed: phase.skippedForClassifications?.includes('confirmed'),
      skippableByModeGate: modeGateSkipped.has(phase.id),
    })),
  };
});

export function getModeCatalogEntry(mode: WorkflowMode): ModeCatalogEntry {
  return WORKFLOW_MODE_CATALOG.find((entry) => entry.mode === mode) ?? WORKFLOW_MODE_CATALOG[0];
}

/**
 * Resolves whether a given preview phase would be skipped at creation time,
 * given the chosen mode/classification. Architecture Health's Mode Gate is
 * decided later (after the Shape phase completes), so it is never
 * "initially skipped" here — it is only annotated as skippable.
 */
export function isPhaseInitiallySkipped(
  phase: CatalogPhasePreview,
  classification: BugFixClassification | null,
): boolean {
  if (phase.alwaysSkipped) return true;
  if (phase.skippedWhenConfirmed) return classification === 'confirmed';
  return false;
}

export interface BugFixClassificationOption {
  value: BugFixClassification;
  label: string;
  description: string;
}

export const BUG_FIX_CLASSIFICATIONS: BugFixClassificationOption[] = [
  {
    value: 'confirmed',
    label: 'Confirmed',
    description: 'The bug is already confirmed — the path skips Intake and Verify, starting at Diagnose.',
  },
  {
    value: 'unverified-external',
    label: 'Unverified / External',
    description: 'The report is unverified or came from outside the team — the path begins with Intake to confirm it.',
  },
];
