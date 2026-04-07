# Naomi — History Archive

## Archived Learnings (2025-07 - 2026-04)

### Amber Glow Animation for Waiting Sessions
- CSS `@keyframes glow-amber` pulses box-shadow, 2s ease-in-out infinite. Applied to KanbanTile, SessionCard, SessionDetail waiting banner (when not selected).
- Pulsing status dots added to PULSING_STATUSES in KanbanTile and StatusBadge.
- Enhanced waiting banner shows `waitingQuestion` + `waitingChoices` as amber pill badges.
- Subtle amber glow draws attention without distraction; compatible with dark/light modes.

### Rocinante Wireframe Horse Logo
- Inline SVG in `Header.tsx`, viewBox `0 0 32 32`, rendered at `h-7 w-7`.
- Angular head, ears, neck, hexagonal body, 3 mesh lines, 4 leg polylines, 3-point tail.
- Drop-shadow glow effect (neon green `#00ff41`). Pulse animation 3.5s ease-in-out infinite.
- Replaced old `>_` terminal prompt. Settings panel About unchanged.

### Kanban Board Feature
- Replaced `SessionList` with `KanbanBoard` in `App.tsx`. `SessionList.tsx` preserved but unused.
- Components: `KanbanTile` (draggable card), `KanbanColumn` (droppable column), `KanbanBoard` (main board), `index.ts` (barrel).
- DnD via `@dnd-kit/core` + `@dnd-kit/sortable`. PointerSensor 5px activation. `closestCenter` collision. DragOverlay renders ghost tile.
- Workstream mapping via `useSessionContext()`. Ungrouped column uses `__ungrouped__` sentinel. Tile sort: active→blocked→waiting→completed, then by `lastActivityAt` desc.
- Status colors reuse `getStatusBorderClass()`, etc. Header ListIcon→BoardIcon. Scrollbar matches `layout-scrollable` pattern.

### Column Drag-and-Drop Reorder
- Hook: `src/hooks/useColumnOrder.ts` — localStorage-backed (`rocinante-column-order`) column order. `getOrderedNames()` + `reorderColumns()`.
- Dual DnD types: tiles (`data: { type: 'tile', session }`) vs columns (`data: { type: 'column', columnId, columnName }`).
- Custom collision detection `typedCollision` filters droppables by type.
- Column sortable via `useSortable` with `COLUMN_SORTABLE_PREFIX + id`. Separate `useDroppable` for tile area.
- Drag handle `⠿` in column header; only shown for sortable columns.
- DragOverlay shows ghost tile (rotated) or ghost column header.
- Ungrouped column: always last, `isSortable=false`, not draggable.

### Session Updates Section
- Added between header and git context in `SessionDetail.tsx`.
- Reads `session.assistantUpdates?: string[]`. Displays reverse chrono (most recent first).
- Fuchsia/magenta accent: `border-fuchsia-500/40` left border, `bg-fuchsia-500/5` item background. Matches CLI magenta text.
- ChatBubbleIcon inline SVG. Conditionally rendered only when non-empty.
- `max-h-64 overflow-y-auto` with `layout-scrollable` class. `bg-surface-secondary` to match other sections.

### Demo Mode Workstream Auto-Seeding
- Backend: `getDemoWorkstreams()` in `server/services/demoData.ts` returns mapping `Record<string, string[]>`. Uses existing `DEFS` array.
- Endpoint: `GET /api/demo/workstreams` returns mapping when `DEMO_MODE=true`, 404 otherwise.
- Frontend seeding: `useWorkstreams.ts` fetches on first mount via `useRef` guard. Seeds if: (1) localStorage flag not set, (2) none of demo names exist.
- Result: 3 kanban columns (Storefront UI, Payments API, Mobile App) + 2 ungrouped. Guard pattern prevents double-fire in React strict mode.

### Conversation History Search Integration
- API: `GET /api/sessions/search?q=<query>` — FTS5 backend search. Returns `{ sessionId, matchType, snippet, turnIndex }[]`.
- Hook changes: `conversationSearchResults` state (Map), `isSearchingConversations` flag, debounced 300ms fetch with `AbortController`.
- Filter merge: sessions by name/intent OR in `conversationSearchResults`. Only first match per session.
- Debounce: `setTimeout` + `AbortController` — timer cleared on re-run, previous fetch aborted. Query >= 3 chars.
- KanbanBoard: spinner while API in flight, "💬 N matches" badge on results. Passes `conversationSearchResults`, `searchQuery` through context.
- KanbanTile: optional `conversationMatch`, `searchActive` props. Renders snippet in `bg-amber-500/10` box with 💬, `text-[10px]`, `line-clamp-2`.

