# Amos — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Backend Dev
- **Joined:** 2026-04-02T01:03:50.178Z

## Learnings

<!-- Append learnings below -->

### API List/Detail Split + N+1 Query Elimination (2026-04)
- **Motivation:** `GET /api/sessions` was returning full session graphs (events, activityBuckets, rootAgent, assistantUpdates) for ALL sessions. List view only needs summaries. Each session triggered 2–3 SQLite queries (N+1 pattern).
- **SessionSummary DTO:** New lightweight interface omits events/activityBuckets/rootAgent/assistantUpdates. Added scalar fields: `agentCount`, `turnCount`, `lastAssistantUpdate`. `Session extends SessionSummary` — backward compatible.
- **Batch queries:** Implemented `getSessionTurnDataBatch(sessionIds)` — single SQL query with `ROW_NUMBER() OVER (PARTITION BY session_id)` window functions fetches first message, last message, and turn count for all sessions at once. Replaces N+1 pattern.
- **Database indexes:** `ensureIndexes()` creates `CREATE INDEX IF NOT EXISTS` on `turns(session_id, turn_index)` and `sessions(updated_at)`. Fails silently for read-only databases.
- **Route split:** `GET /api/sessions` now returns `SessionSummary[]` via `mapAllSessionSummaries()`. `GET /api/sessions/:id` unchanged (returns full `Session`).
- **Frontend adaptation:** `useSessions` hook stores `SessionSummary[]` for list/kanban. `selectedSession` fetched separately from detail endpoint on selection + on poll refresh. Extra detail fetch offset by much smaller list payloads.
- **Trade-off accepted:** Network view "show all" mode now lacks agent sub-trees (summaries omit `rootAgent`). Acceptable — view rarely used for agent-level drill-down, and the network view was already expensive.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through early 2026-04 (Server Baseline Benchmarks, latestUserMessage field, assistantUpdates, DEMO_MODE, Conversation Search, ask_user detection, TokenUtilization Aggregation, and earlier API/N+1 development history).
