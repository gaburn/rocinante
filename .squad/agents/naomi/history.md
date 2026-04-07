# Naomi — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

<!-- Append learnings below -->

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
- **Impact:** Clicking session only re-renders SelectionContext consumers. Polling only re-renders DataContext consumers. Scrolling large lists no longer janky.
- **Files changed:** 17 consumer files migrated to focused hooks. `src/context/SessionContext.tsx` rewritten. SessionCard + SessionList updated. `@tanstack/react-virtual` added to package.json.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through early 2026-04 (Amber Glow, Horse Logo, Kanban Board, Column Reorder, Session Updates, Demo Workstreams, Conversation Search, Session ID Search, Question Mark Icon, TokenUtilization, Inline Markdown, Table Rendering).
