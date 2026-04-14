# Amos — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Backend Dev
- **Joined:** 2026-04-02T01:03:50.178Z

## Learnings

**Archive sync race condition fix (critical startup):** On app startup, `useArchive` POST and `useSessions` GET fired independently. If GET arrived first, server archive store was empty → all 1787 sessions returned unfiltered. Fix: added `syncComplete` flag to `useArchive` (resolves on success OR failure via `.finally()`). `useSessions` now gates initial `loadSessions()` on `archiveSyncComplete`, ensuring server has archive set before session list is fetched. The sidecar file (`initArchiveStore()`) loads on server startup, so this race only mattered on first-ever use or stale sidecar. 141 tests pass.

**Archive pre-filter fix (critical perf):** The archive filter was applied AFTER `mapAllSessionSummaries()` did all expensive per-session work (fs.statSync, event reads, agent tree building) for all 1787 sessions. Moved filtering BEFORE the loop by adding `excludeIds?: Set<string>` parameter to the mapper. Now excluded sessions never touch disk. Cold load becomes proportional to non-archived sessions (~100-200) instead of all sessions (1787). Both Copilot-only and multi-source paths handle the exclude set. 141 tests pass.

## Active Learnings Summary (2026-04)

**Security hardening (P0 audit):** Path traversal + shell injection fixed via `sanitize.ts` (sessionId validation, shell allowlist, `execFileSync` over `execSync`). 35 test cases covering injection vectors.

**Performance optimization:** Implemented 2-layer caching — response cache (10s TTL on `GET /api/sessions`) + per-session computation cache (keyed on event file mtime+size). Phase 3 adds server-aware archive to skip ~85% of archived sessions. Expected cold load: <10s (down from ~60s).

**Multi-source sessions:** Implemented provider abstraction with `CopilotSessionSource` and `ClaudeSessionSource`. Config-driven source selection (`'copilot'`, `'claude'`, `'both'`, `'auto'`). Default switched from hardcoded `'copilot'` to `'auto'` for intelligent provider detection.

**Archive persistence:** New `server/services/archiveStore.ts` with JSON sidecar. 4 new endpoints (GET, POST sync, POST add, POST remove). `GET /api/sessions` filters archived IDs when initialized. Search always searches full set; `isArchived` flag lets frontend distinguish archived hits. Backward compatible.

**Squad session detection:** Detects sessions spawned by squad orchestration via event type pattern matching (`/.squad\//i`). Enables dashboard to distinguish squad vs. organic user sessions.

---

## Archived Learnings

See `history-archive.md` for detailed notes on all 2026-04 implementation work.


## Archived Learnings

See `history-archive.md` for earlier work (2025-07 through 2026-04-10 pre-Phase-3): Server performance baselines, Phase 1–2 caching implementation, N+1 query elimination, context compaction detection, provider abstraction, Claude source, source badges, multi-source settings, squad detection, SessionSources default change.

## Archived Learnings

See `history-archive.md` for earlier work (2025-07 through 2026-04-10 pre-Phase-3): Server performance baselines, Phase 1–2 caching implementation, N+1 query elimination, context compaction detection, provider abstraction, Claude source, source badges, multi-source settings, squad detection, SessionSources default change.
