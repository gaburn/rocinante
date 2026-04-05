# Naomi — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

<!-- Append learnings below -->

### Amber Glow Animation for Waiting Sessions (2025-07)
- **Purpose:** Visual indicator for sessions with `status === 'waiting'` that need user input (questions/choices).
- **CSS Animation:** `@keyframes glow-amber` pulses box-shadow between `rgba(245, 158, 11, 0.15)` and `rgba(245, 158, 11, 0.3)`, 2s ease-in-out infinite. Utility class `.animate-glow-amber` applies animation.
- **Applied to:** KanbanTile button, SessionCard button, SessionDetail waiting banner — but only when NOT selected (selection state is already visually distinct).
- **Pulsing status dots:** Added `'waiting'` to PULSING_STATUSES in KanbanTile (line 22), StatusBadge (line 15).
- **Enhanced waiting banner:** SessionDetail now shows `waitingQuestion` text + `waitingChoices` as amber pill badges when available. Falls back to legacy `waitingFor` display. Banner itself glows.
- **Design principle:** Subtle amber glow draws attention without distraction. Works on both dark and light modes (rgba values compatible).

### Rocinante Wireframe Horse Logo (2025-07)
- **Component:** `RocinanteIcon` — inline SVG in `Header.tsx` (lines ~138-196), placed alongside other micro-icon components (`PulseDot`, `BoardIcon`, etc.).
- **SVG geometry:** viewBox `0 0 32 32`, rendered at `h-7 w-7`. Horse built from: angular head triangle, ear line, two neck lines, hexagonal body polygon, 3 internal wireframe mesh lines (two diagonals + vertical bisector), 4 polyline legs in galloping pose (front pair reaching forward, back pair pushing), and a 3-point tail polyline.
- **Glow effect:** CSS `drop-shadow` with neon green `#00ff41`. Pulse animation via `@keyframes rocinante-glow-pulse` (3.5s ease-in-out infinite) embedded in SVG `<style>` block. Alternates between subtle and bright glow intensity.
- **Styling:** Pure wireframe — `fill="none"`, `stroke="#00ff41"`, `strokeWidth="1.3"`. No background container (removed old `bg-surface-tertiary` rounded-md box). Glow provides visual weight.
- **Replaced:** The `>_` terminal prompt `<span>` (old lines 168-174) with `<RocinanteIcon />`. Same parent flex layout (`gap-3`) preserved.
- **Settings panel:** Checked `SettingsPanel.tsx` About section — no references to the old logo style, so no changes needed there.

### Kanban Board Feature (2025-07)
- **Architecture:** Replaced `SessionList` with `KanbanBoard` as the left panel in `App.tsx`. `SessionList.tsx` is preserved but no longer imported — can be removed or kept as fallback.
- **Components:** `src/components/kanban/` contains `KanbanTile.tsx` (draggable card), `KanbanColumn.tsx` (droppable column with sticky header), `KanbanBoard.tsx` (main board with DndContext), `index.ts` (barrel export).
- **DnD:** Uses `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`. `PointerSensor` with 5px activation distance to distinguish clicks from drags. `closestCenter` collision detection. `DragOverlay` renders ghost tile with slight rotation.
- **Workstream mapping:** `useSessionContext()` provides `groupedSessions` (groups + ungrouped). Board maps each group to a column. Ungrouped column uses sentinel id `__ungrouped__`. DnD end calls `setWorkstream()` or `removeWorkstream()` to reassign.
- **Tile sort order:** active(0) → blocked(1) → waiting(2) → completed(3), then by `lastActivityAt` desc within same status.
- **Status colors:** Reuses `getStatusBorderClass()`, `getStatusBgClass()`, `getStatusDotClass()` from `src/utils/statusColors.ts`.
- **Header:** `ListIcon` replaced with `BoardIcon` (3-column kanban SVG). Tooltip changed to "Board View". Network toggle unchanged.
- **Scrollbar:** Custom `kanban-scrollable` CSS class matches existing `layout-scrollable` pattern from `Layout.tsx`.

