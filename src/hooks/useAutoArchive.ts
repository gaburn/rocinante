import { useCallback, useEffect, useState } from 'react'
import type { AutoArchiveRule } from '../types/settings'

const STORAGE_KEY = 'rocinante-auto-archive-rules'

function generateId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function loadRules(): AutoArchiveRule[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is AutoArchiveRule =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as AutoArchiveRule).id === 'string' &&
        typeof (r as AutoArchiveRule).pattern === 'string' &&
        typeof (r as AutoArchiveRule).enabled === 'boolean',
    )
  } catch {
    return []
  }
}

function persistRules(rules: AutoArchiveRule[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    // Ignore localStorage write errors
  }
}

export interface UseAutoArchiveResult {
  rules: AutoArchiveRule[]
  addRule: (pattern: string) => AutoArchiveRule
  removeRule: (id: string) => void
  toggleRule: (id: string) => void
  matchesAnyRule: (sessionName: string) => boolean
  getMatchingSessionIds: (sessions: { id: string; name: string }[]) => string[]
}

export function useAutoArchive(): UseAutoArchiveResult {
  const [rules, setRules] = useState<AutoArchiveRule[]>(loadRules)

  useEffect(() => {
    persistRules(rules)
  }, [rules])

  const addRule = useCallback((pattern: string): AutoArchiveRule => {
    const rule: AutoArchiveRule = {
      id: generateId(),
      pattern: pattern.trim(),
      enabled: true,
      createdAt: new Date().toISOString(),
    }
    setRules((prev) => [...prev, rule])
    return rule
  }, [])

  const removeRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const toggleRule = useCallback((id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    )
  }, [])

  const matchesAnyRule = useCallback(
    (sessionName: string): boolean => {
      const name = sessionName.toLowerCase()
      return rules.some(
        (r) => r.enabled && r.pattern.length > 0 && name.includes(r.pattern.toLowerCase()),
      )
    },
    [rules],
  )

  const getMatchingSessionIds = useCallback(
    (sessions: { id: string; name: string }[]): string[] => {
      const enabledRules = rules.filter((r) => r.enabled && r.pattern.length > 0)
      if (enabledRules.length === 0) return []

      const patterns = enabledRules.map((r) => r.pattern.toLowerCase())
      return sessions
        .filter((s) => {
          const name = s.name.toLowerCase()
          return patterns.some((p) => name.includes(p))
        })
        .map((s) => s.id)
    },
    [rules],
  )

  return { rules, addRule, removeRule, toggleRule, matchesAnyRule, getMatchingSessionIds }
}
