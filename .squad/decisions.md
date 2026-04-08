# Squad Decisions

## Active Decisions

### 1. Replace SessionList with KanbanBoard

**Author:** Bart (Frontend Dev)  
**Date:** 2025-07  
**Status:** Implemented  
**Scope:** Frontend (left panel)

**Context:** The SessionList vertical list was replaced with a horizontal kanban board (`KanbanBoard`). Each workstream becomes a column; each session becomes a draggable tile. Tiles are sorted by status priority (active → blocked → waiting → completed) then by recency.

**Key Decisions:**
1. SessionList preserved but unused — `SessionList.tsx` is still in the repo but no longer imported from `App.tsx`. Team can decide to remove it or keep it as a fallback/alternate view option.
2. DnD via @dnd-kit — Used existing `@dnd-kit/core` + `@dnd-kit/sortable` packages. `PointerSensor` with 5px activation distance prevents accidental drags when clicking tiles.
3. Ungrouped sentinel — Sessions without a workstream go into an "Ungrouped" column identified by `__ungrouped__`. Dropping a tile there calls `removeWorkstream()`.
4. No data model changes — All workstream assignment still goes through the existing `useWorkstreams` hook (localStorage-backed). No backend changes.
5. Header icon swap — The list icon was replaced with a 3-column kanban board icon (`BoardIcon`). Network toggle is unchanged.

**Trade-offs:** Fixed 320px column width. Works well for typical session counts but may need virtualization if a single workstream has 100+ sessions. No cross-column reordering within a column (tiles auto-sort by status).

**Files Changed:** src/App.tsx, src/components/kanban/KanbanTile.tsx, src/components/kanban/KanbanColumn.tsx, src/components/kanban/KanbanBoard.tsx, src/components/kanban/index.ts, src/components/layout/Header.tsx

---

### 2. ask_user Tool Detection and Waiting State UI

**Author:** Amos (Backend), Naomi (Frontend), Bobbie (Tester)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Backend + Frontend (status derivation, UI indicators, tests)

**Context:** GitHub Copilot CLI uses `ask_user` tool calls when the assistant needs explicit user input. Previously sessions were misclassified as "active" despite being blocked waiting for user input.

**Decision:** Treat `ask_user` tool requests as waiting state with visible question/choices:

1. **Type system**: Added `waitingQuestion?: string` and `waitingChoices?: string[]` to Session and DerivedStatus interfaces.
2. **Detection logic**: Implemented `getAskUserRequest()` helper that normalizes tool name variants (`ask_user`, `askUser`, `ask-user`) and extracts question/choices from multiple possible parameter locations for robustness across Copilot versions.
3. **Status classification**: ask_user filtered from active detection, detected early in waiting step, sets status to `'waiting'` with `waitingFor: 'user input'`.
4. **UI indicators**: Added amber glow CSS animation (`@keyframes glow-amber`) for waiting state, pulsing status dots, enhanced SessionDetail waiting banner showing question text and choice pills.
5. **Test coverage**: 26 comprehensive test cases in `statusDeriver.test.ts` covering core detection, edge cases, backward compatibility, and status priority.

**Files Changed:**
- Backend: `src/types/index.ts`, `server/services/statusDeriver.ts`, `server/services/sessionMapper.ts`
- Frontend: `src/index.css`, `src/components/kanban/KanbanTile.tsx`, `src/components/sessions/SessionCard.tsx`, `src/components/sessions/SessionDetail.tsx`, `src/components/common/StatusBadge.tsx`
- Tests: `server/services/__tests__/statusDeriver.test.ts`

**Outcome:** Build and lint clean. Tests written and awaiting Vitest installation (P0 audit item). All 26 tests expected to pass once implementation verified.

**Trade-offs:** Tests written before Vitest installed (TDD approach). Comprehensive coverage chosen over minimal smoke tests given critical nature of status detection.

---

### 3. Codebase Audit — Prioritized Improvement Backlog

