# Changelog

All notable changes to Rocinante will be documented in this file.

## [1.1.0] - 2026-03-20

### 🐴 What's New

#### Session Archive / Workstream Management
- **Archive sessions** to focus on active workstreams — ✓ button on cards and detail panel
- **"Show Archived" toggle** reveals archived sessions in a dimmed separate section
- **"Archive All Completed"** bulk action to clean up finished work in one click
- **Archived count** displayed in the status summary bar
- Archive state persists in localStorage across page refreshes

#### Embedded Terminal
- **Session-scoped terminals** — click "Resume" to auto-run `copilot --resume=<id>` in the session's working directory
- **Plain shell mode** — click "Shell" for a terminal without copilot auto-resume
- **Multi-tab support** — up to 5 terminal tabs with status-colored tab bar
- **Follow mode** — auto-switches terminal tab when you select a different session
- **Configurable shell** — pwsh (default), PowerShell, cmd, bash, or custom path
- **Confirmation dialog** before closing terminal tabs
- Powered by xterm.js + node-pty over WebSocket

#### Neural Network Visualization
- **Force-directed graph** of all sessions and agents on HTML5 Canvas (d3-force)
- **Animated particles** traveling along connections between nodes
- **Glowing nodes** with status-colored halos, breathing animation for active agents
- **Hover highlighting** — dims unrelated nodes, brightens connected subgraph
- **Click for details** — slide-in panel with session/agent info
- **Zoom & pan** with mouse wheel + drag, node dragging
- Toggle between List View and Network View via header button

#### Settings Panel
- **20+ configurable options** organized in Display, Data, Network View, and About sections
- **Auto-refresh interval** — 10s / 30s / 60s / 120s / off
- **Sort order** — most recent, alphabetical, or status-grouped
- **Accent colors** — emerald, blue, purple, or amber
- **Pane visibility toggles** — show/hide individual detail panel sections
- **Server config** — stale threshold, tail bytes, timeline event limit (with validation)
- **Network tuning** — animation speed, physics strength, label visibility, node size
- Settings persist via localStorage + server config API

#### Light/Dark Mode
- **Full light mode** — surfaces, text, borders, canvas, and terminal all theme-aware
- **System preference detection** — auto-follows OS dark/light setting
- **Quick toggle** in header (☀/🌙) + three-option selector in Settings (Dark/Light/System)
- **No flash on load** — inline script reads preference before React hydrates

#### Medium Features
- **Event Timeline** — chronological feed of last 100 events with type-colored icons
- **Performance Waterfall** — horizontal duration bars for agent execution (toggleable)
- **Tool Results Viewer** — see agent output in the click-to-expand panel
- **Session Activity Sparklines** — mini bar charts on each session card

#### Quick Wins
- **Git Context Card** — repo, branch, working directory in session detail
- **Search** — filter sessions by name or intent text
- **Rich Error Panel** — expandable error details for blocked sessions
- **Agent Click-to-Expand** — view full agent arguments/prompt on click

### 🔧 Improvements
- Agent hierarchy tree now properly nests subagents (was flat)
- Session `cwd` falls back to workspace.yaml when SQLite has null
- Error state messaging when API is unreachable
- EADDRINUSE guard with helpful error message on server startup
- CORS restricted to localhost origins (configurable via ALLOWED_ORIGINS)
- Debug-only logging in production mode
- PTY shell resolution uses full path (fixes node-pty "File not found")
- Duplicate WebSocket session connections rejected gracefully

### 📦 Project
- Renamed to **Rocinante** 🐴
- Comprehensive README with setup, architecture, API docs, troubleshooting
- MIT License
- .env.example with all environment variables documented
- Production serve mode (`npm start` serves built frontend)

## [1.0.0] - 2026-03-18

### Initial Release
- React + Vite + TypeScript + Tailwind CSS v4 dashboard
- Express backend reading from ~/.copilot session data (SQLite + events.jsonl)
- Session list with status filtering (active/blocked/waiting/completed)
- Session detail with agent hierarchy tree
- Status-colored badges with pulse animation
- Auto-refresh (30s) with manual refresh
