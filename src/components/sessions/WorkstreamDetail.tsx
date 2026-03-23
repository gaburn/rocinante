import { useState, useRef, useEffect, useCallback } from 'react';
import { useSessionContext } from '../../context/SessionContext';
import { useAdoIntegration } from '../../hooks/useAdoIntegration';
import type { Session, SessionStatus } from '../../types';
import type { AdoPullRequest } from '../../types/ado';
import {
  formatRelativeTime,
  countAgents,
} from '../../utils/formatters';
import {
  getStatusDotClass,
  getStatusTextClass,
} from '../../utils/statusColors';
import ConfirmDialog from '../common/ConfirmDialog';

/* ────────────────────────────────────────────────────────────────────
 *  WorkstreamDetail — right-panel detail page for a selected workstream
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  Workstream name  (editable)                                │
 *  │  12 sessions                                                │
 *  │  [Archive All]  [Delete Workstream]                         │
 *  │                                                             │
 *  │  NOTES                                                      │
 *  │  ┌──────────────────────────────────────────────────────┐   │
 *  │  │  Add notes about this workstream…                    │   │
 *  │  └──────────────────────────────────────────────────────┘   │
 *  │                                                             │
 *  │  OVERVIEW                                                   │
 *  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
 *  │  │  5   │ │  2   │ │  1   │ │  4   │                       │
 *  │  │Activ │ │Block │ │Wait  │ │ Done │                       │
 *  │  └──────┘ └──────┘ └──────┘ └──────┘                       │
 *  │  Total agents: 42  ·  Combined duration: 3h 22m             │
 *  │                                                             │
 *  │  SESSIONS                                                   │
 *  │  ● Session Alpha              2m ago   3 agents             │
 *  │  ● Session Beta               5m ago   7 agents             │
 *  │  ● Session Gamma             12m ago   1 agent              │
 *  │                                                             │
 *  │  DANGER ZONE                                                │
 *  │  [Delete Workstream]                                        │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  Empty state — when no workstream is selected, a centred prompt
 *  invites the user to pick one from the sidebar.
 * ──────────────────────────────────────────────────────────────── */

/* ── Constants ─────────────────────────────────────────────────── */

const NOTES_MAX_LENGTH = 500;
const NOTES_WARN_THRESHOLD = 400;

const STATUS_SORT_ORDER: Record<SessionStatus, number> = {
  active: 0,
  blocked: 1,
  waiting: 2,
  completed: 3,
};

/* ── Inline SVG micro-icons ────────────────────────────────────
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

/* ── Helpers ──────────────────────────────────────────────────── */

/** Count sessions by their SessionStatus. */
function countSessionsByStatus(sessions: Session[]): Record<SessionStatus, number> {
  const counts: Record<SessionStatus, number> = {
    active: 0,
    blocked: 0,
    waiting: 0,
    completed: 0,
  };

  for (const session of sessions) {
    counts[session.status]++;
  }

  return counts;
}

/** Sum all agents across every session in the workstream. */
function totalAgentsAcrossSessions(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + countAgents(s.rootAgent), 0);
}

/**
 * Compute the combined wall-clock duration of all sessions.
 * Returns a human-readable string like "3h 22m".
 */
function combinedDuration(sessions: Session[]): string {
  const MINUTE = 60;
  const HOUR = 60 * MINUTE;

  let totalSeconds = 0;

  for (const session of sessions) {
    const start = new Date(session.startedAt).getTime();
    if (Number.isNaN(start)) continue;

    const endIso =
      session.status === 'completed' ? session.lastActivityAt : undefined;
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    if (Number.isNaN(end)) continue;

    totalSeconds += Math.max(0, Math.floor(Math.abs(end - start) / 1000));
  }

  if (totalSeconds < MINUTE) return '< 1m';

  const hours = Math.floor(totalSeconds / HOUR);
  const minutes = Math.floor((totalSeconds % HOUR) / MINUTE);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

/** Sort sessions: active → blocked → waiting → completed. */
function sortedByStatus(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status],
  );
}

/* ── ADO styling helpers ──────────────────────────────────────
 *  Colour-code work-item states and PR statuses so the badges
 *  communicate intent at a glance — no legend required.         */

function workItemStateBadgeClasses(state: string): string {
  switch (state.toLowerCase()) {
    case 'active':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'new':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'resolved':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'closed':
      return 'bg-fg/[.08] text-fg/40 border-fg/[.12]';
    default:
      return 'bg-fg/[.08] text-fg/40 border-fg/[.12]';
  }
}

