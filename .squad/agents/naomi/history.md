# Naomi — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

<!-- Append learnings below -->

### pruneStaleIds Archive Corruption Fix (2026-04-15)
- **Bug:** `loadSessions` called `pruneArchiveIds`, `pruneWorkstreamIds`, and `pruneNameIds` with `activeIds` from the server response on every poll. When `showArchived=false`, server excludes archived sessions, so `activeIds` was a PARTIAL list. All three prune functions removed entries not in `activeIds` — silently wiping the entire client-side archive (2092 IDs), all workstream assignments for archived sessions, and all custom names for archived sessions.
- **Symptom chain:** (1) Prune corrupts localStorage archive to empty on first poll. (2) Server archive unaffected (no POST). (3) On next page refresh, empty localStorage synced to server via initial `POST /api/sessions/archive`. (4) Server clears its archive. (5) `GET /api/sessions` returns ALL 2508 sessions. (6) User clicks Auto-group → 2508 sessions get workstream assignments → "archived sessions reappear."
- **Verified with Playwright:** Server had 2092 archived IDs but client localStorage had 0. Restored client archive from server, applied fix, reloaded page multiple times — archive preserved at 2092 across reloads. Auto-group correctly grouped only 417 active sessions into 36 workstreams.
- **Fix:** Gate all three prune calls behind `if (showArchived)` — prune only runs when we have the FULL session list and can distinguish deleted from archived. One-line conditional in `loadSessions`. 176 tests pass. TypeScript clean.

### Archive Sync Race + Auto-Group Filter Fix (2026-04-14)
- **Sync race:** On startup, `useArchive` POST and `useSessions` GET fired independently. If GET arrived first, server archive store was empty → all 1787 sessions returned unfiltered. Fix: added `syncComplete` flag to `useArchive` (resolves on success OR failure via `.finally()`). `useSessions` gates initial `loadSessions()` on `archiveSynced`, ensuring server has archive set before session fetch. 141 tests pass.
- **Auto-group filter:** `autoGroupByRepository()` was grouping `allSessions` (unfiltered) instead of filtered `sessions`. When `showArchived=false`, auto-group created ghost groups with archived sessions. Fix: pass filtered `sessions` array to auto-group function. Now grouped view consistent with flat view. 141 tests pass.

### Context Split + List Virtualization (2026-04)
- **Purpose:** Performance optimization — split monolithic SessionContext into 3 focused providers, memoize SessionCard, lazy-mount WorkstreamAutocomplete, virtualize SessionList.
- **Context split:** `SessionContext.tsx` now exports three contexts: `SessionDataContext` (session list, loading, filters, counts), `SessionSelectionContext` (selected session/workstream + select/clear), `SessionActionsContext` (stable callbacks — archive, workstream, filter setters). Each provider value is `useMemo`'d.
- **Hooks:** `useSessionData()`, `useSessionSelection()`, `useSessionActions()`. Deprecated compat `useSessionContext()` kept for safety.
- **Key win:** Clicking a session only re-renders `SessionSelectionContext` consumers. Polling only re-renders `SessionDataContext` consumers. Action functions are stable refs.
- **Consumer migration:** Updated 17 files from `useSessionContext` to focused hooks. Each component now subscribes only to the context slice it needs.
- **SessionCard memoization:** Wrapped in `React.memo` with custom comparator checking `session.id`, `lastActivityAt`, `status`, `name`, `latestUserMessage`, `isSelected`, `isArchived`, `workstream`, `workstreamNames`.
- **Lazy WorkstreamAutocomplete:** SessionCard no longer mounts `WorkstreamAutocomplete` on every card. Shows a simple inline pill/button, only mounts the full autocomplete on edit click. Added `autoFocus` and `onEditEnd` props to `WorkstreamAutocomplete`.
- **List virtualization:** Installed `@tanstack/react-virtual`. `SessionList` flat views use `useVirtualizer` with estimated 110px row height, `measureElement` for dynamic sizing, 5-row overscan, 10px gap. Grouped view left un-virtualized (nested collapse layout).
- **No new lint errors.** TypeScript clean. All 3 pre-existing server lint errors untouched.
- **Dependency added:** `@tanstack/react-virtual` (~3KB gzipped, zero transitive deps).

### Bundle Baseline Measurement Script (2026-04)
- **Purpose:** Performance optimization baseline — measures frontend bundle sizes before any optimization work begins.
- **Script:** `src/__benchmarks__/bundle-baseline.ts` — Node script using `tsx`. Shells out to `npx vite build`, scans `dist/` for JS/CSS assets, computes gzipped sizes via `zlib.gzipSync`, flags chunks over 100KB gzipped.
- **Output:** JSON report to `src/__benchmarks__/bundle-baseline-results.json` (gitignored) + human-readable table to stderr.
- **npm script:** `bench:build` added to package.json.
- **Baseline findings:** Main bundle `index.js` is 465KB raw / 126KB gzip (over 100KB threshold 🔴). xterm chunk is 340KB raw / 86KB gzip (under threshold). CSS is 73KB raw / 12KB gzip. Total: 861KB raw / 223KB gzip.
- **No dependencies added:** Uses only Node stdlib (`child_process`, `fs`, `path`, `zlib`).
- **Outcome:** Build (`tsc --noEmit`) and lint (`eslint`) both clean. Script runs successfully, results JSON generated.

