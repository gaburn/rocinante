# Contributing to Rocinante

Thanks for your interest in contributing! Rocinante is a dashboard for monitoring GitHub Copilot CLI sessions, and contributions of all kinds are welcome.

## Getting Started

### Prerequisites

- **Node.js 22+**
- **C++ build tools** (required by the `node-pty` native module):
  - Windows: Visual Studio Build Tools with "Desktop development with C++"
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`
- **GitHub Copilot CLI** installed with session data under `~/.copilot/` (or use [Demo Mode](#demo-mode))

### Setup

```bash
git clone https://github.com/gaburn/rocinante.git
cd rocinante
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Demo Mode

If you don't have Copilot CLI session data, create a `.env` file:

```
DEMO_MODE=true
```

Restart the server to see the dashboard with mock data.

## Development

### Project Structure

```
src/                    # Frontend (React + TypeScript)
  components/           # UI components
  hooks/                # Custom React hooks
  types/                # TypeScript type definitions
  services/             # API client functions
  context/              # React context providers
  utils/                # Utility functions

server/                 # Backend (Express + TypeScript)
  routes/               # API route handlers
  services/             # Business logic (SQLite reader, session mapper, etc.)

docs/                   # Documentation
```

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start frontend + backend in dev mode |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run lint` | Run ESLint |

### Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript, Tailwind CSS v4, @dnd-kit, d3-force, xterm.js
- **Backend**: Express 5, better-sqlite3, node-pty, ws, tsx

## Making Changes

1. **Fork** the repository
2. **Create a branch** for your change (`git checkout -b my-feature`)
3. **Make your changes** — keep commits focused and descriptive
4. **Test locally** — run `npm run build` to verify no type errors
5. **Submit a pull request** with a clear description of what changed and why

### Code Style

- TypeScript with strict mode
- Tailwind CSS for styling (no separate CSS files for components)
- Functional React components with hooks
- Comments only where the code needs clarification — don't over-comment

## Reporting Issues

Use [GitHub Issues](https://github.com/gaburn/rocinante/issues) to report bugs or request features. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
