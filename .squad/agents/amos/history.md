# Amos — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Backend Dev
- **Joined:** 2026-04-02T01:03:50.178Z

## Learnings

**ADO PR URL fallback fix (2026-07):** PR links in session detail were rendering as `http://localhost:5173/pullrequest/{id}` because `pr.repository?.webUrl` was sometimes undefined, producing a relative `/pullrequest/{id}` path. Added `buildPrUrl()` helper to both `adoClient.ts` and `adoMcpClient.ts` — uses `webUrl` when present, otherwise constructs `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` from `getConfig()` values. Work item URLs already had a proper config-based fallback. 275 tests pass, server tsc clean.

**MCP client timeout + circuit breaker (2026-07):** Fixed indefinite hangs on `/api/ado/session-deliverables` and `/api/sessions` caused by `getMcpClient()` and `callTool()` having no timeouts. Added `withTimeout()` helper that races promises against a deadline. `client.connect(transport)` now has a 15s timeout (covers npx download + MCP handshake). Each `callTool()` has a 10s per-call timeout; on timeout, the client is torn down so next call retries fresh. Added circuit breaker: after connection failure, `mcpConnectionFailed` flag skips retries for 60s cooldown (auto-resets). `shutdownMcpClient()` resets the breaker. The existing 10s `Promise.race` on `enrichSessionsWithAdoCounts()` in sessions.ts was already correct. 280 tests pass, eslint clean, server tsc clean.

**ADO session summary enrichment (2026-07):**Added inline ADO deliverable counts to `GET /api/sessions` response. `enrichSessionsWithAdoCounts()` in `server/routes/sessions.ts` collects unique branches from sessions, fetches PRs per branch (MCP-first via `mcpListPullRequests`, REST fallback via `getPullRequestsByBranches`), then fetches work-item IDs per PR (`mcpGetPullRequest` with `includeWorkItemRefs: true`, REST fallback via `getWorkItemsForPullRequest`). Builds `Map<branch, {prCount, workItemCount}>` and stamps `adoPrCount`/`adoWorkItemCount` on each session. Key safeguards: (1) `isAdoConfigured()` gate — zero overhead for non-ADO users, (2) `Promise.allSettled` for all branch and PR lookups, (3) 10s timeout via `Promise.race` — enrichment silently skipped on timeout/error, (4) handler converted to async but runs synchronously when ADO not configured (tests remain sync-compatible). Updated `sessionsCache.test.ts` with mocks for `isAdoConfigured`, `adoMcpClient`, and `adoClient`. 233 tests pass, eslint clean, server tsc clean.

**ADO MCP client integration (2026-07):** Created `server/services/adoMcpClient.ts` — a typed MCP client wrapper that spawns `@azure-devops/mcp` as a stdio subprocess via `npx -y @azure-devops/mcp {org} -d core repositories work-items`. Uses `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`. Lazy singleton pattern (one client per org), auto-reconnects if subprocess dies, 5-min response cache. Exports: `mcpListPullRequests`, `mcpGetPullRequest`, `mcpGetWorkItemsBatch`, `mcpTestConnection`, `shutdownMcpClient`, `clearMcpCache`. Refactored `GET /api/ado/session-deliverables` in `server/routes/ado.ts` to MCP-first with REST fallback — if MCP client fails to init (e.g., npx unavailable), catches and falls through to existing `adoClient.ts` direct REST functions. Wired `shutdownMcpClient()` into `server/index.ts` graceful shutdown. Key design: `@azure-devops/mcp` is NOT a project dependency — it's a standalone MCP server invoked via npx at runtime. Only `@modelcontextprotocol/sdk` is installed (^1.29.0). 233 tests pass, eslint clean, server tsc clean.

**Session deliverables endpoint + PR work items (2026-07):** Added `getWorkItemsForPullRequest(repositoryId, prId)` to `server/services/adoClient.ts` — fetches work item refs from the PR endpoint, extracts IDs, batch-fetches full details via existing `getWorkItems()`. Uses `cachedFetch` (5-min TTL), handles 404 gracefully (returns []). Added `repositoryId` to `AdoPullRequest` type and PR mapping. New `GET /api/ado/session-deliverables?branch=` endpoint in `server/routes/ado.ts` fetches PRs for a branch, collects linked work items across all PRs (deduped by ID), returns `{ pullRequests, workItems }`. Added `SessionDeliverables` interface to `src/types/ado.ts`. 233 tests pass, eslint clean, server tsc clean.

**ADO test-connection 403 fix (2026-07):** `handleTestConnection()` in `src/components/settings/SettingsPanel.tsx` was calling `POST /api/ado/test` without first saving the org/project values to the server via `PATCH /api/ado/config`. The server-side `runtimeConfig` still had empty strings, so `isAdoConfigured()` returned false → 403. Fix: added `await updateAdoConfig({ organization, project })` before `testAdoConnection()` inside `handleTestConnection`. Save errors flow through the existing connection-result UI. 233 tests pass, eslint clean.

