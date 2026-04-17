# Team Decisions Log

**Last Updated:** 2026-07-16T18:45:00Z

## Architecture

### Body-parser limit raised to 2MB

**Author:** Amos (Backend Dev)  
**Date:** 2026-04-16  
**Status:** Implemented  
**Sprint:** 1, Item C1  

**Context:** `express.json()` in `server/index.ts` used the default 100KB body limit. The `POST /api/sessions/archive` startup sync sends ~1787 UUIDs (~75KB JSON), which was intermittently hitting this limit due to overhead. The 413 PayloadTooLargeError was caught silently by the frontend, causing the server to map ALL 1787 sessions on the first GET — producing a ~60s cold load.

**Decision:** Changed `express.json()` → `express.json({ limit: '2mb' })`. This applies globally to all JSON endpoints.

**Trade-offs:** 2MB is generous headroom (current payload is ~75KB). If the archive grows to 50K+ sessions, this may need revisiting — but that's a distant concern. Global limit means all endpoints accept up to 2MB. No other endpoint receives payloads anywhere near this, so the risk is minimal. If per-route limits are needed later, use per-route middleware.

**Validation:** 188 tests passing (12 new archive sync tests), `npx tsc --noEmit` clean.

### AbortController on Session Polling

**Author:** Naomi (Frontend Dev)
**Date:** 2026-04-16
**Status:** Implemented
**Sprint:** 1, Item H3

**Context:** `loadSessions()` polls `GET /api/sessions` on an interval but didn't abort prior in-flight requests. During cold start, multiple requests queue and stale responses arrive out-of-order, causing UI flicker.

**Decision:** Added `AbortController` to `loadSessions()` — same pattern already used by the search feature in the same file.

**Changes:**
- **`sessionService.ts`**: `getSessions()` and `getSessionById()` now accept optional `signal?: AbortSignal`, forwarded to `fetch()`.
- **`useSessions.ts`**: Added `loadSessionsAbortRef`. Each `loadSessions()` call aborts the previous controller, creates a fresh one, and passes its signal. AbortErrors are silently ignored. `finally` only clears `isLoading` if the controller is still current. Unmount effect aborts pending requests.
- **Tests**: 7 new tests in `useSessionsAbort.test.ts`.

**Validation:** `npx tsc --noEmit` clean, 195 tests passing (7 new).

### Vite optimizeDeps Configuration for Dev Startup

**Author:** Alex (DevOps)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Vite build configuration  

**Context:** Vite dev server startup was taking ~9035ms because Vite re-scanned and re-bundled all dependencies on every cold start. No `optimizeDeps` configuration existed.

**Decision:** Added `optimizeDeps.include` to `vite.config.ts` with 11 heavy dependencies that are always used together in the Rocinante app:
- react, react-dom, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links, d3-force, @tanstack/react-virtual, js-yaml

**Result:**
- **Startup time:** 6144ms (down from ~9035ms)
- **Improvement:** 32% faster
- **Cache mechanism:** Vite caches pre-bundled deps in `node_modules/.vite`, reusing them on subsequent restarts

**Rationale:** Pre-bundling large, rarely-changed dependencies upfront eliminates re-scanning overhead. These 11 packages are heavy (React, terminal emulator, D3 force layout, drag-drop kit). Esbuild is fast but still incurs per-scan overhead; this is front-loaded.

**Notes:** Did not add `server.warmup` — Vite 8 does not support it. TypeScript check passes clean. No breaking changes to build or test pipeline.

## Architecture (continued)

### Squad Cast Extraction (Amos + Naomi)
- **Decision:** Extract and render squad cast members from session event descriptions and prompts
- **Pattern A:** Description format: `🔧 Amos: Refactoring auth`
- **Pattern B:** Prompt format: `You are Amos, the Backend Dev on this project`
- **Why:** Provide session visibility into which team members contributed to each session
- **Integration:** 
  - Backend: SquadCastMember type in src/types/index.ts
  - Mapper: sessionMapper.ts wires extraction in sessionMapper service
  - Frontend: SquadCastList component renders cast in SessionDetail
  - UI: Emoji + role badges with squad logo

## Testing
- squadCastExtractor: 11 unit tests passing
- All TypeScript clean (no errors)

### Auto-detect Session Sources (Default Change)

**Author:** Amos (Backend Dev)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Backend + Frontend (config, provider registry, settings UI)

**Context:** The `sessionSources` config defaulted to `'copilot'`, requiring users with both Copilot and Claude installed to manually switch to `'both'` in settings. This was bad UX — the dashboard should discover available sources automatically.