**Author:** Homer (Lead / Architect)  
**Date:** 2025-07  
**Status:** Proposed  
**Scope:** Full-stack (frontend + backend)

**Prioritized Backlog:** 25 items organized by category (Tech Debt, DX, Performance, Feature, UX) and priority (P0, P1, P2, P3).

**Critical P0 Items:**
1. Sanitize `sessionId` in `eventTailReader.ts`, `planReader.ts`, `ptyManager.ts` — path traversal allows reading arbitrary local files
2. Sanitize `shell` param in `ptyManager.ts:29` — command injection via terminal WebSocket query params
3. Add test framework (Vitest) + integration tests for `sessionMapper.ts` and `eventTailReader.ts`

**High-Impact P1 Items:**
- Implement graceful shutdown in `server/index.ts`
- Add LRU eviction to caches in `eventTailReader.ts` and `adoClient.ts`
- Convert backend I/O from sync to async (readFileSync → promises)
- Add WebSocket heartbeat/ping-pong and auto-reconnect to terminal connections
- Add CI pipeline (GitHub Actions) — lint + typecheck + test on PR
- Virtualize session list using react-window or @tanstack/virtual

**Recommendation:** Ship P0 items (1-3) immediately. Then attack P1 items in order: graceful shutdown → cache bounds → terminal reconnect → CI pipeline → list virtualization. P2 items are good refactoring targets for parallel feature work.

**Full Backlog:** See `.squad/decisions/inbox/homer-codebase-audit-backlog.md` for detailed 25-item table with effort estimates, trade-offs, and rationale.

**Decision:** Team review and prioritization required. Recommend P0 as blocker for any public/shared deployment.

---

### 4. Add `latestUserMessage` to Session Model

**Author:** Lisa (Backend Dev)  
**Date:** 2025-07  
**Status:** Implemented  
**Scope:** Backend + Frontend (KanbanTile, SessionCard)

**Context:** Kanban tiles displayed `session.intent` (first user prompt), confusing for long-running sessions that should show current work.

**Decision:** Added optional `latestUserMessage` field derived from:
1. Event log (`events.jsonl`): Last `user.message` event with content
2. SQLite fallback: `getLastUserMessage()` from turns table

Frontend displays `session.latestUserMessage ?? session.intent`.

**Trade-offs:** Adds one SQLite query per session when no user message in event tail (negligible). `intent` preserved for backward compatibility.

---

### 5. assistantUpdates Field on Session API

**Author:** Lisa (Backend Dev)  
**Date:** 2025-07  
**Status:** Implemented  
**Scope:** Backend API (Session type + mapper)

**Context:** Need to expose assistant's pure conversational text responses (magenta status updates in Copilot CLI).

**Decision:**
1. **Filter**: `assistant.message` events where `data.toolRequests` absent/empty AND `data.content` is non-empty string
2. **Limit**: Capped at 20 most recent updates (avoid payload bloat)
3. **Ordering**: Chronological (oldest first in window); frontend can reverse
4. **Data source**: Event log only (not stored in turns table)

Returns `undefined` when no updates exist. Cleanly separates status updates from tool-calling turns.

---

### 6. CHANGELOG Format Convention

**Author:** Holden (Lead/Architect)  
**Date:** 2026-04  
**Status:** Proposed  
**Scope:** Documentation

