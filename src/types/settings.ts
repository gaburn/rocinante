export type AccentColor = 'emerald' | 'blue' | 'purple' | 'amber';
export type ThemeMode = 'dark' | 'light' | 'system';
export type SortOrder = 'recent' | 'alphabetical' | 'status-grouped';
export type LabelVisibility = 'always' | 'zoom-dependent' | 'never';
export type NodeSizeScale = 'small' | 'medium' | 'large';
export type PhysicsStrength = 'tight' | 'medium' | 'loose';
export type RefreshInterval = 0 | 10000 | 30000 | 60000 | 120000;
export type ShellType = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'custom';

// ADO settings are managed server-side via /api/ado/config
// They are NOT part of AppSettings (which is localStorage-only)
// See src/types/ado.ts for ADO types

export interface PaneVisibility {
  gitContext: boolean;
  quickStats: boolean;
  performanceWaterfall: boolean;
  agentHierarchy: boolean;
  eventTimeline: boolean;
  sessionPlan: boolean;
}

export interface AutoArchiveRule {
  id: string;
  pattern: string;
  enabled: boolean;
  createdAt: string;
}

export interface DisplaySettings {
  refreshInterval: RefreshInterval;
  defaultViewMode: 'list' | 'network' | 'stats';
  sortOrder: SortOrder;
  showCompletedSessions: boolean;
  theme: ThemeMode;
  accentColor: AccentColor;
  shell: ShellType;
  terminalFontSize: number; // default 13
  customShellPath: string;
  paneVisibility: PaneVisibility;
  autoArchiveRules: AutoArchiveRule[];
}

export type SessionSourceOption = 'auto' | 'copilot' | 'claude' | 'both';

export interface LaunchCommands {
  copilot: string;
  claude: string;
  shell: string;
}

export interface DataSettings {
  sessionStateDir: string;
  maxTimelineEvents: 50 | 100 | 200 | 500;
  staleThresholdMs: 60000 | 300000 | 900000 | 1800000;
  tailBytes: 262144 | 524288 | 1048576 | 2097152;
  sessionSources: SessionSourceOption;
  claudeDir: string;
  launchCommands: LaunchCommands;
}

export interface NetworkViewSettings {
  animationSpeed: number; // 0.5 = slow, 1.0 = normal, 2.0 = fast
  labelVisibility: LabelVisibility;
  nodeSizeScale: NodeSizeScale;
  physicsStrength: PhysicsStrength;
}

export interface AppSettings {
  display: DisplaySettings;
  data: DataSettings;
  network: NetworkViewSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  display: {
    refreshInterval: 30000,
    defaultViewMode: 'list',
    sortOrder: 'recent',
    showCompletedSessions: true,
    theme: 'dark',
    accentColor: 'emerald',
    shell: 'pwsh',
    terminalFontSize: 13,
    customShellPath: '',
    paneVisibility: {
      gitContext: true,
      quickStats: true,
      performanceWaterfall: false,
      agentHierarchy: true,
      eventTimeline: true,
      sessionPlan: true,
    },
    autoArchiveRules: [],
  },
  data: {
    sessionStateDir: '', // empty = use server default
    maxTimelineEvents: 100,
    staleThresholdMs: 300000,
    tailBytes: 524288,
    sessionSources: 'auto',
    claudeDir: '',
    launchCommands: {
      copilot: 'copilot',
      claude: 'claude',
      shell: '',
    },
  },
  network: {
    animationSpeed: 1.0,
    labelVisibility: 'zoom-dependent',
    nodeSizeScale: 'medium',
    physicsStrength: 'medium',
  },
};

export function getNodeSizeMultiplier(scale: NodeSizeScale): number {
  switch (scale) {
    case 'small':
      return 0.75;
    case 'medium':
      return 1.0;
    case 'large':
      return 1.5;
  }
}

export function getPhysicsParams(strength: PhysicsStrength) {
  // Returns { sessionCharge, agentCharge, sessionLinkDist, agentLinkDist, centerStrength, velocityDecay }
  switch (strength) {
    case 'tight':
      return {
        sessionCharge: -150,
        agentCharge: -40,
        sessionLinkDist: 50,
        agentLinkDist: 30,
        centerStrength: 0.08,
        velocityDecay: 0.45,
      };
    case 'medium':
      return {
        sessionCharge: -300,
        agentCharge: -80,
        sessionLinkDist: 90,
        agentLinkDist: 50,
        centerStrength: 0.05,
        velocityDecay: 0.35,
      };
    case 'loose':
      return {
        sessionCharge: -500,
        agentCharge: -150,
        sessionLinkDist: 150,
        agentLinkDist: 80,
        centerStrength: 0.02,
        velocityDecay: 0.25,
      };
  }
}
