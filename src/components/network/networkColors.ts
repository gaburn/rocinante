export const STATUS_COLORS: Record<string, { core: string; glow: string; dim: string }> = {
  active: { core: '#34d399', glow: 'rgba(52,211,153,0.4)', dim: 'rgba(52,211,153,0.15)' },
  running: { core: '#34d399', glow: 'rgba(52,211,153,0.4)', dim: 'rgba(52,211,153,0.15)' },
  blocked: { core: '#f87171', glow: 'rgba(248,113,113,0.4)', dim: 'rgba(248,113,113,0.15)' },
  waiting: { core: '#fbbf24', glow: 'rgba(251,191,36,0.4)', dim: 'rgba(251,191,36,0.15)' },
  completed: { core: '#6b7280', glow: 'rgba(107,114,128,0.2)', dim: 'rgba(107,114,128,0.1)' },
};

export const BACKGROUND_COLOR = '#0a0a0f';
export const EDGE_COLOR = 'rgba(255,255,255,0.06)';
export const EDGE_ACTIVE_COLOR = 'rgba(255,255,255,0.15)';
export const EDGE_DIM_COLOR = 'rgba(255,255,255,0.02)';
export const LABEL_COLOR = 'rgba(255,255,255,0.6)';
export const LABEL_DIM_COLOR = 'rgba(255,255,255,0.15)';
export const PARTICLE_BASE_ALPHA = 0.8;

export interface ThemeColors {
  background: string;
  edge: string;
  edgeActive: string;
  edgeDim: string;
  label: string;
  labelDim: string;
}

const DARK_COLORS: ThemeColors = {
  background: BACKGROUND_COLOR,
  edge: EDGE_COLOR,
  edgeActive: EDGE_ACTIVE_COLOR,
  edgeDim: EDGE_DIM_COLOR,
  label: LABEL_COLOR,
  labelDim: LABEL_DIM_COLOR,
};

const LIGHT_COLORS: ThemeColors = {
  background: '#fafafe',
  edge: 'rgba(0,0,0,0.08)',
  edgeActive: 'rgba(0,0,0,0.25)',
  edgeDim: 'rgba(0,0,0,0.03)',
  label: 'rgba(0,0,0,0.65)',
  labelDim: 'rgba(0,0,0,0.12)',
};

export function getThemeColors(theme: 'dark' | 'light'): ThemeColors {
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

export function getNodeColors(status: string): { core: string; glow: string; dim: string } {
  return STATUS_COLORS[status] ?? STATUS_COLORS.completed;
}
