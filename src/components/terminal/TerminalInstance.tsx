import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { useSettingsContext } from '../../context/SettingsContext'

const DARK_TERMINAL_THEME = {
  background: '#0a0a0f',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#0a0a0f',
  selectionBackground: 'rgba(255,255,255,0.15)',
}

const LIGHT_TERMINAL_THEME = {
  background: '#fafafe',
  foreground: '#1a1a2e',
  cursor: '#1a1a2e',
  cursorAccent: '#fafafe',
  selectionBackground: 'rgba(0,0,0,0.12)',
}

const getTerminalTheme = () => {
  if (typeof document === 'undefined') {
    return DARK_TERMINAL_THEME
  }

  return document.documentElement.classList.contains('light')
    ? LIGHT_TERMINAL_THEME
    : DARK_TERMINAL_THEME
}

interface TerminalInstanceProps {
  sessionId: string
  cwd: string | null
  mode: 'copilot' | 'shell'
  className?: string
}

export default function TerminalInstance({
  sessionId,
  cwd,
  mode,
  className,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { settings } = useSettingsContext()

  // Refs survive re-renders without triggering them — perfect for mutable
  // imperative handles that React doesn't need to know about.
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const ioRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false

    // Async IIFE — dynamic imports keep the main bundle leaner and avoid
    // issues with SSR / test environments that lack a real DOM.
    ;(async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      if (disposed) return

      // ── Create terminal ──────────────────────────────────────────
      const terminal = new Terminal({
        theme: getTerminalTheme(),
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        fontSize: settings.display.terminalFontSize,
        cursorBlink: true,
        scrollback: 5000,
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())

      terminal.open(container)
      fitAddon.fit()

      termRef.current = terminal
      fitRef.current = fitAddon

      // ── WebSocket to server PTY ──────────────────────────────────
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const shell =
        settings.display.shell === 'custom'
          ? settings.display.customShellPath
          : settings.display.shell
      const params = new URLSearchParams()
      if (mode === 'copilot') {
        params.set('sessionId', sessionId)
      }
      if (cwd) {
        params.set('cwd', cwd)
      }
      params.set('shell', shell)
      const wsUrl = `${protocol}://${location.host}/ws/terminal?${params.toString()}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.addEventListener('open', () => {
        // Tell the server our initial dimensions so it can size its PTY.
        ws.send(
          JSON.stringify({
            type: 'resize',
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        )
        terminal.focus()
      })

      ws.addEventListener('message', (event) => {
        terminal.write(event.data)
      })

      ws.addEventListener('close', () => {
        terminal.writeln('\r\n\x1b[31m[Terminal disconnected]\x1b[0m')
      })

      ws.addEventListener('error', () => {
        terminal.writeln(
          '\r\n\x1b[31m[Connection failed. Is the server running?]\x1b[0m',
        )
      })

      // ── Terminal → server ────────────────────────────────────────
      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })

      terminal.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })

      // ── Responsive fitting ───────────────────────────────────────
      // ResizeObserver triggers when the container's pixel dimensions
      // change (e.g. the user drags the panel's resize handle).
      const ro = new ResizeObserver(() => {
        // Guard: fit() throws if the terminal has zero dimensions
        // (which happens while the panel is display:none).
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddon.fit()
        }
      })
      ro.observe(container)
      roRef.current = ro

      // IntersectionObserver catches the hidden → visible transition
      // so we can re-fit after the panel reappears.
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (entry?.isIntersecting) {
            // Small delay lets the layout settle after display change.
            requestAnimationFrame(() => fitAddon.fit())
          }
        },
        { threshold: 0.01 },
      )
      io.observe(container)
      ioRef.current = io
    })()

    // ── Cleanup ──────────────────────────────────────────────────
    return () => {
      disposed = true
      ioRef.current?.disconnect()
      roRef.current?.disconnect()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (termRef.current) {
        termRef.current.dispose()
        termRef.current = null
      }
    }
  }, [sessionId, cwd, mode, settings.display.shell, settings.display.customShellPath])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!termRef.current) return

    const updateTheme = () => {
      const terminal = termRef.current
      if (!terminal) return

      const isLight = document.documentElement.classList.contains('light')
      terminal.options.theme = isLight ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME
    }

    // Initial set
    updateTheme()

    // Watch for class changes on <html>
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.fontSize = settings.display.terminalFontSize

    // Refit after font size change
    if (fitRef.current) {
      fitRef.current.fit()
    }
  }, [settings.display.terminalFontSize])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
