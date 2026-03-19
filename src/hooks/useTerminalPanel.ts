import { useCallback, useEffect, useState } from 'react';

const TERMINAL_HEIGHT_STORAGE_KEY = 'terminal-height';
const MIN_TERMINAL_HEIGHT = 150;
const DEFAULT_TERMINAL_HEIGHT = 300;

export interface UseTerminalPanelResult {
  isTerminalOpen: boolean;
  terminalHeight: number;
  toggleTerminal: () => void;
  openTerminal: () => void;
  closeTerminal: () => void;
  setTerminalHeight: (height: number) => void;
}

function clampTerminalHeight(height: number): number {
  const maxHeight = window.innerHeight * 0.8;
  return Math.min(Math.max(height, MIN_TERMINAL_HEIGHT), maxHeight);
}

export function useTerminalPanel(): UseTerminalPanelResult {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeightState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(TERMINAL_HEIGHT_STORAGE_KEY);
      if (!raw) return DEFAULT_TERMINAL_HEIGHT;

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return DEFAULT_TERMINAL_HEIGHT;

      return clampTerminalHeight(parsed);
    } catch {
      return DEFAULT_TERMINAL_HEIGHT;
    }
  });

  const toggleTerminal = useCallback(() => {
    setIsTerminalOpen((current) => !current);
  }, []);

  const openTerminal = useCallback(() => {
    setIsTerminalOpen(true);
  }, []);

  const closeTerminal = useCallback(() => {
    setIsTerminalOpen(false);
  }, []);

  const setTerminalHeight = useCallback((height: number) => {
    setTerminalHeightState(clampTerminalHeight(height));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleTerminal]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TERMINAL_HEIGHT_STORAGE_KEY, String(terminalHeight));
    } catch {
      // Ignore localStorage write errors so terminal state remains usable.
    }
  }, [terminalHeight]);

  return {
    isTerminalOpen,
    terminalHeight,
    toggleTerminal,
    openTerminal,
    closeTerminal,
    setTerminalHeight,
  };
}
