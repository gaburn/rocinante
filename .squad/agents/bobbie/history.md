# Bobbie — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Tester
- **Joined:** 2026-04-02T01:03:50.182Z

## Learnings

<!-- Append learnings below -->

### 2026-07-17: Session-Level ADO Deliverables Tests (47 new tests)

**Context:** Wrote tests for the session-level ADO deliverables feature (Amos backend + Naomi frontend). Feature adds `/api/ado/session-deliverables` endpoint, ADO enrichment on session summaries, `useSessionDeliverables` hook, and badge rendering in `SessionCard`.

**Test Files:**
- `server/routes/__tests__/adoSessionDeliverables.test.ts` — 12 tests for the session-deliverables endpoint
- `server/routes/__tests__/sessionsAdoEnrichment.test.ts` — 7 tests for ADO enrichment on GET /api/sessions
- `src/hooks/__tests__/useSessionDeliverables.test.ts` — 14 tests for the deliverables hook
- `src/components/sessions/__tests__/SessionCardBadge.test.ts` — 14 tests for badge rendering

**Key Patterns:**
- Direct route handler invocation via Express router stack (same as archiveSync.test.ts, sessionsCache.test.ts)
- `vi.mock()` for service/module mocks — MCP client + REST client + config
- Pure function extraction for frontend tests (no React rendering needed)
- `Promise.allSettled` patterns tested via mock rejection/resolution ordering
- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timeout test

**Gotcha Found:**
- `vi.clearAllMocks()` does NOT reset mock implementations — only call history. Mock return values from prior tests leak across. Either use `vi.resetAllMocks()` in `afterEach`, or explicitly set mock behavior in every test that depends on it. The MCP→REST fallback enrichment test hit this: `mockMcpGetPullRequest` retained its resolved value from the prior test, bypassing the REST fallback.

**Results:** 280 tests across 16 files, all passing (233 existing + 47 new). ESLint clean. No new TypeScript errors.

### 2026-07-17: Comprehensive PlanReader Unit Tests (TDD for Extended Formats)

**Context:** Wrote 35 TDD-style tests for `planReader.ts` ahead of Amos's extended format parser work. Tests define expected behavior for all plan formats — existing and new.

**Test File:** `server/services/__tests__/planReader.test.ts` — 35 tests across 8 describe blocks.

**Results — 12 pass, 23 awaiting Amos's parser:**
- ✅ **Existing formats (9/9 pass):** null file, empty plan, ## heading, ### heading, plain bullet, bold title/desc split, multiline continuation, default section for orphan tasks, raw content preservation
- ✅ **Nested bullets (2/2 pass):** indented items fold into parent description
- ✅ **Table header skip (1/1 pass):** header row not parsed as task (vacuously passes — no table rows parsed yet)
- ❌ **Checkbox format (6 failing):** `- [ ]`/`- [x]`/`- [X]` detection, `checked`/`checkedFromFile` fields, bold checkbox, mixed checkboxes + bullets
- ❌ **Numbered lists (4 failing):** `1. text`, bold numbered, high numbers, mixed numbered + bullets
- ❌ **Tables (6 failing):** data rows as tasks, ✅/❌/Pending status mapping, no-status column, separator skip
- ❌ **Code block immunity (3 failing):** fenced blocks should suppress parsing inside them
- ❌ **Top-level `#` heading (2 failing):** currently only `##`/`###` match
- ❌ **Mixed format (2 failing):** all formats in one plan, numbered checkboxes

**Key Patterns:**
- Mock `node:fs`, `../../config.js`, `../../utils/sanitize.js` — parser tested without disk I/O
- `parsePlan(content)` helper feeds raw markdown directly into `readSessionPlan`
- `(task as any).checked` / `.checkedFromFile` — PlanTask type not yet extended, cast until Amos adds fields
- All 11 existing test files unaffected (207 tests pass)

**Amos needs for his parser:**
1. Extend `PlanTask` type with `checked?: boolean`, `checkedFromFile?: boolean`
2. Regex for `- [ ]`/`- [x]`/`- [X]` checkbox syntax (strip bracket prefix from title)
3. Regex for `\d+\. ` numbered list items
4. Table parser: detect `|` rows, skip header + separator, extract first column as title, detect status column
5. Code block toggle: track `inCodeBlock` flag on ``` lines
6. Extend section heading regex from `^###?\s+` to `^#{1,3}\s+`

### 2026-04-16: Multi-Source Provider Fix Verification (Amos commit 23cd717)

**Context:** Verified Amos's fix to wire `excludeIds` pre-filtering and `getOrComputeSummary` computation cache into the multi-source provider path. The `auto` config (default since April) was routing through providers that lacked these optimizations, making the cold-load fix ineffective for the default code path.

**Test Suite:** 195 tests across 11 files — **all passing** (1.41s).

