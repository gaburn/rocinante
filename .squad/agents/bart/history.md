# Bart — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

<!-- Append learnings below -->

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