**Context:** Version 1.1.0 used narrative "What's New" style with emoji. Version 1.2.0 uses [Keep a Changelog](https://keepachangelog.com) format (Added/Changed/Fixed).

**Decision:** Standardize on Keep a Changelog format going forward for consistency, scannability, and automated tooling compatibility.

**Trade-off:** Narrative style has more personality for release announcements; structured format better for grep and automation. Both currently coexist in CHANGELOG.md.

**Recommendation:** Adopt Added/Changed/Fixed for all future entries. Optionally back-port 1.1.0 in cleanup pass (low priority).

---

### 7. Token Utilization — Model Attribution Strategy

**Author:** Amos (Backend Dev)  
**Date:** 2025-07  
**Status:** Implemented  
**Scope:** Backend telemetry aggregation

**Context:** Token utilization analytics need to attribute `outputTokens` (from `assistant.message` events) to specific models. However, `assistant.message` events don't carry a `model` field — only `tool.execution_complete` events do.

**Decision:** Attribute each session's total output tokens to the **primary model** used in that session (the model with the most `tool.execution_complete` occurrences). Sessions with no model information attribute tokens to `"unknown"`.

**Trade-offs:**
- **Simpler**: One model per session avoids complex per-event correlation that the event structure doesn't support.
- **Approximate**: Multi-model sessions (rare — usually happen with sub-agents using different models) will attribute all tokens to the dominant model.
- **Good enough**: For dashboards showing proportional token spend across models, per-session granularity is sufficient.

**Alternative Considered:** Interleave-based attribution (find the nearest `tool.execution_complete` before each `assistant.message`) — rejected because event ordering within the same timestamp is unreliable, and the added complexity doesn't materially improve accuracy for the dashboard use case.

**Files Changed:** src/types/index.ts, server/services/telemetryAggregator.ts

### 8. Server & Bundle Performance Baselines

**Author:** Amos (Backend Dev), Naomi (Frontend Dev)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Backend + Frontend (performance tooling)

**Context:** Preparing for performance optimization. Created baseline measurement scripts for server API latency and frontend bundle sizes before any optimization work begins.

**Decisions:**

**Server Baseline (Amos):**
1. Created `server/__benchmarks__/baseline.ts` — standalone benchmark script using native Node `fetch` and `performance.now()`.
2. Measures HTTP endpoint latency (`/api/sessions`, `/api/sessions/:id`, `/api/telemetry`) — 20 iterations each, records avg/p50/p95/min/max response times and payload sizes.
3. Direct aggregation timing — imports `aggregateTelemetry()` and times cold vs warm execution (cache behavior).
4. Output: JSON report to file + human-readable table to stderr. Configurable iteration count via constant.
5. No test framework — pure Node/TypeScript. Server must be running separately (avoids coupling).
6. npm script: `bench:server` runs via `tsx`.

**Bundle Baseline (Naomi):**
1. Created `src/__benchmarks__/bundle-baseline.ts` — Node script using `tsx`. Shells out to `npx vite build`, scans `dist/`, computes gzipped sizes.
2. Flags chunks over 100KB gzipped. Output: JSON report to `src/__benchmarks__/bundle-baseline-results.json` + human-readable stderr table.
3. npm script: `bench:build` runs via `tsx`.
4. Baseline findings: Main bundle 465KB raw / 126KB gzip (over 100KB 🔴). xterm chunk 340KB raw / 86KB gzip. CSS 73KB raw / 12KB gzip. Total 861KB raw / 223KB gzip.
5. No new dependencies — uses only Node stdlib (`child_process`, `fs`, `path`, `zlib`).

**Key Choices:**
- Both scripts are one-time baseline snapshots (not continuous monitoring). Re-run after optimization passes to measure improvement.
- Results stored in `.gitignore` so individual developer runs don't pollute git history.
- Server baseline requires separate server startup (manual, avoids startup complexity). Bundle baseline bundles on each run (deterministic, no pre-built artifacts).

**Trade-offs:** Neither script is integrated into CI yet (added later as needed). No cloud deployment or production baseline (local dev only for now).

**Files Changed:** `server/__benchmarks__/baseline.ts`, `src/__benchmarks__/bundle-baseline.ts`, `src/__benchmarks__/bundle-baseline-results.json` (.gitignored), `package.json` (added `bench:server` and `bench:build` scripts).

---

### 9. API List/Detail Split + N+1 Query Elimination

**Author:** Amos (Backend Dev)
**Date:** 2026-04
**Status:** Implemented
**Scope:** Full-stack (Backend API, Frontend state management, UI components)

**Context:** The `GET /api/sessions` endpoint returned the full session graph (events, activityBuckets, rootAgent, assistantUpdates) for ALL sessions on every poll cycle. The frontend list view only needs summary data. Additionally, each session triggered 2–3 separate SQLite queries for first/last message and turn count (N+1 pattern).

**Decision:**

1. **Lightweight SessionSummary DTO** — Added `SessionSummary` interface to `src/types/index.ts`. `Session extends SessionSummary` — backward compatible. Summary omits `rootAgent`, `events`, `activityBuckets`, `assistantUpdates`.
2. **Batch N+1 queries** — Added `getSessionTurnDataBatch(sessionIds)` — single SQL query with `ROW_NUMBER() OVER (PARTITION BY session_id)` window functions.
3. **Database indexes** — `ensureIndexes()` attempts `CREATE INDEX IF NOT EXISTS` on `turns(session_id, turn_index)` and `sessions(updated_at)`.
4. **Route split** — `GET /api/sessions` → `SessionSummary[]` via `mapAllSessionSummaries()`. `GET /api/sessions/:id` → `Session` (unchanged).
5. **Frontend state split** — `useSessions` stores `SessionSummary[]`. `selectedSession` (full `Session`) fetched separately.

**Trade-offs:**
- Network view "show all" mode now shows session nodes without agent sub-trees (summaries lack `rootAgent`).
- Extra detail fetch when selecting a session, offset by much smaller list payload on every poll cycle.

**Files Changed:** `src/types/index.ts`, `server/services/sqliteReader.ts`, `server/services/sessionMapper.ts`, `server/routes/sessions.ts`, `src/services/sessionService.ts`, `src/hooks/useSessions.ts`, and 12 additional component/hook files.

---

### 10. Context Split + List Virtualization

**Author:** Naomi (Frontend Dev)
**Date:** 2026-04
**Status:** Implemented
**Scope:** Frontend (context architecture, rendering performance)

**Context:** The monolithic `SessionContext` caused re-render cascades — any state change (poll, click, search) re-rendered every consumer in the dashboard tree. Combined with an un-virtualized session list rendering all cards, this created measurable jank with 30+ sessions.

**Decision:**

1. **Split SessionContext into three focused providers**:
   - `SessionDataContext` — session list, loading/error, filters, counts, workstream names, auto-archive.
   - `SessionSelectionContext` — selected session/workstream + select/clear actions.
   - `SessionActionsContext` — stable callback functions (archive, workstream, filter setters).

2. **Focused consumer hooks** — `useSessionData()`, `useSessionSelection()`, `useSessionActions()`. `useSessionContext()` kept for backward compatibility.

3. **SessionCard memoization** — Wrapped in `React.memo` with custom comparator checking session id, status, selection, workstream, etc.

4. **Lazy-mount WorkstreamAutocomplete** — SessionCard renders simple pill/button; full autocomplete only mounts on edit.

5. **Virtualize SessionList** — Installed `@tanstack/react-virtual` (~3KB gzipped). Flat list views use `useVirtualizer` with 110px row height, 5-row overscan, 10px gap.

**Trade-offs:**
- Three hooks vs one — slightly more imports but dramatically fewer re-renders.
- Lazy WorkstreamAutocomplete has tiny visual flash on edit (acceptable).
- Grouped view not virtualized (addressed later if needed).

**Files Changed:** `src/context/SessionContext.tsx`, `src/components/sessions/SessionCard.tsx`, `src/components/sessions/SessionList.tsx`, `src/components/common/WorkstreamAutocomplete.tsx`, `src/App.tsx`, 13 consumer files, `package.json`.

---

### 11. Provider Abstraction for Multi-Source Sessions

**Author:** Amos (Backend Dev)
**Date:** 2026-04
**Status:** Implemented (foundation)
**Scope:** Backend (provider layer, config, types)

**Context:** Rocinante reads exclusively from Copilot CLI data (SQLite + event logs). To support Claude Code sessions, we need a provider abstraction that lets multiple session sources feed into the same dashboard.

**Decision:**

1. **SessionSource interface** (`server/services/providers/types.ts`) — contract that any session source must implement: `listSessionSummaries()`, `getSession(id)`, `isAvailable()`, `name`.
2. **CopilotSessionSource** — wraps existing Copilot logic, stamps `source: 'copilot'` on all sessions.
3. **Provider registry** (`providers/index.ts`) — `getActiveSources()` returns available sources, `getSourceByName()` for direct lookup.
4. **source field** — `source?: 'copilot' | 'claude'` on `SessionSummary` (optional for backward compat).
5. **Config** — `claudeDir` and `sessionSources` added to `RuntimeConfig`, exposed via config API.

**Architecture:**

- Helper functions stay in `sessionMapper.ts` (shared across all providers).
- `CopilotSessionSource` imports helpers from `sessionMapper.ts` — no circular deps.
- `sessionMapper.ts` public exports (`mapAllSessionSummaries`, `mapSessionById`) remain backward compatible and set `source: 'copilot'`.
- Routes unchanged — `routes/sessions.ts` still calls sessionMapper directly.
- Future `ClaudeSessionSource` will implement the same interface and get registered in `providers/index.ts`.

**Trade-offs:** sessionMapper's public functions and CopilotSessionSource have parallel implementations (both set `source: 'copilot'`). This avoids circular imports at the cost of minor duplication. When a future multi-source aggregator exists, the sessionMapper exports can delegate to it. `source` field is optional — existing frontends won't break.

**Files Changed:** New: `server/services/providers/types.ts`, `server/services/providers/copilotSource.ts`, `server/services/providers/index.ts`. Modified: `src/types/index.ts`, `server/services/sessionMapper.ts`, `server/config.ts`, `server/routes/config.ts`.

---

### 12. Security Hardening — Path Traversal + Shell Injection Fixes

**Author:** Amos (Backend Dev)
**Date:** 2026-04
**Status:** Implemented
**Scope:** Backend (security)

**Context:** P0 audit blockers for public release. Two critical vulnerabilities:
1. **Path traversal**: `sessionId` from HTTP/WebSocket params used directly in `path.join()` — attacker could read arbitrary files via `../../etc/passwd`.
2. **Shell injection**: `execSync(\`where.exe ${shellName}\`)` in ptyManager — attacker could inject arbitrary commands via WebSocket `shell` parameter.

**Decision:**

**Shared sanitization utility** (`server/utils/sanitize.ts`):
- `sanitizeSessionId()`: Rejects `..`, `/`, `\`, null bytes, and any character outside `[a-zA-Z0-9_-]`. Throws on invalid input.
- `validateShellName()`: Allowlist of known shells (powershell, pwsh, cmd, bash, zsh, sh, fish + `.exe` variants). Case-insensitive. Throws on unknown shell.

**Applied at service boundaries:**
- `eventTailReader.ts` — validates sessionId before file path construction
- `planReader.ts` — validates sessionId before file path construction
- `sessionMapper.ts` — validates sessionId in `getSessionCwd()` before workspace.yaml lookup
- `terminal.ts` — validates sessionId at WebSocket connection, before it's used as PTY id or in `--resume=` command
- `ptyManager.ts` — validates shell name before resolution; replaced `execSync` with `execFileSync`

**Test coverage:** 35 test cases covering valid UUIDs, path traversal attacks, null bytes, shell metacharacters, injection payloads, and edge cases.

**Trade-offs:** Allowlist for shells means adding a new shell requires a code change — acceptable for security-critical code. `sanitizeSessionId` is strict (alphanumeric + hyphens + underscores only). If Copilot CLI ever changes session ID format, this needs updating. Current format is UUIDs so this is safe.

**Files Changed:** New: `server/utils/sanitize.ts`, `server/utils/__tests__/sanitize.test.ts`. Modified: `server/services/eventTailReader.ts`, `server/services/planReader.ts`, `server/services/sessionMapper.ts`, `server/services/ptyManager.ts`, `server/routes/terminal.ts`.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
