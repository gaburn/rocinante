import { useTerminalContext } from '../../context/TerminalContext';
import { useSessionData } from '../../context/SessionContext';
import { getStatusDotClass } from '../../utils/statusColors';

const PULSING_STATUSES = new Set(['active', 'running']);

export default function TerminalTabBar() {
  const { tabs, activeTabId, setActiveTab, requestCloseTab } =
    useTerminalContext();
  const { allSessions } = useSessionData();

  if (tabs.length === 0) return null;

  return (
    <nav
      role="tablist"
      aria-label="Terminal sessions"
      className="flex items-center gap-0.5 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const isActive = tab.sessionId === activeTabId;
        const status =
          allSessions.find((s) => s.id === tab.sessionId)?.status ??
          'completed';

        return (
          <button
            key={tab.sessionId}
            role="tab"
            aria-selected={isActive}
            title={tab.sessionName}
            onClick={() => setActiveTab(tab.sessionId)}
            className={`
              group flex items-center gap-1.5
              max-w-[160px] px-2.5 py-1 rounded-t-md
              text-xs font-mono leading-tight
              transition-colors cursor-pointer
              ${
                isActive
                  ? 'bg-surface-primary text-fg/80'
                  : 'bg-surface-tertiary text-fg/40 hover:text-fg/60'
              }
            `}
          >
            {/* status dot */}
            <span
              aria-hidden="true"
              className={`
                shrink-0 size-1.5 rounded-full
                ${getStatusDotClass(status)}
                ${PULSING_STATUSES.has(status) ? 'animate-pulse' : ''}
              `}
            />

            {/* session name */}
            <span className="truncate">{tab.sessionName}</span>

            {/* close button */}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.sessionName}`}
              onClick={(e) => {
                e.stopPropagation();
                requestCloseTab(tab.sessionId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  requestCloseTab(tab.sessionId);
                }
              }}
              className="
                ml-auto shrink-0
                text-fg/30 hover:text-fg/60
                transition-colors cursor-pointer
                opacity-0 group-hover:opacity-100
                focus:opacity-100
              "
            >
              ✕
            </span>
          </button>
        );
      })}
    </nav>
  );
}
