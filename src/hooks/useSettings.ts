import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type DataSettings,
  type DisplaySettings,
  type NetworkViewSettings,
} from '../types/settings';
import { getServerConfig, updateServerConfig } from '../services/settingsService';

const SETTINGS_STORAGE_KEY = 'dashboard-settings';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) {
    return (patch ?? base) as T;
  }

  const result: Record<string, unknown> = { ...base };
  const patchEntries = Object.entries(patch);

  for (const [key, patchValue] of patchEntries) {
    const baseValue = (base as Record<string, unknown>)[key];
    if (isObject(baseValue) && isObject(patchValue)) {
      result[key] = deepMerge(baseValue, patchValue);
      continue;
    }
    result[key] = patchValue;
  }

  return result as T;
}

function loadInitialSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as unknown;
    return deepMerge(DEFAULT_SETTINGS, parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface UseSettingsResult {
  settings: AppSettings;
  updateDisplaySettings: (partial: Partial<DisplaySettings>) => void;
  updateDataSettings: (partial: Partial<DataSettings>) => Promise<void>;
  updateNetworkSettings: (partial: Partial<NetworkViewSettings>) => void;
  resetToDefaults: () => void;
  isServerSyncing: boolean;
  serverSyncError: string | null;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);
  const [isServerSyncing, setIsServerSyncing] = useState(false);
  const [serverSyncError, setServerSyncError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore localStorage write errors so settings state remains usable.
    }
  }, [settings]);

  useEffect(() => {
    let isMounted = true;

    const hydrateFromServer = async () => {
      setIsServerSyncing(true);
      setServerSyncError(null);
      try {
        const serverConfig = await getServerConfig();
        if (!isMounted) return;

        setSettings((current) => ({
          ...current,
          data: {
            ...current.data,
            sessionStateDir: serverConfig.sessionStateDir,
            tailBytes: serverConfig.tailBytes as DataSettings['tailBytes'],
            staleThresholdMs: serverConfig.staleThresholdMs as DataSettings['staleThresholdMs'],
            maxTimelineEvents: serverConfig.maxTimelineEvents as DataSettings['maxTimelineEvents'],
            sessionSources: serverConfig.sessionSources,
            claudeDir: serverConfig.claudeDir,
            launchCommands: serverConfig.launchCommands ?? current.data.launchCommands,
          },
        }));
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : 'Failed to fetch server settings';
        setServerSyncError(message);
      } finally {
        if (isMounted) {
          setIsServerSyncing(false);
        }
      }
    };

    void hydrateFromServer();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateDisplaySettings = useCallback((partial: Partial<DisplaySettings>) => {
    setSettings((current) => ({
      ...current,
      display: {
        ...current.display,
        ...partial,
      },
    }));
  }, []);

  const updateNetworkSettings = useCallback((partial: Partial<NetworkViewSettings>) => {
    setSettings((current) => ({
      ...current,
      network: {
        ...current.network,
        ...partial,
      },
    }));
  }, []);

  const updateDataSettings = useCallback(async (partial: Partial<DataSettings>) => {
    let previousSettings: AppSettings | null = null;

    setServerSyncError(null);
    setSettings((current) => {
      previousSettings = current;
      return {
        ...current,
        data: {
          ...current.data,
          ...partial,
        },
      };
    });

    setIsServerSyncing(true);
    try {
      const serverConfig = await updateServerConfig(partial);
      setSettings((current) => ({
        ...current,
        data: {
          ...current.data,
          sessionStateDir: serverConfig.sessionStateDir,
          tailBytes: serverConfig.tailBytes as DataSettings['tailBytes'],
          staleThresholdMs: serverConfig.staleThresholdMs as DataSettings['staleThresholdMs'],
          maxTimelineEvents: serverConfig.maxTimelineEvents as DataSettings['maxTimelineEvents'],
          sessionSources: serverConfig.sessionSources,
          claudeDir: serverConfig.claudeDir,
          launchCommands: serverConfig.launchCommands ?? current.data.launchCommands,
        },
      }));
    } catch (error) {
      if (previousSettings) {
        setSettings(previousSettings);
      }
      const message = error instanceof Error ? error.message : 'Failed to update server settings';
      setServerSyncError(message);
      throw error;
    } finally {
      setIsServerSyncing(false);
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    setServerSyncError(null);
    setSettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Ignore localStorage remove errors so reset still completes in memory.
    }
  }, []);

  return {
    settings,
    updateDisplaySettings,
    updateDataSettings,
    updateNetworkSettings,
    resetToDefaults,
    isServerSyncing,
    serverSyncError,
  };
}