**Decision:** Add `'auto'` as a new `SessionSourceOption` value and make it the default.

**Key behavior:**
- `auto` (new default) — checks `isAvailable()` on each registered source, returns only sources whose data directories exist on disk. Silently skips unavailable sources.
- `copilot` / `claude` — explicit single-source override (unchanged).
- `both` — forces both sources regardless of availability; may surface errors if one is missing (unchanged).
- `auto` vs `both`: auto is graceful (skips missing), both is assertive (includes all, may fail).

**Files changed:**
- `server/config.ts` — Added `'auto'` to `SessionSourceOption` union, changed default from `'copilot'` to `'auto'`, updated `parseSessionSources()` to treat unknown values (including absence) as `'auto'`.
- `server/services/providers/index.ts` — Updated `getActiveSources()`: `'auto'` mode filters by `isAvailable()` only (no name match needed).
- `server/services/sessionMapper.ts` — Both `mapAllSessions()` and `mapAllSessionSummaries()` now route through the multi-source provider layer when config is `'auto'`.
- `server/routes/config.ts` — Added `'auto'` to `ALLOWED_SESSION_SOURCES` for PATCH validation.
- `src/types/settings.ts` — Added `'auto'` to `SessionSourceOption`, changed `DEFAULT_SETTINGS.data.sessionSources` to `'auto'`.
- `src/services/settingsService.ts` — Added `'auto'` to `SessionSourceOption` type.
- `src/components/settings/SettingsPanel.tsx` — Added "Auto-detect" as first option in source selector; Claude directory field now also visible in auto mode.

**Trade-offs:**
- Existing users who had no `SESSION_SOURCES` env var will go from seeing only Copilot to seeing all available sources. This is intentional and the whole point.
- `auto` delegates to the provider layer for every list/detail call (same as `'both'`), which is marginally more work than the direct Copilot-only path. Negligible — the provider layer is already optimized.

**Validation:** `npx tsc --noEmit` passes clean.

### Phase 3 Implementation — Server-Aware Archive (Amos + Naomi)

**Status:** Complete (2026-04-10)  
**Outcome:** 141 tests passing

#### Backend (Amos) — Archive Store & API Endpoints
- **Archive persistence:** `server/services/archiveStore.ts` (new) — JSON-backed store for archived session IDs
- **API contract:** 5 endpoints
  1. `POST /api/sessions/archive` — Startup sync; replaces server archive with client state
  2. `POST /api/sessions/archive/add` — Idempotent add
  3. `POST /api/sessions/archive/remove` — Idempotent remove
  4. `GET /api/sessions/archive` — Returns `{ ids: string[] }`
  5. `GET /api/sessions` — Now defaults to excluding archived. Pass `?includeArchived=true` for all.
- **Cache invalidation:** Archive mutations invalidate response cache. Cache key includes `includeArchived` flag.
- **Search:** `GET /api/sessions/search` always searches everything (archive-agnostic), each result includes `isArchived: boolean`.
- **Backward compat:** No POST sync yet → GET returns all sessions (pre-Phase-3 behavior).

#### Frontend (Naomi) — Archive Sync & Search UI
- **Sync pattern:** localStorage-first, server-second. Mutations update UI immediately, POST to server async.
- **Startup:** Push full archive set to server on mount via `POST /api/sessions/archive`. Track `synced` flag.
- **getSessions():** Defaults to `includeArchived=false` so server skips ~90% of archived sessions.
- **Search results:** Archive hits included in response with `isArchived: true`. Frontend renders in separate "Also found in archived" section.
- **Bug fix:** Resolved pre-existing SessionList rendering issue.

#### Constraints & Rationale
- **Search must include archive:** 1787 archived sessions contain valuable knowledge; must remain discoverable.
- **Search results need isArchived flag:** Frontend needs to distinguish and render archived vs. active matches separately.
- **Backward compat:** If archive store uninitialized, behaves identically to pre-Phase-3.

## Roadmap

### Filter Archived Sessions BEFORE Mapping (Amos)

**Author:** Amos (Backend Dev)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Backend — session mapper + sessions route

**Context:** `GET /api/sessions` was filtering archived sessions AFTER `mapAllSessionSummaries()` had already done all expensive per-session work (fs.statSync, event file reads up to 512KB each, agent tree building, status derivation) for all ~1787 sessions. The response cache (10s TTL) masked this on warm loads, but cold start after server restart still took ~60s because the computation cache was empty.

