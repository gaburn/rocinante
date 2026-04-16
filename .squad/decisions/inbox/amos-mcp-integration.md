# ADO MCP Client Integration

**Author:** Amos (Backend Dev)  
**Date:** 2026-07  
**Status:** Implemented  
**Scope:** Backend — ADO integration layer

## Context

The existing `server/services/adoClient.ts` is a hand-rolled REST client (~380 LOC) that authenticates via `az` CLI. Microsoft now publishes an official MCP server (`@azure-devops/mcp`) that exposes ADO APIs as MCP tools. We're pivoting the backend to use MCP as the primary integration path.

## Decision

Created `server/services/adoMcpClient.ts` — a typed MCP client wrapper that spawns `@azure-devops/mcp` as a stdio subprocess via `npx -y @azure-devops/mcp {org} -d core repositories work-items`. Uses `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`.

### Key design choices:

1. **`@azure-devops/mcp` is NOT a project dependency.** It's a standalone MCP server invoked via `npx` at runtime. Only `@modelcontextprotocol/sdk` (^1.29.0) is installed as a dependency. Users just need Node.js/npx available.

2. **Lazy singleton lifecycle.** The MCP subprocess is not spawned at server boot — it starts on first ADO request. One client per organization. If org config changes, the old client is torn down and a new one created.

3. **MCP-first with REST fallback.** The `GET /api/ado/session-deliverables` endpoint tries MCP first. If MCP fails to init (npx unavailable, subprocess crash, etc.), it catches and falls through to the existing direct REST functions in `adoClient.ts`. This means the old REST path remains fully functional as a safety net.

4. **Same caching pattern.** 5-min TTL response cache, same as `adoClient.ts`.

5. **Graceful shutdown.** `shutdownMcpClient()` is wired into `server/index.ts` shutdown handler alongside `killAllPtys()` and `closeDatabase()`.

## Files Changed

- `package.json` — added `@modelcontextprotocol/sdk` (^1.29.0)
- `server/services/adoMcpClient.ts` — NEW: MCP client wrapper (~260 LOC)
- `server/routes/ado.ts` — session-deliverables refactored to MCP-first + REST fallback
- `server/index.ts` — wired MCP shutdown into graceful shutdown

## Trade-offs

- MCP subprocess adds ~1-2s latency on first ADO request (npx cold start + MCP server init). Subsequent calls reuse the warm client.
- If npx is not on PATH or the user has no internet (for the initial `@azure-devops/mcp` download), MCP path fails and REST takes over. No user-facing error in this case — degradation is silent.
- The `@azure-devops/mcp` package handles its own auth via `@azure/identity` (browser-based). This is different from the REST client's `az` CLI auth. Both auth paths coexist.

## Validation

- 233 tests passing (all 12 test files)
- `npx eslint` clean on all changed files
- `npx tsc --noEmit -p tsconfig.server.json` clean
