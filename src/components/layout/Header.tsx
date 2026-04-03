import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useSessionContext } from '../../context/SessionContext'
import { useSettingsContext } from '../../context/SettingsContext'
import { useTerminalContext } from '../../context/TerminalContext'
import SettingsPanel from '../settings/SettingsPanel'

// ---------------------------------------------------------------------------
// Inline SVG micro-icons – no external dependency needed.
// Each is a pure presentational component sized to the surrounding text.
// ---------------------------------------------------------------------------

/** A pulsing dot that conveys "live / connected" energy. */
function PulseDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full transition-colors duration-300 ${
          active ? 'bg-emerald-400' : 'bg-gray-500'
        }`}
      />
    </span>
  )
}

/** Kanban board / columns icon — represents the "board" view mode. */
function BoardIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="4" height="12" rx="1" />
      <rect x="6" y="2" width="4" height="8" rx="1" />
      <rect x="11" y="2" width="4" height="10" rx="1" />
    </svg>
  )
}

/** Nodes‑and‑edges graph icon — represents the "network" view mode. */
function NetworkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* edges */}
      <line x1="4" y1="4" x2="12" y2="4" />
      <line x1="4" y1="4" x2="4" y2="12" />
      <line x1="4" y1="12" x2="12" y2="4" />
      {/* nodes */}
      <circle cx="4" cy="4" r="2" fill="currentColor" />
      <circle cx="12" cy="4" r="2" fill="currentColor" />
      <circle cx="4" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

/** Circular‑arrow refresh icon — parent can spin it via className. */
function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* circular arrow path */}
      <path d="M13.5 8a5.5 5.5 0 1 1-1.28-3.53" />
      <polyline points="13.5 2.5 13.5 5 11 5" />
    </svg>
  )
}

/** Sun icon — represents switching to light theme. */
function SunIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" />
      <line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" />
      <line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.1" y2="4.1" />
      <line x1="11.9" y1="11.9" x2="12.95" y2="12.95" />
      <line x1="3.05" y1="12.95" x2="4.1" y2="11.9" />
      <line x1="11.9" y1="4.1" x2="12.95" y2="3.05" />
    </svg>
  )
}

/** Crescent moon icon — represents switching to dark theme. */
function MoonIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 8.5a5.5 5.5 0 1 1-6-6 4.5 4.5 0 0 0 6 6Z" />
    </svg>
  )
}

/** Wireframe horse-head logo — angular chess-knight profile with neon glow. */
function RocinanteIcon() {
  return (
    <svg
      className="h-8 w-8 rocinante-icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="#00ff41"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <style>{`
        .rocinante-icon {
          filter: drop-shadow(0 0 3px #00ff41) drop-shadow(0 0 6px rgba(0,255,65,0.35));
          animation: rocinante-glow-pulse 3.5s ease-in-out infinite;
        }
        @keyframes rocinante-glow-pulse {
          0%, 100% {
            filter: drop-shadow(0 0 2px #00ff41) drop-shadow(0 0 4px rgba(0,255,65,0.25));
          }
          50% {
            filter: drop-shadow(0 0 4px #00ff41) drop-shadow(0 0 10px rgba(0,255,65,0.5));
          }
        }
      `}</style>

      {/* Head outline — angular horse head profile facing right */}
      <polygon points="4,30 6,22 8,16 10,10 12,5 14,2 17,6 19,9 22,12 26,16 29,18 29,21 26,23 22,25 17,27 12,29 7,30" />

      {/* Mane — angular spikes along the crest of the neck */}
      <polyline points="10,10 7,6 8,16" />
      <polyline points="8,16 4,12 6,22" />

      {/* Eye — small filled diamond for contrast */}
      <polygon points="21,14 22,13 23,14 22,15" fill="#00ff41" />

      {/* Internal wireframe — triangulated mesh lines */}
      <line x1="14" y1="2" x2="22" y2="25" />
      <line x1="10" y1="10" x2="29" y2="21" />
      <line x1="19" y1="9" x2="12" y2="29" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export default function Header() {
  const {
    refreshSessions,
    autoRefreshEnabled,
    toggleAutoRefresh,
    isLoading,
    viewMode,
    setViewMode,
  } = useSessionContext()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const { settings, updateDisplaySettings } = useSettingsContext()
  const { isTerminalOpen, toggleTerminal } = useTerminalContext()

  // Theme toggle: dark ↔ light
  const currentTheme = settings.display.theme
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light'
  const ThemeIcon = currentTheme === 'dark' ? SunIcon : MoonIcon
  const themeToggleTitle =
    currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
  <>
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-default bg-surface-secondary px-4 select-none">
      {/* ── Left: brand / title ───────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Rocinante wireframe horse logo */}
        <RocinanteIcon />

        <div className="flex flex-col justify-center">
          <h1 className="font-mono text-sm font-semibold tracking-wide text-gray-100">
            Rocinante
          </h1>
          <span className="font-mono text-[11px] leading-tight text-gray-500">
            workhorse for workstreams
          </span>
        </div>
      </div>

      {/* ── Right: controls ───────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* View‑mode toggle — hidden on mobile where network view is impractical */}
        <div className="hidden md:flex items-center rounded-lg bg-surface-tertiary p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            title="Board View"
            className={`
              flex items-center justify-center rounded-md px-2 py-1
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary
              ${
                viewMode === 'list'
                  ? 'bg-surface-hover text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }
            `}
          >
            <BoardIcon />
          </button>

          <button
            type="button"
            onClick={() => setViewMode('network')}
            aria-pressed={viewMode === 'network'}
            title="Network view"
            className={`
              flex items-center justify-center rounded-md px-2 py-1
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary
              ${
                viewMode === 'network'
                  ? 'bg-surface-hover text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }
            `}
          >
            <NetworkIcon />
          </button>
        </div>

        {/* Divider after view toggle */}
        <span
          className="mx-0.5 hidden md:block h-5 w-px bg-border-default"
          aria-hidden="true"
        />

        {/* Settings gear button */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="rounded-md p-1.5 text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="2.5" />
            <path d="M13.54 9.19a1.14 1.14 0 0 0 .23 1.26l.04.04a1.38 1.38 0 1 1-1.95 1.95l-.04-.04a1.14 1.14 0 0 0-1.26-.23 1.14 1.14 0 0 0-.69 1.05v.12a1.38 1.38 0 0 1-2.76 0v-.06a1.14 1.14 0 0 0-.75-1.05 1.14 1.14 0 0 0-1.26.23l-.04.04a1.38 1.38 0 1 1-1.95-1.95l.04-.04a1.14 1.14 0 0 0 .23-1.26 1.14 1.14 0 0 0-1.05-.69h-.12a1.38 1.38 0 0 1 0-2.76h.06a1.14 1.14 0 0 0 1.05-.75 1.14 1.14 0 0 0-.23-1.26l-.04-.04A1.38 1.38 0 1 1 4.9 1.74l.04.04a1.14 1.14 0 0 0 1.26.23h.06a1.14 1.14 0 0 0 .69-1.05V.84a1.38 1.38 0 0 1 2.76 0v.06a1.14 1.14 0 0 0 .69 1.05 1.14 1.14 0 0 0 1.26-.23l.04-.04a1.38 1.38 0 1 1 1.95 1.95l-.04.04a1.14 1.14 0 0 0-.23 1.26v.06a1.14 1.14 0 0 0 1.05.69h.12a1.38 1.38 0 0 1 0 2.76h-.06a1.14 1.14 0 0 0-1.05.69Z" />
          </svg>
        </button>

        {/* Divider after settings */}
        <span
          className="mx-0.5 hidden md:block h-5 w-px bg-border-default"
          aria-hidden="true"
        />

        {/* Theme toggle button */}
        <button
          type="button"
          onClick={() => updateDisplaySettings({ theme: nextTheme })}
          title={themeToggleTitle}
          className="hidden md:inline-flex items-center justify-center rounded-md p-1.5 text-fg-secondary hover:text-fg-heading hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary"
        >
          <ThemeIcon />
        </button>

        {/* Divider after theme toggle */}
        <span
          className="mx-0.5 hidden md:block h-5 w-px bg-border-default"
          aria-hidden="true"
        />

        {/* Terminal panel toggle */}
        <button
          type="button"
          onClick={toggleTerminal}
          aria-pressed={isTerminalOpen}
          title="Toggle terminal (Ctrl+`)"
          className={`
            hidden md:inline-flex items-center justify-center rounded-md p-1.5
            transition-colors duration-150
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary
            ${
              isTerminalOpen
                ? 'bg-surface-hover text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }
          `}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="1" y="2.5" width="14" height="11" rx="2" />
            <polyline points="4.5 7.5 7 9.5 4.5 11.5" />
            <line x1="8.5" y1="11.5" x2="11.5" y2="11.5" />
          </svg>
        </button>

        {/* Divider after terminal toggle */}
        <span
          className="mx-0.5 hidden md:block h-5 w-px bg-border-default"
          aria-hidden="true"
        />

        {/* Auto‑refresh toggle pill */}
        <button
          type="button"
          onClick={toggleAutoRefresh}
          aria-pressed={autoRefreshEnabled}
          title={
            autoRefreshEnabled
              ? `Auto-refresh is on (every ${settings.display.refreshInterval / 1000}s) — click to pause`
              : 'Auto-refresh is paused — click to resume'
          }
          className={`
            group flex items-center gap-2 rounded-full px-3 py-1.5
            font-mono text-xs transition-colors duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary
            ${
              autoRefreshEnabled
                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-surface-tertiary text-gray-400 hover:bg-surface-hover'
            }
          `}
        >
          <PulseDot active={autoRefreshEnabled} />

          <span>
            Auto-refresh:
            <span className="ml-1 font-semibold">
              {autoRefreshEnabled ? 'ON' : 'OFF'}
            </span>
          </span>

          {autoRefreshEnabled && (
            <span className="text-[10px] leading-none text-emerald-500/70">
              {settings.display.refreshInterval === 0 ? 'Off' : `${settings.display.refreshInterval / 1000}s`}
            </span>
          )}
        </button>

        {/* Divider */}
        <span
          className="mx-0.5 h-5 w-px bg-border-default"
          aria-hidden="true"
        />

        {/* Manual refresh button */}
        <button
          type="button"
          onClick={refreshSessions}
          disabled={isLoading}
          title="Refresh sessions"
          className={`
            flex items-center gap-1.5 rounded-md px-2.5 py-1.5
            font-mono text-xs text-gray-400 transition-colors duration-200
            hover:bg-surface-hover hover:text-gray-100
            disabled:pointer-events-none disabled:opacity-60
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-secondary
          `}
        >
          <RefreshIcon
            className={`transition-transform duration-300 ${
              isLoading ? 'animate-spin' : 'group-hover:rotate-45'
            }`}
          />
          <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>
    </header>

    {createPortal(
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />,
      document.body
    )}
  </>
  )
}
