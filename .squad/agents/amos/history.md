# Amos — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Backend Dev
- **Joined:** 2026-04-02T01:03:50.178Z

## Learnings

<!-- Append learnings below -->

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

### ask_user tool detection (2025-07)
- **What**: Sessions now detect when the assistant is waiting on an `ask_user` tool call and expose the question text and choices to the frontend.
- **Type schema**: Added `waitingQuestion?: string` and `waitingChoices?: string[]` to both `Session` interface (`src/types/index.ts`) and `DerivedStatus` interface (`server/services/statusDeriver.ts`).
- **Detection logic**: New `getAskUserRequest()` helper in `statusDeriver.ts` inspects `toolRequests` array for items with `name`, `toolName`, or `tool_name` matching `ask_user` (normalized to handle `askUser`, `ask-user` variants). Extracts `question` and `choices` from tool parameters (checks `parameters`, `arguments`, `args`, `input` fields for robustness across Copilot versions).
- **Status classification**: `ask_user` tool requests are NOT classified as active (they're waiting for user input). In the active-detection step, ask_user calls are filtered out. In the waiting-detection step, ask_user is detected early and sets `waitingFor: 'user input'` plus the extracted question/choices.
- **Data flow**: `statusDeriver.ts` populates `waitingQuestion`/`waitingChoices` → `sessionMapper.ts` passes them through to the `Session` object → frontend can now display the specific question the assistant is asking.
- **Key files**: `src/types/index.ts`, `server/services/statusDeriver.ts`, `server/services/sessionMapper.ts`.

### ask_user tool execution bypass fix (2025-07)
- **Bug**: When `ask_user` is pending, subsequent `tool.execution_start`/`tool.execution_complete` events for `ask_user` (and `report_intent`) caused `hasRecentExecutionActivity` to return `true`, misclassifying sessions as `active` instead of `waiting`.
- **Root cause**: The active-detection `sortedEvents.some()` matched `tool.execution_start` and `tool.execution_complete` by type alone, without checking whether the tool was `ask_user`.
- **Fix**: Added `isAskUserToolExecution()` helper that reads `data.toolName` / `data.tool_name` / `data.name` from execution events and normalizes the name. In the active-detection callback, `tool.execution_start` and `tool.execution_complete` events for `ask_user` now return `false`. In waiting detection (step 4), a new block checks if the last meaningful event is a `tool.execution_start`/`tool.execution_complete` for `ask_user` and classifies as `waiting`.
- **Question extraction**: Added `getToolCallId()` and `findAskUserFromToolExecution()` helpers to trace back from a tool execution event to its parent `assistant.message` event via matching `toolCallId`, extracting `question`/`choices` from the original tool request parameters.
- **Key files**: `server/services/statusDeriver.ts`.

### assistantUpdates toolRequests filter fix (2025-07)
- **Bug**: `extractAssistantUpdates()` in `sessionMapper.ts` skipped `assistant.message` events that had both `content` and `toolRequests`. The coordinator often sends user-facing text AND tool calls in the same message, so these were dropped — leaving only sub-agent result messages (pure text, no toolRequests) as the visible updates.
- **Fix**: Removed the `toolRequests` skip filter. Now all `assistant.message` events with non-empty `content` are included, regardless of whether they also carry `toolRequests`. The `content` field is always the user-facing text.
- **Verification**: Confirmed `tool.execution_complete` events are not referenced in this function, so sub-agent raw results cannot leak into updates.
- **Key files**: `server/services/sessionMapper.ts`.

### ask_user detection priority fix (2025-07)
- **Bug**: When `ask_user` is pending alongside other tools (e.g., `report_intent`), the general active-detection check (step 3) fires first because `tool.execution_complete` for `report_intent` satisfies `hasRecentExecutionActivity`. The ask_user waiting check (step 4) is never reached.
- **Root cause**: Detection order — active check (step 3) runs before ask_user waiting check (step 4). The `sortedEvents.some()` in step 3 correctly skips ask_user events but still matches other tools' execution events.
- **Fix**: Inserted a new step 2.5 between blocked (step 2) and active (step 3) that checks if `lastMeaningful` is an ask_user tool execution or an `assistant.message` containing an ask_user request. If so, returns `waiting` immediately before the general active check runs. Added `findAskUserParentMessage()` helper to trace from a tool execution event back to its parent `assistant.message` via `toolCallId`. Also added `hook.start` and `hook.end` to the ignorable types in `getLastMeaningfulEvent()` so hook events don't mask ask_user as the last meaningful event.
- **Priority order now**: shutdown → completed → blocked → **ask_user waiting** → active → general waiting → stale/completed → fallback active.

### Token Utilization Aggregation (2026-04)
- **What:** Backend telemetry pipeline to aggregate and attribute token consumption across sessions by model.
- **Model Attribution:** Implemented primary model selection based on frequency — the model with the most `tool.execution_complete` occurrences in a session gets credited with that session's entire `outputTokens` (summed from `assistant.message` events). Sessions with no model information fallback to `"unknown"`.
- **Why primary model:** `assistant.message` events don't carry model info (only `tool.execution_complete` events do). Per-event interleave-based correlation rejected due to unreliable event ordering within same timestamps and minimal accuracy gain for dashboard aggregation.
- **Implementation:** Added `telemetryAggregator.ts` service with token accumulation logic. Type updates in `src/types/index.ts` for telemetry data structures. Integrates cleanly with existing event processing pipeline.
- **Frontend integration:** Naomi building `TokenUtilization` React component to visualize token spend by model on stats page (Decision #7 filed).
- **Key files:** `src/types/index.ts`, `server/services/telemetryAggregator.ts`.
- **Key files**: `server/services/statusDeriver.ts`.

### getSortedByRecency timestamp tie-breaking fix (2025-07)
- **Bug**: When multiple events share the same millisecond timestamp, JS stable sort preserves original array order (file order = earliest written first). This means later events like `tool.execution_start(ask_user)` sort AFTER earlier events like `tool.execution_start(report_intent)`, causing `getLastMeaningfulEvent()` to return the wrong event.
- **Root cause**: `getSortedByRecency` only compared `toEpochMs()` values. Same-millisecond events retained file order (ascending), so the "first" sorted event was actually the oldest among ties.
- **Fix**: Added secondary sort by original array index (`b.idx - a.idx`) so that later file positions (which represent more-recent writes) win ties. This is the correct tiebreaker because `events.jsonl` is append-only.
- **Diagnostic**: Added a temporary `console.log` (gated by `NODE_ENV !== 'production'`) after `lastMeaningful` is computed, logging when `ask_user` is detected as the last meaningful event.
- **Key files**: `server/services/statusDeriver.ts`.

### sparkline bucketing fix (2025-07)
- **Bug**: `buildActivityBuckets()` used the full session time range (`startedAt` to `lastActivityAt`) to distribute events into 20 buckets. But `eventTailReader.ts` only reads the tail of `events.jsonl`, so for long sessions the events cluster in the last few minutes while the range spans hours. Result: 19 empty buckets and 1 tall bar.
- **Fix**: Changed bucketing to derive the time range from the actual event timestamps (`Math.min`/`Math.max` of parsed event times) instead of the session-level `startedAt`/`lastActivityAt`. Events now spread across all 20 buckets regardless of session duration.
- **Edge cases**: Empty events → 20 zeros. All-noise events → 20 zeros. All events at same timestamp → single centered bucket. The `startedAt`/`lastActivityAt` params are retained in the signature for API compatibility but unused.
- **Key files**: `server/services/activityBucketBuilder.ts`.
