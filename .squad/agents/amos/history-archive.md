# Amos — History Archive

Archived learnings from 2025-07 through 2026-04. See `history.md` for active learnings.

## Archived Section: Performance Baseline & Telemetry (2025-07 to 2026-04)

### Server performance baseline benchmarks (2025-07)
- **What:** Created `server/__benchmarks__/baseline.ts` — a standalone benchmark script that measures API response times (avg/p50/p95), payload sizes, and direct `aggregateTelemetry()` cold/warm timing.
- **Endpoints tested:** `GET /api/sessions`, `GET /api/sessions/:id` (first session from list), `GET /api/telemetry`. 20 iterations each.
- **Telemetry cache insight:** `telemetryAggregator.ts` has module-level `cachedResult`/`cacheTimestamp` (30s TTL). Cache vars are private — can't clear from outside without modifying source. Cold vs warm measurement works by importing fresh (cache starts null) and timing first call vs second call.
- **Percentile computation:** Sort ascending, then `sorted[ceil(p/100 * n) - 1]`. Simple and correct for small sample sizes.
- **npm script:** `bench:server` runs via `tsx`. Server must be running separately.
- **Key files:** `server/__benchmarks__/baseline.ts`, `package.json`.

### latestUserMessage field (2025-07)
- **Event types**: User messages appear as `user.message` events in `events.jsonl` with content in `data.content`.
- **Data sources**: SQLite `turns` table (`user_message` column, ordered by `turn_index`) and event log are both reliable sources. Event log captures the tail; SQLite has the full history.
- **Pattern**: Added `getLastUserMessage()` to `sqliteReader.ts` mirroring the existing `getFirstUserMessage()` pattern. In `sessionMapper.ts`, events are checked first (most recent data), then SQLite as fallback.
- **Key files**: `server/services/sqliteReader.ts`, `server/services/sessionMapper.ts`, `server/services/eventTailReader.ts`, `server/services/eventTimelineBuilder.ts` (has the event type→summary mapping).
- **Frontend consumers of intent**: `KanbanTile.tsx`, `SessionCard.tsx`, `SessionDetail.tsx`, `NetworkDetailPanel.tsx`. The first two now prefer `latestUserMessage` over `intent`.

### assistantUpdates field (2025-07)
- **What**: Added `assistantUpdates?: string[]` to the Session type — an array of the assistant's pure text status updates (the magenta responses in Copilot CLI).
- **Event format**: Assistant status updates are `assistant.message` events in `events.jsonl` where `data.toolRequests` is absent or empty and `data.content` has text. Messages WITH `toolRequests` are tool-calling turns and are excluded.
- **Stats from live data**: ~10% of `assistant.message` events are pure text (112 out of 1120 sampled). The rest carry `toolRequests`.
- **Implementation**: `extractAssistantUpdates()` in `sessionMapper.ts` filters events chronologically, returns last 20 updates max. Returns `undefined` if none found.
- **Key files changed**: `src/types/index.ts`, `server/services/sessionMapper.ts`.

### DEMO_MODE for mock screenshots (2025-07)
- **What**: `DEMO_MODE=true` env var makes the API serve 12 realistic fake sessions so users can take screenshots without exposing real data.
- **Implementation**: `server/services/demoData.ts` exports `generateDemoSessions()` which builds fully-typed `Session[]` with agent trees, timelines, activity buckets, branch names, and all status variants (active/blocked/waiting/completed).
- **Wiring**: `server/routes/sessions.ts` short-circuits both `GET /api/sessions` and `GET /api/sessions/:id` when `DEMO_MODE === 'true'`. No other routes affected.
- **Sessions**: 12 sessions across 3 themed workstreams (Storefront UI ×4, Payments API ×3, Mobile App ×3) plus 2 ungrouped. Covers all status types including `blockedReason` and `waitingFor`.
- **Key files**: `server/services/demoData.ts`, `server/routes/sessions.ts`, `.env.example`.