### Column Drag-and-Drop Reorder (2025-07)
- **Hook:** `src/hooks/useColumnOrder.ts` — localStorage-backed (`rocinante-column-order`) column order state. Exposes `getOrderedNames(names)` to sort workstream names by saved order (new names appended) and `reorderColumns(activeId, overId)` for arrayMove-style reorder.
- **Dual DnD types:** Tiles use `data: { type: 'tile', session }`, columns use `data: { type: 'column', columnId, columnName }`. `active.data.current.type` distinguishes in `onDragEnd`.
- **Custom collision detection:** `typedCollision` wraps `closestCenter` but filters droppable containers by type — column drags only see column droppables, tile drags only see tile/column-drop-zone droppables. Prevents cross-interference with nested droppables.
- **Column sortable:** `KanbanColumn` uses `useSortable` with `COLUMN_SORTABLE_PREFIX + id` (e.g., `column:MyWorkstream`). Separate `useDroppable` on inner tile area keeps tile drops working. `disabled: !isSortable` skips sortable behavior for Ungrouped.
- **Drag handle:** `⠿` grip icon in column header, receives `sortableAttrs` + `sortableListeners`. `cursor-grab` / `active:cursor-grabbing`. Only shown for sortable columns.
- **DragOverlay:** Shows ghost tile (rotated) for tile drags, ghost column header (with session count) for column drags.
- **Ungrouped column:** Always last, `isSortable=false`, no drag handle, not draggable/reorderable.
- **SortableContext:** Board wraps columns in `SortableContext` with `horizontalListSortingStrategy`. Each column internally wraps tiles in its own `SortableContext` with `verticalListSortingStrategy`.

### Session Updates Section (2025-07)
- **Location:** Added between header section (§1) and git context section (§1b) in `SessionDetail.tsx`.
- **Data:** Reads `session.assistantUpdates?: string[]` from the Session type (added by Amos). Displays in reverse chronological order (most recent first).
- **Styling:** Fuchsia/magenta accent — `border-fuchsia-500/40` left border, `bg-fuchsia-500/5` item background. Matches the CLI's magenta status update text.
- **Components:** Added `ChatBubbleIcon` inline SVG (chat bubble with text lines). Section conditionally rendered only when `assistantUpdates` is non-empty.
- **Scroll:** `max-h-64 overflow-y-auto` with `layout-scrollable` class for styled scrollbar. Container uses `bg-surface-secondary` to match other sections like agent hierarchy.

### Demo Mode Workstream Auto-Seeding (2025-07)
- **Backend:** `getDemoWorkstreams()` in `server/services/demoData.ts` returns a `Record<string, string[]>` mapping workstream names to session IDs. Uses the existing `DEFS` array directly (no need to generate full sessions).
- **Endpoint:** `GET /api/demo/workstreams` in `server/routes/sessions.ts` — returns the mapping when `DEMO_MODE=true`, 404 otherwise.
- **Frontend seeding:** `useWorkstreams.ts` fetches `/api/demo/workstreams` on first mount via a `useRef` guard. Seeds workstream map into state (and localStorage) only if: (1) the `rocinante-demo-workstreams-seeded` localStorage flag is not set, and (2) none of the demo workstream names already exist. Sets the flag after seeding.
- **Result:** Demo mode now shows 3 kanban columns (Storefront UI, Payments API, Mobile App) with 2 sessions remaining in Ungrouped (CI pipeline + npm audit).
- **Guard pattern:** `useRef(false)` prevents double-fire in React strict mode; localStorage flag prevents re-seeding across page reloads.

### Conversation History Search Integration (2025-07)
- **API:** `GET /api/sessions/search?q=<query>` — backend FTS5 search over user messages + assistant responses. Returns `{ sessionId, matchType, snippet, turnIndex }[]`.
- **Hook changes (`useSessions.ts`):** Added `conversationSearchResults` state (`Map<string, ConversationMatch>`), `isSearchingConversations` flag, debounced 300ms fetch effect with `AbortController` for cancellation. Exported `ConversationMatch` type.
- **Filter merge:** Search filter now includes sessions matching name/intent OR whose ID is in `conversationSearchResults`. Only first (best) match per session is kept in the map.
- **Debounce pattern:** `setTimeout` + `AbortController` refs in a `useEffect` — timer cleared on re-run, previous fetch aborted. Query must be >= 3 chars to trigger API call.
- **KanbanBoard:** Shows spinner with "Searching conversations…" while API is in flight. Shows "💬 N conversation matches" badge when results arrive. Passes `conversationSearchResults` and `searchQuery` through `KanbanColumn` to `KanbanTile`.
- **KanbanTile:** New optional `conversationMatch` and `searchActive` props. When both present, renders snippet in `bg-amber-500/10` rounded box with 💬 prefix, `text-[10px]`, `line-clamp-2`. Placed between assistant updates and meta row.
- **Props chain:** `useSessions` → `SessionContext` → `KanbanBoard` → `KanbanColumn` (new optional props) → `KanbanTile` (new optional props). No breaking changes to existing call sites.

