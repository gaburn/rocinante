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

### 2. Codebase Audit — Prioritized Improvement Backlog

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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