### Conversation search API (2025-07)
- **What**: Added `GET /api/sessions/search?q=<query>` endpoint for server-side full-text search over conversation history.
- **Implementation**: `searchConversations()` in `sqliteReader.ts` uses a two-pass strategy: (1) FTS5 `search_index` table with phrase quoting for multi-word queries, (2) direct `LIKE` search on `turns.user_message` and `turns.assistant_response`. Results are deduplicated by session (first match wins), snippets show ~100 chars around the match.
- **Route placement**: Search route registered BEFORE `/sessions/:id` to prevent Express matching "search" as an `:id` param. Returns empty array in DEMO_MODE or for queries shorter than 2 chars.
- **Error handling**: FTS5 failure is silently caught (table may not exist in all DBs), falls through to LIKE search. Turns search errors are logged.
- **Key files**: `server/services/sqliteReader.ts`, `server/routes/sessions.ts`.

### ask_user tool detection & execution bypass fix (2025-07)
- **Initial implementation**: Detect when the assistant is waiting on an `ask_user` tool call and expose the question text and choices to the frontend.
- **ask_user type schema**: Added `waitingQuestion?: string` and `waitingChoices?: string[]` to both `Session` interface (`src/types/index.ts`) and `DerivedStatus` interface (`server/services/statusDeriver.ts`).
- **Detection logic**: New `getAskUserRequest()` helper in `statusDeriver.ts` inspects `toolRequests` array for items with `name`, `toolName`, or `tool_name` matching `ask_user` (normalized to handle `askUser`, `ask-user` variants). Extracts `question` and `choices` from tool parameters (checks `parameters`, `arguments`, `args`, `input` fields).
- **Status classification**: `ask_user` tool requests NOT classified as active (waiting for user input). In active-detection, ask_user calls are filtered out. In waiting-detection, ask_user is detected early and sets `waitingFor: 'user input'`.
- **Execution bypass fix**: When `ask_user` is pending, subsequent `tool.execution_start`/`tool.execution_complete` events for `ask_user` (and `report_intent`) were misclassifying sessions as `active`. Fixed by filtering ask_user execution events from active detection.
- **Question extraction**: Added `getToolCallId()` and `findAskUserFromToolExecution()` helpers to trace back from tool execution to parent `assistant.message` event, extracting question/choices.
- **Key files**: `src/types/index.ts`, `server/services/statusDeriver.ts`, `server/services/sessionMapper.ts`.

### assistantUpdates toolRequests filter fix (2025-07)
- **Bug**: `extractAssistantUpdates()` skipped `assistant.message` events that had both `content` and `toolRequests`. Coordinator often sends user-facing text AND tool calls in same message, so these were dropped.
- **Fix**: Removed the `toolRequests` skip filter. Now all `assistant.message` events with non-empty `content` included, regardless of `toolRequests`. `content` field is always user-facing text.
- **Verification**: Confirmed `tool.execution_complete` events not referenced, so sub-agent raw results cannot leak into updates.
- **Key files**: `server/services/sessionMapper.ts`.

### ask_user detection priority fix (2025-07)
- **Bug**: When `ask_user` pending alongside other tools (e.g., `report_intent`), general active-detection fires first because `tool.execution_complete` for `report_intent` satisfies `hasRecentExecutionActivity`. Ask_user waiting check never reached.
- **Root cause**: Detection order — active check (step 3) before ask_user waiting check (step 4).
- **Fix**: Inserted new step 2.5 between blocked and active that checks if `lastMeaningful` is ask_user execution or `assistant.message` containing ask_user request. Returns `waiting` immediately before general active check. Added `findAskUserParentMessage()` helper, `hook.start`/`hook.end` to ignorable types.
- **Priority order now**: shutdown → completed → blocked → **ask_user waiting** → active → general waiting → stale/completed → fallback active.
- **Key files**: `server/services/statusDeriver.ts`.

