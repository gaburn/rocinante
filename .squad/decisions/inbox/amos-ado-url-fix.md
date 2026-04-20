# Decision: ADO URL fallback pattern via `buildPrUrl()` helper

**Author:** Amos (Backend Dev)
**Date:** 2026-07-17

## Context

PR URLs in the session detail view were broken — showing as `http://localhost:5173/pullrequest/{id}` — because `pr.repository?.webUrl` from the ADO API is sometimes undefined. The original code used `webUrl ?? ''` which produced a relative URL the browser resolved against localhost.

## Decision

Introduced a shared `buildPrUrl(webUrl, repoName, prId)` helper in both `adoClient.ts` and `adoMcpClient.ts`. Fallback chain:

1. If `webUrl` exists → use it directly
2. Else → construct from `getConfig()`: `https://dev.azure.com/{org}/{project}/_git/{repoName}/pullrequest/{prId}`
3. If repo name is also missing → omit the repo segment

This matches the existing pattern already used for work item URLs (line 186 of adoClient.ts).

## Impact

Any future ADO entity URL mapping should follow the same pattern: prefer the API-provided URL, fall back to constructing from config values. Never produce a relative/empty URL.
