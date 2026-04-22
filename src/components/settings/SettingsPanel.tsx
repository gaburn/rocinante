import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../context/SettingsContext';
import { useSessionData } from '../../context/SessionContext';
import packageJson from '../../../package.json';
import { updateAdoConfig, testAdoConnection, getAdoStatus } from '../../services/adoService';
import type {
  AccentColor,
  RefreshInterval,
  SortOrder,
  ThemeMode,
  LabelVisibility,
  NodeSizeScale,
  PhysicsStrength,
  ShellType,
  SessionSourceOption,
} from '../../types/settings';

/* ═══════════════════════════════════════════════════════════
 * SettingsPanel
 * ═══════════════════════════════════════════════════════════
 * A slide-over panel anchored to the right edge of the
 * viewport. Houses five collapsible settings sections plus
 * a sticky footer with a "Reset to Defaults" action.
 *
 * ┌────────────────────────────────────┐
 * │  Settings                      ✕   │  ← fixed header
 * ├────────────────────────────────────┤
 * │ ▸ Display Settings                 │
 * │ ▸ Data Settings                    │  ← scrollable
 * │ ▸ Azure DevOps                     │
 * │ ▸ Network View                     │
 * │ ▸ About                            │
 * ├────────────────────────────────────┤
 * │        Reset to Defaults           │  ← sticky footer
 * └────────────────────────────────────┘
 *
 * Design decisions
 *  · Every form control is built inline — no child
 *    component files. This keeps the panel self-contained
 *    and easy to reason about as a single design surface.
 *  · Sections remember their collapsed state locally; the
 *    first section opens by default so users land on
 *    something useful, not a wall of chevrons.
 *  · The backdrop uses backdrop-blur so the panel feels
 *    layered *over* the dashboard rather than replacing it.
 *  · Focus is trapped and returned on close for a11y.
 * ═══════════════════════════════════════════════════════════ */

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ── Lookup tables ─────────────────────────────────────── */

const REFRESH_OPTIONS: { value: RefreshInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 10000, label: '10 s' },
  { value: 30000, label: '30 s' },
  { value: 60000, label: '60 s' },
  { value: 120000, label: '120 s' },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'status-grouped', label: 'Status Grouped' },
];

const ACCENT_COLORS: { value: AccentColor; tw: string; ring: string }[] = [
  { value: 'emerald', tw: 'bg-emerald-500', ring: 'ring-emerald-400' },
  { value: 'blue', tw: 'bg-blue-500', ring: 'ring-blue-400' },
  { value: 'purple', tw: 'bg-purple-500', ring: 'ring-purple-400' },
  { value: 'amber', tw: 'bg-amber-500', ring: 'ring-amber-400' },
];

const TIMELINE_EVENT_OPTIONS: { value: 50 | 100 | 200 | 500; label: string }[] = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 500, label: '500' },
];

const STALE_THRESHOLD_OPTIONS: { value: 60000 | 300000 | 900000 | 1800000; label: string }[] = [
  { value: 60000, label: '1 min' },
  { value: 300000, label: '5 min' },
  { value: 900000, label: '15 min' },
  { value: 1800000, label: '30 min' },
];

const TAIL_SIZE_OPTIONS: { value: 262144 | 524288 | 1048576 | 2097152; label: string }[] = [
  { value: 262144, label: '256 KB' },
  { value: 524288, label: '512 KB' },
  { value: 1048576, label: '1 MB' },
  { value: 2097152, label: '2 MB' },
];

const ANIMATION_SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0.5, label: 'Slow (0.5×)' },
  { value: 1.0, label: 'Normal (1×)' },
  { value: 2.0, label: 'Fast (2×)' },
];

const LABEL_VIS_OPTIONS: { value: LabelVisibility; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'zoom-dependent', label: 'Zoom-dependent' },
  { value: 'never', label: 'Never' },
];

const NODE_SIZE_OPTIONS: { value: NodeSizeScale; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const PHYSICS_OPTIONS: { value: PhysicsStrength; label: string }[] = [
  { value: 'tight', label: 'Tight' },
  { value: 'medium', label: 'Medium' },
  { value: 'loose', label: 'Loose' },
];

const SHELL_OPTIONS: { value: ShellType; label: string }[] = [
  { value: 'pwsh', label: 'PowerShell 7+ (pwsh)' },
  { value: 'powershell', label: 'Windows PowerShell (powershell.exe)' },
  { value: 'cmd', label: 'Command Prompt (cmd.exe)' },
  { value: 'bash', label: 'Bash' },
  { value: 'custom', label: 'Custom path...' },
];

const TERMINAL_FONT_SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 11, label: '11' },
  { value: 12, label: '12' },
  { value: 13, label: '13' },
  { value: 14, label: '14' },
  { value: 15, label: '15' },
  { value: 16, label: '16' },
  { value: 18, label: '18' },
  { value: 20, label: '20' },
];

