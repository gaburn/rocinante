import { useEffect } from 'react';
import type { AccentColor } from '../types/settings';

const ACCENT_COLOR_MAP: Record<
  AccentColor,
  { accent400: string; accent500: string; accentGlow: string }
> = {
  emerald: {
    accent400: '#34d399',
    accent500: '#10b981',
    accentGlow: 'rgba(52,211,153,0.4)',
  },
  blue: {
    accent400: '#60a5fa',
    accent500: '#3b82f6',
    accentGlow: 'rgba(96,165,250,0.4)',
  },
  purple: {
    accent400: '#a78bfa',
    accent500: '#8b5cf6',
    accentGlow: 'rgba(167,139,250,0.4)',
  },
  amber: {
    accent400: '#fbbf24',
    accent500: '#f59e0b',
    accentGlow: 'rgba(251,191,36,0.4)',
  },
};

export function useAccentColor(accentColor: AccentColor): void {
  useEffect(() => {
    const colors = ACCENT_COLOR_MAP[accentColor];
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty('--accent-400', colors.accent400);
    rootStyle.setProperty('--accent-500', colors.accent500);
    rootStyle.setProperty('--accent-glow', colors.accentGlow);
  }, [accentColor]);
}
