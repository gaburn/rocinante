# Claude CLI Support Plan

## Problem

Rocinante currently only supports GitHub Copilot CLI sessions. Users who also use Claude Code (Anthropic's CLI) can't see those sessions in the dashboard. Adding Claude CLI support would make Rocinante a universal dashboard for agentic coding sessions.

## Research Findings

**Copilot CLI** stores data in:
- `~/.copilot/session-store.db` (SQLite: sessions, turns, session_files tables)
- `~/.copilot/session-state/{uuid}/events.jsonl` (append-only event stream)
- Rich metadata: workspace.yaml, plan.md, checkpoints

**Claude Code** stores data in:
- `~/.claude/history.jsonl` (session history index)
- Transcript files per session (JSONL conversation logs)
- `parentUuid`-style message chaining
- `tool_use` / `tool_result` block pairing
- No central SQLite DB

**Key difference:** Copilot uses centralized SQLite + per-session JSONL events. Claude uses file-based transcripts with no central DB.

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

1. Need actual Claude Code transcript files to verify exact JSONL structure (none found on this machine yet)
2. Real-time file watching strategy may differ from Copilot's events.jsonl approach
3. Claude's subagent model may differ from Copilot's agent hierarchy
4. Auto-group by repo should work if we extract repo from Claude's CWD context

## Scope

- 7 todos, sequential dependency chain
- Provider abstraction is the foundation (refactor only)
- Claude parser is the biggest unknown (need sample transcript data)
- UI changes are minimal
- Can ship incrementally: abstraction first, Claude support second
