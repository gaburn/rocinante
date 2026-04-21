import { describe, it, expect } from 'vitest';

/**
 * Tests for KanbanBoard favorite-based column sorting.
 *
 * Extracted sort logic: favorited columns go to the front,
 * ungrouped always stays last, and toggling favorites
 * immediately reorders columns.
 */

const UNGROUPED_ID = '__ungrouped__';

interface Column {
  id: string;
  name: string;
  sessions: unknown[];
}

interface RegistryEntry {
  favorited?: boolean;
}

type WorkstreamRegistry = Record<string, RegistryEntry | undefined>;

/** Mirrors the sort logic in KanbanBoard's effectiveColumns useMemo. */
function sortColumns(cols: Column[], registry: WorkstreamRegistry): Column[] {
  return [...cols].sort((a, b) => {
    const aIsUngrouped = a.id === UNGROUPED_ID;
    const bIsUngrouped = b.id === UNGROUPED_ID;
    if (aIsUngrouped && !bIsUngrouped) return 1;
    if (!aIsUngrouped && bIsUngrouped) return -1;
    const aFav = registry[a.name]?.favorited ? 1 : 0;
    const bFav = registry[b.name]?.favorited ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    return 0;
  });
}

const mkCol = (name: string, id?: string): Column => ({
  id: id ?? name,
  name,
  sessions: [],
});

describe('kanban favorite column sorting', () => {
  it('favorited column moves to the front', () => {
    const cols = [mkCol('Alpha'), mkCol('Beta'), mkCol('Gamma')];
    const registry: WorkstreamRegistry = { Beta: { favorited: true } };
    const sorted = sortColumns(cols, registry);
    expect(sorted.map((c) => c.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('unfavoriting moves the column back to its original position', () => {
    const cols = [mkCol('Alpha'), mkCol('Beta'), mkCol('Gamma')];
    const registry: WorkstreamRegistry = { Beta: { favorited: false } };
    const sorted = sortColumns(cols, registry);
    expect(sorted.map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('ungrouped column always stays last regardless of favorites', () => {
    const cols = [
      mkCol('Ungrouped', UNGROUPED_ID),
      mkCol('Alpha'),
      mkCol('Beta'),
    ];
    const registry: WorkstreamRegistry = {};
    const sorted = sortColumns(cols, registry);
    expect(sorted[sorted.length - 1].id).toBe(UNGROUPED_ID);
  });

  it('multiple favorited columns both move ahead of non-favorited', () => {
    const cols = [mkCol('Alpha'), mkCol('Beta'), mkCol('Gamma'), mkCol('Delta')];
    const registry: WorkstreamRegistry = {
      Gamma: { favorited: true },
      Delta: { favorited: true },
    };
    const sorted = sortColumns(cols, registry);
    const names = sorted.map((c) => c.name);
    // Gamma and Delta should be in the first two positions
    expect(names.slice(0, 2).sort()).toEqual(['Delta', 'Gamma']);
    expect(names.slice(2).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('toggling favorite on/off is reflected immediately with live registry', () => {
    const cols = [mkCol('Alpha'), mkCol('Beta'), mkCol('Gamma')];

    // Star Beta → it jumps to the front
    const reg1: WorkstreamRegistry = { Beta: { favorited: true } };
    const sorted1 = sortColumns(cols, reg1);
    expect(sorted1[0].name).toBe('Beta');

    // Unstar Beta → it returns to original position
    const reg2: WorkstreamRegistry = { Beta: { favorited: false } };
    const sorted2 = sortColumns(cols, reg2);
    expect(sorted2.map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});
