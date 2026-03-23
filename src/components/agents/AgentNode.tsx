import { useState } from 'react';
import type { SubAgent } from '../../types';
import { getStatusDotClass } from '../../utils/statusColors';
import { formatDuration } from '../../utils/formatters';
import StatusBadge from '../common/StatusBadge';

/* ────────────────────────────────────────────────────────────
 *  AgentNode — recursive tree node
 *
 *  Renders a single agent and its descendant sub-agents as a
 *  visual tree that mirrors classic terminal `tree` output:
 *
 *    orchestrator (running) — "Coordinating dark mode…"
 *      ├── explore (completed) — "Searching for patterns"
 *      ├── coder (running) — "Implementing ThemeContext"
 *      │   ├── task (completed) — "Installing deps"
 *      │   └── code-review (waiting) — "Reviewing code"
 *      └── designer (completed) — "Creating palette"
 *
 *  Tree-line geometry
 *  ──────────────────
 *  Each depth level is indented 24 px (`ml-6`).  Connector
 *  lines are 1 px wide, absolutely-positioned divs using the
 *  project's `bg-border-default` token.
 *
 *  • Non-last siblings carry a *full-height* vertical line
 *    that spans the node's entire subtree, visually linking
 *    it to the next sibling below (the ├── / │ segments).
 *  • The last sibling draws only a *half-height stub* from
 *    the top of the row to the connector midpoint (└──).
 *  • A horizontal branch extends from the vertical line to
 *    the node content.
 *
 *  Expand / collapse
 *  ─────────────────
 *  Nodes whose `agent.arguments` carry at least one key are
 *  expandable — clicking (or pressing Enter / Space) reveals
 *  a detail panel showing the full prompt and parameters.
 *  The root orchestrator node (depth 0) is never expandable.
 * ──────────────────────────────────────────────────────────── */

/* ── Ordered fields displayed in the detail panel ────────── */
const KNOWN_FIELDS: { key: string; label: string }[] = [
  { key: 'agent_type', label: 'Agent Type' },
  { key: 'name', label: 'Name' },
  { key: 'model', label: 'Model' },
  { key: 'mode', label: 'Mode' },
  { key: 'description', label: 'Description' },
];

const KNOWN_KEYS = new Set([...KNOWN_FIELDS.map((f) => f.key), 'prompt']);
const MAX_VISIBLE_TOOL_CALLS = 3;

function getToolIcon(toolName: string): string {
  const normalized = toolName.toLowerCase();
  if (normalized === 'powershell' || normalized === 'bash' || normalized === 'shell') {
    return '⌁';
  }
  if (normalized === 'view') {
    return '◫';
  }
  if (normalized === 'grep') {
    return '⌕';
  }
  if (normalized === 'edit' || normalized === 'create') {
    return '✎';
  }

  return '•';
}

interface AgentNodeProps {
  /** The agent (and its children) to render. */
  agent: SubAgent;
  /** Current nesting depth — 0 for the root of the tree. */
  depth?: number;
  /** True when this node is the final sibling at its level. */
  isLast?: boolean;
}

