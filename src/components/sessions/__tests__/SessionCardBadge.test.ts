import { describe, it, expect } from 'vitest';

/**
 * Tests for ADO deliverables badge rendering in SessionCard.
 *
 * Following the project's test pattern: extract the rendering logic
 * and test it as a pure function. No React rendering needed — we test
 * the conditional display logic and text formatting directly.
 *
 * SessionCard renders:
 *   {((session.adoPrCount ?? 0) > 0 || (session.adoWorkItemCount ?? 0) > 0) && (
 *     <span>
 *       🔗 {[
 *         (adoPrCount ?? 0) > 0 ? `${adoPrCount} PR${adoPrCount === 1 ? '' : 's'}` : null,
 *         (adoWorkItemCount ?? 0) > 0 ? `${adoWorkItemCount} WI${adoWorkItemCount === 1 ? '' : 's'}` : null,
 *       ].filter(Boolean).join(' · ')}
 *     </span>
 *   )}
 */

/**
 * Extract of the badge visibility and content logic from SessionCard.
 * Returns null if badge should be hidden, or the text content if shown.
 */
function formatDeliverablesBadge(
  adoPrCount: number | undefined,
  adoWorkItemCount: number | undefined,
): string | null {
  const prCount = adoPrCount ?? 0;
  const wiCount = adoWorkItemCount ?? 0;

  if (prCount === 0 && wiCount === 0) return null;

  const parts = [
    prCount > 0 ? `${prCount} PR${prCount === 1 ? '' : 's'}` : null,
    wiCount > 0 ? `${wiCount} WI${wiCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return `🔗 ${parts}`;
}

// ── Tests ────────────────────────────────────────────────────────

describe('SessionCard — deliverables badge', () => {
  describe('badge visibility', () => {
    it('hidden when both counts are undefined', () => {
      expect(formatDeliverablesBadge(undefined, undefined)).toBeNull();
    });

    it('hidden when both counts are 0', () => {
      expect(formatDeliverablesBadge(0, 0)).toBeNull();
    });

    it('hidden when prCount is 0 and wiCount is undefined', () => {
      expect(formatDeliverablesBadge(0, undefined)).toBeNull();
    });

    it('hidden when prCount is undefined and wiCount is 0', () => {
      expect(formatDeliverablesBadge(undefined, 0)).toBeNull();
    });
  });

  describe('badge content — both present', () => {
    it('shows "🔗 2 PRs · 3 WIs" when both present', () => {
      expect(formatDeliverablesBadge(2, 3)).toBe('🔗 2 PRs · 3 WIs');
    });

    it('shows "🔗 1 PR · 1 WI" (singular) for counts of 1', () => {
      expect(formatDeliverablesBadge(1, 1)).toBe('🔗 1 PR · 1 WI');
    });

    it('shows "🔗 5 PRs · 1 WI" (mixed plural/singular)', () => {
      expect(formatDeliverablesBadge(5, 1)).toBe('🔗 5 PRs · 1 WI');
    });
  });

  describe('badge content — PRs only', () => {
    it('shows "🔗 2 PRs" when only PRs present (wiCount=0)', () => {
      expect(formatDeliverablesBadge(2, 0)).toBe('🔗 2 PRs');
    });

    it('shows "🔗 1 PR" singular', () => {
      expect(formatDeliverablesBadge(1, 0)).toBe('🔗 1 PR');
    });

    it('shows "🔗 2 PRs" when wiCount is undefined', () => {
      expect(formatDeliverablesBadge(2, undefined)).toBe('🔗 2 PRs');
    });
  });

  describe('badge content — WIs only', () => {
    it('shows "🔗 3 WIs" when only work items present (prCount=0)', () => {
      expect(formatDeliverablesBadge(0, 3)).toBe('🔗 3 WIs');
    });

    it('shows "🔗 1 WI" singular', () => {
      expect(formatDeliverablesBadge(0, 1)).toBe('🔗 1 WI');
    });

    it('shows "🔗 3 WIs" when prCount is undefined', () => {
      expect(formatDeliverablesBadge(undefined, 3)).toBe('🔗 3 WIs');
    });
  });

  describe('edge cases', () => {
    it('handles large counts', () => {
      expect(formatDeliverablesBadge(100, 250)).toBe('🔗 100 PRs · 250 WIs');
    });
  });
});
