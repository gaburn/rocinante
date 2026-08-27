import type { BugFixClassification, WorkflowMode } from '../types/workflows';

/**
 * Client-side preview of the bounded, opinionated mode catalog
 * (mirrors server/services/workflowCatalog.ts — the server remains the
 * sole source of truth for actual phase/step state once a workflow is
 * created; this catalog exists only to render the "selected path"
 * preview on the creation form).
 */
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

export const WORKFLOW_MODE_CATALOG: ModeCatalogEntry[] = [
  {
    mode: 'simple',
    label: 'Simple',
    description:
      'A short, direct path for well-scoped work: research the change, then implement it. The Pull Request phase is skipped automatically.',
    phases: [
      { id: 'research', title: 'Research' },
      { id: 'implement', title: 'Implement', requiresApproval: true },
      { id: 'pr', title: 'PR', requiresApproval: true, alwaysSkipped: true },
    ],
  },
  {
    mode: 'full',
    label: 'Full',
    description:
      'The complete engineering path for substantial changes: prototype and plan before implementing, then a formal review before finalizing.',
    phases: [
      { id: 'research', title: 'Research' },
      { id: 'prototype', title: 'Prototype' },
      { id: 'plan', title: 'Plan' },
      { id: 'implement', title: 'Implement', requiresApproval: true },
      { id: 'formal-review', title: 'Formal Review', requiresApproval: true },
      { id: 'finalize', title: 'Finalize', requiresApproval: true },
      { id: 'pr', title: 'PR', requiresApproval: true },
    ],
  },
  {
    mode: 'bug-fix',
    label: 'Bug Fix',
    description:
      'Diagnose and fix a defect. Unverified or externally-reported bugs add an Intake / Verification phase first.',
    phases: [
      { id: 'intake', title: 'Intake / Verification', skippedWhenConfirmed: true },
      { id: 'diagnose', title: 'Diagnose' },
      { id: 'fix', title: 'Fix', requiresApproval: true },
      { id: 'formal-review', title: 'Formal Review', requiresApproval: true },
      { id: 'finalize', title: 'Finalize', requiresApproval: true },
      { id: 'pr', title: 'PR', requiresApproval: true },
    ],
  },
  {
    mode: 'architecture-health',
    label: 'Architecture Health',
    description:
      'Shape the change, then a Mode Gate chooses to implement directly or produce a Specification and Tasks first.',
    phases: [
      { id: 'shape', title: 'Shape' },
      { id: 'specification', title: 'Specification', skippableByModeGate: true },
      { id: 'tasks', title: 'Tasks', skippableByModeGate: true },
      { id: 'implement', title: 'Implement', requiresApproval: true },
      { id: 'formal-review', title: 'Formal Review', requiresApproval: true },
      { id: 'finalize', title: 'Finalize', requiresApproval: true },
      { id: 'pr', title: 'PR', requiresApproval: true },
    ],
  },
  {
    mode: 'wayfinding',
    label: 'Wayfinding',
    description:
      'Explore direction before committing: wayfind, write a specification, break it into tasks, then implement and review.',
    phases: [
      { id: 'wayfind', title: 'Wayfind / Workflow Map', requiresApproval: true },
      { id: 'specification', title: 'Specification' },
      { id: 'tasks', title: 'Tasks' },
      { id: 'implement', title: 'Implement', requiresApproval: true },
      { id: 'formal-review', title: 'Formal Review', requiresApproval: true },
      { id: 'finalize', title: 'Finalize', requiresApproval: true },
      { id: 'pr', title: 'PR', requiresApproval: true },
    ],
  },
];

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
