# Team Decisions Log

**Last Updated:** 2026-04-16T00:00:00Z

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

### ADR: Session Loading Performance Fix (Phases 1–2 Remaining)

**Date:** 2025-07-15  
**Status:** In Progress  
**Author:** Holden (Lead/Architect)  
**Triggered by:** Coordinator analysis — ~60s cold load with 1787 sessions

**Context:** `GET /api/sessions` performs 1787 serial operations per request (readEventsTail + mapSessionSummary per session). Existing `CACHE_TTL_MS=10000` unused.

**Remaining Phases:**

**Phase 1 — Response Cache (Amos, 0.5 days)**
- Wire `CACHE_TTL_MS` into `server/routes/sessions.ts`
- Cache full `SessionSummary[]` result for 10 seconds
- No client changes

**Phase 2 — Per-Session Computation Cache (Amos, 1 day)**
- Add `server/services/sessionSummaryCache.ts`
- Cache computed `SessionSummary` keyed on event file `mtime+size`
- Skip recomputation for unchanged sessions
- Evict on session ID no longer present in SQLite

**Success Criteria:**
- Phase 1 + 2: Cold load < 10s for 1787 sessions (down from ~60s)
- No regression in status accuracy

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

### Rocinante Performance Plan (Cold-Start + PayloadTooLargeError)

**Author:** Holden (Lead/Architect)  
**Date:** 2025-07-16  
**Status:** Active  
**Scope:** Full stack — backend, frontend, build

**Root Cause:** `express.json()` uses 100KB default limit; archive sync payload (1787 UUIDs) exceeds it. Frontend silently catches 413 error, causing server to map all 1787 sessions on first GET.

**Solution:** Three sprints:
1. **Sprint 1 — Unblock (2d):** Fix body-parser limit (Amos, 0.25d), AbortController polling (Naomi, 0.5d), Vite deps caching (Alex, 0.5d), verify (Bobbie, 0.25d)
2. **Sprint 2 — Optimize (2d):** Server pre-warming (Amos, 1d), bounded caches (Amos, 0.5d), Vite vendor splitting (Alex, 0.25d)
3. **Sprint 3 — Polish:** WebSocket heartbeat, component refactoring

**Success Criteria:** Cold load <5s, Vite startup <3s, PayloadTooLargeError eliminated, memory bounded.

## Open Items
- None
