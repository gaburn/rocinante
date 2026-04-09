# Claude CLI Support Plan

## Problem

Rocinante currently only supports GitHub Copilot CLI sessions. Users who also use Claude Code (Anthropic's CLI) can't see those sessions in the dashboard. Adding Claude CLI support would make Rocinante a universal dashboard for agentic coding sessions.

## Research Findings

**Copilot CLI** stores data in:
- `~/.copilot/session-store.db` (SQLite: sessions, turns, session_files tables)
- `~/.copilot/session-state/{uuid}/events.jsonl` (append-only event stream)
- Rich metadata: workspace.yaml, plan.md, checkpoints

**Claude Code** (v2.1.x) stores data in:
- `~/.claude/projects/<project-hash>/<session-file>.jsonl` — one JSONL file per session
- No central SQLite DB, no `history.jsonl` central index
- Discovery: glob `~/.claude/projects/**/*.jsonl`, exclude `agent-*` and `warmup` files
- JSONL entry types: `summary` (metadata), `user` (prompts + tool results), `assistant` (responses + tool calls), `file-history-snapshot` (skip)
- Content blocks: `text`, `thinking`, `tool_use` (id/name/input), `tool_result` (tool_use_id/content/is_error)
- User entries carry `cwd`, `gitBranch`, `sessionId`, `uuid`
- Session ID from `summary.leafUuid` or filename stem
- Tool names: `Write`, `Edit`, `Bash`, `Read`, `TodoWrite`
- Messages are sequential JSONL lines (no parentUuid ancestry)

**Key difference:** Copilot uses centralized SQLite + per-session JSONL events. Claude uses per-project JSONL transcripts with filesystem-based discovery.

## Approach: Provider Abstraction

Introduce a `SessionSource` interface so the server can ingest from multiple CLI tools.

## Todos

### 1. provider-interface
Create a `SessionSource` interface with `listSessions()`, `getSession(id)`, `getEvents(id)`. Refactor existing Copilot code into `CopilotSessionSource`. Sessions route calls provider(s) instead of directly calling sqliteReader.

### 2. claude-config (depends on 1)
Add env vars: `CLAUDE_SESSION_DIR` (default `~/.claude`), `SESSION_SOURCES` (default `copilot`, options: `copilot|claude|both`). Add to settings UI.

### 3. claude-parser (depends on 1)
Build `ClaudeSessionSource` that reads `~/.claude/history.jsonl` + transcript files. Parse `tool_use`/`tool_result` blocks into TimelineEvents. Handle `parentUuid` ancestry for agent trees.

### 4. claude-mapper (depends on 3)
Normalize Claude transcripts into Rocinante's `Session` type. Derive status, extract repo/branch from working directory context.

### 5. merge-sources (depends on 4)
When `SESSION_SOURCES=both`, merge from both providers. Add `source: 'copilot' | 'claude'` field to Session type. Handle ID collisions.

### 6. ui-source-badge (depends on 5)
Show source badge on tiles/detail. Add source filter to toolbar.

### 7. settings-multi-source (depends on 6)
Multi-source config in Settings: toggle each source, set paths, show connection status.

## Open Questions

1. ~~Need actual Claude Code transcript files to verify exact JSONL structure~~ **RESOLVED** — format documented from web research + deepwiki reference (see Research Findings above)
2. Real-time file watching: Claude appends to JSONL incrementally. Could `fs.watch` the projects dir for new/modified files (similar to Copilot's event tail approach)
3. Claude may spawn sub-agents (files prefixed `agent-`). Show as child agents? Need sample data to decide.
4. Auto-group by repo works — Claude's `user` entries carry `cwd` and `gitBranch`
5. Thinking blocks: show in timeline or hide? Could be a user preference.
6. Search: Copilot has SQLite FTS. Claude has no DB — need in-memory index or JSONL file search.

## Scope

- 7 todos, sequential dependency chain
- Provider abstraction is the foundation (refactor only)
- Claude parser is the biggest unknown (need sample transcript data)
- UI changes are minimal
- Can ship incrementally: abstraction first, Claude support second