function prStatusBadgeClasses(status: AdoPullRequest['status']): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'draft':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'completed':
      return 'bg-fg/[.08] text-fg/40 border-fg/[.12]';
    case 'abandoned':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    default:
      return 'bg-fg/[.08] text-fg/40 border-fg/[.12]';
  }
}

/** Summarise a reviewer's vote as a single icon glyph. */
function voteIcon(vote: number): string {
  if (vote >= 5) return '✓';
  if (vote <= -5) return '✗';
  return '○';
}

function voteColorClass(vote: number): string {
  if (vote >= 5) return 'text-emerald-400';
  if (vote <= -5) return 'text-red-400';
  return 'text-fg/30';
}

/** Strip refs/heads/ prefix for display. */
function shortBranch(ref: string): string {
  return ref.replace(/^refs\/heads\//, '');
}

/* ── Stat card (quick-stats grid item) ────────────────────────
 *  Mirrors SessionDetail's StatCard — compact, color-coded tile.
 *  Zero-count cards are dimmed so attention stays on what matters. */

interface StatCardProps {
  status: SessionStatus;
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

/* ── Main component ──────────────────────────────────────────── */

export default function WorkstreamDetail() {
  const {
    selectedWorkstream,
    selectSession,
    renameWorkstream,
    deleteWorkstream,
    setWorkstreamDescription,
    removeWorkstreamDescription,
    archiveSession,
    isArchived,
  } = useSessionContext();

  /* ── Local state ── */
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveAllConfirm, setShowArchiveAllConfirm] = useState(false);
  const [isAddingWorkItem, setIsAddingWorkItem] = useState(false);
  const [addWorkItemValue, setAddWorkItemValue] = useState('');

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const addWorkItemInputRef = useRef<HTMLInputElement>(null);

  /* ── ADO integration ── */
  const ado = useAdoIntegration(
    selectedWorkstream?.name ?? null,
    selectedWorkstream?.sessions ?? [],
  );

  /* Sync notes textarea when the selected workstream changes. */
  const currentName = selectedWorkstream?.name ?? null;
  const currentDescription = selectedWorkstream?.description ?? '';
  useEffect(() => {
    setNotesValue(currentDescription);
  }, [currentName, currentDescription]);

  /* Reset editing state when workstream changes */
  useEffect(() => {
    setIsEditingName(false);
    setEditNameValue('');
    setIsAddingWorkItem(false);
    setAddWorkItemValue('');
  }, [currentName]);

  /* Auto-focus the work-item input when it appears */
  useEffect(() => {
    if (isAddingWorkItem) {
      addWorkItemInputRef.current?.focus();
    }
  }, [isAddingWorkItem]);

  /* ── Work-item add handler ── */
  const commitAddWorkItem = useCallback(() => {
    const parsed = parseInt(addWorkItemValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      ado.addWorkItemId(parsed);
    }
    setAddWorkItemValue('');
    setIsAddingWorkItem(false);
  }, [addWorkItemValue, ado]);

  /* ── Name editing handlers ── */
  const enterNameEditMode = useCallback(() => {
    if (!selectedWorkstream) return;
    setEditNameValue(selectedWorkstream.name);
    setIsEditingName(true);
  }, [selectedWorkstream]);

  const cancelNameEdit = useCallback(() => {
    setIsEditingName(false);
    setEditNameValue('');
  }, []);

  const commitNameEdit = useCallback(() => {
    if (!selectedWorkstream) {
      cancelNameEdit();
      return;
    }

    const trimmed = editNameValue.trim();
    if (!trimmed) {
      cancelNameEdit();
      return;
    }

    if (trimmed !== selectedWorkstream.name) {
      renameWorkstream(selectedWorkstream.name, trimmed);
    }

    cancelNameEdit();
  }, [selectedWorkstream, editNameValue, renameWorkstream, cancelNameEdit]);

  /* ── Notes commit on blur ── */
  const commitNotes = useCallback(() => {
    if (!selectedWorkstream) return;

    const trimmed = notesValue.trim();
    if (trimmed === '') {
      if (selectedWorkstream.description !== null) {
        removeWorkstreamDescription(selectedWorkstream.name);
      }
    } else if (trimmed !== (selectedWorkstream.description ?? '')) {
      setWorkstreamDescription(selectedWorkstream.name, trimmed);
    }
  }, [selectedWorkstream, notesValue, setWorkstreamDescription, removeWorkstreamDescription]);

  /* ── Empty state ────────────────────────────────────────────
   *  Centred welcome screen — matches SessionDetail's pattern.
   *  The panel-layout icon hints at the master–detail pattern. */
  if (!selectedWorkstream) {
    return (
      <div className="flex h-full items-center justify-center p-6 select-none">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary/60">
            <PanelLayoutIcon />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-fg/40">
              Select a workstream to view details
            </p>
            <p className="max-w-[280px] text-xs leading-relaxed text-fg/20">
              Choose a workstream from the list to see its sessions, notes, and
              aggregate progress.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Derived data ── */
  const { name, sessions } = selectedWorkstream;
  const sessionCount = sessions.length;
  const statusCounts = countSessionsByStatus(sessions);
  const totalAgents = totalAgentsAcrossSessions(sessions);
  const duration = combinedDuration(sessions);
  const sorted = sortedByStatus(sessions);
  const notesLength = notesValue.length;
  const showCounter = notesLength > NOTES_WARN_THRESHOLD;
  const unarchivedCount = sessions.filter((s) => !isArchived(s.id)).length;

  /* ── Populated state ── */
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-5">

        {/* ── 1 · Header section ─────────────────────────── */}
        <section className="space-y-3">
          {/* Workstream name — inline editable */}
          <div className="group min-w-0">
            {isEditingName ? (
              <input
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={commitNameEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNameEdit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelNameEdit();
                  }
                }}
                autoFocus
                className="w-full bg-transparent border-b border-border-active text-fg/90 font-semibold text-lg font-mono outline-none"
                aria-label="Edit workstream name"
              />
            ) : (
              <div className="flex items-center gap-2">
                <h2
                  className="min-w-0 cursor-text text-xl font-semibold leading-tight text-fg/95"
                  onClick={enterNameEditMode}
                  title="Click to rename workstream"
                >
                  {name}
                </h2>
                <button
                  type="button"
                  onClick={enterNameEditMode}
                  className="opacity-0 transition-opacity group-hover:opacity-100 text-fg/45 hover:text-fg/75"
                  title="Rename workstream"
                  aria-label="Rename workstream"
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
              </div>
            )}
          </div>

          {/* Subtitle */}
          <p className="font-mono text-xs tabular-nums text-fg/35">
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
          </p>

          {/* Quick action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArchiveAllConfirm(true)}
              disabled={unarchivedCount === 0}
              className={`
                inline-flex items-center gap-1.5
                px-2.5 py-1 rounded-md text-xs font-mono
                transition-colors
                ${
                  unarchivedCount === 0
                    ? 'bg-surface-tertiary text-fg/30 cursor-not-allowed'
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
                <path d="M3 8L6.5 11.5L13 4.5" />
              </svg>
              Archive All
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
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
                <path d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M5 4.5v8a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-8" />
              </svg>
              Delete Workstream
            </button>
          </div>
        </section>

        {/* ── 2 · Notes section ──────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/60">
            Notes
          </h3>

          <div className="relative">
            <textarea
              ref={notesRef}
              value={notesValue}
              onChange={(e) => {
                if (e.target.value.length <= NOTES_MAX_LENGTH) {
                  setNotesValue(e.target.value);
                }
              }}
              onBlur={commitNotes}
              placeholder="Add notes about this workstream…"
              rows={4}
              className="w-full resize-y text-xs font-mono text-fg/50 bg-surface-secondary border border-border-default rounded-lg px-3 py-2 outline-none focus:border-border-active transition-colors placeholder:text-fg/20"
              aria-label="Workstream notes"
              maxLength={NOTES_MAX_LENGTH}
            />
            {showCounter && (
              <p className="mt-1 text-right font-mono text-[11px] tabular-nums text-fg/50">
                {notesLength} / {NOTES_MAX_LENGTH}
              </p>
            )}
          </div>
        </section>

        {/* ── 2b · Work Items (ADO) ──────────────────────── */}
        {ado.isAdoConfigured && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/60">
                  Work Items
                </h3>
                {ado.workItems.length > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-surface-tertiary px-1.5 py-px font-mono text-[10px] tabular-nums text-fg/35">
                    {ado.workItems.length}
                  </span>
                )}
              </div>

              {!isAddingWorkItem && (
                <button
                  type="button"
                  onClick={() => setIsAddingWorkItem(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-0.5 font-mono text-[11px] text-fg/45 transition-colors hover:bg-surface-hover hover:text-fg/70"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <line x1="8" y1="3" x2="8" y2="13" />
                    <line x1="3" y1="8" x2="13" y2="8" />
                  </svg>
                  Add
                </button>
              )}
            </div>

            {/* Inline input for adding a work item ID */}
            {isAddingWorkItem && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-fg/50">#</span>
                <input
                  ref={addWorkItemInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={addWorkItemValue}
                  onChange={(e) => {
                    // Only allow digits
                    const v = e.target.value.replace(/\D/g, '');
                    setAddWorkItemValue(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitAddWorkItem();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setAddWorkItemValue('');
                      setIsAddingWorkItem(false);
                    }
                  }}
                  onBlur={commitAddWorkItem}
                  placeholder="Work item ID"
                  className="h-7 flex-1 rounded-md border border-border-active bg-surface-secondary px-2 font-mono text-xs text-fg/70 outline-none placeholder:text-fg/20"
                  aria-label="Work item ID to add"
                />
              </div>
            )}

            {/* Work items list */}
            <div className="rounded-lg border border-border-default bg-surface-secondary overflow-hidden">
              {ado.isLoadingWorkItems && ado.workItems.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-3">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-fg/10 border-t-fg/40" />
                  <span className="font-mono text-[11px] text-fg/50">Loading work items…</span>
                </div>
              )}

              {ado.workItemError && (
                <div className="flex items-start gap-2 px-3 py-2.5">
                  <svg
                    className="mt-px h-3.5 w-3.5 shrink-0 text-red-400"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="6" />
                    <line x1="8" y1="5" x2="8" y2="8.5" />
                    <circle cx="8" cy="11" r="0.5" fill="currentColor" />
                  </svg>
                  <span className="text-xs text-red-400">{ado.workItemError}</span>
                </div>
              )}

              {!ado.isLoadingWorkItems && !ado.workItemError && ado.workItemIds.length > 0 && ado.workItems.length === 0 && (
                <p className="px-3 py-3 font-mono text-[11px] text-fg/50">
                  No work items linked
                </p>
              )}

              {ado.workItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/wi flex w-full items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-hover"
                >
                  {/* ID */}
                  <span className="shrink-0 font-mono text-xs tabular-nums text-fg/45">
                    #{item.id}
                  </span>

                  {/* Title — truncated */}
                  <span className="min-w-0 flex-1 truncate text-sm text-fg/70">
                    {item.title}
                  </span>

                  {/* State badge */}
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-px font-mono text-[10px] font-medium leading-snug ${workItemStateBadgeClasses(item.state)}`}
                  >
                    {item.state}
                  </span>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      ado.removeWorkItemId(item.id);
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg/20 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover/wi:opacity-100"
                    aria-label={`Remove work item ${item.id}`}
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <line x1="4" y1="4" x2="12" y2="12" />
                      <line x1="12" y1="4" x2="4" y2="12" />
                    </svg>
                  </button>
                </a>
              ))}

              {/* Subtle loading overlay when refreshing with existing items */}
              {ado.isLoadingWorkItems && ado.workItems.length > 0 && (
                <div className="flex items-center gap-2 border-t border-border-default px-3 py-1.5">
                  <div className="h-2.5 w-2.5 animate-spin rounded-full border border-fg/10 border-t-fg/30" />
                  <span className="font-mono text-[10px] text-fg/50">Refreshing…</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── 2c · Pull Requests (ADO) ───────────────────── */}
        {ado.isAdoConfigured && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/60">
                Pull Requests
              </h3>
              {ado.pullRequests.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-surface-tertiary px-1.5 py-px font-mono text-[10px] tabular-nums text-fg/35">
                  {ado.pullRequests.length}
                </span>
              )}
            </div>

            <p className="font-mono text-[10px] text-fg/50">
              Auto-detected from session branches
            </p>

            <div className="rounded-lg border border-border-default bg-surface-secondary overflow-hidden">
              {ado.isLoadingPRs && ado.pullRequests.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-3">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-fg/10 border-t-fg/40" />
                  <span className="font-mono text-[11px] text-fg/50">Loading pull requests…</span>
                </div>
              )}

              {ado.prError && (
                <div className="flex items-start gap-2 px-3 py-2.5">
                  <svg
                    className="mt-px h-3.5 w-3.5 shrink-0 text-red-400"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="6" />
                    <line x1="8" y1="5" x2="8" y2="8.5" />
                    <circle cx="8" cy="11" r="0.5" fill="currentColor" />
                  </svg>
                  <span className="text-xs text-red-400">{ado.prError}</span>
                </div>
              )}

              {!ado.isLoadingPRs && !ado.prError && ado.pullRequests.length === 0 && (
                <p className="px-3 py-3 font-mono text-[11px] text-fg/50">
                  No pull requests found
                </p>
              )}

              {ado.pullRequests.map((pr) => (
                <a
                  key={pr.id}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/pr block w-full px-3 py-2 transition-colors hover:bg-surface-hover"
                >
                  {/* Top row: ID + title + status + reviewers */}
                  <div className="flex items-center gap-3">
                    {/* PR ID */}
                    <span className="shrink-0 font-mono text-xs tabular-nums text-fg/45">
                      PR #{pr.id}
                    </span>

                    {/* Title — truncated */}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg/70">
                      {pr.title}
                    </span>

                    {/* Status badge */}
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-px font-mono text-[10px] font-medium capitalize leading-snug ${prStatusBadgeClasses(pr.status)}`}
                    >
                      {pr.status}
                    </span>

                    {/* Reviewer summary */}
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-fg/50">
                      {pr.reviewers.length > 0 ? (
                        <>
                          <span className="tabular-nums">{pr.reviewers.length}</span>
                          <span className="flex gap-px">
                            {pr.reviewers.map((r, i) => (
                              <span key={i} className={voteColorClass(r.vote)} title={`${r.displayName}: ${voteIcon(r.vote)}`}>
                                {voteIcon(r.vote)}
                              </span>
                            ))}
                          </span>
                        </>
                      ) : (
                        <span>0 reviewers</span>
                      )}
                    </span>
                  </div>

                  {/* Bottom row: branch info */}
                  <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-fg/50">
                    <span className="max-w-[120px] truncate">{shortBranch(pr.sourceBranch)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="max-w-[120px] truncate">{shortBranch(pr.targetBranch)}</span>
                  </div>
                </a>
              ))}

              {/* Subtle loading overlay when refreshing with existing items */}
              {ado.isLoadingPRs && ado.pullRequests.length > 0 && (
                <div className="flex items-center gap-2 border-t border-border-default px-3 py-1.5">
                  <div className="h-2.5 w-2.5 animate-spin rounded-full border border-fg/10 border-t-fg/30" />
                  <span className="font-mono text-[10px] text-fg/50">Refreshing…</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── 3 · Aggregate stats ────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/60">
            Overview
          </h3>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard status="active"    label="Active"    count={statusCounts.active} />
            <StatCard status="blocked"   label="Blocked"   count={statusCounts.blocked} />
            <StatCard status="waiting"   label="Waiting"   count={statusCounts.waiting} />
            <StatCard status="completed" label="Completed" count={statusCounts.completed} />
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-fg/35">
            <span>
              Total agents: {totalAgents}
            </span>
            <span aria-hidden="true" className="text-fg/15">·</span>
            <span>
              Combined duration: {duration}
            </span>
          </div>
        </section>

        {/* ── 4 · Session list (compact) ─────────────────── */}
        {sorted.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/60">
              Sessions
            </h3>

            <div className="rounded-lg border border-border-default bg-surface-secondary overflow-hidden">
              {sorted.map((session) => {
                const agentCount = countAgents(session.rootAgent);
                const archived = isArchived(session.id);

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => selectSession(session.id)}
                    className={`
                      flex w-full items-center gap-3 px-3 py-2 text-left
                      hover:bg-surface-hover cursor-pointer transition-colors
                      ${archived ? 'opacity-50' : ''}
                    `}
                  >
                    {/* Status dot */}
                    <span
                      aria-hidden="true"
                      className={`size-1.5 shrink-0 rounded-full ${getStatusDotClass(session.status)}`}
                    />

                    {/* Session name — truncated */}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg/70">
                      {session.name}
                    </span>

                    {/* Relative time */}
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg/50">
                      {formatRelativeTime(session.lastActivityAt)}
                    </span>

                    {/* Agent count */}
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg/50">
                      {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 5 · Danger zone ────────────────────────────── */}
        <section className="space-y-2 border-t border-border-default pt-5">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-red-400/50">
            Danger Zone
          </h3>

          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg/70">
                  Delete this workstream
                </p>
                <p className="mt-0.5 text-xs text-fg/35">
                  Ungroups all {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}. Sessions will not be deleted.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors"
              >
                Delete Workstream
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ── Confirmation dialogs ─────────────────────────── */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete workstream?"
        message={`This will ungroup all ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}. Sessions will not be deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          deleteWorkstream(name);
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showArchiveAllConfirm}
        title="Archive all sessions?"
        message={`This will archive ${unarchivedCount} ${unarchivedCount === 1 ? 'session' : 'sessions'} in "${name}".`}
        confirmLabel="Archive All"
        cancelLabel="Cancel"
        onConfirm={() => {
          for (const session of sessions) {
            if (!isArchived(session.id)) {
              archiveSession(session.id);
            }
          }
          setShowArchiveAllConfirm(false);
        }}
        onCancel={() => setShowArchiveAllConfirm(false)}
      />
    </div>
  );
}