**TypeScript Check:**
- ⚠️ `npx tsc --noEmit` (root) passes — but this is a **false green**. Root tsconfig uses `files: []` with project references; it compiles nothing without `--build` mode.
- ❌ `npx tsc --noEmit -p tsconfig.server.json` — **1 error**: `file.sessionId` does not exist on type `DiscoveredFile` at `claudeSource.ts:487`.
- ❌ `npx tsc --noEmit -p tsconfig.app.json` — 4 pre-existing errors in `SessionList.tsx` (redeclared block-scoped variables, NOT from this fix).
- ✅ `npx tsc --noEmit -p tsconfig.node.json` — clean.

**Code Review — What's Correct:**
1. ✅ `SessionSource` interface updated: `listSessionSummaries(excludeIds?: Set<string>)`
2. ✅ `CopilotSessionSource.listSessionSummaries()` — properly pre-filters rows before expensive loop, wires `getOrComputeSummary` + `evictStaleSummaries`. Mirrors the direct Copilot path exactly.
3. ✅ `sessionMapper.ts` multi-source path now passes `excludeIds` through to `source.listSessionSummaries(excludeIds)`.
4. ✅ Post-hoc `.filter()` removed from mapper (sources handle it now).
5. ✅ `auto` mode correctly reaches multi-source path.
6. ✅ `copilot` explicit mode still routes to direct path (line 469 check doesn't match `'copilot'`).
7. ✅ `both` mode routes through multi-source path with both sources.

**Code Review — Bug Found:**
- ❌ **ClaudeSessionSource pre-filter is broken** (`claudeSource.ts:487`): `file.sessionId` does not exist on `DiscoveredFile` (which only has `filePath` and `mtimeMs`). At runtime, `SOURCE_PREFIX + file.sessionId` evaluates to `"claude:undefined"`, which never matches any real ID. **No Claude sessions are ever pre-filtered.**
- **Regression risk:** Amos removed the post-hoc safety-net filter in `sessionMapper.ts` (which previously caught unfiltered sessions). Archived Claude sessions will now leak into `GET /api/sessions` responses when `includeArchived=false` and Claude source is active.
- **Fix:** Compute session ID via `buildFileMeta(file)` (reads only first 8KB) before the exclusion check, then check `excludeIds.has(meta.id)`.

**Benchmark Results (server running, 20 iterations):**
- `/api/sessions`: avg 2.23ms, p50 1.88ms, p95 3.76ms — excellent
- `/api/sessions/:id`: avg 10.39ms, p50 9.67ms — acceptable
- `/api/telemetry`: p50 0.86ms (cold: 1166ms, then <1.5ms)

**Regression Check:**
- ✅ `auto` discovers available sources via `isAvailable()` check
- ✅ `both` mode unchanged (routes through same multi-source path)
- ✅ `copilot` explicit mode unchanged (direct path, lines 492–543)
- ⚠️ Archived Claude sessions not properly excluded (see bug above)
- ✅ Search is archive-agnostic (unaffected by this change)

**TypeScript CI Gap:** The team has been running `npx tsc --noEmit` which silently passes because the root tsconfig compiles nothing. Recommend switching to `npx tsc --noEmit -p tsconfig.server.json && npx tsc --noEmit -p tsconfig.app.json` or `npx tsc --build --noEmit`.

### 2026-07-16: Sprint 1 Verification — Cold Load Performance Fix

**Context:** Verified all Sprint 1 changes after Amos's body-parser fix (`express.json({ limit: '2mb' })`).

**Results:**
- **Test suite:** 195 tests passing across 11 files, 0 failures (duration: 1.48s)
- **TypeScript:** `npx tsc --noEmit` clean, exit code 0
- **Benchmark:** `npm run bench:server` exists (20 iterations, measures /api/sessions, session detail, /api/telemetry) but requires a running server instance — not run in this verification pass
- **Body-parser fix:** Confirmed on line 23 of `server/index.ts`: `express.json({ limit: '2mb' })`

**Amos's Integration Tests (archiveSync.test.ts — 12 tests):**
- ✅ Large payload: 1787 UUIDs accepted (200 OK)
- ✅ Near-limit: 2500 UUIDs accepted
- ✅ Round-trip: POST sync → GET returns same IDs
- ✅ Empty array handled
- ✅ Single UUID handled
- ✅ Replace previous archive on subsequent sync
- ✅ Validation: missing ids (400), non-array (400), non-string elements (400)
- ✅ Payload size assertion: 1787 UUIDs < 2MB but > 50KB

**Sprint 1 Success Criteria:**
- ✅ PayloadTooLargeError eliminated (2mb limit replaces 100kb default)
- ✅ Test count ≥ 180 (195 tests, up from 176)

**No issues found.** Sprint 1 verification passes clean.

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