**Session plan initial-load fix (2026-07):**On fresh app load, the Session Plan for the auto-selected first session wasn't loading. Root cause: `loadSessions()` skipped the inner detail refresh when `selectedIdRef.current` was null (initial state). The auto-select effect then set the session ID in the next render, and the detail-fetch effect started the request in yet another render — a multi-render-cycle gap that prevented PlanViewer from mounting in time. Fix: eagerly auto-select the first session inside `loadSessions()` (setting both the ref and state) so the inner detail refresh picks it up in the same async flow. Also added `key={session.id}` on PlanViewer for clean per-session state, and passed AbortSignal through `getSessionPlan` for proper fetch cancellation. 233 tests pass, eslint clean.

**Plan reader format extensions (2026-07):** Extended `server/services/planReader.ts` to handle 6 additional markdown formats beyond the original `## / ###` headings + `- bullet` + `- **bold**: desc`. New formats: (1) checkbox `- [ ]` / `- [x]` with `checked`/`checkedFromFile` fields on PlanTask, (2) numbered lists `1. Task`, (3) markdown tables with status detection (✅/❌/Done/Pending), (4) nested indented bullets appended to parent description, (5) code block immunity (``` fences skip task detection), (6) `# Title` single-hash headings as sections. Extracted `parsePlanMarkdown(raw)` as a pure function (exported for testing) from `readSessionPlan()`. All 230 tests pass (35 planReader), TypeScript clean on both tsconfigs.

**Sprint 1 Final — Claude pre-filter fix + commit + push (2026-04-16):** Fixed `ClaudeSessionSource.listSessionSummaries()` pre-filter bug: `file.sessionId` doesn't exist on `DiscoveredFile` (only has `filePath` and `mtimeMs`). Fix calls `buildFileMeta(file)` to derive the session ID from the file's first JSONL entry, then checks `meta.id` against `excludeIds`. This is still cheaper than `buildSummaryFromFile` which parses the entire file. 195 tests pass, TypeScript clean. Committed all Sprint 1 app changes (6 files) and pushed to `dev`. PR creation blocked by Enterprise Managed User restriction — gaburn needs to open draft PR manually from `dev → main`.

**Sprint 1 C1 — PayloadTooLargeError fix (2026-04-16):** Changed `express.json()` to `express.json({ limit: '2mb' })` in `server/index.ts`. The default 100KB body limit was rejecting the archive sync payload (1787 UUIDs ≈ 70-75KB JSON, but with overhead hits the limit). Added 12 integration tests in `server/routes/__tests__/archiveSync.test.ts` covering: large payload acceptance (1787+ UUIDs), round-trip POST→GET correctness, edge cases (empty, single, 2500 UUIDs), validation errors, and payload size assertions. 188 tests pass, TypeScript clean.

**Archive sync race condition fix (critical startup):**On app startup, `useArchive` POST and `useSessions` GET fired independently. If GET arrived first, server archive store was empty → all 1787 sessions returned unfiltered. Fix: added `syncComplete` flag to `useArchive` (resolves on success OR failure via `.finally()`). `useSessions` now gates initial `loadSessions()` on `archiveSyncComplete`, ensuring server has archive set before session list is fetched. The sidecar file (`initArchiveStore()`) loads on server startup, so this race only mattered on first-ever use or stale sidecar. 141 tests pass.

**Archive pre-filter fix (critical perf):** The archive filter was applied AFTER `mapAllSessionSummaries()` did all expensive per-session work (fs.statSync, event reads, agent tree building) for all 1787 sessions. Moved filtering BEFORE the loop by adding `excludeIds?: Set<string>` parameter to the mapper. Now excluded sessions never touch disk. Cold load becomes proportional to non-archived sessions (~100-200) instead of all sessions (1787). Both Copilot-only and multi-source paths handle the exclude set. 141 tests pass.

**Provider-layer pre-filter + cache bypass fix (critical perf):** The previous pre-filter fix only applied in the Copilot-only direct path inside `mapAllSessionSummaries()`, but the default config (`sessionSources: 'auto'`) routes through the multi-source provider path. `CopilotSessionSource.listSessionSummaries()` was processing ALL 1787 sessions with no `excludeIds` pre-filter and no per-session computation cache — both optimizations existed only in the dead Copilot-only codepath. Fix: (1) Added `excludeIds?: Set<string>` to `SessionSource` interface. (2) `CopilotSessionSource.listSessionSummaries()` now pre-filters rows AND uses `getOrComputeSummary()` cache. (3) `ClaudeSessionSource` pre-filters too. (4) `mapAllSessionSummaries()` passes `excludeIds` through to each source. Removed redundant post-hoc `.filter()`. 195 tests pass, TypeScript clean.

## Active Learnings Summary (2026-04)

**Security hardening (P0 audit):** Path traversal + shell injection fixed via `sanitize.ts` (sessionId validation, shell allowlist, `execFileSync` over `execSync`). 35 test cases covering injection vectors.

**Performance optimization:** Implemented 2-layer caching — response cache (10s TTL on `GET /api/sessions`) + per-session computation cache (keyed on event file mtime+size). Phase 3 adds server-aware archive to skip ~85% of archived sessions. Expected cold load: <10s (down from ~60s).

**Multi-source sessions:** Implemented provider abstraction with `CopilotSessionSource` and `ClaudeSessionSource`. Config-driven source selection (`'copilot'`, `'claude'`, `'both'`, `'auto'`). Default switched from hardcoded `'copilot'` to `'auto'` for intelligent provider detection.

**Archive persistence:** New `server/services/archiveStore.ts` with JSON sidecar. 4 new endpoints (GET, POST sync, POST add, POST remove). `GET /api/sessions` filters archived IDs when initialized. Search always searches full set; `isArchived` flag lets frontend distinguish archived hits. Backward compatible.

**Squad session detection:** Detects sessions spawned by squad orchestration via event type pattern matching (`/.squad\//i`). Enables dashboard to distinguish squad vs. organic user sessions.

---

## Archived Learnings

See `history-archive.md` for detailed notes on all 2026-04 implementation work.

---

**Sprint 1 Assignment: Rocinante Performance Plan (2026-04-16)**

**Critical Path:** Fix `express.json()` body-parser limit (0.25d). Archive sync payload (1787 UUIDs) exceeds 100KB default. Changing to 2MB limit unblocks all downstream caching and archive-filtering work.

**Sprint 1 Tasks:**
1. Body-parser limit → 2MB (critical)
2. Server pre-warming post-startup (Sprint 2, 1d)
3. Bounded caches w/ LRU eviction (Sprint 2, 0.5d)

**Full plan:** 3 sprints, target cold load <5s. Naomi owns AbortController polling, Alex owns Vite deps caching.

---

## 2026-07 MCP Integration Sprint

**ADO MCP Client Integration (2026-07):** Created `server/services/adoMcpClient.ts` — a typed MCP client wrapper that spawns `@azure-devops/mcp` as a stdio subprocess via `npx -y @azure-devops/mcp {org} -d core repositories work-items`. Uses `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`. Lazy singleton pattern (one client per org), auto-reconnects if subprocess dies, 5-min response cache. Exports: `mcpListPullRequests`, `mcpGetPullRequest`, `mcpGetWorkItemsBatch`, `mcpTestConnection`, `shutdownMcpClient`, `clearMcpCache`. Refactored `GET /api/ado/session-deliverables` in `server/routes/ado.ts` to MCP-first with REST fallback — if MCP client fails to init (e.g., npx unavailable), catches and falls through to existing `adoClient.ts` direct REST functions. Wired `shutdownMcpClient()` into `server/index.ts` graceful shutdown. Key design: `@azure-devops/mcp` is NOT a project dependency — it's a standalone MCP server invoked via npx at runtime. Only `@modelcontextprotocol/sdk` is installed (^1.29.0). 233 tests pass, eslint clean, server tsc clean.

**Session Deliverables Endpoint + PR Work Items (2026-07):** Added `getWorkItemsForPullRequest(repositoryId, prId)` to `server/services/adoClient.ts` — fetches work item refs from the PR endpoint, extracts IDs, batch-fetches full details via existing `getWorkItems()`. Uses `cachedFetch` (5-min TTL), handles 404 gracefully (returns []). Added `repositoryId` to `AdoPullRequest` type and PR mapping. New `GET /api/ado/session-deliverables?branch=` endpoint in `server/routes/ado.ts` fetches PRs for a branch, collects linked work items across all PRs (deduped by ID), returns `{ pullRequests, workItems }`. Added `SessionDeliverables` interface to `src/types/ado.ts`. 233 tests pass, eslint clean, server tsc clean.

**ADO Session Summary Enrichment (2026-07):** Added inline ADO deliverable counts to `GET /api/sessions` response. `enrichSessionsWithAdoCounts()` in `server/routes/sessions.ts` collects unique branches from sessions, fetches PRs per branch (MCP-first via `mcpListPullRequests`, REST fallback via `getPullRequestsByBranches`), then fetches work-item IDs per PR (`mcpGetPullRequest` with `includeWorkItemRefs: true`, REST fallback via `getWorkItemsForPullRequest`). Builds `Map<branch, {prCount, workItemCount}>` and stamps `adoPrCount`/`adoWorkItemCount` on each session. Key safeguards: (1) `isAdoConfigured()` gate — zero overhead for non-ADO users, (2) `Promise.allSettled` for all branch and PR lookups, (3) 10s timeout via `Promise.race` — enrichment silently skipped on timeout/error, (4) handler converted to async but runs synchronously when ADO not configured (tests remain sync-compatible). Updated `sessionsCache.test.ts` with mocks for `isAdoConfigured`, `adoMcpClient`, and `adoClient`. 233 tests pass, eslint clean, server tsc clean.
