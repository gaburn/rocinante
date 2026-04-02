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
