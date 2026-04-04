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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
