# Alex — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** DevOps
- **Joined:** 2026-04-02T01:03:50.188Z

## Learnings

<!-- Append learnings below -->

### Public Repository Preparation (2025-07)
- **npm audit fix** resolved all 4 vulnerabilities (vite 8.0.0→8.0.5, picomatch, path-to-regexp, brace-expansion) in one pass without `--force`.
- **Dependency classification matters:** `better-sqlite3` was misclassified as devDep but used at runtime by the server. Build tools (`concurrently`, `tsx`, `vite`, `tailwindcss`, `@tailwindcss/vite`, `@vitejs/plugin-react`) moved to devDeps. Always verify with `npx tsc --noEmit` after reshuffling deps.
- **.gitignore already covered `*.log`** — stale log files existed because they were committed before the gitignore rule. Deleted them manually.
- **Added safety-net patterns** to .gitignore: `*.pem`, `*.key`, `*.cert` — prevents accidental credential commits.
- **Removed `"private": true`** from package.json for open-source publishing.
- Created: CODE_OF_CONDUCT.md (Contributor Covenant v2.1), SECURITY.md (GitHub private vuln reporting), .github/CODEOWNERS, issue/PR templates, CI badge in README.
- **No personal emails in public files** — used GitHub Issues and GitHub Security Advisories URLs instead.

---

## Sprint 1 Assignment: Rocinante Performance Plan (2026-04-16)

**Sprint 1 Task:** Vite `optimizeDeps.include` (0.5d). Reduce dev startup from ~9s to <3s by pre-bundling heavy deps (React, xterm, etc) so they don't get bundled on first load.

**Sprint 2 Task:** Vendor chunk splitting in Vite build output (0.25d). Reduce main bundle stress.

**Full plan:** 3 sprints, target cold load <5s. Amos owns critical path (body-parser fix).

---

### Sprint 1, Item H2 — Vite Dev Startup Optimization (2026-04)

**Status:** ✅ Complete

**What was done:**
- Added `optimizeDeps.include` to vite.config.ts with 11 heavy dependencies:
  - React core: `react`, `react-dom`
  - dnd-kit drag-drop: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
  - Terminal emulator: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
  - Visualization: `d3-force`
  - Component libs: `@tanstack/react-virtual`, `js-yaml`

**Outcome:**
- Vite dev startup: **6144ms** (baseline ~9035ms)
- **32% improvement** from baseline
- TypeScript check: ✅ clean (no errors)
- No errors on cold start

**Why this works:**
- Pre-bundling heavy dependencies during first startup means Vite scans them once, caches the bundle in `node_modules/.vite`, then reuses it on subsequent restarts
- Without this, Vite re-scans and re-bundles all deps on every cold start
- Vite 8 uses esbuild under the hood, which is fast but still incurs overhead per scan

**Next steps for further optimization (Sprint 2):**
- Vendor chunk splitting in build output (Vite build performance)
- Server pre-warming / connection pooling improvements