### Context Split + List Virtualization (2026-04)
- **Problem:** Monolithic SessionContext caused re-render cascades. Any state change (poll, click, search) re-rendered every consumer. Un-virtualized session list rendering all cards (each mounting `WorkstreamAutocomplete`) caused measurable jank with 30+ sessions.
- **Solution - Context split:** `SessionContext.tsx` now exports three contexts: `SessionDataContext` (session list, loading, filters, counts), `SessionSelectionContext` (selected session/workstream + select/clear), `SessionActionsContext` (stable callbacks). Each provider value is `useMemo`'d.
- **Solution - Focused hooks:** `useSessionData()`, `useSessionSelection()`, `useSessionActions()`. Deprecated compat `useSessionContext()` kept. Component now subscribes only to context slices it needs.
- **Solution - SessionCard memoization:** Wrapped in `React.memo` with custom comparator checking session id, status, selection, workstream, etc. Prevents re-render when parent re-renders but card props unchanged.
- **Solution - Lazy WorkstreamAutocomplete:** SessionCard no longer mounts full autocomplete on every render. Shows simple inline pill/button; full autocomplete mounts only on edit click. Added `autoFocus`, `onEditEnd` props.
- **Solution - List virtualization:** Installed `@tanstack/react-virtual` (~3KB gzipped, zero transitive deps). Flat list views use `useVirtualizer` with 110px row height, `measureElement`, 5-row overscan, 10px gap. Grouped view left un-virtualized (nested collapse layout doesn't map well to flat virtualization; KanbanBoard is primary view).

---

## Sprint 1 Assignment: Rocinante Performance Plan (2026-04-16)

**Sprint 1 Task:** AbortController on session polling (0.5d). Prevent request pileup during cold start when `loadSessions()` loops. Cancel in-flight requests if a new poll is triggered before the previous completes.

**Sprint 1 owners:** Amos (body-parser fix, critical), Alex (Vite deps), Bobbie (verify).

**Full plan:** 3 sprints, target cold load <5s.
- **Impact:** Clicking session only re-renders SelectionContext consumers. Polling only re-renders DataContext consumers. Scrolling large lists no longer janky.
- **Files changed:** 17 consumer files migrated to focused hooks. `src/context/SessionContext.tsx` rewritten. SessionCard + SessionList updated. `@tanstack/react-virtual` added to package.json.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through early 2026-04 (Amber Glow, Horse Logo, Kanban Board, Column Reorder, Session Updates, Demo Workstreams, Conversation Search, Session ID Search, Question Mark Icon, TokenUtilization, Inline Markdown, Table Rendering).

### Source Badge + Source Filter (2026-04)
- **Purpose:** Visual differentiation and filtering of sessions by provider source (Copilot vs Claude), supporting the new multi-source provider abstraction.
- **SourceBadge component:** `src/components/common/SourceBadge.tsx` — small pill/chip with CSS classes. Copilot gets blue-teal accent, Claude gets orange-amber. Defaults to "Copilot" when `source` is undefined (backward compat).
- **CSS:** `.source-badge`, `.source-badge--copilot`, `.source-badge--claude` in `src/index.css`. Light-mode overrides via `.light` selector. Uses oklch colors matching the dashboard palette.
- **Badge placement:** KanbanTile (meta row, next to agent count), SessionCard (meta row, next to agent count), SessionDetail (header, next to StatusBadge).
- **Source filter:** `sourceFilter` state (`'copilot' | 'claude' | 'all'`) added to `useSessions` hook. Filters via `(s.source ?? 'copilot') === sourceFilter`. Wired through `SessionDataContext` (read) and `SessionActionsContext` (setter), following the existing context-split pattern.
- **Header dropdown:** Native `<select>` in Header.tsx between view-mode toggle and settings gear. Styled with existing surface/border tokens. Options: All Sources / Copilot / Claude.
- **SessionCard memo:** Added `session.source` to comparator to avoid stale badge renders.
- **No new dependencies.** TypeScript clean (`tsc --noEmit` passes).

### Multi-Source Settings UI (2026-04)
- **Purpose:** Expose backend configuration for multi-source session support via frontend settings.
- **Settings service:** `useSettings()` hook reads from `/api/config`, exposes `sessionSources` and `claudeDir` strings. POST `/api/settings` on change with `{ sessionSources?, claudeDir? }` body. Automatically refreshes config after update.
- **SettingsPanel additions:** Two new fields under "Session Sources" section: (1) Session sources dropdown (options: "Copilot Only", "Claude Only", "Both"), (2) Claude directory text input with placeholder showing `~/.claude/projects`.
- **UI behavior:** Changes apply immediately (no Save button). Invalid Claude paths are handled gracefully by the server (404 → no sessions found).
- **Type definitions:** `sessionSources: 'copilot' | 'claude' | 'both'` and `claudeDir: string` added to `Settings` type in `src/types/settings.ts`.
- **No new dependencies.** TypeScript clean. Settings UI integrates seamlessly with existing pattern.

### Squad Badge UI (2026-04-09)
- **Purpose:** Visual indicator on session tiles and detail views to distinguish squad-spawned sessions from organic user sessions.
- **SquadBadge component:** `src/components/common/SquadBadge.tsx` — small pill/chip with conditional rendering. Shows "Squad" label + optional icon when `session.isSquadSession === true`. Uses project-consistent color scheme (squad accent).
- **CSS:** `.squad-badge`, `.squad-badge--active` in `src/index.css`. Light-mode overrides via `.light` selector. Positioned inline with other metadata badges.
- **Badge placement:** KanbanTile (meta row, next to session name), SessionCard (meta row, next to agent count), SessionDetail (header, next to StatusBadge).
- **Asset:** `public/squad-logo.png` — squad branding logo for optional icon rendering.
- **Integration:** Wired into `KanbanTile.tsx`, `SessionCard.tsx`, `SessionDetail.tsx`. Props pass `session.isSquadSession` to badge component; badge handles rendering logic internally.
- **No new dependencies.** TypeScript clean (`tsc --noEmit` passes).

### Performance Optimization Plan — Phase 3 (2026-04-10)
- **Holden (Lead) analysis:** `GET /api/sessions` cold load ~60s with 1787 sessions. Root cause: 1787 serial per-session operations (readEventsTail + mapSessionSummary per session). Archive state is client-side only — server has no way to skip archived sessions.
- **Phase 3 assignment (Amos + Naomi, 2 days):** Server-aware archive to reduce load time proportional to active session count.
  - **Backend (Amos):** Add `POST /api/sessions/archive` endpoint. Server stores archived IDs in memory (+ optional JSON sidecar for persistence). `GET /api/sessions` skips archived IDs in mapping loop.
  - **Frontend (Naomi):** Update `src/hooks/useArchive.ts` and `src/services/sessionService.ts` to push localStorage archive state to server on startup and on every archive toggle.
- **Design:** localStorage remains authoritative; server is a performance optimization, not the source of truth. Backward compatible via graceful client degradation if server archive endpoint is unavailable.
- **Success criteria:** Load time proportional to non-archived session count (expected <5s for typical 100–300 active sessions). Archive state persists across page reloads. No regression in status accuracy.

### Phase 3 — Server-Aware Archive Frontend (Completed 2026-04-10)
- **Purpose:** Performance optimization — push archive state to server so `GET /api/sessions` can skip archived sessions server-side, reducing load time proportional to active session count.
- **useArchive.ts changes:** Added server sync on mount (POST localStorage archive IDs to `/api/sessions/archive`). Added fire-and-forget server calls on `archiveSession` (POST `/api/sessions/archive/add`), `unarchiveSession` (POST `/api/sessions/archive/remove`), `archiveByIds` and `clearArchive` (POST full set). Added `synced` state flag. localStorage remains source of truth — all server calls are best-effort with console warnings on failure.
- **sessionService.ts changes:** `getSessions()` now accepts optional `includeArchived` param. Default `false` — server skips archived. When `showArchived` toggle is on, passes `?includeArchived=true`.
- **useSessions.ts changes:** `loadSessions` passes `showArchived` to `getSessions()`. Search handler separates results into `conversationSearchResults` (in-view) and `archivedSearchResults` (archived hits not in loaded list, based on `isArchived` flag from server). `ConversationMatch` type now includes optional `isArchived` field. New exports: `archivedSearchResults`, `archiveSynced`.
- **SessionContext.tsx changes:** Added `archivedSearchResults`, `archiveSynced` to `SessionDataContextValue` interface and provider wiring.
- **SessionList.tsx changes:** Fixed pre-existing undefined `archivedSessions`/`activeSessions` variables (were used but never declared). Added "Also found in X archived sessions" banner section — shows when searching with archived hits, renders up to 5 compact results with session ID + snippet, click reveals archives and selects session.
- **Backward compat:** UI feels identical — localStorage is immediate, server sync is invisible. If server is down, graceful degradation to client-only filtering.
- **Tests:** 141 passing. Bug fix: resolved pre-existing SessionList rendering issue.
