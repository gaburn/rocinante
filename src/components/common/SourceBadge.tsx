interface SourceBadgeProps {
  source?: 'copilot' | 'claude';
}

export default function SourceBadge({ source }: SourceBadgeProps) {
  const resolved = source ?? 'copilot';

  return (
    <span
      className={`source-badge ${
        resolved === 'copilot' ? 'source-badge--copilot' : 'source-badge--claude'
      }`}
    >
      {resolved === 'copilot' ? 'Copilot' : 'Claude'}
    </span>
  );
}
