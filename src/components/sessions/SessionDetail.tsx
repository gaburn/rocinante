import { useState } from 'react';
import { useSettingsContext } from '../../context/SettingsContext';
import { useSessionSelection, useSessionActions, useSessionData } from '../../context/SessionContext';
import { useTerminalContext } from '../../context/TerminalContext';
import type { SubAgent, AgentStatus, ErrorDetail } from '../../types';
import {
  formatRelativeTime,
  formatDuration,
  countAgents,
} from '../../utils/formatters';
import {
  getStatusDotClass,
  getStatusTextClass,
} from '../../utils/statusColors';
import { renderInlineMarkdown } from '../../utils/inlineMarkdown';
import StatusBadge from '../common/StatusBadge';
import SourceBadge from '../common/SourceBadge';
import SquadBadge from '../common/SquadBadge';
import SquadCastList from './SquadCastList';
import WorkstreamAutocomplete from '../common/WorkstreamAutocomplete';
import SubagentTree from '../agents/SubagentTree';
import WaterfallChart from '../waterfall/WaterfallChart';
import EventTimeline from '../timeline/EventTimeline';
import PlanViewer from './PlanViewer';

/* ────────────────────────────────────────────────────────────────────
 *  SessionDetail — right-panel deep-dive for the selected session
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  Session name                              [● Status Badge] │
 *  │  sess_abc123def456                                          │
 *  │                                                             │
 *  │  ▌ Implement dark-mode theming across the entire React      │
 *  │  ▌ application using CSS custom properties…                 │
 *  │                                                             │
 *  │  Started 5m ago  ·  Active just now  ·  Duration: 5m 12s   │
 *  │                                                             │
 *  │  ┏━ ⚠ Blocked ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
 *  │  ┃  Waiting for user approval on PR #432                 ┃  │
 *  │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
 *  │                                                             │
 *  │  AGENTS — 12 total                                          │
 *  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
 *  │  │  5   │ │  2   │ │  1   │ │  4   │                       │
 *  │  │ Run  │ │Block │ │Wait  │ │ Done │                       │
 *  │  └──────┘ └──────┘ └──────┘ └──────┘                       │
 *  │                                                             │
 *  │  AGENT HIERARCHY                                            │
 *  │  ┌──────────────────────────────────────────────────────┐   │
 *  │  │  orchestrator ● Running — "Coordinating…"    5m 12s │   │
 *  │  │    ├── explore ● Done   — "Searching…"       2m 3s  │   │
 *  │  │    ├── coder   ● Running— "Implementing…"    3m 1s  │   │
 *  │  │    │   └── task ● Done  — "Installing…"      < 1m   │   │
 *  │  │    └── designer ● Wait  — "Creating…"        1m 22s │   │
 *  │  └──────────────────────────────────────────────────────┘   │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  Empty state — when no session is selected, a centred welcome
 *  prompt invites the user to pick one from the sidebar list.
 * ──────────────────────────────────────────────────────────────── */

/* ── Helpers ──────────────────────────────────────────────────── */

/** Recursively tallies every agent in the tree by its status. */
function countAgentsByStatus(agent: SubAgent): Record<AgentStatus, number> {
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

/* ── Inline SVG micro-icons ───────────────────────────────────
 *  Kept file-local — these are single-use decorative elements. */

/** Two-panel layout — communicates "select to fill this space." */
function PanelLayoutIcon() {
  return (
    <svg
      className="h-8 w-8 text-fg/15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="9" y1="3" x2="9" y2="21" />
      {/* List-item indicators in the left panel */}
      <line x1="5" y1="8" x2="7.5" y2="8" />
      <line x1="5" y1="12" x2="7.5" y2="12" />
      <line x1="5" y1="16" x2="7.5" y2="16" />
    </svg>
  );
}

/** Alert triangle — blocked-status banner. */
function WarningTriangleIcon() {
  return (
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
  );
}

/** Info circle — waiting-status banner. */
function InfoCircleIcon() {
  return (
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
  );
}

/** Git repository icon — small book/repo glyph. */
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

/** Git branch icon — forking path. */
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

/** Chat bubble icon — session updates. */
function ChatBubbleIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-fuchsia-400/60"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V9.5C14 10.33 13.33 11 12.5 11H9L6 14V11H3.5C2.67 11 2 10.33 2 9.5Z" />
      <line x1="5" y1="5.5" x2="11" y2="5.5" />
      <line x1="5" y1="8" x2="9" y2="8" />
    </svg>
  );
}

