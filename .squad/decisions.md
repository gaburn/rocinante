# Team Decisions Log

**Last Updated:** 2026-04-09T08:43:25Z

## Architecture

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

## Open Items
- None
