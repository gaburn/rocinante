# Naomi — History

## Core Context

- **Project:** A real-time dashboard for monitoring and interacting with GitHub Copilot CLI sessions, built with React, Vite, and a Node/Express WebSocket backend.
- **Role:** Frontend Dev
- **Joined:** 2026-04-02T01:03:50.173Z

## Learnings

<!-- Append learnings below -->

### Bundle Baseline Measurement Script (2026-04)
- **Purpose:** Performance optimization baseline — measures frontend bundle sizes before any optimization work begins.
- **Script:** `src/__benchmarks__/bundle-baseline.ts` — Node script using `tsx`. Shells out to `npx vite build`, scans `dist/` for JS/CSS assets, computes gzipped sizes via `zlib.gzipSync`, flags chunks over 100KB gzipped.
- **Output:** JSON report to `src/__benchmarks__/bundle-baseline-results.json` (gitignored) + human-readable table to stderr.
- **npm script:** `bench:build` added to package.json.
- **Baseline findings:** Main bundle `index.js` is 465KB raw / 126KB gzip (over 100KB threshold 🔴). xterm chunk is 340KB raw / 86KB gzip (under threshold). CSS is 73KB raw / 12KB gzip. Total: 861KB raw / 223KB gzip.
- **No dependencies added:** Uses only Node stdlib (`child_process`, `fs`, `path`, `zlib`).
- **Outcome:** Build (`tsc --noEmit`) and lint (`eslint`) both clean. Script runs successfully, results JSON generated.

## Archived Learnings

See `history-archive.md` for detailed notes from 2025-07 through early 2026-04 (Amber Glow, Horse Logo, Kanban Board, Column Reorder, Session Updates, Demo Workstreams, Conversation Search, Session ID Search, Question Mark Icon, TokenUtilization, Inline Markdown, Table Rendering).
