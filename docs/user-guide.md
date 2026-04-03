<img src="../rocinante-logo-green.png" alt="Rocinante" width="60" />

# Rocinante User Guide

A practical guide for using the Rocinante dashboard to organize and monitor your Copilot CLI sessions.

See `screenshot.png` in the project root for an example of the kanban board.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [The Kanban Board](#the-kanban-board)
3. [Search](#search)
4. [Auto-group by Repository](#auto-group-by-repository)
5. [Session Detail Panel](#session-detail-panel)
6. [Auto-Archive Rules](#auto-archive-rules)
7. [Settings](#settings)
8. [Demo Mode](#demo-mode)
9. [Status Filters](#status-filters)
10. [Tips](#tips)

---

## Getting Started

### Prerequisites

- **Node.js 22+**
- **C++ build tools** (required by the `node-pty` native module):
  - Windows: Visual Studio Build Tools with "Desktop development with C++"
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`
- **GitHub Copilot CLI** installed and configured, with session data under `~/.copilot/`

### Installation

```bash
git clone https://github.com/gaburn/rocinante
cd rocinante
npm install
```

### First Run

```bash
npm run dev
```

Open your browser to **http://localhost:5173**. You should see:

- A **status summary bar** at the top showing workstream and session counts
- A **kanban board** with your sessions organized into columns
- A **detail panel** on the right (empty until you select a session)

If you have no Copilot sessions yet, the board will be empty. Try [Demo Mode](#demo-mode) to see the dashboard with sample data.

---

## The Kanban Board

The kanban board is the main view. Sessions are organized into vertical columns, one per workstream.

### Workstream Columns

Each column represents a workstream. You create a workstream by assigning a session to a new workstream name (type any name into the workstream field on a session's detail panel). The column appears automatically.

### Session Tiles

Each tile on the board shows:

| Element | Description |
|---|---|
| **Status dot** | Color-coded circle: emerald (active), red (blocked), amber (waiting), gray (completed). Active sessions pulse. |
| **Session name** | The name or intent of the session, shown in bold at the top of the tile. |
| **Repo path** | The working directory path, shown in small monospace text below the name. Hover to see the full path. |
| **Latest user message** | The most recent prompt you sent to Copilot, shown in muted text below the name. |
| **Assistant update** | A fuchsia-accented snippet showing Copilot's latest status message, with a left border highlight. |
| **Sparkline** | A tiny activity chart showing recent event density. |
| **Agent count** | A pill badge showing how many agents are working in the session. |
| **Time** | How long ago the session was last active (e.g., "3m ago"). |
| **Archive button** | A small archive icon appears on hover — click to archive the session directly from the tile. |

### Drag and Drop

- **Move sessions between workstreams**: Drag a session tile from one column and drop it into another column to reassign it.
- **Reorder columns**: Grab the grip handle (⠿) in a column header and drag to rearrange columns. The order is saved and persists across page refreshes.

### The Ungrouped Column

Sessions that have not been assigned to any workstream live in the **Ungrouped** column, which always appears at the far right. Dropping a session into this column removes its workstream assignment.

---

## Search

The search box sits at the top of the kanban board. It supports two levels of search:

### Basic Search (Name/Intent)

Start typing and results appear instantly at 1 or more characters. This filters sessions by name and intent.

### Conversation Search

When your query reaches **3 or more characters**, Rocinante also searches through all user messages and assistant responses across every session. A spinner labeled "Searching conversations..." appears while this runs.

### Match Snippets

When a conversation match is found, the tile shows an amber-highlighted snippet with a 💬 icon. This tells you the match came from inside the session's conversation history, not just the session name.

The status line below the search box shows how many conversation matches were found (e.g., "💬 3 conversation matches").

---

## Auto-group by Repository

The **Auto-group** button sits next to the status filter bar. Clicking it:

1. Scans all sessions for their working directory path (falls back to git remote URL if available)
2. Extracts the last path segment as the workstream name (e.g., `C:\data\src\my-project` → "my-project")
3. Creates a workstream column for each unique name
4. Assigns unassigned sessions to the matching workstream

**Important**: Auto-group only assigns sessions that are currently unassigned (in the Ungrouped column). It never moves sessions that already belong to a workstream. This means you can safely run it multiple times without disrupting your existing organization.

---

## Session Detail Panel

Click any session tile to open the detail panel on the right side. The panel shows the full context for that session. **The panel is resizable** — drag the thin vertical handle between the kanban board and the detail panel to adjust the width (320–800px). Your preferred width is saved automatically.

### Session Header

- **Title**: The session name, shown large. Click it to rename the session. A pencil icon appears on hover. If you have renamed a session, a "Reset" link lets you restore the original name.
- **Status badge**: A colored pill showing the current status (Active, Blocked, Waiting, Completed).
- **Action buttons**:
  - **Resume**: Opens a terminal tab that resumes the Copilot session.
  - **Shell**: Opens a plain shell terminal in the session's working directory.
  - **Archive / Unarchive**: Moves the session to or from the archive. When archiving, the next session in the same workstream is automatically selected.
  - **Auto-archive**: Creates a rule to automatically archive future sessions with the same name (keeps the newest visible, archives older duplicates).

### Session ID & Repo Path

Below the header:
- **Session ID**: The full UUID, styled for select-all (click to copy).
- **Repo path**: The working directory path (📂), also select-all for easy copying.

Shown as a compact row below the header:

- **Started**: When the session began (relative time, e.g., "3h ago")
- **Active**: When the session was last active
- **Duration**: Total elapsed time

### Workstream Tag

An autocomplete input field where you can assign or change the session's workstream. Type a name to create a new workstream, or select from existing ones.

### Latest Prompt

The most recent user message sent to Copilot. Long prompts are truncated to 3 lines — click **"▼ Show more…"** to expand the full text, or **"▲ Collapse"** to shrink it back.

### Session Updates

A scrollable list of assistant status messages, shown newest first. Each update appears in a fuchsia-accented block with preserved line breaks. This section only appears when updates exist.

### Session Plan

A collapsible viewer that shows the session's plan file (if one exists). Click the header to expand or collapse.

### Session Timeline

A collapsible timeline of events in the session: user messages, assistant messages, tool calls, file edits, shell commands, agent spawns, and more. Click the header to expand or collapse.

### Agent Hierarchy

A collapsible tree view showing the hierarchy of agents in the session. Each agent shows its name, status, task, and duration. **Collapsed by default** to keep the detail panel focused on the most relevant information.

### Status Banners

- **Blocked sessions** show a red alert banner with the blocked reason. If error details exist, a "Show details" toggle reveals them.
- **Waiting sessions** show an amber banner describing what the session is waiting for.
- **Archived sessions** show a gray banner with an "Unarchive" action.

---

## Auto-Archive Rules

Auto-archive rules let you automatically hide repetitive sessions that clutter the board (e.g., work-loop sessions that always have the same name).

### Creating a Rule

There are two ways to create a rule:

1. **From Session Detail**: Click the **Auto-archive** button in the session header. This creates a rule from the session's name.
2. **From Settings**: Open Settings → Auto-Archive Rules → type a pattern → click "Add Rule".

### How Rules Work

- Rules match by **substring** — any session whose name contains the pattern will match
- Matching sessions are **automatically archived** on each data refresh
- The **newest session** per matching name is always kept visible; only older duplicates are archived
- Archived sessions are never deleted — toggle "Show Archived" to see them

### Managing Rules

In Settings → Auto-Archive Rules:
- **Toggle** individual rules on/off with the switch
- **Delete** rules with the ✕ button
- **Add** new rules with the text input

### Toolbar Indicator

When auto-archive rules are active, a "🔕 N rules active" indicator appears in the kanban toolbar below the archive controls.

---

## Settings

Open Settings from the gear icon in the top-right corner of the header.

The settings panel has six collapsible sections:

### Display Settings

- Theme mode (Light / Dark / System)
- Accent color (Emerald, Blue, Purple, Amber)
- Refresh interval (Off, 10s, 30s, 60s, 120s)
- Sort order (Most Recent, Alphabetical, Status Grouped)
- Pane visibility toggles for detail panel sections

### Auto-Archive Rules

- Add, remove, and toggle substring-based rules that automatically archive matching sessions
- See [Auto-Archive Rules](#auto-archive-rules) for details

### Data Settings

- **Session state directory**: Path to your Copilot session state folder (default: `~/.copilot/session-state`)
- **SQLite DB path**: Path to the Copilot session database (default: `~/.copilot/session-store.db`)
- Stale threshold (how long before a session is marked completed)
- Tail size (how many bytes to read from event logs)
- Max timeline events

### Azure DevOps

Optional integration for linking workstreams to ADO work items.

### Network View

Settings for the neural network visualization: animation speed, label visibility, node size, physics strength.

### Terminal

Shell type selection (PowerShell 7+, Windows PowerShell, Command Prompt, Bash, or a custom path) and font size.

### About

Shows the current version number and a link to the GitHub repository.

### Reset to Defaults

A button at the bottom of the settings panel resets all settings to their defaults.

---

## Demo Mode

Demo mode lets you explore Rocinante without needing real Copilot session data.

### Enabling Demo Mode

Create a `.env` file in the project root (or edit the existing one) and set:

```
DEMO_MODE=true
```

Then restart the server (`npm run dev`).

### What You Get

Demo mode provides:

- **12 mock sessions** across different statuses (active, blocked, waiting, completed)
- **3 pre-built workstreams**: "Storefront UI", "Payments API", and "Mobile App"
- **2 ungrouped sessions** for testing the auto-group feature
- Realistic session data including agent trees, timelines, and assistant updates

### Separate Storage

Demo mode uses a separate localStorage namespace. Switching between demo mode and real mode does not affect your workstream assignments, archives, or settings in either mode. This makes it safe to toggle back and forth.

### Use Cases

Demo mode is useful for:

- Taking screenshots for documentation or presentations
- Evaluating the dashboard before committing to a full setup
- Testing new features without risking real session data

---

## Status Filters

### The Status Bar

The status summary bar at the top of the board shows at a glance:

- **Workstream count**: How many workstream columns exist
- **Session count**: Total number of visible sessions
- **Status breakdown**: Counts for Active, Blocked, Waiting, and Done, each with a color-coded dot

### Filtering by Status

Below the search box, a row of filter pills lets you narrow the board to a single status:

- **All**: Show everything (default)
- **Active**: Only emerald/active sessions
- **Blocked**: Only red/blocked sessions
- **Waiting**: Only amber/waiting sessions
- **Completed**: Only gray/completed sessions

Click a pill to apply the filter. The selected pill gets a colored underline. Zero-count pills are dimmed.

### Archiving Completed Sessions

When completed sessions exist, archive controls appear below the search area:

- **Show Archived** toggle: Reveals or hides archived sessions
- **Archive All Completed** button: Archives every completed session at once

Archived sessions are hidden by default but never deleted. Toggle "Show Archived" to see them again.

---

## Tips

- **Resize the detail panel**: Drag the thin vertical handle between the kanban board and the detail panel to adjust width.
- **Archive from tiles**: Hover over any session tile and click the archive icon to archive it without opening the detail panel.
- **Loading indicator**: The wireframe horse logo in the header pulses when data is loading.
- **Column order**: Workstream column order is saved to localStorage and persists across page refreshes.
- **Deselect a session**: Press **Escape** to close the detail panel and deselect the current session.
- **Copy session ID**: The session ID in the detail panel uses select-all styling. Click it to select the full ID for easy copying.
- **Rename sessions**: Click any session title in the detail panel to rename it. Press Enter to save or Escape to cancel.
- **Terminal tabs**: You can have up to 5 terminal tabs open at once. The Resume button opens Copilot in resume mode; the Shell button opens a plain terminal.
- **Keyboard shortcut**: Press `Ctrl+`` ` to toggle the terminal panel.
- **Theme follows system**: Set the theme to "System" in Settings to match your OS light/dark preference automatically.
- **Archive flow**: When you archive a session from the detail panel, the next session in the same workstream is automatically selected so you can quickly triage.
