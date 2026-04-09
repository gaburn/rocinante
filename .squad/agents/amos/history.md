# Amos — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Backend Dev
- **Joined:** 2026-04-02T01:03:50.178Z

## Learnings

<!-- Append learnings below -->

### Security Hardening — Path Traversal + Shell Injection (2026-04)
- **Motivation:** P0 audit items — `sessionId` was used unsanitized in `path.join()` across eventTailReader, planReader, and sessionMapper (path traversal). `ptyManager.ts` used `execSync` with string interpolation for shell lookup (command injection). Terminal route passed raw `sessionId` into a command string written to the PTY.
- **Sanitize utility:** Created `server/utils/sanitize.ts` with two focused validators:
  - `sanitizeSessionId()` — rejects `..`, `/`, `\`, null bytes, and non-alphanumeric/hyphen/underscore characters. Pattern: `/^[a-zA-Z0-9_-]+$/`.
  - `validateShellName()` — allowlist of known shells (powershell, pwsh, cmd, bash, zsh, sh, fish + `.exe` variants). Case-insensitive comparison.
- **Applied in:** `eventTailReader.ts`, `planReader.ts`, `sessionMapper.ts` (getSessionCwd), `terminal.ts` (WebSocket connection handler).
- **Shell injection fix:** Replaced `execSync(\`where.exe ${shellName}\`)` with `execFileSync('where.exe', [shellName])` in ptyManager — eliminates shell interpretation entirely. Added `validateShellName()` call before the shell resolution logic.
- **Test coverage:** 35 test cases in `server/utils/__tests__/sanitize.test.ts` covering valid inputs, path traversal vectors, null bytes, shell metacharacters, and injection payloads.
- **Key insight:** Defense in depth — validate at the entry point (route/service boundary) AND use safe APIs (`execFileSync` over `execSync`). Don't rely on just one layer.

### API List/Detail Split + N+1 Query Elimination (2026-04)
- **Motivation:** `GET /api/sessions` was returning full session graphs (events, activityBuckets, rootAgent, assistantUpdates) for ALL sessions. List view only needs summaries. Each session triggered 2–3 SQLite queries (N+1 pattern).
- **SessionSummary DTO:** New lightweight interface omits events/activityBuckets/rootAgent/assistantUpdates. Added scalar fields: `agentCount`, `turnCount`, `lastAssistantUpdate`. `Session extends SessionSummary` — backward compatible.
- **Batch queries:** Implemented `getSessionTurnDataBatch(sessionIds)` — single SQL query with `ROW_NUMBER() OVER (PARTITION BY session_id)` window functions fetches first message, last message, and turn count for all sessions at once. Replaces N+1 pattern.
- **Database indexes:** `ensureIndexes()` creates `CREATE INDEX IF NOT EXISTS` on `turns(session_id, turn_index)` and `sessions(updated_at)`. Fails silently for read-only databases.
- **Route split:** `GET /api/sessions` now returns `SessionSummary[]` via `mapAllSessionSummaries()`. `GET /api/sessions/:id` unchanged (returns full `Session`).
- **Frontend adaptation:** `useSessions` hook stores `SessionSummary[]` for list/kanban. `selectedSession` fetched separately from detail endpoint on selection + on poll refresh. Extra detail fetch offset by much smaller list payloads.
- **Trade-off accepted:** Network view "show all" mode now lacks agent sub-trees (summaries omit `rootAgent`). Acceptable — view rarely used for agent-level drill-down, and the network view was already expensive.

### Context Compaction Detection (2026-04)
- **Motivation:** Flag sessions where context compaction occurred so the dashboard can surface this signal.
- **Type changes:** Added `compacted: boolean` and `compactionCount: number` to `SessionSummary` in `src/types/index.ts`. Since `Session extends SessionSummary`, both list and detail endpoints include these fields.
- **Detection:** Added `countCompactionEvents()` helper in `sessionMapper.ts`. Single pass over the events array (already in hand). Checks for `session.compaction_start` (sets `compacted: true`) and `session.compaction_complete` (increments `compactionCount` and sets `compacted: true`). Case-insensitive type matching for consistency with existing event handlers.
- **Wired into:** Both `mapToSession()` (detail endpoint) and `mapSessionSummary()` (list endpoint). Zero additional I/O — reuses the existing `events` parameter.
- **Key insight:** Compaction detection only needs the boolean+count — no need to store the token data from the event payloads in the summary. Keeps the DTO lightweight.

### Provider Abstraction — Multi-Source Session Support (2026-04)
- **Motivation:** Foundation for multi-source sessions. Rocinante currently only reads Copilot CLI data; adding a provider abstraction so Claude Code (and future sources) can also feed sessions into the dashboard.
- **New files:**
  - `server/services/providers/types.ts` — `SessionSource` interface and `SessionSourceName` type (`'copilot' | 'claude'`).
  - `server/services/providers/copilotSource.ts` — `CopilotSessionSource` class implementing `SessionSource`. Imports shared helpers from `sessionMapper.ts`, stamps `source: 'copilot'` on every returned session. `isAvailable()` checks if SQLite DB exists.
  - `server/services/providers/index.ts` — Provider registry with `getActiveSources()` and `getSourceByName()`.
- **Type changes:** Added optional `source?: 'copilot' | 'claude'` to `SessionSummary` in `src/types/index.ts`. Backward compatible.
- **sessionMapper refactoring:** Kept all helper functions in `sessionMapper.ts` as shared utilities. `mapAllSessionSummaries()` and `mapSessionById()` now stamp `source: 'copilot'` on returned sessions. No circular imports — `copilotSource.ts` imports from `sessionMapper.ts`, not vice versa.
- **Config additions:** Added `claudeDir` (default `~/.claude`, env `CLAUDE_DIR`) and `sessionSources` (default `'copilot'`, env `SESSION_SOURCES`, options: `copilot | claude | both`) to `RuntimeConfig`. Config route exposes both via GET/PATCH.
- **Key insight:** Avoided circular deps by keeping `sessionMapper.ts` self-contained for its public API. `CopilotSessionSource` is a parallel entry point that reuses the same helpers. Routes didn't change at all.

### Claude Code Session Source — Parser + Mapper + Multi-Source Merge (2026-04)
- **Motivation:** Second provider for multi-source dashboard. Claude Code stores sessions as JSONL files in `~/.claude/projects/`, fundamentally different from Copilot's SQLite + event-log format.
- **New file:** `server/services/providers/claudeSource.ts` — implements `SessionSource` interface. Self-contained parser/mapper with zero dependency on Copilot-specific code (`sqliteReader`, `eventTailReader`, etc.).
- **JSONL parsing:** `parseClaudeEntry()` handles 4 entry types: `summary`, `user`, `assistant`, `file-history-snapshot` (skipped). Content blocks include `text`, `thinking` (skipped), `tool_use`, `tool_result`.
- **Discovery:** `fs.readdirSync` with `recursive: true` (Node 18.17+) — no external `glob` dependency needed. Filters out `agent-*` prefix and `warmup` files. Sorts by file mtime descending.
- **ID scheme:** All Claude session IDs prefixed with `claude:` to prevent collisions with Copilot UUIDs. Source is `leafUuid` from the summary entry, falling back to filename stem.
- **Status derivation:** Simple — file mtime within `staleThresholdMs` → `'active'`, otherwise `'completed'`. No event-based detection (Claude JSONL lacks the heartbeat/shutdown events Copilot has).
- **Tool mapping:** `collectToolPairs()` matches `tool_use` blocks (in assistant entries) to `tool_result` blocks (in subsequent user entries) by `id ↔ tool_use_id`. Generates paired `tool.execution_start` and `tool.execution_complete` timeline events.
- **Agent tree:** Flat — Claude sessions have no sub-agent concept. Single root node named `'claude'` with tool calls attached.
- **Provider registry update:** `providers/index.ts` now instantiates both `CopilotSessionSource` and `ClaudeSessionSource`. `getActiveSources()` filters by both availability AND the `sessionSources` config value.
- **sessionMapper merge logic:**
  - `mapSessionById()` routes `claude:*` IDs directly to `ClaudeSessionSource`, others to Copilot lookup.
  - `mapAllSessionSummaries()` and `mapAllSessions()` check config: `'copilot'` → original Copilot-only path (no behavioral change), `'claude'` or `'both'` → delegates to provider layer, merges results sorted by `lastActivityAt`.
  - Backward compatible: default config is `'copilot'`, so existing deployments see zero change.
- **Test fixture:** `server/services/providers/__tests__/fixtures/claude-session-sample.jsonl` — 10-line synthetic JSONL covering all entry types (summary, user messages, tool_use/tool_result pairs, thinking blocks, file-history-snapshot).
- **Key insight:** Claude's JSONL is self-contained per file — no external DB, no event tail reads, no workspace.yaml. This makes the source simpler but means all data must be parsed from a single file. The `parseFirstEntry()` fast-path reads only 8KB for list-view summaries.

### Source Badge + Source Filter (2026-04)
- **Purpose:** Visual differentiation and filtering of sessions by provider source (Copilot vs Claude), supporting the new multi-source provider abstraction.
- **SourceBadge component:** `src/components/common/SourceBadge.tsx` — small pill/chip with CSS classes. Copilot gets blue-teal accent, Claude gets orange-amber. Defaults to "Copilot" when `source` is undefined (backward compat).
- **CSS:** `.source-badge`, `.source-badge--copilot`, `.source-badge--claude` in `src/index.css`. Light-mode overrides via `.light` selector. Uses oklch colors matching the dashboard palette.
- **Badge placement:** KanbanTile (meta row, next to agent count), SessionCard (meta row, next to agent count), SessionDetail (header, next to StatusBadge).
- **Source filter:** `sourceFilter` state (`'copilot' | 'claude' | 'all'`) added to `useSessions` hook. Filters via `(s.source ?? 'copilot') === sourceFilter`. Wired through `SessionDataContext` (read) and `SessionActionsContext` (setter), following the existing context-split pattern.
- **Header dropdown:** Native `<select>` in Header.tsx between view-mode toggle and settings gear. Styled with existing surface/border tokens. Options: All Sources / Copilot / Claude.
- **SessionCard memo:** Added `session.source` to comparator to avoid stale badge renders.
- **No new dependencies.** TypeScript clean (`tsc --noEmit` passes).

### Multi-Source Settings UI (2026-04)
- **Purpose:** Expose backend configuration for multi-source session support via frontend settings.
- **Settings service:** `useSettings()` hook reads from `/api/config`, exposes `sessionSources` and `claudeDir` strings. POST `/api/settings` on change with `{ sessionSources?, claudeDir? }` body. Automatically refreshes config after update.
- **SettingsPanel additions:** Two new fields under "Session Sources" section: (1) Session sources dropdown (options: "Copilot Only", "Claude Only", "Both"), (2) Claude directory text input with placeholder showing `~/.claude/projects`.
- **UI behavior:** Changes apply immediately (no Save button). Invalid Claude paths are handled gracefully by the server (404 → no sessions found).
- **Type definitions:** `sessionSources: 'copilot' | 'claude' | 'both'` and `claudeDir: string` added to `Settings` type in `src/types/settings.ts`.
- **No new dependencies.** TypeScript clean. Settings UI integrates seamlessly with existing pattern.

### SessionSources Default Change — 'copilot' → 'auto' (2026-04-09)
- **What changed:** Updated sessionSources default from hardcoded `'copilot'` to `'auto'` across the full stack to enable intelligent provider selection by default.
- **Server-side:** Config default in `server/config.ts`, session mapper logic in `server/services/sessionMapper.ts` and `server/services/providers/index.ts` now respects `'auto'` to auto-detect available sources. Route endpoint `server/routes/config.ts` exposes new default.
- **Client-side:** Type definition updated in `src/types/settings.ts`. Settings service in `src/services/settingsService.ts` reflects new default on first read. UI in `src/components/settings/SettingsPanel.tsx` updated to show `'auto'` as the default option.
- **Backward compatibility:** Explicit settings (e.g., `'copilot'` or `'claude'` or `'both'`) continue to be honored. Only the initial default changed.
- **Verification:** TypeScript clean — `tsc --noEmit` passes. All modified files follow existing patterns. No breaking API changes.

### Squad Session Detection (2026-04-09)
- **Motivation:** Enable dashboard to distinguish squad-spawned sessions from organic user sessions. Squad sessions have a different event structure (event types contain `.squad/` prefix).
- **Type addition:** Added `isSquadSession: boolean` to `SessionSummary` in `src/types/index.ts`. Backward compatible — defaults to `false`.
- **Detection logic:** Implemented `detectSquadSession()` helper in `server/services/statusDeriver.ts`. Single pass over events array, checks for event type pattern matching `/\.squad\//i`. Case-insensitive to handle variances in squad marker formatting.
- **Integration:** Wired detection into `mapToSession()` (detail endpoint) and `mapSessionSummary()` (list endpoint) in `server/services/sessionMapper.ts`. Zero additional I/O — reuses existing events parameter.
- **Key insight:** Squad marker in event types is the canonical signal. No need for separate config flag or workspace marker. Fully data-driven detection.
- **Verification:** `tsc --noEmit` clean. All session types correctly populated.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through early 2026-04 (Server Baseline Benchmarks, latestUserMessage field, assistantUpdates, DEMO_MODE, Conversation Search, ask_user detection, TokenUtilization Aggregation, and earlier API/N+1 development history).
