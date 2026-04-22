import { useCallback, useRef } from 'react'
import { useTerminalContext } from '../../context/TerminalContext'
import TerminalTabBar from './TerminalTabBar'
import TerminalInstance from './TerminalInstance'
import ConfirmDialog from '../common/ConfirmDialog'

// ---------------------------------------------------------------------------
// TerminalPanel
// ---------------------------------------------------------------------------
// Bottom-anchored panel that hosts multiple session-scoped terminal tabs.
// The panel is **always mounted** (hidden with `display: none`) so the
// underlying PTY connections and scrollback buffers survive while the panel
// is collapsed.  Every open tab's <TerminalInstance /> is rendered at all
// times — inactive tabs are hidden with `display: none` rather than
// unmounted so they keep their connection alive.
//
// ┌═══════════════ drag handle (4 px, cursor: row-resize) ═══════════════┐
// │  >_ [Tab1][Tab2][Tab3]                                          [✕]  │  ← toolbar 32 px
// │                                                                      │
// │         <TerminalInstance /> (active tab — display: flex)             │  ← flex-1
// │         <TerminalInstance /> (inactive — display: none)               │
// │                                                                      │
// │   ─── OR empty state if no tabs ───                                  │
// │                                                                      │
// └──────────────────────────────────────────────────────────────────────┘
// + <ConfirmDialog /> (when pendingCloseTabId is set)
// ---------------------------------------------------------------------------

/** Clamp a pixel value between sensible panel bounds. */
const clampHeight = (h: number) => Math.min(Math.max(h, 120), window.innerHeight * 0.8)

export default function TerminalPanel() {
  const {
    isTerminalOpen,
    terminalHeight,
    setTerminalHeight,
    closeTerminal,
    tabs,
    activeTabId,
    pendingCloseTabId,
    followSession,
    toggleFollowSession,
    confirmCloseTab,
    cancelCloseTab,
  } = useTerminalContext()

  // Track whether a drag gesture is active so we can attach / detach
  // pointer listeners on the document (not the tiny handle element).
  const dragging = useRef(false)

  // ── Drag-to-resize ─────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true

      // Prevent text selection across the page while dragging.
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const newHeight = clampHeight(window.innerHeight - ev.clientY)
        setTerminalHeight(newHeight)
      }

      const onMouseUp = () => {
        dragging.current = false
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [setTerminalHeight],
  )

  // ── Resolve the tab name for the close-confirmation dialog ─────────
  const pendingTabName =
    tabs.find((t) => t.sessionId === pendingCloseTabId)?.sessionName ?? 'this session'

  return (
    <>
      <section
        aria-label="Terminal"
        className="flex flex-col border-t border-border-default"
        style={{
          height: terminalHeight,
          display: isTerminalOpen ? 'flex' : 'none',
        }}
      >
        {/* ── Drag handle ───────────────────────────────────────────── */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal panel"
          className="h-1 shrink-0 cursor-row-resize bg-border-default hover:bg-border-active transition-colors"
          onMouseDown={onMouseDown}
        />

        {/* ── Toolbar ───────────────────────────────────────────────── */}
        <div className="flex h-8 shrink-0 items-center justify-between bg-surface-secondary border-b border-border-default px-3 select-none">
          {/* Left — icon + tabs (or fallback label) */}
          <div className="flex items-center gap-2 min-w-0 overflow-hidden font-mono text-xs text-fg/60">
            <span aria-hidden="true" className="shrink-0">&gt;_</span>
            {tabs.length > 0 ? <TerminalTabBar /> : <span>Terminal</span>}
          </div>

          {/* Right — follow toggle + close panel */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleFollowSession}
              title={
                followSession
                  ? 'Following selected session (click to disable)'
                  : 'Not following selected session (click to enable)'
              }
              aria-label={
                followSession
                  ? 'Following selected session (click to disable)'
                  : 'Not following selected session (click to enable)'
              }
              className="rounded p-1 transition-colors hover:bg-surface-hover"
            >
              <svg
                className={`h-3.5 w-3.5 ${followSession ? 'text-emerald-400' : 'text-fg/30'}`}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6.5 9.5 4.4 11.6a2 2 0 1 1-2.8-2.8l2.1-2.1a2 2 0 0 1 2.8 0" />
                <path d="m9.5 6.5 2.1-2.1a2 2 0 1 1 2.8 2.8l-2.1 2.1a2 2 0 0 1-2.8 0" />
                <path d="m6 10 4-4" />
              </svg>
            </button>

            <button
              type="button"
              onClick={closeTerminal}
              title="Hide terminal panel"
              aria-label="Hide terminal panel"
              className="
                shrink-0 flex h-5 w-5 items-center justify-center rounded
                text-fg/40 hover:text-fg/90 hover:bg-surface-hover
                transition-colors duration-100
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active
              "
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Terminal surface ───────────────────────────────────────── */}
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const isActive = tab.sessionId === activeTabId
            return (
              <div
                key={tab.sessionId}
                className={isActive ? 'flex-1 min-h-0' : undefined}
                style={{ display: isActive ? 'flex' : 'none' }}
              >
                <TerminalInstance
                  sessionId={tab.sessionId}
                  cwd={tab.cwd}
                  mode={tab.mode}
                  launchId={tab.launchId}
                  className="flex-1 min-h-0"
                />
              </div>
            )
          })
        ) : (
          /* ── Empty state ────────────────────────────────────────── */
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1">
            <span className="text-fg/20 text-xs font-mono">
              No terminals open
            </span>
            <span className="text-fg/20 text-xs font-mono">
              Open a terminal from a session&#39;s detail view
            </span>
          </div>
        )}
      </section>

      {/* ── Close-tab confirmation ────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={pendingCloseTabId !== null}
        title="Close Terminal"
        message={`Close terminal for "${pendingTabName}"? This will end the copilot process.`}
        confirmLabel="Close Terminal"
        onConfirm={confirmCloseTab}
        onCancel={cancelCloseTab}
      />
    </>
  )
}
