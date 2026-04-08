import { useMemo, useState } from 'react';

import { useSessionData, useSessionSelection } from '../../context/SessionContext';
import NetworkCanvas from './NetworkCanvas';
import NetworkDetailPanel from './NetworkDetailPanel';
import StatusFilter from '../filters/StatusFilter';
import StatusSummaryBar from '../common/StatusSummaryBar';
import type { Session, SessionSummary } from '../../types';

export default function NetworkView() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const { selectedSession } = useSessionSelection();
  const { sessions } = useSessionData();

  const networkSessions = useMemo<(Session | SessionSummary)[]>(() => {
    if (showAllSessions) return sessions;
    if (selectedSession) return [selectedSession];
    return sessions;
  }, [showAllSessions, selectedSession, sessions]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-primary">
      {/* Canvas fills entire area */}
      <NetworkCanvas
        sessions={networkSessions}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
      />

      {/* Floating controls overlay — top-left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Compact summary bar */}
        <div className="rounded-lg bg-surface-secondary/80 backdrop-blur-sm border border-border-default px-3 py-2">
          <StatusSummaryBar />
        </div>

        {/* Status filter pills */}
        <div className="rounded-lg bg-surface-secondary/80 backdrop-blur-sm border border-border-default">
          <StatusFilter />
        </div>

        <button
          type="button"
          className="rounded-lg bg-surface-secondary/80 backdrop-blur-sm border border-border-default px-3 py-1.5 text-xs font-mono text-fg/50 hover:text-fg/80 cursor-pointer transition-colors"
          onClick={() => setShowAllSessions(!showAllSessions)}
        >
          {showAllSessions ? 'Show Selected Only' : 'Show All Sessions'}
        </button>

        {/* Legend */}
        <div className="rounded-lg bg-surface-secondary/80 backdrop-blur-sm border border-border-default px-3 py-2 flex items-center gap-4 text-[10px] text-fg/40 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded-full bg-fg/20" />
            Session
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-fg/20" />
            Agent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-fg/20" />
            Sub-agent
          </span>
        </div>
      </div>

      {/* Detail panel — slides in from right */}
      <NetworkDetailPanel
        nodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
      />
    </div>
  );
}