**Decision:** Pass archived IDs into `mapAllSessionSummaries()` as an `excludeIds?: Set<string>` parameter so excluded sessions are filtered out BEFORE the per-session loop.

**Changes:**
1. `server/services/sessionMapper.ts` — `mapAllSessionSummaries(excludeIds?)`:
   - Copilot path: filters `getAllSessions()` rows before the loop, so excluded sessions never hit `fs.statSync`, `readEventsTail`, or `buildAgentTree`
   - Multi-source path: filters provider results before sorting
   - Backward compatible: no `excludeIds` = map everything (same as before)

2. `server/routes/sessions.ts` — GET handler:
   - Builds `new Set(getArchivedIds())` when archive is active and `includeArchived=false`
   - Passes the set to `mapAllSessionSummaries(excludeIds)`
   - Removed the post-hoc `.filter()` since it's now handled inside the mapper

**Trade-offs:**
- Slightly more coupling: the route now passes archive knowledge into the mapper. Acceptable because the mapper already accepts config-driven behavior.
- `evictStaleSummaries()` now only sees non-archived IDs, so archived sessions get evicted from the computation cache. This is actually desirable — no point caching summaries we never serve.

**Validation:**
- 141 tests passing (all 8 test files)
- Cold load now proportional to non-archived sessions (~100-200) instead of all sessions (1787)

### Provider-Layer Pre-Filter + Computation Cache Fix

**Author:** Amos (Backend Dev)  
**Date:** 2026-04-16  
**Status:** Implemented  
**Scope:** Backend — provider layer, session mapper

**Context:** After fixing the body-parser limit and adding the `excludeIds` pre-filter to `mapAllSessionSummaries()`, cold load was still >60s. Root cause: the default config (`sessionSources: 'auto'`) routes through the multi-source provider path in `mapAllSessionSummaries()`. The pre-filter and computation cache optimizations only existed in the Copilot-only direct path (unreachable under `'auto'`).

`CopilotSessionSource.listSessionSummaries()` was:
1. Processing ALL ~1787 sessions with no `excludeIds` filtering
2. Calling `mapSessionSummary()` directly — bypassing the per-session computation cache (`getOrComputeSummary`)
3. Returning all results, which were then post-filtered (too late — all expensive work already done)

**Changes:**
1. `server/services/providers/types.ts` — `SessionSource.listSessionSummaries()` now accepts `excludeIds?: Set<string>`
2. `server/services/providers/copilotSource.ts` — Pre-filters rows before loop. Uses `getOrComputeSummary()` with mtime+size cache key (same as the Copilot-only path). Evicts stale cache entries.
3. `server/services/providers/claudeSource.ts` — Pre-filters by `excludeIds` before file parsing
4. `server/services/sessionMapper.ts` — Passes `excludeIds` to each source in multi-source path. Removed redundant post-hoc `.filter()`

**Impact:** Cold load now proportional to non-archived sessions (~100-200) instead of all (1787) under `'auto'` mode. Second+ requests benefit from per-session computation cache (mtime+size keyed) — near-instant for unchanged sessions. Both optimizations now work regardless of `sessionSources` config value.

**Validation:** 195 tests passing (all 11 test files), `npx tsc --noEmit` clean.

### Known Issue: ClaudeSessionSource excludeIds Pre-Filter Bug

**Filed by:** Bobbie (Test Engineer)  
**Date:** 2026-04-16  
**Severity:** Medium — correctness regression for users with archived Claude sessions  
**Status:** Awaiting fix

**Problem:** `ClaudeSessionSource.listSessionSummaries()` at line 487 references `file.sessionId`, but the `DiscoveredFile` interface only has `filePath` and `mtimeMs`. The property is always `undefined`, so the pre-filter never fires. Amos also removed the post-hoc safety-net filter from `sessionMapper.ts`, so archived Claude sessions now leak into `GET /api/sessions` responses when `includeArchived=false` and a Claude source is active.

**TypeScript CI Gap:** The root tsconfig (`npx tsc --noEmit`) compiles nothing and silently passes. Team should use:
```bash
npx tsc --noEmit -p tsconfig.server.json && npx tsc --noEmit -p tsconfig.app.json
```

**Suggested Fix:** Compute session ID via `buildFileMeta(file)` (first-line read only) before the exclusion check, using the correct `meta.id` in the excludeIds comparison.

### Hybrid Plan Completion — File-Checked vs UI-Checked Tasks

**Author:** Naomi (Frontend Dev)  
**Date:** 2026-04-16  
**Status:** Implemented  
**Scope:** Frontend — PlanViewer, usePlanStatus

#### Context

