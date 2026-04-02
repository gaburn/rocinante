# Squad Decisions

## Active Decisions

### 1. Codebase Audit — Prioritized Improvement Backlog

**Author:** Homer (Lead / Architect)  
**Date:** 2025-07  
**Status:** Proposed  
**Scope:** Full-stack (frontend + backend)

**Context:** Performed a comprehensive audit of the entire Rocinante codebase (66 frontend source files, 10 backend service files, 4 route files). Zero tests exist. No CI pipeline for build/lint. Several security and reliability gaps identified.

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