/** Folder icon — working directory. */
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
 *  A compact, color-coded tile for a single agent-status count.
 *  Zero-count cards are dimmed so attention stays on what matters. */

interface StatCardProps {
  status: AgentStatus;
  label: string;
  count: number;
}

function StatCard({ status, label, count }: StatCardProps) {
  return (
    <div
      className={`
        rounded-lg bg-surface-secondary px-3 py-2
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

function ExpandablePrompt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;

  return (
    <div className="rounded-lg border-l-2 border-border-active bg-surface-secondary px-3.5 py-3">
      <p
        className={`text-sm leading-relaxed text-fg/70 whitespace-pre-wrap ${
          !expanded && isLong ? 'line-clamp-3' : ''
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[11px] font-mono text-border-active hover:text-fg/60 transition-colors cursor-pointer"
        >
          {expanded ? '▲ Collapse' : '▼ Show more…'}
        </button>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────── */

export default function SessionDetail() {
  const {
    selectedSession,
  } = useSessionSelection();
  const {
    isArchived,
    toggleArchive,
    archiveAndSelectNext,
    getWorkstream,
    setWorkstream,
    removeWorkstream,
    getCustomName,
    setSessionName,
    removeSessionName,
  } = useSessionActions();
  const {
    autoArchive,
    getWorkstreamNames,
  } = useSessionData();
  const { settings } = useSettingsContext();
  const { openSessionTerminal, openShellTerminal, hasTab, canOpenTab } = useTerminalContext();
  const panes = settings.display.paneVisibility;
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [agentHierarchyExpanded, setAgentHierarchyExpanded] = useState(false);

  /* ── Empty state ────────────────────────────────────────────
   *  Centred welcome screen — feels intentional, not broken.
   *  The panel-layout icon hints at the master–detail pattern. */
  if (!selectedSession) {
    return (
      <div className="flex h-full items-center justify-center p-6 select-none">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary/60">
            <PanelLayoutIcon />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-fg/40">
              Select a session to view details
            </p>
            <p className="max-w-[280px] text-xs leading-relaxed text-fg/20">
              Choose a session from the list to inspect its agents, progress, and
              activity.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Derived data ── */
  const session = selectedSession;
  const totalAgents = countAgents(session.rootAgent);
  const agentCounts = countAgentsByStatus(session.rootAgent);
  const hasGitContext = !!(session.cwd || session.repository || session.branch);
  const hasCustomName = getCustomName(session.id) !== null;

  const enterNameEditMode = () => {
    setEditNameValue(session.name);
    setIsEditingName(true);
  };

  const cancelNameEdit = () => {
    setIsEditingName(false);
    setEditNameValue('');
  };

  const commitNameEdit = () => {
    const trimmedValue = editNameValue.trim();
    if (!trimmedValue) {
      cancelNameEdit();
      return;
    }

    if (trimmedValue !== session.name) {
      setSessionName(session.id, trimmedValue);
    }

    cancelNameEdit();
  };

  /* ── Populated state ── */
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-5">

        {/* ── 1 · Header section ─────────────────────────── */}
        <section className="space-y-3">
          {/* Name + terminal action + status badge */}
          <div className="space-y-2">
            <div className="group">
              {isEditingName ? (
                <input
                  value={editNameValue}
                  onChange={(event) => setEditNameValue(event.target.value)}
                  onBlur={commitNameEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitNameEdit();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelNameEdit();
                    }
                  }}
                  autoFocus
                  className="w-full bg-transparent border-b border-border-active text-fg/90 font-semibold text-lg font-mono outline-none"
                  aria-label="Edit session name"
                />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    className="cursor-text text-xl font-semibold leading-tight text-fg/95"
                    onClick={enterNameEditMode}
                    title="Click to rename session"
                  >
                    {session.name}
                  </h2>
                  <StatusBadge status={session.status} size="md" />
                  <SourceBadge source={session.source} />
                  <SquadBadge isSquadSession={session.isSquadSession} />
                  <button
                    type="button"
                    onClick={enterNameEditMode}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-fg/45 hover:text-fg/75"
                    title="Rename session"
                    aria-label="Rename session"
                  >
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
                      <path d="M11.5 2.5L13.5 4.5L6 12H4V10L11.5 2.5Z" />
                      <path d="M9.5 4.5L11.5 6.5" />
                    </svg>
                  </button>
                  {hasCustomName && (
                    <button
                      type="button"
                      onClick={() => removeSessionName(session.id)}
                      className="text-xs text-fg/45 underline underline-offset-2 transition-colors hover:text-fg/75"
                      title="Reset to original session name"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const isResumeOpen = hasTab(session.id);
                const shellTabId = `shell-${session.id}`;
                const isShellOpen = hasTab(shellTabId);
                const isResumeDisabled = !isResumeOpen && !canOpenTab(session.id);
                const isShellDisabled = !isShellOpen && !canOpenTab(shellTabId);
                return (
                  <div className="hidden md:inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openSessionTerminal(session)}
                      disabled={isResumeDisabled}
                      title={
                        isResumeDisabled
                          ? 'Maximum 5 terminal tabs open'
                          : isResumeOpen
                            ? 'Focus resumed terminal session'
                            : 'Open resumed terminal for this session'
                      }
                      className={`
                        inline-flex items-center gap-1.5
                        px-2.5 py-1 rounded-md text-xs font-mono
                        transition-colors
                        ${
                          isResumeOpen
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : isResumeDisabled
                              ? 'bg-surface-tertiary text-fg/50 opacity-40 cursor-not-allowed'
                              : 'bg-surface-tertiary text-fg/50 hover:bg-surface-hover hover:text-fg/80'
                        }
                      `}
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 5.5 L7.5 8.5 L4 11.5" />
                        <line x1="9" y1="12" x2="12" y2="12" />
                      </svg>
                      {isResumeOpen ? 'Resume \u25CF' : 'Resume'}
                    </button>

                    <button
                      type="button"
                      onClick={() => openShellTerminal(session)}
                      disabled={isShellDisabled}
                      title={
                        isShellDisabled
                          ? 'Maximum 5 terminal tabs open'
                          : isShellOpen
                            ? 'Focus plain shell terminal'
                            : 'Open plain shell terminal in this session folder'
                      }
                      className={`
                        inline-flex items-center gap-1.5
                        px-2.5 py-1 rounded-md text-xs font-mono
                        transition-colors
                        ${
                          isShellOpen
                            ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                            : isShellDisabled
                              ? 'bg-surface-tertiary text-fg/40 opacity-40 cursor-not-allowed'
                              : 'bg-surface-secondary text-fg/40 hover:bg-surface-tertiary hover:text-fg/70 border border-border-default'
                        }
                      `}
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 5.5 L7.5 8.5 L4 11.5" />
                        <line x1="9" y1="12" x2="12" y2="12" />
                      </svg>
                      {isShellOpen ? 'Shell \u25CF' : 'Shell'}
                    </button>

                    {/* Archive / Unarchive toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        isArchived(session.id)
                          ? toggleArchive(session.id)
                          : archiveAndSelectNext(session.id)
                      }
                      title={isArchived(session.id) ? 'Unarchive this session' : 'Archive this session'}
                      className={`
                        inline-flex items-center gap-1.5
                        px-2.5 py-1 rounded-md text-xs font-mono
                        transition-colors
                        ${
                          isArchived(session.id)
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-surface-tertiary text-fg/50 hover:bg-surface-hover hover:text-fg/80'
                        }
                      `}
                    >
                      {isArchived(session.id) ? (
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M5 5L2.5 8L5 11" />
                          <path d="M2.5 8H10C11.5 8 13 6.5 13 5C13 3.5 11.5 2 10 2H7.5" />
                        </svg>
                      ) : (
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 8L6.5 11.5L13 4.5" />
                        </svg>
                      )}
                      {isArchived(session.id) ? 'Unarchive' : 'Archive'}
                    </button>

                    {/* Auto-archive sessions like this */}
                    <button
                      type="button"
                      onClick={() => {
                        const pattern = session.name.slice(0, 60).trim();
                        if (pattern) autoArchive.addRule(pattern);
                      }}
                      title="Create an auto-archive rule for sessions with this name"
                      className="
                        inline-flex items-center gap-1.5
                        px-2.5 py-1 rounded-md text-xs font-mono
                        bg-surface-tertiary text-fg/50
                        hover:bg-surface-hover hover:text-fg/80
                        transition-colors
                      "
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="1.5" y="2" width="13" height="4" rx="0.5" />
                        <path d="M1.5 6v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V6" />
                        <path d="M6.5 9h3" />
                        <circle cx="13" cy="3" r="2.5" fill="currentColor" stroke="none" opacity="0.5" />
                      </svg>
                      Auto-archive
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Session ID — select-all for easy copying */}
          <p className="font-mono text-[11px] leading-none text-fg/30 select-all">
            {session.id}
          </p>

          {/* Repo path */}
          {session.cwd && (
            <p className="font-mono text-[11px] leading-none text-fg/25 select-all truncate" title={session.cwd}>
              📂 {session.cwd}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-fg/35">
            <span>Started {formatRelativeTime(session.startedAt)}</span>
            <span aria-hidden="true" className="text-fg/15">·</span>
            <span>Active {formatRelativeTime(session.lastActivityAt)}</span>
            <span aria-hidden="true" className="text-fg/15">·</span>
            <span>
              Duration:{' '}
              {formatDuration(
                session.startedAt,
                session.status === 'completed' ? session.lastActivityAt : undefined,
              )}
            </span>
            {session.compacted && (
              <>
                <span aria-hidden="true" className="text-fg/15">·</span>
                <span className="text-amber-400/70" title="Some earlier context may have been summarized">
                  ⚠️ Context compacted: {session.compactionCount ?? 1} {(session.compactionCount ?? 1) === 1 ? 'time' : 'times'}
                </span>
              </>
            )}
          </div>

          {/* Workstream assignment */}
          <div className="mt-1">
            <WorkstreamAutocomplete
              value={getWorkstream(session.id)}
              suggestions={getWorkstreamNames}
              onChange={(name) => setWorkstream(session.id, name)}
              onRemove={() => removeWorkstream(session.id)}
              size="md"
              placeholder="Assign workstream…"
            />
          </div>

          {/* Latest user message — truncated with expand option */}
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/25">
            Latest Prompt
          </h3>
          <ExpandablePrompt text={session.latestUserMessage || session.intent} />

          {/* ── Blocked banner (with expandable error details) ── */}
          {session.status === 'blocked' && session.blockedReason && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/25 bg-red-500/10 text-red-400"
            >
              <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                <WarningTriangleIcon />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-red-400/70">
                      Blocked
                    </p>
                    {session.errorDetails && session.errorDetails.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setErrorExpanded((v) => !v)}
                        className="shrink-0 text-[11px] text-red-400/60 transition-colors hover:text-red-400/90"
                      >
                        {errorExpanded ? 'Hide details \u25B2' : 'Show details \u25BC'}
                      </button>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-red-300/90">
                    {session.blockedReason}
                  </p>
                </div>
              </div>

              {/* ── Expanded error detail list ── */}
              {errorExpanded && session.errorDetails && session.errorDetails.length > 0 && (
                <div className="max-h-60 overflow-y-auto border-t border-red-500/15 px-3.5 py-2">
                  <ul className="space-y-1.5">
                    {session.errorDetails.map((err: ErrorDetail, i: number) => (
                      <li
                        key={`${err.timestamp}-${i}`}
                        className="rounded-md border border-red-500/10 bg-red-500/5 px-2.5 py-1.5"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-red-400/50">
                            {formatRelativeTime(err.timestamp)}
                          </span>
                          <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-red-400/70">
                            {err.eventType}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-red-300/70">
                          {err.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Waiting banner ─────────────────────────── */}
          {session.status === 'waiting' && (session.waitingFor || session.waitingQuestion) && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-amber-400 animate-glow-amber"
            >
              <InfoCircleIcon />
              <div className="min-w-0 space-y-0.5">
                {session.waitingQuestion ? (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-400/70">
                      Waiting for Input
                    </p>
                    <p className="text-sm leading-relaxed text-amber-300/90">
                      {renderInlineMarkdown(session.waitingQuestion)}
                    </p>
                    {session.waitingChoices && session.waitingChoices.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {session.waitingChoices.map((choice, i) => (
                          <span key={i} className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300/90">
                            {choice}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-400/70">
                      Waiting for
                    </p>
                    <p className="text-sm leading-relaxed text-amber-300/90">
                      {renderInlineMarkdown(session.waitingFor)}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Archived banner ─────────────────────────── */}
          {isArchived(session.id) && (
            <div className="bg-surface-tertiary border border-border-default rounded-lg px-3 py-2 text-xs text-fg/40">
              <div className="flex items-center justify-between gap-2">
                <span>📦 This session is archived</span>
                <button
                  type="button"
                  onClick={() => toggleArchive(session.id)}
                  className="text-fg/50 hover:text-fg/80 underline underline-offset-2 transition-colors"
                >
                  Unarchive
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── 1a · Squad cast ─────────────────────────────── */}
        {session.isSquadSession && session.squadCast && session.squadCast.length > 0 && (
          <section>
            <SquadCastList cast={session.squadCast} />
          </section>
        )}

        {/* ── 1b · Session Updates ────────────────────────── */}
        {session.assistantUpdates && session.assistantUpdates.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ChatBubbleIcon />
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/25">
                Session Updates
              </h3>
            </div>

            <div className="layout-scrollable max-h-64 overflow-y-auto rounded-lg bg-surface-secondary p-3 space-y-2">
              {[...session.assistantUpdates].reverse().map((update, i) => (
                <div
                  key={i}
                  className="rounded-md border-l-2 border-fuchsia-500/40 bg-fuchsia-500/5 px-3 py-2"
                >
                  <p className="text-sm leading-relaxed text-fg/70 whitespace-pre-wrap">{renderInlineMarkdown(update)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 1c · Git context ───────────────────────────── */}
        {panes.gitContext && session.repository && hasGitContext && (
          <section>
            <div className="rounded-lg border border-border-default bg-surface-secondary px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {session.repository && (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <GitRepoIcon />
                    <span className="text-xs text-fg/30">Repo</span>
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
                    <span className="text-xs text-fg/30">Branch</span>
                    <span className="font-mono text-xs text-fg/50">
                      {session.branch}
                    </span>
                  </div>
                )}
                {session.cwd && (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <FolderIcon />
                    <span className="text-xs text-fg/30">Dir</span>
                    <span
                      className="truncate font-mono text-xs text-fg/50"
                      title={session.cwd}
                    >
                      {session.cwd}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── 2 · Quick stats ────────────────────────────── */}
        {panes.quickStats && (
          <section className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/25">
                Agents
              </h3>
              <span className="font-mono text-[11px] tabular-nums text-fg/20">
                {totalAgents} total
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard status="running"   label="Running"   count={agentCounts.running} />
              <StatCard status="blocked"   label="Blocked"   count={agentCounts.blocked} />
              <StatCard status="waiting"   label="Waiting"   count={agentCounts.waiting} />
              <StatCard status="completed" label="Completed" count={agentCounts.completed} />
            </div>
          </section>
        )}

        {panes.sessionPlan && (
          <PlanViewer sessionId={session.id} />
        )}

        {/* ── 2b · Performance waterfall ────────────────── */}
        {panes.performanceWaterfall && session.rootAgent.children.length > 0 && (
          <section>
            <WaterfallChart rootAgent={session.rootAgent} sessionStartedAt={session.startedAt} />
          </section>
        )}

        {/* ── 3 · Agent hierarchy ────────────────────────── */}
        {panes.agentHierarchy && (
          <section>
            <div className="rounded-lg border border-border-default bg-surface-secondary">
              <button
                type="button"
                onClick={() => setAgentHierarchyExpanded(!agentHierarchyExpanded)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 pt-4 pb-3 text-left"
                aria-expanded={agentHierarchyExpanded}
              >
                <h2 className="font-mono text-sm font-semibold text-fg-heading">
                  Agent Hierarchy ({totalAgents})
                </h2>

                <span
                  className={`inline-block text-base text-fg/30 transition-transform duration-200 ${
                    agentHierarchyExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>

              {agentHierarchyExpanded && (
                <div className="px-4 pb-4">
                  <SubagentTree rootAgent={session.rootAgent} />
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── 4 · Event timeline ─────────────────────────── */}
        {panes.eventTimeline && session.events && session.events.length > 0 && (
          <section>
            <EventTimeline events={session.events} />
          </section>
        )}
      </div>
    </div>
  );
}
