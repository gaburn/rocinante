# Provider-Layer Pre-Filter + Computation Cache Fix

**Author:** Amos (Backend Dev)  
**Date:** 2026-04-16  
**Status:** Implemented  
**Scope:** Backend — provider layer, session mapper

## Context

After fixing the body-parser limit and adding the `excludeIds` pre-filter to `mapAllSessionSummaries()`, cold load was still >60s. Root cause: the default config (`sessionSources: 'auto'`) routes through the multi-source provider path in `mapAllSessionSummaries()`. The pre-filter and computation cache optimizations only existed in the Copilot-only direct path (unreachable under `'auto'`).

`CopilotSessionSource.listSessionSummaries()` was:
1. Processing ALL ~1787 sessions with no `excludeIds` filtering
2. Calling `mapSessionSummary()` directly — bypassing the per-session computation cache (`getOrComputeSummary`)
3. Returning all results, which were then post-filtered (too late — all expensive work already done)

## Changes

1. **`server/services/providers/types.ts`** — `SessionSource.listSessionSummaries()` now accepts `excludeIds?: Set<string>`
2. **`server/services/providers/copilotSource.ts`** — Pre-filters rows before loop. Uses `getOrComputeSummary()` with mtime+size cache key (same as the Copilot-only path). Evicts stale cache entries.
3. **`server/services/providers/claudeSource.ts`** — Pre-filters by `excludeIds` before file parsing
4. **`server/services/sessionMapper.ts`** — Passes `excludeIds` to each source in multi-source path. Removed redundant post-hoc `.filter()`

## Impact

- Cold load now proportional to non-archived sessions (~100-200) instead of all (1787) under `'auto'` mode
- Second+ requests benefit from per-session computation cache (mtime+size keyed) — near-instant for unchanged sessions
- Both optimizations now work regardless of `sessionSources` config value

## Validation

- 195 tests passing (all 11 test files)
- `npx tsc --noEmit` clean