export default function AgentNode({
  agent,
  depth = 0,
  isLast = false,
}: AgentNodeProps) {
  const isRoot = depth === 0;
  const hasChildren = agent.children.length > 0;
  const isRunning = agent.status === 'running';
  const duration = formatDuration(agent.startedAt, agent.completedAt);
  const taskTextClass = isRunning ? 'text-fg/50' : 'text-fg/35';
  const toolCalls = agent.toolCalls ?? [];
  const visibleToolCalls = toolCalls.slice(0, MAX_VISIBLE_TOOL_CALLS);
  const hiddenToolCallCount = Math.max(0, toolCalls.length - MAX_VISIBLE_TOOL_CALLS);

  /* ── Expandability ─────────────────────────────────────── */
  const isExpandable =
    !isRoot &&
    (
      (!!agent.arguments && Object.keys(agent.arguments).length > 0) ||
      !!agent.result
    );

  const [expanded, setExpanded] = useState<boolean>(false);

  const toggle = () => {
    if (isExpandable) setExpanded((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isExpandable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  /* ── Gather "extra" argument keys not in KNOWN_FIELDS ── */
  const extraFields: { key: string; value: unknown }[] = [];
  if (agent.arguments) {
    for (const [k, v] of Object.entries(agent.arguments)) {
      if (!KNOWN_KEYS.has(k) && v != null) {
        extraFields.push({ key: k, value: v });
      }
    }
  }

  return (
    <div className={`relative ${isRoot ? '' : 'ml-6'}`}>
      {/* ── Vertical continuation line ──────────────────────
       *  For every non-last sibling the line runs the FULL
       *  height of this subtree — row + all descendants —
       *  connecting this node's connector to the next
       *  sibling's connector below.                         */}
      {!isRoot && !isLast && (
        <div
          className="pointer-events-none absolute -left-6 top-0 bottom-0 w-px bg-border-default"
          aria-hidden="true"
        />
      )}

      {/* ── Node row ── */}
      <div className="group/row relative flex items-center">
        {/* Connector lines (decorative)
         *  ├──  non-last  →  full vertical + horizontal
         *  └──  last      →  half stub   + horizontal     */}
        {!isRoot && (
          <>
            {isLast && (
              <div
                className="pointer-events-none absolute -left-6 top-0 h-1/2 w-px bg-border-default"
                aria-hidden="true"
              />
            )}
            <div
              className="pointer-events-none absolute -left-6 top-1/2 h-px w-[22px] bg-border-default"
              aria-hidden="true"
            />
          </>
        )}

        {/* ── Content capsule ── */}
        <div
          className={[
            'flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1',
            'transition-colors duration-150 ease-out',
            'group-hover/row:bg-surface-hover',
            isExpandable ? 'cursor-pointer select-none' : '',
          ].join(' ')}
          {...(isExpandable
            ? {
                role: 'button' as const,
                tabIndex: 0,
                onClick: toggle,
                onKeyDown: handleKeyDown,
                'aria-expanded': expanded,
              }
            : {})}
        >
          {/* Status dot — pulses for running agents */}
          <span
            aria-hidden="true"
            className={[
              'mt-1 shrink-0 size-2 rounded-full',
              getStatusDotClass(agent.status),
              isRunning ? 'animate-pulse' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {/* Agent name */}
              <span className="shrink-0 font-mono text-sm font-semibold text-fg-heading">
                {agent.name}
              </span>

              {/* Status badge */}
              <StatusBadge status={agent.status} size="sm" />
            </div>

            {/* Task description — visible secondary line */}
            <p
              className={[
                'mt-0.5 min-w-0 line-clamp-2 text-xs leading-snug',
                taskTextClass,
              ].join(' ')}
              title={agent.task}
            >
              {'\u2014'} &quot;{agent.task}&quot;
            </p>

            {visibleToolCalls.length > 0 && (
              <div className="mt-1 pl-4 text-[10px] font-mono text-fg/30">
                {visibleToolCalls.map((toolCall, index) => {
                  const rowClass =
                    toolCall.status === 'running'
                      ? 'text-fg/40'
                      : 'text-fg/25';

                  return (
                    <div
                      key={`${toolCall.name}-${toolCall.timestamp}-${index}`}
                      className={`flex min-w-0 items-center gap-1 ${rowClass}`}
                      title={`${toolCall.name} ${toolCall.summary}`}
                    >
                      <span className="shrink-0">{getToolIcon(toolCall.name)}</span>
                      <span className="text-fg/40 font-semibold">{toolCall.name}</span>
                      <span className="min-w-0 truncate text-fg/30">
                        {toolCall.summary}
                      </span>
                      {toolCall.status === 'running' ? (
                        <span className="ml-1 inline-flex items-center gap-1 text-fg/40">
                          <span className="inline-block size-1.5 rounded-full bg-sky-400 animate-pulse" />
                          running
                        </span>
                      ) : (
                        <span className="ml-1 text-fg/25">done</span>
                      )}
                    </div>
                  );
                })}
                {hiddenToolCallCount > 0 && (
                  <div className="text-fg/25">+{hiddenToolCallCount} more</div>
                )}
              </div>
            )}
          </div>

          <div className="ml-2 flex shrink-0 items-center gap-2 self-start">
            {/* Duration pill (always visible in row) */}
            <span className="rounded bg-surface-tertiary px-1.5 py-0.5 font-mono text-[11px] leading-tight tabular-nums text-fg-muted">
              {duration}
            </span>

            {/* Expand / collapse chevron */}
            {isExpandable && (
              <span
                aria-hidden="true"
                className={[
                  'shrink-0 text-[10px] leading-none text-fg/25',
                  'transition-transform duration-150 ease-out',
                  expanded ? 'rotate-90' : '',
                ].join(' ')}
              >
                ▶
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Expandable detail panel ────────────────────────── */}
      {expanded && (agent.arguments || agent.result) && (
        <div className="rounded-md bg-surface-tertiary border border-border-default mt-1 mb-2 p-3 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            {/* ── Known fields (ordered) ── */}
            {KNOWN_FIELDS.map(({ key, label }) => {
              const val = agent.arguments?.[key as keyof typeof agent.arguments];
              if (val == null || val === '') return null;
              return (
                <div key={key} className="col-span-2 grid grid-cols-subgrid">
                  <dt className="font-mono text-fg/30">{label}</dt>
                  <dd className="text-fg/70">{String(val)}</dd>
                </div>
              );
            })}

            {/* ── Extra / unknown fields ── */}
            {extraFields.map(({ key, value }) => (
              <div key={key} className="col-span-2 grid grid-cols-subgrid">
                 <dt className="font-mono text-fg/30">{key}</dt>
                 <dd className="text-fg/70">
                  {typeof value === 'object'
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </dd>
              </div>
            ))}

            {/* ── Prompt (full-width block) ── */}
            {agent.arguments?.prompt && (
              <div className="col-span-2 mt-1">
                <dt className="mb-1 font-mono text-fg/30">Prompt</dt>
                <dd className="max-h-64 overflow-y-auto rounded bg-surface-secondary p-2 font-mono text-fg/60 whitespace-pre-wrap leading-relaxed">
                  {agent.arguments.prompt}
                </dd>
              </div>
            )}

            {/* ── Result ── */}
            {agent.result && (
              <div className="col-span-2 mt-1">
                <dt className="mb-1 flex items-center gap-2 font-mono text-fg/30">
                  Result
                  {agent.result.success ? (
                    <span className="text-emerald-400">✓ Success</span>
                  ) : (
                    <span className="text-red-400">✗ Failed</span>
                  )}
                </dt>
                <dd>
                  <pre className="max-h-64 overflow-y-auto rounded bg-surface-secondary p-2 font-mono text-xs text-fg/60 whitespace-pre-wrap leading-relaxed">
                    {agent.result.content}
                  </pre>
                  {agent.result.content.includes('Output too large') && (
                    <p className="mt-1 text-[10px] italic text-fg/30">
                      Output was truncated
                    </p>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* ── Recursive children ── */}
      {hasChildren &&
        agent.children.map((child, index) => (
          <AgentNode
            key={child.id}
            agent={child}
            depth={depth + 1}
            isLast={index === agent.children.length - 1}
          />
        ))}
    </div>
  );
}
