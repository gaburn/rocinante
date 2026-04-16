# Bobbie — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Tester
- **Joined:** 2026-04-02T01:03:50.182Z

## Learnings

<!-- Append learnings below -->

### 2026-04-04: statusDeriver ask_user Detection Tests

**Context:** Wrote comprehensive test suite for ask_user detection in `statusDeriver.ts` before implementation (TDD approach). Tests are ready for when Amos implements the feature.

**Architecture Decisions:**
- Test framework: Vitest (not yet installed - P0 item from audit)
- Test location: `server/services/__tests__/` following common Node.js convention
- Test file: `statusDeriver.test.ts` (26 test cases covering all scenarios)

**Key Patterns:**
- Mock `getConfig()` to control staleThresholdMs (set to 300000ms for test stability)
- Helper `createEvent()` function creates ParsedEvent objects with defaults
- Tests use fresh timestamps (`Date.now()`) to avoid staleness, except when testing stale behavior
- Test structure: describe blocks organized by scenario type (name field, toolName field, edge cases, etc.)

**Expected Implementation Details:**
1. `DerivedStatus` interface needs `waitingQuestion?: string` and `waitingChoices?: string[]` fields
2. ask_user detection should check both `name` and `toolName` fields (schema variants)
3. Question extracted from `parameters.question` or `arguments.question`
4. Choices extracted from `parameters.choices` or `arguments.choices`
5. Empty strings/arrays normalized to undefined
6. Status priority: shutdown > error > ask_user > other tool requests
7. When multiple ask_user requests exist, use most recent

**File Paths:**
- Test file: `server/services/__tests__/statusDeriver.test.ts`
- Test docs: `server/services/__tests__/README.md`
- System under test: `server/services/statusDeriver.ts`
- Config mock: `server/config.js`

**Trade-offs:**
- Tests written before implementation (TDD) - will fail until Amos implements ask_user detection
- Comprehensive coverage (26 tests) vs simpler smoke tests - chose thorough approach given critical nature of status detection
- Used Vitest despite not being installed yet - team decision from audit that Vitest is the chosen framework

### 2026-07-15: Performance Cache Test Suites (Phase 1 + Phase 2)

**Context:** Wrote test suites for the session loading performance fix (ADR from Holden). Amos had already landed both Phase 1 (response cache) and Phase 2 (computation cache) implementations by the time tests ran, so all tests pass green.

---

## Sprint 1 Assignment: Rocinante Performance Plan (2026-04-16)

**Sprint 1 Task:** Verify cold-load end-to-end after body-parser fix (0.25d). Check:
- Archive sync succeeds without PayloadTooLargeError
- Cold load <5s (target)
- No regression in status accuracy

**Full plan:** 3 sprints, target cold load <5s. Critical path: Amos (body-parser → unblocks all).

**Test Files:**
- `server/routes/__tests__/sessionsCache.test.ts` — 13 tests for Phase 1 (response cache)
- `server/services/__tests__/sessionSummaryCache.test.ts` — 20 tests for Phase 2 (computation cache)

**Phase 1 Tests (Response Cache in `sessions.ts`):**
- First call computes and caches the result
- Second call within TTL returns cached data (mapAllSessionSummaries NOT called again)
- Call after TTL expires recomputes with fresh data
- Cached response preserves all SessionSummary fields (no field drift)
- `invalidateSessionsCache()` forces recomputation
- Demo mode bypasses cache entirely
- Errors are not cached (500 on first call, clean recovery on second)
- Edge cases: empty lists, 1787-session batch, TTL boundary, idempotent invalidation

**Phase 2 Tests (Computation Cache in `sessionSummaryCache.ts`):**
- Cache hit when mtime+size unchanged → computeFn NOT called again
- Cache miss on mtime change, size change, or both → recomputes
- No event file → falls back to SQLite updated_at as cache key
- updated_at change (no event file) → recomputes
- null eventFilePath → caches on updated_at
- Eviction: removes entries for sessions not in active set, handles empty/full sets
- Status transitions: idle→active and active→completed reflect correctly on file change
- Stale-safe: unchanged file returns cached status even if "real" status changed
- invalidate/clearAll work correctly
- Non-ENOENT errors propagate (no silent stale data)
- computeFn errors don't pollute cache
- Independent sessions cached independently

**Key Patterns:**
- `vi.mock('node:fs')` + `vi.mocked(fs.statSync)` for Phase 2 filesystem control
- Direct route handler invocation via Express router stack for Phase 1
- `vi.spyOn(Date, 'now')` for time control in TTL tests
- `invalidateSessionsCache()` exported for test cache reset between tests
- `makeSummary()` helper creates SessionSummary objects with defaults

**Total suite: 141 tests across 8 files, all passing.**

### Orchestration — Phase 1+2 Caching Complete (2026-04-10T08:46:01Z)
- **Team collaboration:** Amos implemented Phase 1+2, Bobbie wrote anticipatory tests (tests written before code), Scribe logged orchestration.
- **Result:** 33 new tests, all passing. Holden's perf roadmap Phase 1+2 complete. Phase 3 (archive endpoint) pending.

### 2026-07-16: Auto-Group + Archive Interaction Tests

**Context:** Wrote comprehensive test suite covering the interaction between auto-group-by-repository and archived sessions — the core bug scenario where archived sessions could reappear in workstream groups.

**Test File:** `src/hooks/__tests__/autoGroupArchive.test.ts` — 35 tests across 7 describe blocks.

**What's Covered:**
1. **repoDisplayName** (7 tests) — path segment extraction, trailing slashes, whitespace handling
2. **autoGroupByRepository core logic** (12 tests) — grouping by repo, cwd fallback, skipping assigned sessions, null/empty/whitespace edge cases, reference identity optimization
3. **filterOutArchived** (3 tests) — showArchived true/false, no-archive case
4. **Auto-group + archive interaction** (6 tests) — THE CORE BUG SCENARIO: archived sessions excluded from grouping, showArchived=true includes them, previously archived don't reappear, source/status filter interaction
5. **handleAutoGroupByRepository** (1 test) — verifies `sessions` (filtered) is passed, not `allSessions`
6. **Archive sync + auto-group sequencing** (3 tests) — client-side archive respected before server sync, pruneStaleIds cleanup
7. **groupedSessions display layer** (3 tests) — archived sessions with workstream assignments don't appear in visible groups

**Key Patterns:**
- Extracted pure functions from hooks (matching existing useSessions.test.ts pattern)
- No React rendering or hook mocking needed — logic tested directly
- `createSession()` helper builds SessionSummary objects with defaults

**Total suite: 176 tests across 9 files, all passing.**
