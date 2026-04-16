# Naomi — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

### AbortController on Session Polling (Sprint 1 — H3) (2026-04-16)
- **Problem:** `loadSessions()` polls on an interval but didn't abort prior in-flight requests. During cold start (slow server), multiple requests queue and stale responses arrive out-of-order causing UI flicker.
- **Fix:** Added `loadSessionsAbortRef` (mirrors existing `searchAbortRef` pattern). Before each `loadSessions()` call, previous in-flight request is aborted via `AbortController.abort()`. Signal is passed to both `getSessions()` and `getSessionById()`. AbortErrors are silently ignored (a newer request has taken over). `finally` block only clears `isLoading` if the controller is still current — prevents premature loading-state reset when superseded. Unmount cleanup effect aborts any pending request.
- **Service layer:** Added optional `signal?: AbortSignal` parameter to `getSessions()` and `getSessionById()` in `sessionService.ts`, forwarded to `fetch()`.
- **Tests:** 7 new tests in `useSessionsAbort.test.ts` covering: signal passing, abort-on-re-call, abort-on-unmount, non-abort error propagation, fresh controller per call, rapid sequential calls (only last wins). All 195 tests pass. TypeScript clean.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through 2026-04-15 (pruneStaleIds corruption fix, archive sync race, context split + virtualization, bundle baseline, squad badge, multi-source settings, and more).

### AbortController on Session Polling (Sprint 1 — H3) (2026-04-16)
- **Problem:** `loadSessions()` polls on an interval but didn't abort prior in-flight requests. During cold start (slow server), multiple requests queue and stale responses arrive out-of-order causing UI flicker.
- **Fix:** Added `loadSessionsAbortRef` (mirrors existing `searchAbortRef` pattern). Before each `loadSessions()` call, previous in-flight request is aborted via `AbortController.abort()`. Signal is passed to both `getSessions()` and `getSessionById()`. AbortErrors are silently ignored (a newer request has taken over). `finally` block only clears `isLoading` if the controller is still current — prevents premature loading-state reset when superseded. Unmount cleanup effect aborts any pending request.
- **Service layer:** Added optional `signal?: AbortSignal` parameter to `getSessions()` and `getSessionById()` in `sessionService.ts`, forwarded to `fetch()`.
- **Tests:** 7 new tests in `useSessionsAbort.test.ts` covering: signal passing, abort-on-re-call, abort-on-unmount, non-abort error propagation, fresh controller per call, rapid sequential calls (only last wins). All 195 tests pass. TypeScript clean.
