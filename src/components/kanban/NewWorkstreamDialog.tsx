import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionSummary } from '../../types'
import { useSessionData, useSessionActions } from '../../context/SessionContext'
import { useTerminalContext } from '../../context/TerminalContext'

interface NewWorkstreamDialogProps {
  isOpen: boolean
  onClose: () => void
  sessions: SessionSummary[]
  defaultRepoPath?: string
}

type AgentType = 'copilot' | 'claude' | 'shell'

interface AgentDetection {
  copilot: boolean
  claude: boolean
}

export default function NewWorkstreamDialog({
  isOpen,
  onClose,
  sessions,
  defaultRepoPath,
}: NewWorkstreamDialogProps) {
  const { getWorkstreamNames } = useSessionData()
  const { createWorkstream } = useSessionActions()
  const { openLaunchTerminal } = useTerminalContext()

  const [name, setName] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [agentType, setAgentType] = useState<AgentType>('shell')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [nameError, setNameError] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [agentDetection, setAgentDetection] = useState<AgentDetection | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Known cwds from sessions for autocomplete
  const knownCwds = useMemo(() => {
    const cwds = new Set<string>()
    for (const s of sessions) {
      if (s.cwd) cwds.add(s.cwd)
    }
    return Array.from(cwds).sort()
  }, [sessions])

  const filteredSuggestions = useMemo(() => {
    if (!repoPath.trim()) return knownCwds
    const lower = repoPath.toLowerCase()
    return knownCwds.filter((c) => c.toLowerCase().includes(lower))
  }, [knownCwds, repoPath])

  // Reset state on open
  useEffect(() => {
    if (!isOpen) return
    setName('')
    setRepoPath(defaultRepoPath ?? '')
    setAgentType('shell')
    setNameError(null)
    setPathError(null)
    setSubmitError(null)
    setIsSubmitting(false)
    setShowSuggestions(false)

    // Focus name input after paint
    requestAnimationFrame(() => nameInputRef.current?.focus())

    // Detect available agent CLIs
    setAgentLoading(true)
    setAgentDetection(null)
    fetch('/api/workstreams/agents')
      .then((res) => {
        if (!res.ok) throw new Error('Agent detection failed')
        return res.json() as Promise<AgentDetection>
      })
      .then((data) => {
        setAgentDetection(data)
        // Auto-select if only one CLI is available
        if (data.copilot && !data.claude) setAgentType('copilot')
        else if (data.claude && !data.copilot) setAgentType('claude')
        else if (data.copilot) setAgentType('copilot')
        else setAgentType('shell')
      })
      .catch(() => {
        setAgentDetection({ copilot: false, claude: false })
        setAgentType('shell')
      })
      .finally(() => setAgentLoading(false))
  }, [isOpen, defaultRepoPath])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSuggestions])

  // Validate name in real-time
  const validateName = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        setNameError(null)
        return
      }
      const existing = getWorkstreamNames.map((n) => n.toLowerCase())
      if (existing.includes(trimmed.toLowerCase())) {
        setNameError('A workstream with this name already exists')
      } else {
        setNameError(null)
      }
    },
    [getWorkstreamNames],
  )

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value)
      validateName(value)
      setSubmitError(null)
    },
    [validateName],
  )

  const handleSubmit = useCallback(async () => {
    // Validate
    const trimmedName = name.trim()
    const trimmedPath = repoPath.trim()
    let hasError = false

    if (!trimmedName) {
      setNameError('Workstream name is required')
      hasError = true
    } else {
      const existing = getWorkstreamNames.map((n) => n.toLowerCase())
      if (existing.includes(trimmedName.toLowerCase())) {
        setNameError('A workstream with this name already exists')
        hasError = true
      }
    }

    if (!trimmedPath) {
      setPathError('Repo path is required')
      hasError = true
    } else {
      setPathError(null)
    }

    if (hasError) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/workstreams/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: trimmedPath, agentType }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          (body as { error?: string } | null)?.error
            ?? `Launch failed (${res.status})`,
        )
      }

      const { launchId, normalizedPath } = (await res.json()) as {
        launchId: string
        normalizedPath: string
      }

      createWorkstream(trimmedName, {
        repoPath: normalizedPath,
        pendingLaunchId: launchId,
      })

      // Open a launch terminal that connects via /ws/terminal?launchId=<id>
      openLaunchTerminal(launchId, trimmedName, normalizedPath)

      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }, [
    name, repoPath, agentType, getWorkstreamNames,
    createWorkstream, openLaunchTerminal, onClose,
  ])

  if (!isOpen) return null

  const hasAnyCli = agentDetection ? (agentDetection.copilot || agentDetection.claude) : false

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-workstream-title"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[90vw] bg-surface-secondary rounded-xl border border-border-default shadow-2xl p-5"
      >
        <h2 id="new-workstream-title" className="text-sm font-semibold text-fg/90">
          New Workstream
        </h2>
        <p className="mt-1 text-xs text-fg/40">
          Launch a new workstream with its own terminal session.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="mt-4 space-y-4"
        >
          {/* ── Workstream name ── */}
          <div>
            <label htmlFor="ws-name" className="block text-xs font-medium text-fg/60 mb-1">
              Workstream name
            </label>
            <input
              ref={nameInputRef}
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. auth-refactor"
              autoComplete="off"
              className={`
                w-full rounded-lg border bg-surface-tertiary px-3 py-1.5 text-sm text-fg/80
                placeholder:text-fg/25 focus:outline-none focus:ring-1
                ${nameError
                  ? 'border-red-500/60 focus:ring-red-500/40'
                  : 'border-border-default focus:ring-border-active'}
              `}
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-400">{nameError}</p>
            )}
          </div>

          {/* ── Repo path ── */}
          <div className="relative" ref={suggestionsRef}>
            <label htmlFor="ws-path" className="block text-xs font-medium text-fg/60 mb-1">
              Repo path
            </label>
            <input
              id="ws-path"
              type="text"
              value={repoPath}
              onChange={(e) => {
                setRepoPath(e.target.value)
                setPathError(null)
                setSubmitError(null)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="/path/to/repository"
              autoComplete="off"
              className={`
                w-full rounded-lg border bg-surface-tertiary px-3 py-1.5 text-sm text-fg/80
                placeholder:text-fg/25 focus:outline-none focus:ring-1
                ${pathError
                  ? 'border-red-500/60 focus:ring-red-500/40'
                  : 'border-border-default focus:ring-border-active'}
              `}
            />
            {pathError && (
              <p className="mt-1 text-xs text-red-400">{pathError}</p>
            )}

            {/* Autocomplete suggestions */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-36 overflow-y-auto rounded-lg border border-border-default bg-surface-secondary shadow-lg">
                {filteredSuggestions.map((cwd) => (
                  <button
                    key={cwd}
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-xs text-fg/60 hover:bg-surface-hover hover:text-fg/80 transition-colors truncate"
                    onClick={() => {
                      setRepoPath(cwd)
                      setPathError(null)
                      setShowSuggestions(false)
                    }}
                  >
                    {cwd}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Agent type ── */}
          <fieldset>
            <legend className="text-xs font-medium text-fg/60 mb-2">Agent type</legend>

            {agentLoading ? (
              <div className="flex items-center gap-2 text-xs text-fg/35">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                  <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Detecting available CLIs…
              </div>
            ) : (
              <div className="space-y-1.5">
                {agentDetection?.copilot && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="agentType"
                      value="copilot"
                      checked={agentType === 'copilot'}
                      onChange={() => setAgentType('copilot')}
                      className="accent-border-active"
                    />
                    <span className="text-xs text-fg/70 group-hover:text-fg/90 transition-colors">
                      Copilot CLI
                    </span>
                  </label>
                )}
                {agentDetection?.claude && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="agentType"
                      value="claude"
                      checked={agentType === 'claude'}
                      onChange={() => setAgentType('claude')}
                      className="accent-border-active"
                    />
                    <span className="text-xs text-fg/70 group-hover:text-fg/90 transition-colors">
                      Claude CLI
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="agentType"
                    value="shell"
                    checked={agentType === 'shell'}
                    onChange={() => setAgentType('shell')}
                    className="accent-border-active"
                  />
                  <span className="text-xs text-fg/70 group-hover:text-fg/90 transition-colors">
                    Shell only
                  </span>
                </label>

                {!hasAnyCli && agentDetection && (
                  <p className="text-[11px] text-fg/30 mt-1">
                    No agent CLIs detected — sessions will use shell only.
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {/* ── Submit error ── */}
          {submitError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {submitError}
            </div>
          )}

          {/* ── Button row ── */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg bg-surface-tertiary text-fg/50 hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !!nameError}
              className="
                px-3 py-1.5 rounded-lg border transition-colors
                bg-border-active/15 border-border-active/40 text-fg/80
                hover:bg-border-active/25
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {isSubmitting ? 'Launching…' : 'Create & Launch'}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  )
}
