# Holden — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Lead
- **Joined:** 2026-04-02T01:03:50.168Z

## Learnings

<!-- Append learnings below -->

### 2025-07 Codebase Audit

**Architecture:**
- No router — view switching is state-driven via `SessionContext.viewMode` in `App.tsx`
- State management: Context + hooks pattern (`SessionContext`, `SettingsContext`, `TerminalContext`), each wrapping a custom hook
- Frontend: 66 source files across `components/`, `hooks/`, `services/`, `types/`, `context/`, `utils/`, `data/`
- Backend: Express 5 + better-sqlite3 + node-pty + ws, all synchronous I/O
- Data flow: Backend reads SQLite + events.jsonl tail → maps to Session objects → Frontend polls `/api/sessions`

**Key File Paths:**
- Entry: `index.html` → `src/main.tsx` → `src/App.tsx`
- Components: `src/components/{agents,common,filters,layout,network,sessions,settings,terminal,timeline,waterfall}/`
- Hooks: `src/hooks/use{Sessions,Settings,TerminalTabs,TerminalPanel,Archive,Workstreams,AdoIntegration,...}.ts`
- Services: `src/services/{sessionService,settingsService,adoService}.ts`
- Types: `src/types/{index,settings,ado}.ts`
- Server entry: `server/index.ts` → routes in `server/routes/{sessions,config,terminal,ado}.ts`
- Server services: `server/services/{sessionMapper,eventTailReader,sqliteReader,agentTreeBuilder,ptyManager,adoClient,...}.ts`

**Critical Findings:**
- Zero test files in the entire codebase
- No CI pipeline for build/lint/test
- Path traversal risk: `sessionId` used in `path.join()` without validation (`eventTailReader.ts`, `planReader.ts`)
- Terminal shell injection risk: unvalidated `shell` param + `where.exe ${shellName}` in `ptyManager.ts`
- All backend I/O is synchronous (`readFileSync`, `statSync`, `execSync`, `better-sqlite3`)
- Unbounded caches in `eventTailReader.ts` and `adoClient.ts`
- No WebSocket heartbeat/reconnect on terminal connections
- Large monolithic components: `SettingsPanel.tsx` (1165 lines), `WorkstreamDetail.tsx` (864), `NetworkDetailPanel.tsx` (779), `SessionDetail.tsx` (714)
- Session list has no virtualization
- Polling without AbortController in `useSessions.ts`

**Patterns:**
- ADO integration uses Azure CLI for token acquisition via `execSync`
- Settings persist to localStorage client-side and optionally sync to server
- Terminal tabs tracked in `useTerminalTabs.ts` with identity bug (shell vs session tab prefix mismatch)
- ESLint config applies browser globals to server files

### 2026-04-02 Documentation Update

- Updated README.md to reflect kanban board replacing session list, added @dnd-kit to tech stack, restructured Features section by view (Kanban Board / Session Detail / Other Views), updated architecture diagram to say "Kanban View" instead of "List View", updated screenshot placeholder description.
- Updated CHANGELOG.md with [1.2.0] entry covering all session kanban board, drag-and-drop, column reorder, assistant updates, layout changes, and fixes.
- Bumped package.json version from 1.1.0 → 1.2.0.
- Trade-off: grouped CHANGELOG by Added/Changed/Fixed (Keep a Changelog convention) rather than the narrative "What's New" style used in 1.1.0. More scannable for consumers, slightly less personality. Both styles coexist in the file — worth unifying in a future pass.
