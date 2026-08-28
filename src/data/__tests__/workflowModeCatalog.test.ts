import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_MODE_CATALOG,
  BUG_FIX_CLASSIFICATIONS,
  getModeCatalogEntry,
  getVisibleCatalogPhases,
  isPhaseInitiallySkipped,
} from '../workflowModeCatalog';

/**
 * The client-side mode catalog is a preview mirror of the server's bounded
 * catalog (server/services/workflowCatalog.ts). These tests pin the exact
 * phase ordering per mode so the creation form's preview cannot silently
 * drift from the actual, opinionated server-side paths.
 */

describe('workflowModeCatalog', () => {
  it('exposes exactly the five bounded modes', () => {
    expect(WORKFLOW_MODE_CATALOG.map((m) => m.mode)).toEqual([
      'simple',
      'full',
      'bug-fix',
      'architecture-health',
      'wayfinding',
    ]);
  });

  it('matches the server Simple path: Research -> Implement -> PR (always skipped)', () => {
    const entry = getModeCatalogEntry('simple');
    expect(entry.phases.map((p) => p.id)).toEqual(['research', 'implement', 'pr']);
    const pr = entry.phases.find((p) => p.id === 'pr')!;
    expect(isPhaseInitiallySkipped(pr, null)).toBe(true);
  });

  it('matches the server Full path', () => {
    const entry = getModeCatalogEntry('full');
    expect(entry.phases.map((p) => p.id)).toEqual([
      'research', 'prototype', 'plan', 'implement', 'formal-review', 'finalize', 'pr',
    ]);
  });

  it('matches the server Bug Fix path, skipping Intake / Verification when confirmed', () => {
    const entry = getModeCatalogEntry('bug-fix');
    expect(entry.phases.map((p) => p.id)).toEqual([
      'intake', 'diagnose', 'fix', 'formal-review', 'finalize', 'pr',
    ]);
    const intake = entry.phases.find((p) => p.id === 'intake')!;
    expect(isPhaseInitiallySkipped(intake, 'confirmed')).toBe(true);
    expect(isPhaseInitiallySkipped(intake, 'unverified-external')).toBe(false);
    expect(getVisibleCatalogPhases(entry, 'confirmed').map((phase) => phase.id)).toEqual([
      'diagnose', 'fix', 'formal-review', 'finalize', 'pr',
    ]);
  });

  it('matches the server Architecture Health path (Mode Gate is out-of-band, after Shape)', () => {
    const entry = getModeCatalogEntry('architecture-health');
    expect(entry.phases.map((p) => p.id)).toEqual([
      'shape', 'specification', 'tasks', 'implement', 'formal-review', 'finalize', 'pr',
    ]);
    expect(entry.phases.find((p) => p.id === 'specification')?.skippableByModeGate).toBe(true);
    expect(entry.phases.find((p) => p.id === 'tasks')?.skippableByModeGate).toBe(true);
  });

  it('matches the server Wayfinding path', () => {
    const entry = getModeCatalogEntry('wayfinding');
    expect(entry.phases.map((p) => p.id)).toEqual([
      'wayfind', 'specification', 'tasks', 'implement', 'formal-review', 'finalize', 'pr',
    ]);
    expect(entry.phases[0].requiresApproval).toBe(true);
  });

  it('requires exactly two Bug Fix classifications: confirmed and unverified-external', () => {
    expect(BUG_FIX_CLASSIFICATIONS.map((c) => c.value)).toEqual(['confirmed', 'unverified-external']);
  });

  it('falls back to the first catalog entry for an unrecognized mode', () => {
    // @ts-expect-error deliberately passing an out-of-union value to check the fallback
    expect(getModeCatalogEntry('unknown-mode')).toBe(WORKFLOW_MODE_CATALOG[0]);
  });
});
