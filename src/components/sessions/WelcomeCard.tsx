import { useSourceStatus } from '../../hooks/useSourceStatus';

function StatusLine({ icon, text, dim }: { icon: string; text: string; dim?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${dim ? 'text-fg/25' : 'text-fg/50'}`}>
      <span className="w-4 text-center" aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

export default function WelcomeCard() {
  const { sources, isLoading } = useSourceStatus();

  return (
    <div className="flex h-full min-h-48 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        {/* Header */}
        <div className="space-y-1.5 text-center">
          <h2 className="text-base font-medium text-fg/70">
            Welcome to Rocinante
          </h2>
          <p className="text-xs leading-relaxed text-fg/35">
            Your AI coding sessions will appear here automatically.
          </p>
        </div>

        {/* Source detection */}
        <div className="rounded-lg border border-border bg-surface-secondary/40 p-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-fg/25">
            Source Detection
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-fg/25">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-fg/15 border-t-fg/40" />
              <span>Checking sources…</span>
            </div>
          ) : sources ? (
            <div className="space-y-1.5">
              <StatusLine
                icon={sources.copilot.available ? '✅' : '⚠️'}
                text={sources.copilot.available
                  ? 'Copilot CLI detected'
                  : 'Copilot CLI not detected — sessions stored in ~/.copilot/'}
              />
              <StatusLine
                icon={sources.claude.available ? '✅' : '○'}
                text={sources.claude.available
                  ? 'Claude CLI detected'
                  : 'Claude CLI not configured'}
                dim={!sources.claude.available}
              />
            </div>
          ) : (
            <p className="text-xs text-fg/25">
              Status endpoint unavailable — sources will be detected on first session.
            </p>
          )}
        </div>

        {/* Getting started hint */}
        <div className="text-center">
          <p className="text-xs leading-relaxed text-fg/30">
            Run a Copilot or Claude session, then refresh to see it here.
          </p>
        </div>
      </div>
    </div>
  );
}