### Session ID Search
- Location: `src/hooks/useSessions.ts` lines 231-237 — inside `sessions` useMemo filter.
- Change: Added `s.id.toLowerCase().includes(query)` as first condition before name/intent/conversation checks.
- Case-insensitive partial match on `session.id`. Typing UUID fragment (e.g. `1828`) finds matching sessions.
- All local search fields use `.includes()`. Conversation search async via API.
- Outcome: Build and lint clean. Enables quick session lookup by ID substring.

### Question Mark Icon for Waiting Sessions
- KanbanTile: small amber circle (`size-4 rounded-full bg-amber-500/20 text-amber-400`) in Row 1 between status dot and name.
- SessionCard: same amber circle in top row between name and StatusBadge. Name + icon wrapped in flex.
- Only rendered when `status === 'waiting'`. No new props/dependencies.
- Outcome: Build and lint clean. Small but unmissable — pairs with pulsing dot and glow.

### TokenUtilization Component
- New React component `src/components/telemetry/TokenUtilization.tsx` for token spend visualization on stats page.
- Consumes Amos's token aggregation backend (Decision #7). Expects per-model breakdowns from `/api/telemetry/tokens`.
- Displays token spend proportionally per model, supports time range filtering, responsive design.
- File changes: created `src/components/telemetry/TokenUtilization.tsx`, integrated into `StatsPage.tsx`.
- No breaking changes to existing telemetry API.

### Utility: renderInlineMarkdown
- `src/utils/inlineMarkdown.tsx` — `renderInlineMarkdown(text)` converts inline markdown (`**bold**`, `*italic*`, `` `code` ``) to React elements via regex tokenization.
- Returns plain string if no markdown, otherwise fragment with keys. No `dangerouslySetInnerHTML` — pure React.
- Inline `<code>` styled: `bg-surface-tertiary px-1 py-0.5 font-mono text-[0.9em] text-fuchsia-300/90`.
- Applied to: SessionDetail session updates (line ~794), waiting banner question + waitingFor (lines ~735, ~753), KanbanTile update preview (line ~103).
- Handles only inline — block-level (headers, lists, code blocks) renders plain. Emoji pass through naturally.
- Outcome: Build and lint clean. `**Naomi**` renders as bold, not literal asterisks.

### Markdown Table Rendering in inlineMarkdown
- Refactored `renderInlineMarkdown()` into block-level parser. Original inline regex moved to private `renderInlineTokens()`.
- New `splitBlocks()` detects contiguous pipe-prefixed lines, separates `'text'` and `'table'` blocks.
- `isSeparatorRow()` validates `|------|` patterns. `parseCells()` strips outer pipes. Header = line before separator; data rows follow.
- Inline markdown (bold/italic/code) applied to each cell.
- Styling: `table: "w-full text-xs border-collapse my-1"`, `th: "text-left font-medium..."`, `td: "text-fg/80..."`. Dark theme, compact.
- Mixed content: text before/after tables. Pipe blocks without separator demoted to plain text.
- Fast path: no `|` → skips splitting, goes straight to inline rendering. No perf impact.
- Outcome: Build and lint clean. Test matrices now render as HTML tables, not raw pipe text.

### Bundle Baseline Measurement Script
- `src/__benchmarks__/bundle-baseline.ts` — Node script using `tsx`. Shells out to `npx vite build`, scans `dist/` for JS/CSS, computes gzipped sizes via `zlib.gzipSync`.
- Flags chunks over 100KB gzipped. Output: JSON to `src/__benchmarks__/bundle-baseline-results.json` (gitignored) + human-readable table to stderr.
- npm script: `bench:build`.
- Baseline: Main bundle 465KB raw / 126KB gzip 🔴. xterm 340KB/86KB. CSS 73KB/12KB. Total 861KB raw / 223KB gzip.
- No new dependencies — uses Node stdlib only.
- Outcome: Build and lint clean. Script runs successfully, results JSON generated.