### getSortedByRecency timestamp tie-breaking fix (2025-07)
- **Bug**: Multiple events with same millisecond timestamp — JS stable sort preserves file order, causing `getLastMeaningfulEvent()` to return wrong event.
- **Fix**: Added secondary sort by original array index so later file positions (more-recent writes) win ties. Correct for append-only `events.jsonl`.
- **Diagnostic**: Added `console.log` (production-gated) logging when ask_user detected as last meaningful event.
- **Key files**: `server/services/statusDeriver.ts`.

### sparkline bucketing fix (2025-07)
- **Bug**: `buildActivityBuckets()` used full session time range (`startedAt` to `lastActivityAt`) but `eventTailReader.ts` only reads tail. Long sessions had events clustered in last few minutes while range spanned hours. Result: 19 empty buckets, 1 tall bar.
- **Fix**: Derive time range from actual event timestamps (`Math.min`/`Math.max` of parsed times) instead of session-level times. Events now spread across all 20 buckets.
- **Edge cases**: Empty events → 20 zeros. All-noise events → 20 zeros. All events at same timestamp → single centered bucket. `startedAt`/`lastActivityAt` params retained for compatibility but unused.
- **Key files**: `server/services/activityBucketBuilder.ts`.

### Token Utilization Aggregation (2026-04)
- **What:** Backend telemetry pipeline to aggregate and attribute token consumption across sessions by model.
- **Model Attribution:** Implemented primary model selection based on frequency — model with most `tool.execution_complete` occurrences gets credited with session's entire `outputTokens` (summed from `assistant.message` events). Sessions with no model info fallback to `"unknown"`.
- **Why primary model:** `assistant.message` events don't carry model info. Per-event interleave-based correlation rejected due to unreliable event ordering within same timestamps and minimal accuracy gain for dashboard aggregation.
- **Implementation:** Added `telemetryAggregator.ts` service with token accumulation logic. Type updates in `src/types/index.ts`.
- **Key files:** `src/types/index.ts`, `server/services/telemetryAggregator.ts`.

### API over-fetching + N+1 query elimination (2025-07 development, finalized 2026-04)
- **What:** Split sessions list endpoint (`GET /api/sessions`) from detail endpoint (`GET /api/sessions/:id`). List returns `SessionSummary[]` (lightweight DTO), detail returns full `Session`.
- **Over-fetching fix:** Created `SessionSummary` interface (extends nothing, `Session extends SessionSummary`). Summary omits `rootAgent`, `events`, `activityBuckets`, `assistantUpdates`. Adds `agentCount: number`, `turnCount: number`, `lastAssistantUpdate?: string` as scalars.
- **N+1 fix:** Added `getSessionTurnDataBatch()` in `sqliteReader.ts` — single SQL query using window functions (`ROW_NUMBER() OVER PARTITION BY session_id`) to fetch first message, last message, turn count for ALL sessions at once. Replaced per-session queries.
- **Database indexes:** Added `ensureIndexes()` that opens separate write connection to create `idx_turns_session_turn` and `idx_sessions_updated`. Fails silently if DB locked/read-only.
- **Frontend split:** `useSessions` stores `SessionSummary[]` for list. `selectedSession` (full `Session`) fetched separately via detail endpoint on selection + poll refresh. Custom names applied to both.
- **Component updates:** KanbanTile, SessionCard, KanbanColumn, KanbanBoard, WorkstreamDetail, SessionList changed from `Session` to `SessionSummary`. `countAgents(session.rootAgent)` replaced with `session.agentCount`. Network view handles both `Session` and `SessionSummary`.
- **Verification:** TypeScript clean, 57 tests pass, lint clean.
- **Key files changed:** Backend: `src/types/index.ts`, `server/services/sqliteReader.ts`, `server/services/sessionMapper.ts`, `server/routes/sessions.ts`. Frontend: `src/services/sessionService.ts`, `src/hooks/useSessions.ts`, `src/hooks/useWorkstreams.ts`, `src/context/SessionContext.tsx`, + 10 components.
