# Bobbie — History

## Core Context

- Project: A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions
- Role: Tester
- Joined: 2026-04-02T01:03:50.182Z

## Learnings

### 2026-07-17: Session-Level ADO Deliverables Tests (47 new tests)

Context: Wrote tests for the session-level ADO deliverables feature (Amos backend + Naomi frontend). Feature adds /api/ado/session-deliverables endpoint, ADO enrichment on session summaries, useSessionDeliverables hook, and badge rendering in SessionCard.

Test Files:
- server/routes/__tests__/adoSessionDeliverables.test.ts — 12 tests
- server/routes/__tests__/sessionsAdoEnrichment.test.ts — 7 tests  
- src/hooks/__tests__/useSessionDeliverables.test.ts — 14 tests
- src/components/sessions/__tests__/SessionCardBadge.test.ts — 14 tests

Key Patterns:
- Direct route handler invocation via Express router stack
- vi.mock() for service/module mocks
- Pure function extraction for frontend tests
- Promise.allSettled patterns tested via mock ordering
- vi.useFakeTimers() for timeout test

Gotcha Found:
- vi.clearAllMocks() does NOT reset mock implementations. Use vi.resetAllMocks() in afterEach.

Results: 280 tests across 16 files, all passing. ESLint clean. No new TypeScript errors.

---

Note: Earlier learnings archived in history-archive file.
