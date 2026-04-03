<img src="rocinante-logo-green.png" alt="Rocinante" width="80" />

# Rocinante

*workhorse for workstreams*

A real-time dashboard for organizing agentic coding sessions into workstreams and interacting with them. When you have dozens of Copilot CLI sessions running across multiple projects, Rocinante gives you a kanban board to track them all, see what each session is working on, and jump into any session with a single click.

Named after the ship from *The Expanse*, which was named after Don Quixote's horse.

![Rocinante Dashboard](screenshot.png)

---

## Features

### Kanban Board
- **Workstream columns**: Sessions grouped by workstream in a horizontal kanban board, one column per workstream plus an "Ungrouped" column for unassigned sessions
- **Drag-and-drop sessions**: Reassign sessions between workstreams by dragging tiles between columns (@dnd-kit)
- **Column reorder**: Drag workstream columns by their grip handle to rearrange, order persisted to localStorage
- **Status-coded tiles**: Emerald (active), red (blocked), amber (waiting), gray (completed). Active and blocked sessions float to the top
- **Latest context on tiles**: Each tile shows the most recent user message and a magenta assistant-update bubble with Copilot's latest status
- **Workstream count**: Status summary bar includes workstream count

### Session Detail
- **Session Updates**: Fuchsia-accented scrollable list of assistant status messages with preserved line breaks
- **Agent Hierarchy**: Collapsible tree (collapsed by default) with unified arrow icons
- **Git context**, Session Timeline, tool results, performance waterfall

### Other Views
- **Neural Network View**: Animated force-directed graph visualization of all sessions and agents (d3-force + Canvas)
- **Embedded Terminal**: Session-scoped terminals that auto-resume Copilot sessions in their working directory (xterm.js + node-pty)
- **Settings**: 20+ configurable options with localStorage persistence + server config API. About section shows version and GitHub repo link
- **Light/Dark Mode**: Full theme support with system preference detection
- **Real-time Updates**: Auto-refresh with configurable interval

## User Guide

For a comprehensive guide on using the dashboard, see **[docs/user-guide.md](./docs/user-guide.md)**. It covers the kanban board, search, auto-grouping, session details, settings, demo mode, and more.

## Screenshots

*(placeholder: the main view is a horizontal kanban board with color-coded session tiles organized by workstream, and a fixed 420px detail sidebar on the right)*

---

## Prerequisites

- Node.js 22+
- C++ build tools (required by `node-pty` native module):
  - **Windows**: Visual Studio Build Tools with **Desktop development with C++**
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential` (and standard compiler toolchain)
- GitHub Copilot CLI installed and configured (`~/.copilot/` directory with session data)

---

## Quick Start

```bash
# Clone the repo
git clone <repo-url>
cd rocinante

# Install dependencies (includes native module compilation)
npm install

# Start development server (frontend + backend)
npm run dev

# Open in browser
# http://localhost:5173
```

---

## Environment Variables

Create a `.env` file from `.env.example` as needed.

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `3001` | Backend API/WS port used by Express and terminal WebSocket server |
| `SESSION_STATE_DIR` | `~/.copilot/session-state` | Directory containing per-session state folders and `events.jsonl` files |
| `SQLITE_DB_PATH` | `~/.copilot/session-store.db` | Path to Copilot SQLite session metadata database |
| `TAIL_BYTES` | `524288` | Number of bytes read from end of each `events.jsonl` file |
| `STALE_THRESHOLD_MS` | `300000` | Inactivity threshold before a session is considered stale/completed |
| `CACHE_TTL_MS` | `10000` | In-memory cache TTL for event tail reads |
| `MAX_TIMELINE_EVENTS` | `100` | Maximum timeline events returned to the UI |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3001` | Comma-separated CORS origins in `.env.example` (currently not enforced by server code) |

---

## Architecture

