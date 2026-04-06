import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useSessionContext } from './SessionContext';
import { useTerminalPanel } from '../hooks/useTerminalPanel';
import { useTerminalTabs, type UseTerminalTabsResult } from '../hooks/useTerminalTabs';
import type { Session } from '../types';

interface TerminalContextValue {
  // Panel state (existing)
  isTerminalOpen: boolean;
  terminalHeight: number;
  toggleTerminal: () => void;
  openTerminal: () => void;
  closeTerminal: () => void;
  setTerminalHeight: (height: number) => void;
  // Tab state (new)
  tabs: UseTerminalTabsResult['tabs'];
  activeTabId: string | null;
  pendingCloseTabId: string | null;
  followSession: boolean;
  isAtMaxTabs: boolean;
  hasTab: (sessionId: string) => boolean;
  canOpenTab: (sessionId: string) => boolean;
  openTab: (
    session: { id: string; name: string; cwd?: string | null },
    mode?: 'copilot' | 'shell',
  ) => void;
  setActiveTab: (sessionId: string) => void;
  toggleFollowSession: () => void;
  requestCloseTab: (sessionId: string) => void;
  confirmCloseTab: () => void;
  cancelCloseTab: () => void;
  // Convenience (new)
  openSessionTerminal: (session: Session) => void;
  openShellTerminal: (session: Session) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const panel = useTerminalPanel();
  const tabs = useTerminalTabs();
  const { selectedSession } = useSessionContext();

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const openSessionTerminal = useCallback(
    (session: Session) => {
      tabs.openTab({ id: session.id, name: session.name, cwd: session.cwd ?? null });
      panel.openTerminal();
    },
    [tabs.openTab, panel.openTerminal],
  );

  const openShellTerminal = useCallback((session: Session) => {
    tabs.openTab(
      { id: session.id, name: `${session.name} (shell)`, cwd: session.cwd ?? null },
      'shell',
    );
    panel.openTerminal();
  }, [tabs.openTab, panel.openTerminal]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  useEffect(() => {
    if (!tabs.followSession || !selectedSession || !panel.isTerminalOpen) return;
    if (tabs.hasTab(selectedSession.id)) {
      tabs.setActiveTab(selectedSession.id);
    }
  }, [selectedSession?.id, tabs.followSession, panel.isTerminalOpen]);

  return (
    <TerminalContext.Provider
      value={{
        ...panel,
        ...tabs,
        openSessionTerminal,
        openShellTerminal,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTerminalContext(): TerminalContextValue {
  const context = useContext(TerminalContext);
  if (!context) throw new Error('useTerminalContext must be used within a TerminalProvider');
  return context;
}