const SESSION_SOURCE_OPTIONS: { value: 'auto' | 'copilot' | 'claude' | 'both'; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'claude', label: 'Claude' },
  { value: 'both', label: 'Both' },
];

/* ── Inline micro-icons ────────────────────────────────── */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 text-fg/30 transition-transform duration-200 ${
        open ? 'rotate-90' : ''
      }`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

function SyncSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-blue-400"
      viewBox="0 0 16 16"
      fill="none"
      aria-label="Syncing with server"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Reusable inline controls ──────────────────────────── */

/** Styled <select> that matches the dashboard aesthetic. */
function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <select
      value={String(value)}
      aria-label={label}
      onChange={(e) => {
        const raw = e.target.value;
        // Recover original type — numbers stay numbers.
        const coerced = options.find((o) => String(o.value) === raw)?.value;
        if (coerced !== undefined) onChange(coerced);
      }}
      className="
        w-full appearance-none
        bg-surface-tertiary border border-border-default rounded-md
        px-3 py-1.5 pr-8
        text-sm text-fg/80 font-mono
        transition-colors duration-150
        hover:border-fg/20
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-border-active focus-visible:ring-offset-1
        focus-visible:ring-offset-surface-secondary
        cursor-pointer
      "
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='rgba(255,255,255,0.35)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='3 5 6 8 9 5'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Toggle pill — a compact on/off switch. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 items-center
        rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out
        cursor-pointer
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-border-active focus-visible:ring-offset-2
        focus-visible:ring-offset-surface-secondary
        ${checked ? 'bg-emerald-500' : 'bg-surface-tertiary'}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          pointer-events-none inline-block h-4 w-4
          rounded-full bg-white shadow-sm ring-0
          transition-transform duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0.5'}
        `}
      />
    </button>
  );
}