```text
Frontend (Vite + React + TypeScript + Tailwind CSS v4)
├── Kanban View: horizontal board (workstream columns + 420px detail sidebar)
├── Network View: animated force-directed graph (d3-force + Canvas)
├── Terminal: session-scoped xterm.js terminals
└── Settings: configurable preferences

Backend (Express + TypeScript)
├── /api/sessions: session data from SQLite + events.jsonl
├── /api/config: runtime configuration
└── /ws/terminal: WebSocket PTY bridge (node-pty)

Data Sources
├── ~/.copilot/session-store.db: SQLite (session metadata)
├── ~/.copilot/session-state/{id}/events.jsonl: event logs
└── ~/.copilot/session-state/{id}/workspace.yaml: session config
```

### Runtime Flow (high-level)

1. Backend reads session metadata from SQLite and event tails from `events.jsonl`.
2. Backend maps raw data into normalized session objects (status, tree, timeline, activity buckets).
3. Frontend polls `/api/sessions` on a configurable interval and renders list/detail/network views.
4. Terminal panel opens WebSocket connections to `/ws/terminal` and binds PTY output to xterm.js.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start both frontend (Vite) and backend (Express via tsx watch) |
| `npm run dev:client` | Start frontend only |
| `npm run dev:server` | Start backend only |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## API Reference

### `GET /api/sessions`
Returns all sessions.

- **200**: `Session[]`
- **500**: `{ "error": "..." }`

### `GET /api/sessions/:id`
Returns one session by ID.

- **200**: `Session`
- **404**: `{ "error": "Session not found" }`
- **500**: `{ "error": "..." }`

### `GET /api/config`
Returns runtime configuration exposed to UI settings.

- **200**:
  ```json
  {
    "sessionStateDir": "...",
    "tailBytes": 524288,
    "staleThresholdMs": 300000,
    "maxTimelineEvents": 100
  }
  ```

### `PATCH /api/config`
Updates runtime configuration fields.

- **Body**: Partial of `sessionStateDir`, `tailBytes`, `staleThresholdMs`, `maxTimelineEvents`
- **200**: Updated config object
- **400**: Validation errors (`unknown field`, invalid enum values, invalid directory path)
- **500**: `{ "error": "..." }`

### `WS /ws/terminal?sessionId=X&cwd=Y&shell=Z`
Terminal bridge over WebSocket.

- If `sessionId` is provided, backend starts terminal with `copilot --resume=<sessionId>`.
- One terminal connection per `sessionId` is allowed.
- **Client messages**:
  - `{ "type": "input", "data": "..." }`
  - `{ "type": "resize", "cols": 120, "rows": 30 }`
- **Server messages**:
  - raw terminal output stream
  - `{ "type": "exit", "code": 0 }`
  - `{ "type": "error", "message": "..." }`

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+\`` | Toggle terminal panel |
| `Esc` | Close settings/detail/confirm overlays (when focused/open) |

---

## Troubleshooting

- **EADDRINUSE on port 3001**  
  Kill stale processes: `taskkill /F /IM node.exe`  
  (or find PID with `netstat -ano | findstr :3001`)

- **`node-pty` build failure**  
  Install required C++ build tools for your platform (see Prerequisites), then reinstall dependencies.

- **"Terminal disconnected"**  
  Ensure backend server is running (`npm run dev:server`) and check backend logs for PTY spawn errors.

- **Empty session list**  
  Verify Copilot session data exists under `~/.copilot/`, and confirm `SESSION_STATE_DIR` / `SQLITE_DB_PATH` are correct.

- **Config update fails with 400**  
  Use only supported values:
  - `tailBytes`: `262144`, `524288`, `1048576`, `2097152`
  - `staleThresholdMs`: `60000`, `300000`, `900000`, `1800000`
  - `maxTimelineEvents`: `50`, `100`, `200`, `500`

---

## Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript, Tailwind CSS v4, @dnd-kit (drag-and-drop), d3-force, xterm.js
- **Backend**: Express 5, better-sqlite3, node-pty, ws, tsx

---

## License

MIT. See [LICENSE](./LICENSE).