Amos extended `planReader.ts` to parse markdown checkboxes, numbered lists, and tables from plan files, adding `checked?: boolean` and `checkedFromFile?: boolean` to the `PlanTask` type. The frontend needed to support both file-sourced completion state and the existing localStorage-based UI toggles without conflicts.

#### Decision

**Two-source completion model:**
- Tasks with `checkedFromFile: true` are read-only in the UI — the plan file is the single source of truth. Checkbox is disabled, styled with reduced opacity and a ✦ indicator.
- Tasks without `checkedFromFile` continue using localStorage toggles (existing behavior unchanged).
- `getProgress()` now accepts an optional `allTasks` parameter. It sums file-checked count + localStorage-checked count, using a `Set` of file-managed task IDs to prevent double-counting.

#### Trade-offs

- `getProgress()` signature changed (new optional third param) — backward compatible, but callers that want hybrid counting must pass tasks.
- ✦ indicator is subtle; could revisit with a tooltip or different checkbox icon if users find it unclear.
- No localStorage cleanup for tasks that become file-managed later — harmless stale data, and avoids complexity.

#### Validation

- 230 tests passing, `npx tsc --noEmit -p tsconfig.app.json` has no new errors (pre-existing SessionList.tsx errors only).

### 2026-04-16T20:12:51Z: User directive — Task Auto-Completion

**By:** gaburn (via Copilot)  
**What:** Agents should mark plan tasks as complete when they finish work. Users should not have to manually check boxes in the UI.  
**Why:** User request — the Session Plan progress counter should reflect actual work done automatically, not require manual toggling.

### 2026-04-16T20:26:27Z: User directive — Lint Pre-Commit Gate

**By:** gaburn (via Copilot)  
**What:** Always lint files successfully before any commits. Update agent workflows to include linting as a pre-commit gate.  
**Why:** User request — lint errors were introduced in recent commits. Agents must run linting before committing.

## Open Items
- Amos: Fix ClaudeSessionSource pre-filter (use buildFileMeta for correct session ID extraction)

### ADO Test Connection Save-Before-Test

**Author:** Amos (Backend Dev)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Frontend — SettingsPanel ADO test connection flow

**Context:** `handleTestConnection()` called `POST /api/ado/test` without first persisting the user-entered organization/project to the server. The server-side `runtimeConfig` still had empty strings, so `isAdoConfigured()` returned false and the endpoint returned HTTP 403. Users had to know to click "Save" before "Test Connection" — a non-obvious two-step flow.

**Decision:** Modified `handleTestConnection()` in `src/components/settings/SettingsPanel.tsx` to call `updateAdoConfig({ organization, project })` before `testAdoConnection()`. If the save fails, the error is surfaced through the existing connection-result UI (same catch block).

**Trade-offs:** Test Connection now implicitly saves. This is acceptable for a settings page — users expect "test" to use their current inputs. If the save call fails (network error, server down), the user sees the save error in the test-result area rather than a separate save-error banner. Clear enough for the use case.

**Validation:** 233 tests passing, eslint clean, no new TypeScript errors (pre-existing SessionList.tsx errors only).

### ADO MCP Client Integration

**Author:** Amos (Backend Dev)  
**Date:** 2026-07  
**Status:** Implemented  
**Scope:** Backend — ADO integration layer

**Context:** The existing `server/services/adoClient.ts` is a hand-rolled REST client (~380 LOC) that authenticates via `az` CLI. Microsoft now publishes an official MCP server (`@azure-devops/mcp`) that exposes ADO APIs as MCP tools. We're pivoting the backend to use MCP as the primary integration path.

**Decision:** Created `server/services/adoMcpClient.ts` — a typed MCP client wrapper that spawns `@azure-devops/mcp` as a stdio subprocess via `npx -y @azure-devops/mcp {org} -d core repositories work-items`. Uses `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`.

**Key design choices:**

1. **`@azure-devops/mcp` is NOT a project dependency.** It's a standalone MCP server invoked via `npx` at runtime. Only `@modelcontextprotocol/sdk` (^1.29.0) is installed as a dependency. Users just need Node.js/npx available.

2. **Lazy singleton lifecycle.** The MCP subprocess is not spawned at server boot — it starts on first ADO request. One client per organization. If org config changes, the old client is torn down and a new one created.

3. **MCP-first with REST fallback.** The `GET /api/ado/session-deliverables` endpoint tries MCP first. If MCP fails to init (npx unavailable, subprocess crash, etc.), it catches and falls through to the existing direct REST functions in `adoClient.ts`. This means the old REST path remains fully functional as a safety net.

