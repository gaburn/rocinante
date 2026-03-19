import { useState } from 'react';

import NetworkCanvas from './NetworkCanvas';
import NetworkDetailPanel from './NetworkDetailPanel';
import StatusFilter from '../filters/StatusFilter';
import StatusSummaryBar from '../common/StatusSummaryBar';

export default function NetworkView() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-primary">
      {/* Canvas fills entire area */}
      <NetworkCanvas
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
