import { useCallback, useEffect, useState } from 'react';

export interface TerminalTab {
  sessionId: string;
  sessionName: string;
  cwd: string | null;
  mode: 'copilot' | 'shell';
}

export interface UseTerminalTabsResult {
  tabs: TerminalTab[];
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
}

const MAX_TERMINAL_TABS = 5;
const FOLLOW_SESSION_STORAGE_KEY = 'terminal-follow-session';

export function useTerminalTabs(): UseTerminalTabsResult {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const [followSession, setFollowSession] = useState<boolean>(() => {
    try {
      const storedValue = window.localStorage.getItem(FOLLOW_SESSION_STORAGE_KEY);
      return storedValue === null ? true : storedValue === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(FOLLOW_SESSION_STORAGE_KEY, String(followSession));
    } catch {
      // localStorage may be unavailable in some environments.
    }
  }, [followSession]);

  const isAtMaxTabs = tabs.length >= MAX_TERMINAL_TABS;

  const hasTab = useCallback(
    (sessionId: string) => tabs.some((tab) => tab.sessionId === sessionId),
    [tabs],
  );

  const canOpenTab = useCallback(
    (sessionId: string) => hasTab(sessionId) || !isAtMaxTabs,
    [hasTab, isAtMaxTabs],
  );

  const openTab = useCallback(
    (session: { id: string; name: string; cwd?: string | null }, mode: 'copilot' | 'shell' = 'copilot') => {
      const tabId = mode === 'shell' ? `shell-${session.id}` : session.id;
      const existingTab = tabs.find((tab) => tab.sessionId === tabId);
      if (existingTab) {
        setActiveTabId(existingTab.sessionId);
        return;
      }

      if (tabs.length >= MAX_TERMINAL_TABS) {
        return;
      }

      const nextTab: TerminalTab = {
        sessionId: tabId,
        sessionName: session.name,
        cwd: session.cwd ?? null,
        mode,
      };

      setTabs((currentTabs) => [...currentTabs, nextTab]);
      setActiveTabId(tabId);
    },
    [tabs],
  );

  const setActiveTab = useCallback((sessionId: string) => {
    setActiveTabId(sessionId);
  }, []);

  const toggleFollowSession = useCallback(() => {
    setFollowSession((currentValue) => !currentValue);
  }, []);

  const requestCloseTab = useCallback((sessionId: string) => {
    setPendingCloseTabId(sessionId);
  }, []);

  const confirmCloseTab = useCallback(() => {
    if (!pendingCloseTabId) {
      return;
    }

    const closingIndex = tabs.findIndex((tab) => tab.sessionId === pendingCloseTabId);
    if (closingIndex === -1) {
      setPendingCloseTabId(null);
      return;
    }

    if (activeTabId === pendingCloseTabId) {
      const nextRightTab = tabs[closingIndex + 1] ?? null;
      const nextLeftTab = tabs[closingIndex - 1] ?? null;
      const nextActiveTabId = nextRightTab?.sessionId ?? nextLeftTab?.sessionId ?? null;
      setActiveTabId(nextActiveTabId);
    }

    setTabs((currentTabs) =>
      currentTabs.filter((tab) => tab.sessionId !== pendingCloseTabId),
    );
    setPendingCloseTabId(null);
  }, [activeTabId, pendingCloseTabId, tabs]);

  const cancelCloseTab = useCallback(() => {
    setPendingCloseTabId(null);
  }, []);

  return {
    tabs,
    activeTabId,
    pendingCloseTabId,
    followSession,
    isAtMaxTabs,
    hasTab,
    canOpenTab,
    openTab,
    setActiveTab,
    toggleFollowSession,
    requestCloseTab,
    confirmCloseTab,
    cancelCloseTab,
  };
}
