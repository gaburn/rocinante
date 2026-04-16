# Decision: Test Connection saves config before testing

**Author:** Amos (Backend Dev)  
**Date:** 2026-07  
**Status:** Implemented  
**Scope:** Frontend — SettingsPanel ADO test connection flow

## Context

`handleTestConnection()` called `POST /api/ado/test` without first persisting the user-entered organization/project to the server. The server-side `runtimeConfig` still had empty strings, so `isAdoConfigured()` returned false and the endpoint returned HTTP 403. Users had to know to click "Save" before "Test Connection" — a non-obvious two-step flow.

## Decision

Modified `handleTestConnection()` in `src/components/settings/SettingsPanel.tsx` to call `updateAdoConfig({ organization, project })` before `testAdoConnection()`. If the save fails, the error is surfaced through the existing connection-result UI (same catch block).

## Trade-offs

- Test Connection now implicitly saves. This is acceptable for a settings page — users expect "test" to use their current inputs.
- If the save call fails (network error, server down), the user sees the save error in the test-result area rather than a separate save-error banner. Clear enough for the use case.

## Validation

- 233 tests passing, eslint clean, no new TypeScript errors (pre-existing SessionList.tsx errors only).