/** A labelled row: label on the left, control on the right. */
function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm text-fg/60 truncate">{label}</span>
        {hint && (
          <span className="text-[11px] text-fg/25 leading-tight">{hint}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A labelled row where the control stretches full width below the label. */
function FieldStack({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <span className="text-sm text-fg/60">{label}</span>
      {children}
      {hint && (
        <span className="text-[11px] text-fg/25 leading-tight">{hint}</span>
      )}
    </div>
  );
}

/* ── Collapsible section wrapper ───────────────────────── */

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-default">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        className="
          flex w-full items-center gap-2 px-5 py-3.5
          cursor-pointer select-none
          transition-colors duration-150
          hover:bg-surface-hover/40
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-inset focus-visible:ring-border-active
        "
      >
        <ChevronIcon open={isOpen} />
        <span className="font-mono text-[11px] uppercase tracking-widest text-fg/30">
          {title}
        </span>
      </button>

      {/* Animated content reveal */}
      <div
        className={`
          grid transition-[grid-template-rows] duration-250 ease-in-out
          ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}
        `}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Azure DevOps settings (self-contained state) ──────── */

function AdoSettings() {
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate org + project from server on mount
  useEffect(() => {
    getAdoStatus()
      .then((status) => {
        setOrganization(status.organization ?? '');
        setProject(status.project ?? '');
      })
      .catch(() => {
        /* fields stay empty */
      });
  }, []);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionResult(null);
    try {
      // Save config to server first so the test endpoint sees current values
      await updateAdoConfig({ organization, project });
      const result = await testAdoConnection();
      setConnectionResult(result);
    } catch (err) {
      setConnectionResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(
        () => setConnectionResult(null),
        5000,
      );
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateAdoConfig({
        organization,
        project,
      });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save configuration',
      );
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClasses = `
    w-full
    bg-surface-tertiary border border-border-default rounded-md
    px-3 py-1.5
    text-sm text-fg/80 font-mono placeholder:text-fg/20
    transition-colors duration-150
    hover:border-fg/20
    focus-visible:outline-none focus-visible:ring-2
    focus-visible:ring-border-active focus-visible:ring-offset-1
    focus-visible:ring-offset-surface-secondary
  `;

  return (
    <>
      <FieldStack label="Organization">
        <input
          type="text"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="e.g., microsoft"
          aria-label="Azure DevOps organization"
          className={inputClasses}
        />
      </FieldStack>

      <FieldStack label="Project">
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="e.g., MyProject"
          aria-label="Azure DevOps project"
          className={inputClasses}
        />
      </FieldStack>

      {/* Action buttons */}
      <div className="flex items-center gap-2.5 pt-2.5">
        <button
          type="button"
          onClick={() => void handleTestConnection()}
          disabled={isTesting}
          className="
            rounded-md px-3 py-1.5
            text-xs font-mono
            bg-surface-tertiary text-fg/60
            hover:bg-surface-hover
            transition-colors duration-150
            cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-border-active focus-visible:ring-offset-1
            focus-visible:ring-offset-surface-secondary
          "
        >
          {isTesting ? 'Testing…' : 'Test Connection'}
        </button>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="
            rounded-md px-3 py-1.5
            text-xs font-mono
            bg-border-active/15 text-border-active border border-border-active/25
            hover:bg-border-active/25
            transition-colors duration-150
            cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-border-active focus-visible:ring-offset-1
            focus-visible:ring-offset-surface-secondary
          "
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Connection test result — inline below buttons, auto-clears */}
      {connectionResult && (
        <p
          role="status"
          className={`mt-2 text-[12px] leading-snug ${
            connectionResult.ok ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {connectionResult.ok ? '✓ Connected' : connectionResult.message}
        </p>
      )}

      {/* Save error */}
      {saveError && (
        <div
          role="alert"
          className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-[12px] text-red-400 leading-snug"
        >
          {saveError}
        </div>
      )}

      {/* Muted security note */}
      <p className="text-[11px] text-fg/20 leading-relaxed pt-3">
        Authentication uses Azure CLI (az login). No credentials stored.
      </p>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Main export
 * ═══════════════════════════════════════════════════════════ */

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    settings,
    updateDisplaySettings,
    updateDataSettings,
    updateNetworkSettings,
    resetToDefaults,
    isServerSyncing,
    serverSyncError,
  } = useSettingsContext();

  const { autoArchive } = useSessionData();
  const [newRulePattern, setNewRulePattern] = useState('');

  /* ── Reset confirmation guard ────────────────────────── */
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResetClick = useCallback(() => {
    if (confirmReset) {
      resetToDefaults();
      setConfirmReset(false);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    } else {
      setConfirmReset(true);
      resetTimerRef.current = setTimeout(() => setConfirmReset(false), 3000);
    }
  }, [confirmReset, resetToDefaults]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  /* ── Close on Escape key ─────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  /* ── Focus the panel on open ─────────────────────────── */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen) {
      // Small delay so the slide animation has started
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [isOpen]);

  /* ── Dir input debounce ──────────────────────────────── */
  const [dirDraft, setDirDraft] = useState(settings.data.sessionStateDir);
  const dirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep draft in sync when settings change externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirDraft(settings.data.sessionStateDir);
  }, [settings.data.sessionStateDir]);

  const handleDirChange = (value: string) => {
    setDirDraft(value);
    if (dirTimerRef.current) clearTimeout(dirTimerRef.current);
    dirTimerRef.current = setTimeout(() => {
      void updateDataSettings({ sessionStateDir: value });
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (dirTimerRef.current) clearTimeout(dirTimerRef.current);
    };
  }, []);

  /* ── Claude dir input debounce ───────────────────────── */
  const [claudeDirDraft, setClaudeDirDraft] = useState(settings.data.claudeDir);
  const claudeDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClaudeDirDraft(settings.data.claudeDir);
  }, [settings.data.claudeDir]);

  const handleClaudeDirChange = (value: string) => {
    setClaudeDirDraft(value);
    if (claudeDirTimerRef.current) clearTimeout(claudeDirTimerRef.current);
    claudeDirTimerRef.current = setTimeout(() => {
      void updateDataSettings({ claudeDir: value });
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (claudeDirTimerRef.current) clearTimeout(claudeDirTimerRef.current);
    };
  }, []);

  /* ── Launch command input debounce ───────────────────── */
  const [copilotCmdDraft, setCopilotCmdDraft] = useState(settings.data.launchCommands.copilot);
  const [claudeCmdDraft, setClaudeCmdDraft] = useState(settings.data.launchCommands.claude);
  const [shellCmdDraft, setShellCmdDraft] = useState(settings.data.launchCommands.shell);
  const launchCmdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCopilotCmdDraft(settings.data.launchCommands.copilot);
  }, [settings.data.launchCommands.copilot]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClaudeCmdDraft(settings.data.launchCommands.claude);
  }, [settings.data.launchCommands.claude]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShellCmdDraft(settings.data.launchCommands.shell);
  }, [settings.data.launchCommands.shell]);

  const handleLaunchCmdChange = (field: 'copilot' | 'claude' | 'shell', value: string) => {
    if (field === 'copilot') setCopilotCmdDraft(value);
    else if (field === 'claude') setClaudeCmdDraft(value);
    else setShellCmdDraft(value);

    if (launchCmdTimerRef.current) clearTimeout(launchCmdTimerRef.current);
    launchCmdTimerRef.current = setTimeout(() => {
      void updateDataSettings({
        launchCommands: { ...settings.data.launchCommands, [field]: value },
      });
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (launchCmdTimerRef.current) clearTimeout(launchCmdTimerRef.current);
    };
  }, []);

  /* ── Destructure settings for convenience ────────────── */
  const { display, data, network } = settings;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      {/* ── Panel ─────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        className={`
          fixed right-0 top-0 z-50
          flex h-full w-[420px] max-w-full flex-col
          bg-surface-secondary shadow-2xl shadow-black/40
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          focus-visible:outline-none
        `}
      >
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-default bg-surface-secondary px-5">
          <h2 className="font-mono text-sm font-semibold tracking-wide text-fg-heading">
            Settings
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="
              flex h-8 w-8 items-center justify-center rounded-md
              text-fg-secondary transition-colors duration-150
              hover:bg-surface-hover hover:text-fg-heading
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-border-active
              cursor-pointer
            "
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Scrollable content ──────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ━━━━━━━━━━ Section 1: Display ━━━━━━━━━━━━ */}
          <Section title="Display Settings" defaultOpen>

            {/* Refresh Interval */}
            <FieldRow label="Refresh Interval">
              <Select
                label="Refresh interval"
                value={display.refreshInterval}
                options={REFRESH_OPTIONS}
                onChange={(v) =>
                  updateDisplaySettings({ refreshInterval: v as RefreshInterval })
                }
              />
            </FieldRow>

            {/* Default View */}
            <FieldRow label="Default View">
              <div className="flex items-center rounded-lg bg-surface-tertiary p-0.5">
                {(['list', 'network', 'stats'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={display.defaultViewMode === mode}
                    onClick={() =>
                      updateDisplaySettings({ defaultViewMode: mode })
                    }
                    className={`
                      rounded-md px-3 py-1 text-xs font-mono capitalize
                      transition-colors duration-150 cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-border-active focus-visible:ring-offset-1
                      focus-visible:ring-offset-surface-tertiary
                      ${
                        display.defaultViewMode === mode
                          ? 'bg-surface-hover text-fg-heading'
                          : 'text-fg-muted hover:text-fg-secondary'
                      }
                    `}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </FieldRow>

            {/* Sort Order */}
            <FieldRow label="Sort Order">
              <Select
                label="Sort order"
                value={display.sortOrder}
                options={SORT_OPTIONS}
                onChange={(v) =>
                  updateDisplaySettings({ sortOrder: v as SortOrder })
                }
              />
            </FieldRow>

            {/* Show Completed */}
            <FieldRow label="Show Completed">
              <Toggle
                label="Show completed sessions"
                checked={display.showCompletedSessions}
                onChange={(v) =>
                  updateDisplaySettings({ showCompletedSessions: v })
                }
              />
            </FieldRow>

            <div className="pt-2">
              <div className="space-y-1">
                <p className="text-fg/30 font-mono text-[11px] uppercase tracking-widest">
                  Visible Panes
                </p>
                <p className="text-[11px] text-fg/25 leading-tight">
                  Toggle detail panel sections
                </p>
              </div>

              <div className="mt-1">
                <FieldRow label="Git Context">
                  <Toggle
                    label="Show Git context pane"
                    checked={display.paneVisibility.gitContext}
                    onChange={(v) =>
                      updateDisplaySettings({
                        paneVisibility: {
                          ...settings.display.paneVisibility,
                          gitContext: v,
                        },
                      })
                    }
                  />
                </FieldRow>

                <FieldRow label="Performance Waterfall">
                  <Toggle
                    label="Show performance waterfall pane"
                    checked={display.paneVisibility.performanceWaterfall}
                    onChange={(v) =>
                      updateDisplaySettings({
                        paneVisibility: {
                          ...settings.display.paneVisibility,
                          performanceWaterfall: v,
                        },
                      })
                    }
                  />
                </FieldRow>

                <FieldRow label="Agent Hierarchy">
                  <Toggle
                    label="Show agent hierarchy pane"
                    checked={display.paneVisibility.agentHierarchy}
                    onChange={(v) =>
                      updateDisplaySettings({
                        paneVisibility: {
                          ...settings.display.paneVisibility,
                          agentHierarchy: v,
                        },
                      })
                    }
                  />
                </FieldRow>

                <FieldRow label="Event Timeline">
                  <Toggle
                    label="Show event timeline pane"
                    checked={display.paneVisibility.eventTimeline}
                    onChange={(v) =>
                      updateDisplaySettings({
                        paneVisibility: {
                          ...settings.display.paneVisibility,
                          eventTimeline: v,
                        },
                      })
                    }
                  />
                </FieldRow>

                <FieldRow label="Session Plan">
                  <Toggle
                    label="Show session plan pane"
                    checked={display.paneVisibility.sessionPlan}
                    onChange={(v) =>
                      updateDisplaySettings({
                        paneVisibility: {
                          ...settings.display.paneVisibility,
                          sessionPlan: v,
                        },
                      })
                    }
                  />
                </FieldRow>
              </div>
            </div>

            {/* Theme */}
            <FieldRow label="Theme">
              <div className="flex items-center rounded-lg bg-surface-tertiary p-0.5" role="radiogroup" aria-label="Theme">
                {([
                  { value: 'dark' as ThemeMode, label: 'Dark', icon: (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="8" cy="8" r="3.5" />
                      <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
                    </svg>
                  )},
                  { value: 'light' as ThemeMode, label: 'Light', icon: (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M13.2 9.5A5.5 5.5 0 1 1 6.5 2.8a4.4 4.4 0 0 0 6.7 6.7Z" />
                    </svg>
                  )},
                  { value: 'system' as ThemeMode, label: 'System', icon: (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="3" width="12" height="9" rx="1.5" />
                      <path d="M6 14.5h4M8 12v2.5" />
                    </svg>
                  )},
                ]).map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={display.theme === value}
                    aria-label={`${label} theme`}
                    onClick={() => updateDisplaySettings({ theme: value })}
                    className={`
                      flex items-center gap-1.5
                      rounded-md px-3 py-1 text-xs font-mono
                      transition-colors duration-150 cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-border-active focus-visible:ring-offset-1
                      focus-visible:ring-offset-surface-tertiary
                      ${
                        display.theme === value
                          ? 'bg-surface-hover text-fg-heading'
                          : 'text-fg-muted hover:text-fg-secondary'
                      }
                    `}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>

            {/* Accent Color */}
            <FieldRow label="Accent Color">
              <div className="flex items-center gap-2.5" role="radiogroup" aria-label="Accent color">
                {ACCENT_COLORS.map(({ value, tw, ring }) => {
                  const selected = display.accentColor === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={value}
                      title={value.charAt(0).toUpperCase() + value.slice(1)}
                      onClick={() =>
                        updateDisplaySettings({ accentColor: value })
                      }
                      className={`
                        h-6 w-6 rounded-full ${tw}
                        transition-all duration-150 cursor-pointer
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-offset-2
                        focus-visible:ring-offset-surface-secondary
                        focus-visible:${ring}
                        ${selected ? `ring-2 ring-offset-2 ring-offset-surface-secondary ${ring}` : 'hover:scale-110'}
                      `}
                    />
                  );
                })}
              </div>
            </FieldRow>

            <FieldRow label="Terminal Shell">
              <Select
                label="Terminal shell"
                value={display.shell}
                options={SHELL_OPTIONS}
                onChange={(value) =>
                  updateDisplaySettings({ shell: value as ShellType })
                }
              />
            </FieldRow>

            <FieldRow label="Terminal Font Size">
              <Select
                label="Terminal font size"
                value={display.terminalFontSize}
                options={TERMINAL_FONT_SIZE_OPTIONS}
                onChange={(value) =>
                  updateDisplaySettings({
                    terminalFontSize: parseInt(String(value), 10),
                  })
                }
              />
            </FieldRow>

            {display.shell === 'custom' && (
              <FieldStack label="Custom Shell Path">
                <input
                  type="text"
                  value={display.customShellPath}
                  onChange={(e) =>
                    updateDisplaySettings({ customShellPath: e.target.value })
                  }
                  placeholder="e.g., C:\\Program Files\\Git\\bin\\bash.exe"
                  aria-label="Custom shell executable path"
                  className="
                    w-full
                    bg-surface-tertiary border border-border-default rounded-md
                    px-3 py-1.5
                    text-sm text-fg/80 font-mono placeholder:text-fg/20
                    transition-colors duration-150
                    hover:border-fg/20
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-border-active focus-visible:ring-offset-1
                    focus-visible:ring-offset-surface-secondary
                  "
                />
              </FieldStack>
            )}
          </Section>

          {/* ━━━━━━━━━━ Section: Auto-Archive Rules ━━━━━━━━━━━━━━━ */}
          <Section title="Auto-Archive Rules">
            <div className="space-y-3">
              <p className="text-xs text-fg/40">
                Sessions whose name contains a rule pattern will be automatically archived.
              </p>

              {/* Add new rule */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newRulePattern.trim()) {
                      autoArchive.addRule(newRulePattern.trim());
                      setNewRulePattern('');
                    }
                  }}
                  placeholder="Enter name pattern…"
                  aria-label="Auto-archive rule pattern"
                  className="
                    flex-1 bg-surface-tertiary border border-border-default rounded-md
                    px-3 py-1.5 text-sm text-fg/80 placeholder:text-fg/20
                    transition-colors duration-150 hover:border-fg/20
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-border-active focus-visible:ring-offset-1
                    focus-visible:ring-offset-surface-secondary
                  "
                />
                <button
                  type="button"
                  disabled={!newRulePattern.trim()}
                  onClick={() => {
                    if (newRulePattern.trim()) {
                      autoArchive.addRule(newRulePattern.trim());
                      setNewRulePattern('');
                    }
                  }}
                  className="
                    shrink-0 rounded-md bg-border-active/20 px-3 py-1.5 text-xs
                    font-medium text-border-active transition-colors duration-150
                    enabled:hover:bg-border-active/30 enabled:cursor-pointer
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                >
                  Add Rule
                </button>
              </div>

              {/* Rule list */}
              {autoArchive.rules.length === 0 ? (
                <p className="py-2 text-center text-xs text-fg/25 italic">
                  No rules configured
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {autoArchive.rules.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-center gap-2 rounded-md bg-surface-tertiary/50 px-3 py-2"
                    >
                      {/* Enable/disable toggle */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule: ${rule.pattern}`}
                        onClick={() => autoArchive.toggleRule(rule.id)}
                        className={`
                          relative inline-flex h-[14px] w-[24px] shrink-0 cursor-pointer items-center
                          rounded-full transition-colors duration-200 ease-in-out
                          ${rule.enabled ? 'bg-border-active' : 'bg-surface-tertiary'}
                        `}
                      >
                        <span
                          aria-hidden="true"
                          className={`
                            pointer-events-none inline-block h-[8px] w-[8px] rounded-full bg-fg/80
                            shadow-sm transition-transform duration-200 ease-in-out
                            ${rule.enabled ? 'translate-x-[12px]' : 'translate-x-[3px]'}
                          `}
                        />
                      </button>

                      {/* Pattern text */}
                      <span
                        className={`flex-1 truncate font-mono text-xs ${
                          rule.enabled ? 'text-fg/70' : 'text-fg/30 line-through'
                        }`}
                        title={rule.pattern}
                      >
                        {rule.pattern}
                      </span>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => autoArchive.removeRule(rule.id)}
                        className="shrink-0 rounded p-0.5 text-fg/25 transition-colors hover:text-red-400 cursor-pointer"
                        aria-label={`Remove rule: ${rule.pattern}`}
                      >
                        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <line x1="4" y1="4" x2="12" y2="12" />
                          <line x1="12" y1="4" x2="4" y2="12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {/* ━━━━━━━━━━ Section 2: Data ━━━━━━━━━━━━━━━ */}
          <Section title="Data Settings">

            {/* Session State Dir — full-width stacked layout */}
            <FieldStack label="Session State Dir">
              <div className="relative">
                <input
                  type="text"
                  value={dirDraft}
                  onChange={(e) => handleDirChange(e.target.value)}
                  placeholder="Use server default"
                  aria-label="Session state directory path"
                  className="
                    w-full
                    bg-surface-tertiary border border-border-default rounded-md
                    px-3 py-1.5
                    text-sm text-fg/80 font-mono placeholder:text-fg/20
                    transition-colors duration-150
                    hover:border-fg/20
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-border-active focus-visible:ring-offset-1
                    focus-visible:ring-offset-surface-secondary
                  "
                />
                {/* Inline syncing indicator */}
                {isServerSyncing && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <SyncSpinner />
                  </span>
                )}
              </div>
            </FieldStack>

            {/* Max Timeline Events */}
            <FieldRow label="Max Timeline Events">
              <Select
                label="Max timeline events"
                value={data.maxTimelineEvents}
                options={TIMELINE_EVENT_OPTIONS}
                onChange={(v) =>
                  void updateDataSettings({
                    maxTimelineEvents: v as 50 | 100 | 200 | 500,
                  })
                }
              />
            </FieldRow>

            {/* Stale Threshold */}
            <FieldRow label="Stale Threshold">
              <Select
                label="Stale threshold"
                value={data.staleThresholdMs}
                options={STALE_THRESHOLD_OPTIONS}
                onChange={(v) =>
                  void updateDataSettings({
                    staleThresholdMs: v as 60000 | 300000 | 900000 | 1800000,
                  })
                }
              />
            </FieldRow>

            {/* Tail Read Size */}
            <FieldRow label="Tail Read Size">
              <Select
                label="Tail read size"
                value={data.tailBytes}
                options={TAIL_SIZE_OPTIONS}
                onChange={(v) =>
                  void updateDataSettings({
                    tailBytes: v as 262144 | 524288 | 1048576 | 2097152,
                  })
                }
              />
            </FieldRow>

            {/* Server sync status bar */}
            <div className="mt-1 flex flex-col gap-1.5">
              {isServerSyncing && (
                <div className="flex items-center gap-2 text-[11px] text-blue-400/70">
                  <SyncSpinner />
                  <span>Syncing with server…</span>
                </div>
              )}

              {serverSyncError && (
                <div
                  role="alert"
                  className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-[12px] text-red-400 leading-snug"
                >
                  {serverSyncError}
                </div>
              )}

              <p className="text-[11px] text-fg/20 leading-relaxed pt-1">
                Changes affect server-side data processing
              </p>
            </div>
          </Section>

          {/* ━━━━━━━━━━ Section: Session Sources ━━━━━━━━ */}
          <Section title="Session Sources">

            {/* Source selector — segmented button group */}
            <FieldRow label="Data Source">
              <div className="flex items-center rounded-lg bg-surface-tertiary p-0.5">
                {SESSION_SOURCE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={data.sessionSources === value}
                    onClick={() =>
                      void updateDataSettings({ sessionSources: value as SessionSourceOption })
                    }
                    className={`
                      rounded-md px-3 py-1 text-xs font-mono
                      transition-colors duration-150 cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-border-active focus-visible:ring-offset-1
                      focus-visible:ring-offset-surface-tertiary
                      ${
                        data.sessionSources === value
                          ? 'bg-surface-hover text-fg-heading'
                          : 'text-fg-muted hover:text-fg-secondary'
                      }
                    `}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>

            {/* Claude Directory — only visible when Claude source is enabled */}
            {(data.sessionSources === 'auto' || data.sessionSources === 'claude' || data.sessionSources === 'both') && (
              <FieldStack label="Claude Directory">
                <div className="relative">
                  <input
                    type="text"
                    value={claudeDirDraft}
                    onChange={(e) => handleClaudeDirChange(e.target.value)}
                    placeholder="~/.claude"
                    aria-label="Claude session data directory path"
                    className="
                      w-full
                      bg-surface-tertiary border border-border-default rounded-md
                      px-3 py-1.5
                      text-sm text-fg/80 font-mono placeholder:text-fg/20
                      transition-colors duration-150
                      hover:border-fg/20
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-border-active focus-visible:ring-offset-1
                      focus-visible:ring-offset-surface-secondary
                    "
                  />
                  {isServerSyncing && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <SyncSpinner />
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-fg/25 leading-tight">
                  Path to the Claude session data directory
                </span>
              </FieldStack>
            )}

            <p className="text-[11px] text-fg/20 leading-relaxed pt-1">
              Choose which AI assistant session data to display
            </p>
          </Section>

          {/* ━━━━━━━━━━ Section: Launch Commands ━━━━━━━━ */}
          <Section title="Launch Commands">

            <FieldStack label="Copilot CLI" hint="Command to run when launching a Copilot session">
              <div className="relative">
                <input
                  type="text"
                  value={copilotCmdDraft}
                  onChange={(e) => handleLaunchCmdChange('copilot', e.target.value)}
                  placeholder="copilot"
                  aria-label="Copilot CLI command"
                  className="
                    w-full
                    bg-surface-tertiary border border-border-default rounded-md
                    px-3 py-1.5
                    text-sm text-fg/80 font-mono placeholder:text-fg/20
                    transition-colors duration-150
                    hover:border-fg/20
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-border-active focus-visible:ring-offset-1
                    focus-visible:ring-offset-surface-secondary
                  "
                />
                {isServerSyncing && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <SyncSpinner />
                  </span>
                )}
              </div>
            </FieldStack>

            <FieldStack label="Claude CLI" hint="Command to run when launching a Claude session">
              <div className="relative">
                <input
                  type="text"
                  value={claudeCmdDraft}
                  onChange={(e) => handleLaunchCmdChange('claude', e.target.value)}
                  placeholder="claude"
                  aria-label="Claude CLI command"
                  className="
                    w-full
                    bg-surface-tertiary border border-border-default rounded-md
                    px-3 py-1.5
                    text-sm text-fg/80 font-mono placeholder:text-fg/20
                    transition-colors duration-150
                    hover:border-fg/20
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-border-active focus-visible:ring-offset-1
                    focus-visible:ring-offset-surface-secondary
                  "
                />
                {isServerSyncing && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <SyncSpinner />
                  </span>
                )}
              </div>
            </FieldStack>

            <FieldStack label="Shell" hint="Optional command to run when launching a shell session">
              <div className="relative">
                <input
                  type="text"
                  value={shellCmdDraft}
                  onChange={(e) => handleLaunchCmdChange('shell', e.target.value)}
                  placeholder="(none — opens shell only)"
                  aria-label="Shell command"
                  className="
                    w-full
                    bg-surface-tertiary border border-border-default rounded-md
                    px-3 py-1.5
                    text-sm text-fg/80 font-mono placeholder:text-fg/20
                    transition-colors duration-150
                    hover:border-fg/20
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-border-active focus-visible:ring-offset-1
                    focus-visible:ring-offset-surface-secondary
                  "
                />
                {isServerSyncing && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <SyncSpinner />
                  </span>
                )}
              </div>
            </FieldStack>

            <p className="text-[11px] text-fg/20 leading-relaxed pt-1">
              Configure the command used when creating new workstreams
            </p>
          </Section>

          {/* ━━━━━━━━━━ Section 3: Azure DevOps ━━━━━━━━ */}
          <Section title="Azure DevOps">
            <AdoSettings />
          </Section>

          {/* ━━━━━━━━━━ Section 4: Network View ━━━━━━━━ */}
          <Section title="Network View">

            {/* Animation Speed */}
            <FieldRow label="Animation Speed">
              <Select
                label="Animation speed"
                value={network.animationSpeed}
                options={ANIMATION_SPEED_OPTIONS}
                onChange={(v) =>
                  updateNetworkSettings({ animationSpeed: v as number })
                }
              />
            </FieldRow>

            {/* Label Visibility */}
            <FieldRow label="Label Visibility">
              <Select
                label="Label visibility"
                value={network.labelVisibility}
                options={LABEL_VIS_OPTIONS}
                onChange={(v) =>
                  updateNetworkSettings({
                    labelVisibility: v as LabelVisibility,
                  })
                }
              />
            </FieldRow>

            {/* Node Size */}
            <FieldRow label="Node Size">
              <Select
                label="Node size"
                value={network.nodeSizeScale}
                options={NODE_SIZE_OPTIONS}
                onChange={(v) =>
                  updateNetworkSettings({
                    nodeSizeScale: v as NodeSizeScale,
                  })
                }
              />
            </FieldRow>

            {/* Physics Strength */}
            <FieldRow label="Physics Strength">
              <Select
                label="Physics strength"
                value={network.physicsStrength}
                options={PHYSICS_OPTIONS}
                onChange={(v) =>
                  updateNetworkSettings({
                    physicsStrength: v as PhysicsStrength,
                  })
                }
              />
            </FieldRow>
          </Section>

          {/* ━━━━━━━━━━ Section 5: About ━━━━━━━━━━━━━━ */}
          <Section title="About">
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-fg/80">
                    Rocinante
                  </span>
                  <span className="text-[11px] text-fg/25 font-mono">
                    workhorse for workstreams
                  </span>
                </div>
                <span className="rounded-full bg-surface-tertiary px-2.5 py-0.5 font-mono text-[11px] text-fg/40">
                  v{packageJson.version}
                </span>
              </div>

              <a
                href="https://github.com/gaburn/rocinante"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-fg/30 hover:text-fg/50 transition-colors"
              >
                github.com/gaburn/rocinante
              </a>

              <a
                href="https://github.com/bradygaster/squad"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-mono text-fg/30 hover:text-fg/50 transition-colors"
              >
                Built with
                <img
                  src="/squad-logo.png"
                  alt="Squad logo"
                  className="inline-block h-[14px] w-[14px]"
                />
                <span className="underline underline-offset-2">Squad</span>
              </a>
            </div>
          </Section>
        </div>

        {/* ── Footer ──────────────────────────────────── */}
        <div className="shrink-0 border-t border-border-default bg-surface-secondary px-5 py-4">
          <button
            type="button"
            onClick={handleResetClick}
            className={`
              w-full rounded-md px-4 py-2
              font-mono text-sm transition-all duration-200 cursor-pointer
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-border-active focus-visible:ring-offset-2
              focus-visible:ring-offset-surface-secondary
              ${
                confirmReset
                  ? 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25'
                  : 'bg-surface-tertiary border border-border-default text-fg/50 hover:bg-surface-hover hover:text-fg/70'
              }
            `}
          >
            {confirmReset ? 'Click again to confirm reset' : 'Reset to Defaults'}
          </button>
        </div>
      </div>
    </>
  );
}
