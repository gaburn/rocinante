import type { SubAgent, AgentStatus } from '../../types';
import { countAgents } from '../../utils/formatters';
import { getStatusDotClass, getStatusLabel } from '../../utils/statusColors';
import AgentNode from './AgentNode';

/* ────────────────────────────────────────────────────────────
 *  SubagentTree — section container for the agent hierarchy
 *
 *  Wraps a recursive AgentNode tree in a self-contained panel
 *  with a title header, scrollable tree area, and a compact
 *  legend that decodes the status colour language.
 *
 *  Layout
 *  ──────
 *    ┌──────────────────────────────────────────┐
 *    │  Agent Hierarchy                7 agents │  ← header
 *    ├──────────────────────────────────────────┤
 *    │                                          │
 *    │  (recursive AgentNode tree)              │  ← scrollable
 *    │                                          │
 *    ├──────────────────────────────────────────┤
 *    │  ● Running  ● Completed  ● Blocked  …   │  ← legend
 *    └──────────────────────────────────────────┘
 * ──────────────────────────────────────────────────────────── */

interface SubagentTreeProps {
  rootAgent: SubAgent;
}

/* The four agent-level statuses rendered in the legend,
   ordered by urgency so the eye lands on "live" first. */
const LEGEND_STATUSES: AgentStatus[] = [
  'running',
  'completed',
  'blocked',
  'waiting',
];

export default function SubagentTree({ rootAgent }: SubagentTreeProps) {
  const totalAgents = countAgents(rootAgent);

  return (
    <section
      aria-label="Agent hierarchy"
      className="rounded-lg border border-border-default bg-surface-secondary"
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h2 className="font-mono text-sm font-semibold text-fg-heading">
          Agent Hierarchy
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
          {totalAgents} {totalAgents === 1 ? 'agent' : 'agents'}
        </span>
      </div>

      {/* ── Divider ───────────────────────────────────────── */}
      <div className="mx-4 h-px bg-border-default" aria-hidden="true" />

      {/* ── Tree area (scrollable) ────────────────────────── */}
      <div className="max-h-[480px] overflow-y-auto px-4 py-3">
        <AgentNode agent={rootAgent} depth={0} isLast />
      </div>

      {/* ── Divider ───────────────────────────────────────── */}
      <div className="mx-4 h-px bg-border-default" aria-hidden="true" />

      {/* ── Legend ─────────────────────────────────────────── */}
      <div
        aria-label="Status colour legend"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
      >
        {LEGEND_STATUSES.map((status) => (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 select-none"
          >
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${getStatusDotClass(status)}`}
            />
            <span className="font-mono text-[11px] leading-none text-fg-muted">
              {getStatusLabel(status)}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
