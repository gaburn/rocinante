# Session Log: Archive Sync + Auto-Group Race Conditions — 2026-04-14T22:19:00Z

**Participants:** Amos (Backend Dev), Naomi (Frontend Dev)  
**Mode:** background (parallel)  
**Duration:** 1 session cycle  
**Status:** ✅ Complete  
**Tests:** 141 passing

---

## Problem Statement

Two race conditions emerged during Phase 3 archive implementation:

### 1. Archive Sync Race (Amos)
**Symptom:** On app startup, `useArchive` and `useSessions` fired independently via `useEffect([])`. If `getSessions()` arrived at the server before `POST /api/sessions/archive` (sync), the server's archive store was empty → all 1787 sessions returned unfiltered.

**Root cause:** No synchronization primitive between the two hooks.

**Impact:** First load after server restart showed all sessions, archive filter appeared broken.

### 2. Auto-Group Race (Naomi)
**Symptom:** `autoGroupByRepository()` used `allSessions` (entire fetched list) instead of the current filtered sessions from `showArchived` state. When archive filter was on (`showArchived=false`), auto-group still grouped archived sessions, creating ghost groups.

**Root cause:** Auto-group logic didn't respect the current view filter.

**Impact:** Archive filter appeared incomplete; grouped view showed sessions that weren't visible in flat view.

---

## Solution

### Amos — Archive Sync Synchronization

**File:** `src/hooks/useArchive.ts`

**Changes:**
1. Added `syncComplete` state flag (initializes `false`)
2. In the sync effect (`useEffect(() => { POST archive; })`), call `.finally(() => setSyncComplete(true))` to mark completion regardless of success/failure
3. Export `archiveSynced` alongside `synced` (backward compat)

**Mechanism:**
- `syncComplete` resolves to `true` on successful POST or any error (no hung state)
- Component consuming the hook can now wait for this flag before acting

**Code pattern:**
```typescript
const { archivedIds, synced, archiveSynced } = useArchive();

useEffect(() => {
  if (!archiveSynced) return; // Gate on sync completion
  loadSessions(); // Now safe — server has archive state
}, [archiveSynced]);
```

**Validation:** No intermediate states; `syncComplete` is deterministic. Matches existing `synced` state pattern.

---

### Amos — useSessions Gate

**File:** `src/hooks/useSessions.ts`

**Changes:**
1. Gate initial `loadSessions()` call on `archiveSyncComplete` flag from `useArchive`
2. Destructure `archiveSynced` from `useArchive()` hook
3. Add guard: `if (!archiveSynced) return;` at start of load effect

**Mechanism:**
- On mount, `archiveSyncComplete` is `false` → no session load
- Once `useArchive` POST completes (success or failure), `syncComplete → true` → `loadSessions()` fires
- Server now guaranteed to have archive state before session list is fetched

**Validation:** Startup load now deterministic. Tests confirm sessions load after archive sync.

---

### Naomi — Auto-Group Filter Fix

**File:** `src/hooks/useSessions.ts`

**Changes:**
1. In `autoGroupByRepository()` function, replace `allSessions` parameter with `sessions` (filtered list)
2. Update call site: `autoGroupByRepository(sessions)` instead of `autoGroupByRepository(allSessions)`
3. Verify: auto-group now operates on the view-filtered set, respecting `showArchived` state

**Mechanism:**
- `sessions` array already filters per `showArchived` flag at load time (via `getSessions(includeArchived)`)
- Auto-group now only sees visible sessions, grouping mirrors what user sees in flat view
- Archive filter is now complete: flat view + grouped view both consistent

**Validation:** No ghost groups. Archive filter fully respected in both views.

---

## Outcome

**Tests:** 141 passing (all 8 test files)  
**Regressions:** None

**Behavior:**
1. ✅ App startup: `useArchive` syncs to server, then `useSessions` loads filtered list
2. ✅ Archive toggle: Grouped view updates consistently with flat view
3. ✅ Search results: Separated into active + archived sections (from Phase 3)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/hooks/useArchive.ts` | Added `syncComplete` flag, export `archiveSynced` |
| `src/hooks/useSessions.ts` | Gate load on `archiveSynced`; fix auto-group to use filtered `sessions` |

---

## Next Steps

- Monitor for any edge cases in concurrent startup scenarios
- Archive state now persists across page reloads (Phase 3 + sync fix)
- Both race conditions resolved; system ready for performance testing

---

**Scribe Note:** Both agents completed their work in a single pass. No blocking issues. Archive system now fully synchronized and consistent across views.
