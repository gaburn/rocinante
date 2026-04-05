/* ── WaterfallRow ──────────────────────────────────────────
   A single agent bar in the waterfall.  Renders its children
   recursively to preserve the tree structure visually.
   ──────────────────────────────────────────────────────── */

import type { SubAgent } from '../../types';
import { getStatusDotClass } from '../../utils/statusColors';
import { formatCompactDuration } from '../../utils/formatters';

/* ── bar colour lookup (≈ 40 % opacity fills) ─────────── */

const BAR_COLOR: Record<string, string> = {
  running:   'bg-emerald-500/40',
  completed: 'bg-emerald-500/40',
  blocked:   'bg-red-500/40',
  waiting:   'bg-amber-500/40',
};

/* ── props ─────────────────────────────────────────────── */

interface WaterfallRowProps {
  agent: SubAgent;
  sessionStart: number;
  totalDuration: number;
  depth: number;
}

/* ── component ─────────────────────────────────────────── */

export default function WaterfallRow({
  agent,
  sessionStart,
  totalDuration,
  depth,
}: WaterfallRowProps) {
  const agentStart = Date.parse(agent.startedAt);
  // eslint-disable-next-line react-hooks/purity
  const agentEnd   = agent.completedAt ? Date.parse(agent.completedAt) : Date.now();
  const agentDur   = Math.max(agentEnd - agentStart, 0);

  /* position & sizing (percentages) */
  const leftPct  = ((agentStart - sessionStart) / totalDuration) * 100;
  const widthPct = (agentDur / totalDuration) * 100;

  /* cap indentation at depth 6 (96 px) */
  const indent = Math.min(depth, 6) * 16;

  const isRunning = agent.status === 'running';
  const barColor  = BAR_COLOR[agent.status] ?? 'bg-fg/20';

  return (
    <>
      {/* ── this agent's row ──────────────────────────── */}
      <div className="group flex items-center hover:bg-surface-hover/40 transition-colors">

        {/* ── left: label column ────────────────────── */}
        <div
          className="flex w-[140px] shrink-0 items-center gap-1.5 overflow-hidden py-[5px] pr-2"
          style={{ paddingLeft: indent }}
        >
          <span
            className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${getStatusDotClass(agent.status)}`}
            aria-hidden="true"
          />
          <span className="truncate font-mono text-[11px] leading-tight text-fg-heading">
            {agent.name}
          </span>
        </div>

        {/* ── right: bar area ───────────────────────── */}
        <div className="relative flex flex-1 items-center py-[5px]">
          {/* bar */}
          <div
            className={`relative h-[14px] rounded-sm ${barColor}`}
            style={{
              marginLeft: `${Math.max(leftPct, 0)}%`,
              width:      `${Math.max(widthPct, 0)}%`,
              minWidth:   2,
            }}
          >
            {/* running pulse on right edge */}
            {isRunning && (
              <span
                className="absolute right-0 top-0 h-full w-[3px] rounded-r-sm bg-emerald-400 animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>

          {/* duration label */}
          <span className="ml-1.5 shrink-0 font-mono text-[10px] leading-none text-fg/40 select-none">
            {formatCompactDuration(agentDur)}
          </span>
        </div>
      </div>

      {/* ── children (recursive) ──────────────────────── */}
      {agent.children.map((child) => (
        <WaterfallRow
          key={child.id}
          agent={child}
          sessionStart={sessionStart}
          totalDuration={totalDuration}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
