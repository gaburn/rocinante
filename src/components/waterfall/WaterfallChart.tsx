/* ── WaterfallChart ────────────────────────────────────────
   Top-level "Performance Waterfall" panel.  Walks the agent
   tree to derive timing, renders a time axis + one bar row
   per sub-agent (skipping the root orchestrator).
   ──────────────────────────────────────────────────────── */

import type { SubAgent } from '../../types';
import { formatCompactDuration } from '../../utils/formatters';
import WaterfallTimeAxis from './WaterfallTimeAxis';
import WaterfallRow from './WaterfallRow';

/* ── props ─────────────────────────────────────────────── */

interface WaterfallChartProps {
  rootAgent: SubAgent;
  sessionStartedAt: string;
}

/* ── helpers ───────────────────────────────────────────── */

/** Find the latest timestamp across the entire tree. */
function findLatestMs(agent: SubAgent): number {
  let latest = agent.completedAt
    ? Date.parse(agent.completedAt)
    : Date.now();

  for (const child of agent.children) {
    latest = Math.max(latest, findLatestMs(child));
  }

  return latest;
}

/** DFS-flatten children (skipping root) into { agent, depth }[]. */
function flattenChildren(agent: SubAgent): { agent: SubAgent; depth: number }[] {
  const result: { agent: SubAgent; depth: number }[] = [];

  function walk(node: SubAgent, depth: number) {
    result.push({ agent: node, depth });
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }

  for (const child of agent.children) {
    walk(child, 0);
  }

  return result;
}

/* ── component ─────────────────────────────────────────── */

export default function WaterfallChart({
  rootAgent,
  sessionStartedAt,
}: WaterfallChartProps) {
  const sessionStart   = Date.parse(sessionStartedAt);
  const latestMs       = findLatestMs(rootAgent);
  const totalDuration  = Math.max(latestMs - sessionStart, 1000);

  const rows = flattenChildren(rootAgent);

  return (
    <section
      aria-label="Performance waterfall"
      className="rounded-lg border border-border-default bg-surface-secondary p-4"
    >
      {/* ── header ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="font-mono text-sm font-semibold text-fg-heading">
          Performance Waterfall
        </h2>

        <span
          className={`
            inline-flex shrink-0 items-center
            rounded-full bg-surface-tertiary
            px-2.5 py-0.5
            font-mono text-xs leading-none tabular-nums text-fg-secondary
            select-none
          `}
        >
          {formatCompactDuration(totalDuration)}
        </span>
      </div>

      {/* ── divider ──────────────────────────────────── */}
      <div className="mb-3 h-px bg-border-default" />

      {/* ── time axis ────────────────────────────────── */}
      <WaterfallTimeAxis totalDurationMs={totalDuration} />

      {/* ── rows ─────────────────────────────────────── */}
      <div className="relative max-h-[400px] overflow-y-auto overflow-x-hidden">
        {rows.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-fg/20">
            No sub-agents to display
          </p>
        ) : (
          rows.map(({ agent, depth }) => (
            <WaterfallRow
              key={agent.id}
              agent={agent}
              sessionStart={sessionStart}
              totalDuration={totalDuration}
              depth={depth}
            />
          ))
        )}
      </div>
    </section>
  );
}
