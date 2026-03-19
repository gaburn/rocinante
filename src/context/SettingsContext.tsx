import { createContext, useContext, type ReactNode } from 'react';
import { useSettings, type UseSettingsResult } from '../hooks/useSettings';

const SettingsContext = createContext<UseSettingsResult | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settingsState = useSettings();
  return (
    <SettingsContext.Provider value={settingsState}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext(): UseSettingsResult {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettingsContext must be used within a SettingsProvider');
  return context;
}
