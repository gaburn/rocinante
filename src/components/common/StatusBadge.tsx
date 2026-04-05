import type { SessionStatus, AgentStatus } from '../../types';
import {
  getStatusDotClass,
  getStatusTextClass,
  getStatusBgClass,
  getStatusBorderClass,
  getStatusLabel,
} from '../../utils/statusColors';

interface StatusBadgeProps {
  status: SessionStatus | AgentStatus;
  size?: 'sm' | 'md';
}

const PULSING_STATUSES = new Set<string>(['active', 'running', 'waiting']);

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const shouldPulse = PULSING_STATUSES.has(status);
  const label = getStatusLabel(status);

  const isSm = size === 'sm';

  return (
    <span
      className={`
        inline-flex items-center rounded-full border font-medium
        ${getStatusBgClass(status)}
        ${getStatusTextClass(status)}
        ${getStatusBorderClass(status)}
        ${isSm ? 'gap-1 px-1.5 py-0.5 text-xs' : 'gap-1.5 px-2.5 py-1 text-sm'}
      `}
    >
      {/* Status dot — pulses for live statuses to signal activity */}
      <span
        aria-hidden="true"
        className={`
          shrink-0 rounded-full
          ${getStatusDotClass(status)}
          ${shouldPulse ? 'animate-pulse' : ''}
          ${isSm ? 'size-1.5' : 'size-2'}
        `}
      />
      {label}
    </span>
  );
}
