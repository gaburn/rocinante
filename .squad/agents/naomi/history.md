# Naomi — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

### Kanban Tile Deliverable Badges — T7 (2026-04)
- **What:** Added inline deliverable badges to `SessionCard.tsx` showing ADO PR and work item counts when available.
- **Type changes:** Added `adoPrCount?: number` and `adoWorkItemCount?: number` to `SessionSummary` in `src/types/index.ts`.
- **Badge logic:** Conditional render — only when at least one count > 0. Handles PR-only, WI-only, and both cases with `·` separator. Pluralization handled inline.
- **Styling:** `text-[10px] font-mono text-fg/25` — very muted, consistent with existing meta row elements (time-ago, agent count).
- **Position:** In the meta row, between compaction indicator and the `ml-auto` source/agent section.
- **Memo:** Added `adoPrCount` and `adoWorkItemCount` to the memo comparator so tile re-renders when counts change.
- **Validation:** 233 tests passing, eslint clean, no new TS errors (pre-existing SessionList.tsx errors only).

### Hybrid Plan Completion— File + localStorage (2026-04-16)
- **Problem:** Amos extended `planReader.ts` to parse checkboxes/numbered lists/tables from plan files, surfacing `checked` and `checkedFromFile` on `PlanTask`. Frontend only knew about localStorage toggles.
- **Fix:** Updated `usePlanStatus.getProgress()` to accept an optional `allTasks` array; it now sums file-checked tasks (`checkedFromFile && checked`) plus localStorage-checked tasks, deduplicating via a `Set`. `PlanViewer.tsx` `Section` component reads `task.checkedFromFile` to decide: file-managed tasks render as `disabled` checkboxes (read-only, dimmed accent, ✦ indicator); non-file tasks keep the existing localStorage toggle. Progress counter passes `flattenTasks(sections)` into `getProgress()`.
- **Key design:** File is source of truth for `checkedFromFile` tasks — no UI toggle allowed. localStorage tasks are unaffected. No double-counting.
- **Validation:** 230 tests pass, no new TS errors from changed files.

### AbortController on Session Polling (Sprint 1 — H3) (2026-04-16)
- **Problem:** `loadSessions()` polls on an interval but didn't abort prior in-flight requests. During cold start (slow server), multiple requests queue and stale responses arrive out-of-order causing UI flicker.
- **Fix:** Added `loadSessionsAbortRef` (mirrors existing `searchAbortRef` pattern). Before each `loadSessions()` call, previous in-flight request is aborted via `AbortController.abort()`. Signal is passed to both `getSessions()` and `getSessionById()`. AbortErrors are silently ignored (a newer request has taken over). `finally` block only clears `isLoading` if the controller is still current — prevents premature loading-state reset when superseded. Unmount cleanup effect aborts any pending request.
- **Service layer:** Added optional `signal?: AbortSignal` parameter to `getSessions()` and `getSessionById()` in `sessionService.ts`, forwarded to `fetch()`.
- **Tests:** 7 new tests in `useSessionsAbort.test.ts` covering: signal passing, abort-on-re-call, abort-on-unmount, non-abort error propagation, fresh controller per call, rapid sequential calls (only last wins). All 195 tests pass. TypeScript clean.

### Plan Reader Format Extensions (2026-04)
- **Context:** Amos extended `server/services/planReader.ts` with 6 new plan format handlers. Backend now parses checkboxes, numbered lists, tables, nested bullets, code blocks (immune), and heading variants.
- **Type Changes:** `PlanTask` type now has `checked?: boolean` and `checkedFromFile?: boolean` fields. Distinguish file-sourced completion state from localStorage-driven state.
- **Upcoming Work:** Naomi needs to update session detail rendering to display these new fields. Tables will require layout adjustments. Checkboxes require click handlers tied to `checkedFromFile` flag.
- **Reference:** See `.squad/orchestration-log/2026-04-16T19-22-09Z-amos.md` for full format details.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through 2026-04-15 (pruneStaleIds corruption fix, archive sync race, context split + virtualization, bundle baseline, squad badge, multi-source settings, and more).

### Session Deliverables — T4+T5 (2026-04)
- **What:** Built frontend hook (`useSessionDeliverables`) and Deliverables section in `SessionDetail.tsx` for ADO pull requests and work items linked to a session's branch.
- **Hook:** `useSessionDeliverables(branch, isAdoConfigured)` — AbortController pattern matching `useAdoIntegration`. Calls `GET /api/ado/session-deliverables?branch=...`. Returns empty arrays when preconditions not met.
- **Service:** Added `getSessionDeliverables()` to `adoService.ts`, throws on non-ok (consistent with existing pattern).
- **Type:** Added `SessionDeliverables` interface to `src/types/ado.ts`.
- **UI:** Collapsible section between git context (1c) and quick stats (2) in SessionDetail. PR status badges (green active, amber draft, gray completed, red abandoned), work item state badges (same scheme as WorkstreamDetail). Loading spinner, error with retry, empty state.
- **ADO status check:** Small `useState`+`useEffect` in SessionDetail calls `getAdoStatus()` once on mount — same as `useAdoIntegration` line 64-78.
- **Styling helpers:** Duplicated badge functions as file-local (prefixed `deliverable*`) to avoid coupling to WorkstreamDetail. Extract to shared utils on 3rd consumer.
- **Validation:** 233 tests passing, eslint clean, no new TypeScript errors.

### Kanban Tile Deliverable Badges — T7 (2026-07)
- **What:** Added inline deliverable badges to `SessionCard.tsx` showing ADO PR and work item counts when available.
- **Type changes:** Added `adoPrCount?: number` and `adoWorkItemCount?: number` to `SessionSummary` in `src/types/index.ts`.
- **Badge logic:** Conditional render — only when at least one count > 0. Handles PR-only, WI-only, and both cases with `·` separator. Pluralization handled inline.
- **Styling:** `text-[10px] font-mono text-fg/25` — very muted, consistent with existing meta row elements (time-ago, agent count).
- **Position:** In the meta row, between compaction indicator and the `ml-auto` source/agent section.
- **Memo:** Added `adoPrCount` and `adoWorkItemCount` to the memo comparator so tile re-renders when counts change.
- **Validation:** 233 tests passing, eslint clean, no new TS errors.
