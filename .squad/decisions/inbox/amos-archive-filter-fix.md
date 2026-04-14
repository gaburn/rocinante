# Decision: Skip Archived Sessions BEFORE Mapping

**Author:** Amos (Backend Dev)  
**Date:** 2026-04  
**Status:** Implemented  
**Scope:** Backend — session mapper + sessions route

## Context

`GET /api/sessions` was filtering archived sessions AFTER `mapAllSessionSummaries()` had already done all expensive per-session work (fs.statSync, event file reads up to 512KB each, agent tree building, status derivation) for all ~1787 sessions. The response cache (10s TTL) masked this on warm loads, but cold start after server restart still took ~60s because the computation cache was empty.

## Decision

Pass archived IDs into `mapAllSessionSummaries()` as an `excludeIds?: Set<string>` parameter so excluded sessions are filtered out BEFORE the per-session loop.

## Changes

1. **`server/services/sessionMapper.ts`** — `mapAllSessionSummaries(excludeIds?)`:
   - Copilot path: filters `getAllSessions()` rows before the loop, so excluded sessions never hit `fs.statSync`, `readEventsTail`, or `buildAgentTree`
   - Multi-source path: filters provider results before sorting
   - Backward compatible: no `excludeIds` = map everything (same as before)

2. **`server/routes/sessions.ts`** — GET handler:
   - Builds `new Set(getArchivedIds())` when archive is active and `includeArchived=false`
   - Passes the set to `mapAllSessionSummaries(excludeIds)`
   - Removed the post-hoc `.filter()` since it's now handled inside the mapper

## Trade-offs

- Slightly more coupling: the route now passes archive knowledge into the mapper. Acceptable because the mapper already accepts config-driven behavior.
- `evictStaleSummaries()` now only sees non-archived IDs, so archived sessions get evicted from the computation cache. This is actually desirable — no point caching summaries we never serve.

## Validation

- 141 tests passing (all 8 test files)
- Cold load now proportional to non-archived sessions (~100-200) instead of all sessions (1787)
