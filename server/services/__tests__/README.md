# statusDeriver Tests

## Overview

This directory contains tests for the `statusDeriver.ts` service, which derives session status from event streams.

## Test Framework Status

**⚠️ VITEST NOT YET INSTALLED**

These tests are written for Vitest but the framework has not yet been installed (P0 item from codebase audit). To run these tests:

1. Install Vitest:
   ```bash
   npm install -D vitest
   ```

2. Create `vitest.config.ts` in the project root:
   ```typescript
   import { defineConfig } from 'vitest/config';
   
   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
     },
   });
   ```

3. Add test script to `package.json`:
   ```json
   "scripts": {
     "test": "vitest",
     "test:ui": "vitest --ui",
     "test:coverage": "vitest --coverage"
   }
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Test Coverage

### `statusDeriver.test.ts`

Tests for `deriveSessionStatus` function focusing on ask_user detection:

**Core Scenarios:**
- ask_user as only tool request → waiting status with question/choices
- ask_user with "name" field (standard schema)
- ask_user with "toolName" field (alternate schema)
- ask_user with no choices (freeform input)
- ask_user with empty choices array (normalized to undefined)
- Mixed tool requests with ask_user (ask_user takes priority)

**Edge Cases:**
- Stale ask_user events → completed (beyond threshold)
- ask_user after session.shutdown → completed (shutdown wins)
- Multiple ask_user requests → most recent wins
- ask_user after error event → blocked (error has priority)
- Malformed toolRequests → graceful handling
- Null/undefined question → graceful handling
- Non-array choices → normalized to undefined
- Empty string question → normalized to undefined
- Whitespace preservation in question text

**Existing Behavior:**
- assistant.message without toolRequests → waiting (no question/choices)
- Non-ask_user tool requests → active status
- tool.execution_start → active status

**Total:** 26 test cases covering all ask_user detection scenarios

## Implementation Notes

These tests assume the following enhancements to `statusDeriver.ts`:

1. **DerivedStatus interface** should include:
   ```typescript
   waitingQuestion?: string;
   waitingChoices?: string[];
   ```

2. **ask_user detection logic** should:
   - Check toolRequests array for tools with name/toolName === 'ask_user'
   - Extract question from parameters.question or arguments.question
   - Extract choices from parameters.choices or arguments.choices
   - Normalize empty strings and empty arrays to undefined
   - Prioritize most recent ask_user if multiple exist
   - Respect existing status priority (shutdown > error > ask_user)

3. **Config mock** sets staleThresholdMs to 300000ms (5 minutes) for test stability

## Running Individual Tests

```bash
# Run all statusDeriver tests
npx vitest statusDeriver

# Run specific test suite
npx vitest -t "ask_user detection with name field"

# Watch mode
npx vitest --watch
```