### Session ID Search (2026-04)
- **Location:** `src/hooks/useSessions.ts`, lines 231-237 — the `searchQuery` filter inside the `sessions` useMemo.
- **Change:** Added `s.id.toLowerCase().includes(query)` as the first condition in the filter chain, before name/intent/conversation checks.
- **Behavior:** Case-insensitive partial match on `session.id`. Typing a UUID fragment (e.g. `1828`) finds sessions whose ID contains that substring. Same priority as name/intent — no separate category.
- **Pattern:** All local search fields (id, name, intent) use `.toLowerCase().includes(query)`. Conversation search is async via API (`conversationSearchResults.has(s.id)`).
- **Outcome:** Build and lint clean. Feature enables quick session lookup by ID substring. No performance impact on existing searches.

### Question Mark Icon for Waiting Sessions (2025-07)
- **Purpose:** Adds a visible `?` icon on session tiles when `status === 'waiting'`, complementing the subtle amber glow animation with a clear visual indicator.
- **KanbanTile:** Small amber circle (`size-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold`) placed inline in Row 1 between the status dot and session name. Includes `title` and `aria-label` for accessibility.
- **SessionCard:** Same amber circle element placed in the top row between the session name and `StatusBadge`. Wrapped name + icon in a flex container to preserve `justify-between` layout with the badge.
- **Conditional:** Only rendered when `session.status === 'waiting'`. No new props or dependencies added.
- **Outcome:** Build (`tsc --noEmit`) and lint (`eslint`) both clean. Icon is small but unmissable — pairs with the pulsing dot and glow to make waiting sessions obvious.

### Inline Markdown Rendering for Session Updates (2025-07)
- **Utility:** `src/utils/inlineMarkdown.tsx` — `renderInlineMarkdown(text)` converts basic inline markdown (`**bold**`, `*italic*`, `` `code` ``) into React elements using regex tokenization. Returns plain string if no markdown found, otherwise wraps in a fragment. No `dangerouslySetInnerHTML` — pure React elements with keys.
- **Code styling:** Inline `<code>` gets `bg-surface-tertiary px-1 py-0.5 font-mono text-[0.9em] text-fuchsia-300/90` to match the session update fuchsia accent.
- **Applied to:** (1) `SessionDetail.tsx` session updates list (line ~794), (2) `SessionDetail.tsx` waiting banner question text (line ~735) and waiting-for text (line ~753), (3) `KanbanTile.tsx` assistant update preview (line ~103).
- **Import:** Added `import { renderInlineMarkdown } from '../../utils/inlineMarkdown'` to both `SessionDetail.tsx` and `KanbanTile.tsx`.
- **Approach:** Option A (lightweight regex utility) chosen over installing a library. Handles only inline formatting — block-level markdown (headers, lists, code blocks) renders as plain text. Emoji pass through naturally since they're just Unicode.
- **Outcome:** Build (`tsc --noEmit`) and lint (`eslint`) both clean. `**Naomi**` now renders as bold **Naomi** instead of literal asterisks.

### Markdown Table Rendering in inlineMarkdown (2025-07)
- **Purpose:** Session updates containing markdown tables (pipe-delimited with `|---|` separator rows) were rendering as raw text. Now they render as styled HTML tables.
- **Architecture:** Refactored `renderInlineMarkdown()` into a block-level parser. The original inline regex logic moved to a private `renderInlineTokens()` function. New `splitBlocks()` splits input text into `'text'` and `'table'` blocks by detecting contiguous pipe-prefixed lines.
- **Table parsing:** `isSeparatorRow()` validates `|------|` patterns. `parseCells()` strips outer pipes and splits on inner ones. Header row is the line immediately before the separator; data rows follow it. Inline markdown (bold/italic/code) is applied to each cell's content.
- **Styling:** `table: "w-full text-xs border-collapse my-1"`, `th: "text-left font-medium text-fg/60 border-b border-border-default px-2 py-1"`, `td: "text-fg/80 border-b border-border-default/50 px-2 py-1"`. Matches dark theme, compact and monospace-friendly.
- **Mixed content:** Handles text before/after tables — each block type renders independently. Pipe-delimited blocks without a separator row are demoted back to plain text.
- **Fast path:** If input contains no `|` character, skips block splitting entirely and goes straight to inline token rendering. No perf impact on non-table content.
- **Outcome:** Build (`tsc --noEmit`) and lint (`eslint`) both clean. Tables like test result matrices now render as proper HTML tables instead of raw pipe text.
