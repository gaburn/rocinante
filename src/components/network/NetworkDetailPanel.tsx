import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSessionData, useSessionSelection } from '../../context/SessionContext';
import type { Session, SessionSummary, SubAgent, AgentStatus } from '../../types';
import { formatRelativeTime, formatDuration } from '../../utils/formatters';
import { getStatusDotClass, getStatusTextClass } from '../../utils/statusColors';
import StatusBadge from '../common/StatusBadge';

/* ────────────────────────────────────────────────────────────────────
 *  NetworkDetailPanel — slide-in sidebar for network node inspection
 *
 *  Appears when a user clicks a node in the network visualization
 *  canvas. Slides in from the right edge with a translucent backdrop
 *  overlay, and slides back out when dismissed.
 *
 *  ┌────────────────────────────┬──────────────────────────────────┐
 *  │                            │  SESSION DETAIL            [✕]  │
 *  │     Network                │                                 │
 *  │     Visualization          │  Session Name                   │
 *  │     (canvas)               │  ● Active                       │
 *  │                            │  sess_abc123def456               │
 *  │                            │                                 │
 *  │                            │  ▌ Full intent text…            │
 *  │                            │                                 │
 *  │                            │  Started 5m ago · Duration 5m   │
 *  │                            │                                 │
 *  │                            │  GIT CONTEXT                    │
 *  │                            │  📁 repo  🌿 branch  📂 dir    │
 *  │                            │                                 │
 *  │                            │  AGENTS — 12 total              │
 *  │                            │  ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
 *  │                            │  │ 5  │ │ 2  │ │ 1  │ │ 4  │   │
 *  │                            │  └────┘ └────┘ └────┘ └────┘   │
 *  │                            │                                 │
 *  │                            │  ┌──────────────────────────┐   │
 *  │                            │  │   View in List  →        │   │
 *  │                            │  └──────────────────────────┘   │
 *  └────────────────────────────┴──────────────────────────────────┘
 *
 *  Node ID prefixes
 *  ────────────────
 *  • session-{id}  →  session detail with metadata, stats, git
 *  • agent-{id}    →  agent detail with task, args, parent link
 *
 *  Transitions
 *  ───────────
 *  • Panel:    translateX(100%) → translateX(0)  300 ms ease-out
 *  • Backdrop: opacity 0 → 1                     300 ms
 *  • Stale nodeId preserved during exit so content doesn't flash
 * ──────────────────────────────────────────────────────────────── */

interface NetworkDetailPanelProps {
  nodeId: string | null;
  onClose: () => void;
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** Parse a prefixed network node ID into its entity type and raw ID. */
function parseNodeId(
  nodeId: string,
): { type: 'session' | 'agent'; entityId: string } | null {
  if (nodeId.startsWith('session-')) {
    return { type: 'session', entityId: nodeId.slice('session-'.length) };
  }
  if (nodeId.startsWith('agent-')) {
    return { type: 'agent', entityId: nodeId.slice('agent-'.length) };
  }
  return null;
}

/** Recursively search an agent tree for a matching ID. */
function findAgentInTree(
  agent: SubAgent,
  agentId: string,
): SubAgent | null {
  if (agent.id === agentId) return agent;
  for (const child of agent.children) {
    const found = findAgentInTree(child, agentId);
    if (found) return found;
  }
  return null;
}

/** Locate an agent across every session, returning both it and the
 *  parent session it belongs to. Only searches full Session objects. */
function findAgentAndSession(
  sessions: SessionSummary[],
  selectedSession: Session | null,
  agentId: string,
): { agent: SubAgent; session: Session } | null {
  // Search in selected session detail first (has rootAgent)
  if (selectedSession && 'rootAgent' in selectedSession) {
    const agent = findAgentInTree(selectedSession.rootAgent, agentId);
    if (agent) return { agent, session: selectedSession };
  }
  // Fallback: search in any full Session objects in the list
  for (const session of sessions) {
    if ('rootAgent' in session && (session as Session).rootAgent) {
      const agent = findAgentInTree((session as Session).rootAgent, agentId);
      if (agent) return { agent, session: session as Session };
    }
  }
  return null;
}

/** Recursively tally every agent in a tree by its status. */
function countAgentsByStatus(
  agent: SubAgent,
): Record<AgentStatus, number> {
  const counts: Record<AgentStatus, number> = {
    running: 0,
    completed: 0,
    blocked: 0,
    waiting: 0,
  };

  (function walk(node: SubAgent) {
    counts[node.status]++;
    node.children.forEach(walk);
  })(agent);

  return counts;
}

/* ── Argument display fields (mirrors AgentNode expand panel) ─ */

const KNOWN_FIELDS: { key: string; label: string }[] = [
  { key: 'agent_type', label: 'Agent Type' },
  { key: 'name', label: 'Name' },
  { key: 'model', label: 'Model' },
  { key: 'mode', label: 'Mode' },
  { key: 'description', label: 'Description' },
];

const KNOWN_KEYS = new Set([...KNOWN_FIELDS.map((f) => f.key), 'prompt']);

/* ── Inline SVG micro-icons ──────────────────────────────────
 *  Kept file-local — single-use decorative glyphs matching
 *  the stroke style and sizing of SessionDetail icons. */

function GitRepoIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="1.5" width="12" height="13" rx="2" />
      <path d="M5 1.5V14.5" />
      <path d="M8 5h3" />
      <path d="M8 8h2" />
    </svg>
  );
}

function GitBranchIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="11" cy="4" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <path d="M5 5.5V10.5" />
      <path d="M11 5.5C11 8 5 7 5 10.5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6l1.5 2H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5Z" />
    </svg>
  );
}

/* ── Stat card (quick-stats grid item) ────────────────────────
 *  Compact color-coded tile for a single agent-status count.
 *  Zero-count cards are dimmed to keep focus on what matters. */

interface StatCardProps {
  status: AgentStatus;
  label: string;
  count: number;
}

function StatCard({ status, label, count }: StatCardProps) {
  return (
    <div
      className={`
        rounded-lg bg-surface-tertiary px-3 py-2
        transition-opacity duration-150
        ${count === 0 ? 'opacity-40' : ''}
      `}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${getStatusDotClass(status)}`}
        />
        <span
          className={`text-lg font-semibold tabular-nums leading-none ${getStatusTextClass(status)}`}
        >
          {count}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-fg/40">{label}</p>
    </div>
  );
}

/* ── Resolved data discriminated union ─────────────────────── */

type ResolvedSession = {
  type: 'session';
  session: SessionSummary;
};

type ResolvedAgent = {
  type: 'agent';
  agent: SubAgent;
  session: Session;
};

type ResolvedData = ResolvedSession | ResolvedAgent;

/* ── Main component ──────────────────────────────────────────── */

export default function NetworkDetailPanel({
  nodeId,
  onClose,
}: NetworkDetailPanelProps) {
  const { allSessions } = useSessionData();
  const { selectSession, selectedSession } = useSessionSelection();

  const isOpen = nodeId !== null;
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Stale content preservation ─────────────────────────────
   *  When nodeId goes null the panel slides off-screen. We keep
   *  the last valid nodeId in state so content doesn't flash
   *  empty while the panel is still partially visible during its
   *  exit transition. Both updates use setTimeout to satisfy
   *  react-hooks/set-state-in-effect (no synchronous setState
   *  inside an effect body). The 0 ms opening delay is invisible
   *  because the panel is still animating in from off-screen. */
  const [displayedNodeId, setDisplayedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (nodeId !== null) {
      const raf = requestAnimationFrame(() => setDisplayedNodeId(nodeId));
      return () => cancelAnimationFrame(raf);
    }

    const timer = setTimeout(() => setDisplayedNodeId(null), 300);
    return () => clearTimeout(timer);
  }, [nodeId]);

  /* ── Focus management ── */
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => closeBtnRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /* ── Keyboard: ESC to dismiss ── */
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /* ── Resolve node → session / agent data ── */
  const resolvedData = useMemo<ResolvedData | null>(() => {
    if (!displayedNodeId) return null;

    const parsed = parseNodeId(displayedNodeId);
    if (!parsed) return null;

    if (parsed.type === 'session') {
      const session = allSessions.find((s) => s.id === parsed.entityId);
      if (!session) return null;
      return { type: 'session', session };
    }

    const result = findAgentAndSession(allSessions, selectedSession, parsed.entityId);
    if (!result) return null;
    return { type: 'agent', agent: result.agent, session: result.session };
  }, [displayedNodeId, allSessions, selectedSession]);

  /* ── Actions ── */
  const handleViewInList = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
      onClose();
    },
    [selectSession, onClose],
  );

  /* ── Derive the panel header label from content type ── */
  const panelLabel =
    resolvedData?.type === 'agent' ? 'Agent Detail' : 'Session Detail';

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────
       *  Semi-transparent overlay behind the panel.
       *  Clicking it dismisses the panel (large Fitts target).
       *  Pointer-events are disabled when hidden so the canvas
       *  remains interactive during the exit animation. */}
      <div
        className={`
          fixed inset-0 top-14 z-40 bg-black/30
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Panel ─────────────────────────────────────────── */}
      <aside
        className={`
          fixed right-0 top-14 bottom-0 z-50
          flex w-96 flex-col
          border-l border-border-default bg-surface-secondary
          shadow-2xl shadow-black/50
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-label="Node detail panel"
        aria-hidden={!isOpen}
      >
        {/* ── Header bar (fixed at top, never scrolls) ───── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/25">
            {panelLabel}
          </h2>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="
              flex h-7 w-7 items-center justify-center rounded-lg
              text-fg/40 transition-colors duration-150
              hover:bg-surface-hover hover:text-fg/70
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active
            "
            aria-label="Close detail panel"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable content area ────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {resolvedData?.type === 'session' && (
            <SessionContent
              session={resolvedData.session}
              onViewInList={handleViewInList}
            />
          )}

          {resolvedData?.type === 'agent' && (
            <AgentContent
              agent={resolvedData.agent}
              parentSession={resolvedData.session}
              onNavigateToSession={handleViewInList}
            />
          )}

          {displayedNodeId && !resolvedData && (
            <NotFoundContent />
          )}
        </div>
      </aside>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
 *  SESSION CONTENT
 *  ─────────────────────────────────────────────────────────────
 *  Full session deep-dive: name, status, intent, timing,
 *  git context, agent quick-stats, and a "view in list" action.
 * ══════════════════════════════════════════════════════════════ */

interface SessionContentProps {
  session: SessionSummary;
  onViewInList: (sessionId: string) => void;
}

function SessionContent({ session, onViewInList }: SessionContentProps) {
  const totalAgents = session.agentCount;
  const hasRootAgent = 'rootAgent' in session && (session as Session).rootAgent != null;
  const agentCounts = hasRootAgent
    ? countAgentsByStatus((session as Session).rootAgent)
    : null;
  const hasGitContext = !!(session.cwd || session.repository || session.branch);

  return (
    <div className="space-y-5 p-4">
      {/* ── Header ─────────────────────────────────────── */}
      <section className="space-y-3">
        {/* Name + badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg font-semibold leading-tight text-fg/95">
            {session.name}
          </h3>
          <StatusBadge status={session.status} size="sm" />
        </div>

        {/* Session ID — click-to-select for copying */}
        <p className="font-mono text-[11px] leading-none text-fg/30 select-all">
          {session.id}
        </p>

        {/* Intent — full text, accent border */}
        <div className="rounded-lg border-l-2 border-border-active bg-surface-tertiary px-3.5 py-3">
          <p className="text-sm leading-relaxed text-fg/70">
            {session.intent}
          </p>
        </div>
      </section>

      {/* ── Timing metadata ────────────────────────────── */}
      <section className="space-y-1.5">
        <SectionHeading>Timing</SectionHeading>
        <div className="space-y-1 font-mono text-xs tabular-nums text-fg/35">
          <div className="flex items-center justify-between">
            <span>Started</span>
            <span className="text-fg/50">
              {formatRelativeTime(session.startedAt)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last active</span>
            <span className="text-fg/50">
              {formatRelativeTime(session.lastActivityAt)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Duration</span>
            <span className="text-fg/50">
              {formatDuration(
                session.startedAt,
                session.status === 'completed'
                  ? session.lastActivityAt
                  : undefined,
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── Git context ────────────────────────────────── */}
      {hasGitContext && (
        <section className="space-y-1.5">
          <SectionHeading>Git Context</SectionHeading>
          <div className="space-y-2 rounded-lg border border-border-default bg-surface-tertiary px-3.5 py-3">
            {session.repository && (
              <div className="flex min-w-0 items-center gap-1.5">
                <GitRepoIcon />
                <span className="shrink-0 text-xs text-fg/30">Repo</span>
                <span
                  className="truncate font-mono text-xs text-fg/50"
                  title={session.repository}
                >
                  {session.repository}
                </span>
              </div>
            )}
            {session.branch && (
              <div className="flex min-w-0 items-center gap-1.5">
                <GitBranchIcon />
                <span className="shrink-0 text-xs text-fg/30">Branch</span>
                <span className="font-mono text-xs text-fg/50">
                  {session.branch}
                </span>
              </div>
            )}
            {session.cwd && (
              <div className="flex min-w-0 items-center gap-1.5">
                <FolderIcon />
                <span className="shrink-0 text-xs text-fg/30">Dir</span>
                <span
                  className="truncate font-mono text-xs text-fg/50"
                  title={session.cwd}
                >
                  {session.cwd}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Agent quick-stats ──────────────────────────── */}
      <section className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <SectionHeading>Agents</SectionHeading>
          <span className="font-mono text-[11px] tabular-nums text-fg/20">
            {totalAgents} total
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {agentCounts ? (
            <>
              <StatCard status="running"   label="Running"   count={agentCounts.running} />
              <StatCard status="blocked"   label="Blocked"   count={agentCounts.blocked} />
              <StatCard status="waiting"   label="Waiting"   count={agentCounts.waiting} />
              <StatCard status="completed" label="Completed" count={agentCounts.completed} />
            </>
          ) : (
            <span className="col-span-2 text-xs text-fg/30 italic">
              Select session for agent breakdown
            </span>
          )}
        </div>
      </section>

      {/* ── Blocked / Waiting banners ─────────────────── */}
      {session.status === 'blocked' && session.blockedReason && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-red-400"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 1.5 L14.5 13 H1.5 Z" />
            <line x1="8" y1="6" x2="8" y2="9" />
            <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none" />
          </svg>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-wider text-red-400/70">
              Blocked
            </p>
            <p className="text-sm leading-relaxed text-red-300/90">
              {session.blockedReason}
            </p>
          </div>
        </div>
      )}

      {session.status === 'waiting' && session.waitingFor && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-amber-400"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" />
            <line x1="8" y1="7.5" x2="8" y2="11" />
            <circle cx="8" cy="5.5" r="0.5" fill="currentColor" stroke="none" />
          </svg>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400/70">
              Waiting for
            </p>
            <p className="text-sm leading-relaxed text-amber-300/90">
              {session.waitingFor}
            </p>
          </div>
        </div>
      )}

      {/* ── Action: view in list ──────────────────────── */}
      <section>
        <button
          type="button"
          onClick={() => onViewInList(session.id)}
          className="
            flex w-full items-center justify-center gap-2
            rounded-lg border border-border-active/40
            bg-border-active/10 px-4 py-2.5
            text-sm font-medium text-fg/70
            transition-colors duration-150
            hover:bg-border-active/20 hover:text-fg/90
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active
          "
        >
          View in List
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 *  AGENT CONTENT
 *  ─────────────────────────────────────────────────────────────
 *  Agent deep-dive: name, status, task description, duration,
 *  arguments panel (matching AgentNode expand), parent session.
 * ══════════════════════════════════════════════════════════════ */

interface AgentContentProps {
  agent: SubAgent;
  parentSession: Session;
  onNavigateToSession: (sessionId: string) => void;
}

function AgentContent({
  agent,
  parentSession,
  onNavigateToSession,
}: AgentContentProps) {
  const hasArguments =
    !!agent.arguments && Object.keys(agent.arguments).length > 0;

  /* Gather extra argument keys not covered by KNOWN_FIELDS */
  const extraFields: { key: string; value: unknown }[] = [];
  if (agent.arguments) {
    for (const [k, v] of Object.entries(agent.arguments)) {
      if (!KNOWN_KEYS.has(k) && v != null) {
        extraFields.push({ key: k, value: v });
      }
    }
  }

  return (
    <div className="space-y-5 p-4">
      {/* ── Header ─────────────────────────────────────── */}
      <section className="space-y-3">
        {/* Name (mono) + badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-mono text-lg font-semibold leading-tight text-fg/95">
            {agent.name}
          </h3>
          <StatusBadge status={agent.status} size="sm" />
        </div>

        {/* Agent ID */}
        <p className="font-mono text-[11px] leading-none text-fg/30 select-all">
          {agent.id}
        </p>

        {/* Task — full text, accent border */}
        <div className="rounded-lg border-l-2 border-border-active bg-surface-tertiary px-3.5 py-3">
          <p className="text-sm leading-relaxed text-fg/70">
            {agent.task}
          </p>
        </div>
      </section>

      {/* ── Timing ─────────────────────────────────────── */}
      <section className="space-y-1.5">
        <SectionHeading>Timing</SectionHeading>
        <div className="space-y-1 font-mono text-xs tabular-nums text-fg/35">
          <div className="flex items-center justify-between">
            <span>Started</span>
            <span className="text-fg/50">
              {formatRelativeTime(agent.startedAt)}
            </span>
          </div>
          {agent.completedAt && (
            <div className="flex items-center justify-between">
              <span>Completed</span>
              <span className="text-fg/50">
                {formatRelativeTime(agent.completedAt)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Duration</span>
            <span className="text-fg/50">
              {formatDuration(agent.startedAt, agent.completedAt)}
            </span>
          </div>
        </div>
      </section>

      {/* ── Arguments panel ────────────────────────────── */}
      {hasArguments && (
        <section className="space-y-1.5">
          <SectionHeading>Arguments</SectionHeading>
          <div className="rounded-lg border border-border-default bg-surface-tertiary p-3 text-xs">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              {/* Known fields in deliberate display order */}
              {KNOWN_FIELDS.map(({ key, label }) => {
                const val =
                  agent.arguments?.[key as keyof typeof agent.arguments];
                if (val == null || val === '') return null;
                return (
                  <div key={key} className="col-span-2 grid grid-cols-subgrid">
                    <dt className="font-mono text-fg/30">{label}</dt>
                    <dd className="text-fg/70">{String(val)}</dd>
                  </div>
                );
              })}

              {/* Extra / unknown fields */}
              {extraFields.map(({ key, value }) => (
                <div key={key} className="col-span-2 grid grid-cols-subgrid">
                  <dt className="font-mono text-fg/30">{key}</dt>
                  <dd className="break-words text-fg/70">
                    {typeof value === 'object'
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </dd>
                </div>
              ))}

              {/* Full prompt — wider scrollable block */}
              {agent.arguments?.prompt && (
                <div className="col-span-2 mt-1">
                  <dt className="mb-1 font-mono text-fg/30">Prompt</dt>
                  <dd className="max-h-64 overflow-y-auto rounded bg-surface-primary p-2 font-mono text-fg/60 whitespace-pre-wrap leading-relaxed">
                    {agent.arguments.prompt}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </section>
      )}

      {/* ── Parent session link ────────────────────────── */}
      <section className="space-y-1.5">
        <SectionHeading>Parent Session</SectionHeading>
        <button
          type="button"
          onClick={() => onNavigateToSession(parentSession.id)}
          className="
            group/link flex w-full items-center gap-3
            rounded-lg border border-border-default bg-surface-tertiary
            px-3.5 py-3 text-left
            transition-colors duration-150
            hover:border-border-active/50 hover:bg-surface-hover
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active
          "
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg/80 group-hover/link:text-fg/95">
              {parentSession.name}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-fg/30">
              {parentSession.id}
            </p>
          </div>
          <StatusBadge status={parentSession.status} size="sm" />
          <svg
            className="h-4 w-4 shrink-0 text-fg/20 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover/link:text-fg/50"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
        </button>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 *  SHARED PIECES
 * ══════════════════════════════════════════════════════════════ */

/** Consistent uppercase section heading — matches the dashboard
 *  convention used in SessionDetail and elsewhere. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/25">
      {children}
    </h4>
  );
}

/** Fallback when a parsed nodeId cannot be resolved to any
 *  session or agent — covers stale references from animations
 *  or data refresh races. */
function NotFoundContent() {
  return (
    <div className="flex h-full items-center justify-center p-6 select-none">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-tertiary/60">
          <svg
            className="h-6 w-6 text-fg/15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M9 9l4 4M13 9l-4 4" />
          </svg>
        </div>
        <p className="text-sm text-fg/40">Node not found</p>
        <p className="max-w-[240px] text-xs leading-relaxed text-fg/20">
          This node may have been removed during a data refresh. Try
          clicking another node.
        </p>
      </div>
    </div>
  );
}