4. **Same caching pattern.** 5-min TTL response cache, same as `adoClient.ts`.

5. **Graceful shutdown.** `shutdownMcpClient()` is wired into `server/index.ts` shutdown handler alongside `killAllPtys()` and `closeDatabase()`.

**Files Changed:**
- `package.json` — added `@modelcontextprotocol/sdk` (^1.29.0)
- `server/services/adoMcpClient.ts` — NEW: MCP client wrapper (~260 LOC)
- `server/routes/ado.ts` — session-deliverables refactored to MCP-first + REST fallback
- `server/index.ts` — wired MCP shutdown into graceful shutdown

**Trade-offs:**
- MCP subprocess adds ~1-2s latency on first ADO request (npx cold start + MCP server init). Subsequent calls reuse the warm client.
- If npx is not on PATH or the user has no internet (for the initial `@azure-devops/mcp` download), MCP path fails and REST takes over. No user-facing error in this case — degradation is silent.
- The `@azure-devops/mcp` package handles its own auth via `@azure/identity` (browser-based). This is different from the REST client's `az` CLI auth. Both auth paths coexist.

**Validation:** 233 tests passing (all 12 test files), `npx eslint` clean on all changed files, `npx tsc --noEmit -p tsconfig.server.json` clean.

### Session Deliverables Endpoint + PR-Linked Work Items

**Author:** Amos (Backend Dev)  
**Date:** 2026-07  
**Status:** Implemented  
**Scope:** Backend — adoClient service, ADO routes, shared types

**Context:** The frontend needs to display ADO deliverables (PRs + linked work items) for a given session branch. No endpoint existed to aggregate this data.

**Changes:**

1. **`src/types/ado.ts`** — Added `repositoryId?: string` to `AdoPullRequest`. Added `SessionDeliverables` interface (`{ pullRequests, workItems }`).

2. **`server/services/adoClient.ts`** — Updated `PullRequestResponse` type to include `repository.id`. Updated PR mapping to populate `repositoryId`. Added `getWorkItemsForPullRequest(repositoryId, prId)` — calls the PR work items endpoint, extracts IDs, batch-fetches via existing `getWorkItems()`. Uses `cachedFetch` with 5-min TTL. Returns `[]` on 404.

3. **`server/routes/ado.ts`** — Added `GET /api/ado/session-deliverables?branch={branchName}`. Fetches PRs for the branch, then collects linked work items across all PRs (deduplicated by work item ID). Returns `SessionDeliverables` shape. 502 for upstream ADO errors, 500 for unexpected.

**Design decisions:**
- Uses `Promise.allSettled` for work item fetches so one failed PR doesn't block the whole response.
- Work items are deduplicated by ID since the same WI can be linked to multiple PRs.
- `repositoryId` is optional on the type since older cached PR data won't have it.

**Validation:** 233 tests passing, eslint clean, `npx tsc --noEmit -p tsconfig.server.json` clean.

### Session Deliverables Frontend Pattern

**Author:** Naomi (Frontend Dev)  
**Date:** 2026-07  
**Status:** Implemented  
**Scope:** T4 + T5 — `useSessionDeliverables` hook + SessionDetail deliverables section

**Context:** SessionDetail needed to show ADO pull requests and work items linked to the session's branch. WorkstreamDetail already has similar rendering but uses the heavier `useAdoIntegration` hook (which manages work item IDs, workstream keys, multi-branch aggregation).

**Decisions:**

1. **Lightweight dedicated hook** — `useSessionDeliverables` takes `(branch, isAdoConfigured)` and calls a single backend endpoint (`GET /api/ado/session-deliverables?branch=...`). Simpler than reusing `useAdoIntegration` which has workstream-specific concerns.

2. **ADO status via inline effect** — SessionDetail checks `getAdoStatus()` in a `useState`+`useEffect` on mount, same pattern as `useAdoIntegration` lines 64-78. No context or provider needed.

3. **Duplicated styling helpers** — PR status badge and work item state badge functions are duplicated as file-local helpers in SessionDetail (prefixed `deliverable*`). This avoids coupling to WorkstreamDetail internals. If a third consumer appears, extract to a shared `src/utils/adoStyles.ts`.

**Trade-offs:**
- Styling helper duplication: ~40 lines duplicated. Acceptable for 2 consumers; extract on 3rd.
- No signal forwarding to `getSessionDeliverables()` — the hook aborts via cancelled flag pattern. Could add AbortSignal to the fetch if cancellation latency matters.

**Validation:** 233 tests passing.

