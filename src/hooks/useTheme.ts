import { useEffect, useState } from 'react';
import type { ThemeMode } from '../types/settings';

type EffectiveTheme = 'dark' | 'light';

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia(DARK_MODE_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(theme: ThemeMode): EffectiveTheme {
  if (theme === 'dark' || theme === 'light') {
    return theme;
  }

  return getSystemTheme();
}

export function useTheme(theme: ThemeMode): EffectiveTheme {
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
    resolveTheme(theme),
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEffectiveTheme(resolveTheme(theme));

    if (theme !== 'system' || typeof window === 'undefined') {
      return;
    }

    const mediaQueryList = window.matchMedia(DARK_MODE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setEffectiveTheme(event.matches ? 'dark' : 'light');
    };

    mediaQueryList.addEventListener('change', onChange);

    return () => {
      mediaQueryList.removeEventListener('change', onChange);
    };
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const oppositeTheme: EffectiveTheme = effectiveTheme === 'dark' ? 'light' : 'dark';

    root.classList.add(effectiveTheme);
    root.classList.remove(oppositeTheme);
  }, [effectiveTheme]);

  return effectiveTheme;
}
