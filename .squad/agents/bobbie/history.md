# Bobbie — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Tester
- **Joined:** 2026-04-02T01:03:50.182Z

## Learnings

<!-- Append learnings below -->

### 2026-04-04: statusDeriver ask_user Detection Tests

**Context:** Wrote comprehensive test suite for ask_user detection in `statusDeriver.ts` before implementation (TDD approach). Tests are ready for when Amos implements the feature.

**Architecture Decisions:**
- Test framework: Vitest (not yet installed - P0 item from audit)
- Test location: `server/services/__tests__/` following common Node.js convention
- Test file: `statusDeriver.test.ts` (26 test cases covering all scenarios)

**Key Patterns:**
- Mock `getConfig()` to control staleThresholdMs (set to 300000ms for test stability)
- Helper `createEvent()` function creates ParsedEvent objects with defaults
- Tests use fresh timestamps (`Date.now()`) to avoid staleness, except when testing stale behavior
- Test structure: describe blocks organized by scenario type (name field, toolName field, edge cases, etc.)

**Expected Implementation Details:**
1. `DerivedStatus` interface needs `waitingQuestion?: string` and `waitingChoices?: string[]` fields
2. ask_user detection should check both `name` and `toolName` fields (schema variants)
3. Question extracted from `parameters.question` or `arguments.question`
4. Choices extracted from `parameters.choices` or `arguments.choices`
5. Empty strings/arrays normalized to undefined
6. Status priority: shutdown > error > ask_user > other tool requests
7. When multiple ask_user requests exist, use most recent

**File Paths:**
- Test file: `server/services/__tests__/statusDeriver.test.ts`
- Test docs: `server/services/__tests__/README.md`
- System under test: `server/services/statusDeriver.ts`
- Config mock: `server/config.js`

**Trade-offs:**
- Tests written before implementation (TDD) - will fail until Amos implements ask_user detection
- Comprehensive coverage (26 tests) vs simpler smoke tests - chose thorough approach given critical nature of status detection
- Used Vitest despite not being installed yet - team decision from audit that Vitest is the chosen framework
