import { createContext, useContext, type ReactNode } from 'react'
import { useSessions, type UseSessionsResult } from '../hooks/useSessions'

const SessionContext = createContext<UseSessionsResult | null>(null)

interface SessionProviderProps {
  children: ReactNode
}

export function SessionProvider({ children }: SessionProviderProps) {
  const sessionState = useSessions()

  return (
    <SessionContext.Provider value={sessionState}>
      {children}
    </SessionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionContext(): UseSessionsResult {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider')
  }

  return context
}
