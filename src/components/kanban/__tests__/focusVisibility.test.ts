import { describe, it, expect } from 'vitest';

/**
 * Tests for focus-mode column visibility filtering in KanbanBoard.
 *
 * Extracted filter logic: when focus mode is active with pinned workstreams,
 * only focused columns are visible; Ungrouped is hidden and counted among
 * the "+N other workstreams". When no workstreams are pinned, everything shows.
 */

const UNGROUPED_ID = '__ungrouped__';

interface Column {
  id: string;
  name: string;
  sessions: unknown[];
}

interface RegistryEntry {
  focused?: boolean;
  favorited?: boolean;
}

type WorkstreamRegistry = Record<string, RegistryEntry | undefined>;

/** Mirrors the visibility split in KanbanBoard's visibleColumns useMemo. */
function computeVisibility(
  effectiveColumns: Column[],
  focusModeEnabled: boolean,
  showAllWorkstreams: boolean,
  workstreamRegistry: WorkstreamRegistry,
): { visibleColumns: Column[]; hiddenCount: number } {
  if (!focusModeEnabled || showAllWorkstreams) {
    return { visibleColumns: effectiveColumns, hiddenCount: 0 };
  }
  const focused = effectiveColumns.filter(
    (col) => col.id !== UNGROUPED_ID && workstreamRegistry[col.name]?.focused,
  );
  if (focused.length === 0) {
    return { visibleColumns: effectiveColumns, hiddenCount: 0 };
  }
  const hidden = effectiveColumns.filter(
    (col) => col.id === UNGROUPED_ID || !workstreamRegistry[col.name]?.focused,
  );
  return { visibleColumns: focused, hiddenCount: hidden.length };
}

const mkCol = (name: string, id?: string, sessionCount = 1): Column => ({
  id: id ?? name,
  name,
  sessions: Array.from({ length: sessionCount }, (_, i) => ({ id: `${name}-${i}` })),
});

describe('Focus-mode column visibility', () => {
  const ungrouped = mkCol('Ungrouped', UNGROUPED_ID, 2);
  const alpha = mkCol('Alpha');
  const beta = mkCol('Beta');
  const gamma = mkCol('Gamma');
  const delta = mkCol('Delta');
  const allCols = [alpha, beta, gamma, delta, ungrouped];

  const registry: WorkstreamRegistry = {
    Alpha: { focused: true },
    Beta: { focused: true },
    Gamma: { focused: true },
    Delta: { focused: false },
  };

  it('hides Ungrouped when focus mode is on with pinned workstreams', () => {
    const { visibleColumns, hiddenCount } = computeVisibility(allCols, true, false, registry);
    const names = visibleColumns.map((c) => c.name);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(names).not.toContain('Ungrouped');
    expect(hiddenCount).toBe(2); // Delta + Ungrouped
  });

  it('shows Ungrouped when "Show all" is active', () => {
    const { visibleColumns, hiddenCount } = computeVisibility(allCols, true, true, registry);
    expect(visibleColumns.map((c) => c.name)).toContain('Ungrouped');
    expect(hiddenCount).toBe(0);
  });

  it('shows Ungrouped when focus mode is off', () => {
    const { visibleColumns, hiddenCount } = computeVisibility(allCols, false, false, registry);
    expect(visibleColumns.map((c) => c.name)).toContain('Ungrouped');
    expect(hiddenCount).toBe(0);
  });

  it('shows everything (including Ungrouped) when zero workstreams are pinned', () => {
    const emptyRegistry: WorkstreamRegistry = {
      Alpha: { focused: false },
      Beta: { focused: false },
    };
    const { visibleColumns, hiddenCount } = computeVisibility(allCols, true, false, emptyRegistry);
    expect(visibleColumns).toHaveLength(allCols.length);
    expect(visibleColumns.map((c) => c.name)).toContain('Ungrouped');
    expect(hiddenCount).toBe(0);
  });

  it('counts Ungrouped with zero sessions among hidden columns', () => {
    const emptyUngrouped = mkCol('Ungrouped', UNGROUPED_ID, 0);
    const cols = [alpha, beta, emptyUngrouped];
    const reg: WorkstreamRegistry = { Alpha: { focused: true }, Beta: { focused: false } };
    const { visibleColumns, hiddenCount } = computeVisibility(cols, true, false, reg);
    expect(visibleColumns.map((c) => c.name)).toEqual(['Alpha']);
    expect(hiddenCount).toBe(2); // Beta + empty Ungrouped
  });

  it('still shows focused columns even if they have zero sessions', () => {
    const emptyAlpha = mkCol('Alpha', 'Alpha', 0);
    const cols = [emptyAlpha, beta, ungrouped];
    const reg: WorkstreamRegistry = { Alpha: { focused: true }, Beta: { focused: false } };
    const { visibleColumns, hiddenCount } = computeVisibility(cols, true, false, reg);
    expect(visibleColumns.map((c) => c.name)).toEqual(['Alpha']);
    expect(hiddenCount).toBe(2); // Beta + Ungrouped
  });
});
