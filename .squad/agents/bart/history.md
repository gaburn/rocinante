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
