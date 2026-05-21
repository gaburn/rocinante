import { useState, useEffect } from 'react';

interface FocusWarningBannerProps {
  activeCount: number;
  threshold: number;
  /** Optional callback fired when the banner is dismissed. */
  onDismiss?: () => void;
}

/**
 * Dismissible warning banner shown when active workstream count
 * exceeds the configured threshold. Re-appears if the count rises
 * above the level at which it was dismissed.
 */
export default function FocusWarningBanner({
  activeCount,
  threshold,
  onDismiss,
}: FocusWarningBannerProps) {
  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(null);

  // Re-show banner if active count rises above the dismissed-at value
  useEffect(() => {
    if (dismissedAtCount !== null && activeCount > dismissedAtCount) {
      setDismissedAtCount(null);
    }
  }, [activeCount, dismissedAtCount]);

  if (dismissedAtCount !== null) return null;

  return (
    <div
      role="alert"
      data-testid="focus-warning-banner"
      className="
        flex items-center justify-between gap-3
        rounded-lg border border-amber-500/30 bg-amber-500/10
        px-4 py-2.5 text-sm text-amber-200/90
      "
    >
      <span>
        <span aria-hidden="true">⚠️</span>{' '}
        {activeCount} workstreams are currently active (threshold: {threshold}).
        Consider focusing or completing some before starting new work.
      </span>
      <button
        type="button"
        data-testid="focus-warning-dismiss"
        onClick={() => {
          setDismissedAtCount(activeCount);
          onDismiss?.();
        }}
        className="
          shrink-0 rounded px-2 py-0.5 text-xs font-medium
          text-amber-300 transition-colors
          hover:bg-amber-500/20 hover:text-amber-200
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-amber-400
        "
      >
        Dismiss
      </button>
    </div>
  );
}
