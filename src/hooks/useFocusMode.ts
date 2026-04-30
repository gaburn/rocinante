import { useMemo } from 'react'
import { useSessionData } from '../context/SessionContext'
import { useSettingsContext } from '../context/SettingsContext'

export interface UseFocusModeResult {
  /** Count of workstreams that have ≥1 session with status === 'active' */
  activeWorkstreamCount: number
  /** Names of workstreams where focused === true in the registry */
  focusedWorkstreamNames: string[]
  /** Whether focused count ≥ workstreamThreshold */
  isFocusLimitReached: boolean
  /** Whether activeWorkstreamCount > workstreamThreshold (strictly greater than) */
  shouldShowWarning: boolean
  /** The current threshold value from settings */
  workstreamThreshold: number
  /** Whether focus mode is enabled in settings */
  focusModeEnabled: boolean
}

export function useFocusMode(): UseFocusModeResult {
  const { groupedSessions, workstreamRegistry } = useSessionData()
  const { settings } = useSettingsContext()

  const { workstreamThreshold, focusModeEnabled } = settings.display

  const focusedWorkstreamNames = useMemo(() => {
    return Object.entries(workstreamRegistry)
      .filter(([, entry]) => entry.focused)
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b))
  }, [workstreamRegistry])

  const activeWorkstreamCount = useMemo(() => {
    let count = 0
    for (const group of groupedSessions.groups) {
      if (group.sessions.some((s) => s.status === 'active')) {
        count++
      }
    }
    // Also check ungrouped sessions
    if (groupedSessions.ungrouped.some((s) => s.status === 'active')) {
      count++
    }
    return count
  }, [groupedSessions])

  const isFocusLimitReached = focusedWorkstreamNames.length >= workstreamThreshold
  const shouldShowWarning = activeWorkstreamCount > workstreamThreshold

  return {
    activeWorkstreamCount,
    focusedWorkstreamNames,
    isFocusLimitReached,
    shouldShowWarning,
    workstreamThreshold,
    focusModeEnabled,
  }
}
