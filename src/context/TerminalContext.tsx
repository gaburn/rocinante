import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useSessionSelection } from './SessionContext';
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
  openLaunchTab: UseTerminalTabsResult['openLaunchTab'];
  setActiveTab: (sessionId: string) => void;
  toggleFollowSession: () => void;
  requestCloseTab: (sessionId: string) => void;
  confirmCloseTab: () => void;
  cancelCloseTab: () => void;
  // Convenience (new)
  openSessionTerminal: (session: Session) => void;
  openShellTerminal: (session: Session) => void;
  openLaunchTerminal: (launchId: string, workstreamName: string, cwd: string) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const panel = useTerminalPanel();
  const tabs = useTerminalTabs();
  const { selectedSession } = useSessionSelection();

  const { openTab, hasTab, setActiveTab, followSession, openLaunchTab } = tabs;
  const { openTerminal, isTerminalOpen } = panel;

  const openSessionTerminal = useCallback(
    (session: Session) => {
      openTab({ id: session.id, name: session.name, cwd: session.cwd ?? null });
      openTerminal();
    },
    [openTab, openTerminal],
  );

  const openShellTerminal = useCallback((session: Session) => {
    openTab(
      { id: session.id, name: `${session.name} (shell)`, cwd: session.cwd ?? null },
      'shell',
    );
    openTerminal();
  }, [openTab, openTerminal]);

  const openLaunchTerminal = useCallback(
    (launchId: string, workstreamName: string, cwd: string) => {
      openLaunchTab(launchId, workstreamName, cwd);
      openTerminal();
    },
    [openLaunchTab, openTerminal],
  );

  useEffect(() => {
    if (!followSession || !selectedSession || !isTerminalOpen) return;
    if (hasTab(selectedSession.id)) {
      setActiveTab(selectedSession.id);
    }
  }, [selectedSession, followSession, isTerminalOpen, hasTab, setActiveTab]);

  return (
    <TerminalContext.Provider
      value={{
        ...panel,
        ...tabs,
        openSessionTerminal,
        openShellTerminal,
        openLaunchTerminal,
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
