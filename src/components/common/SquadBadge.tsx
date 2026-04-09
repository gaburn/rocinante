interface SquadBadgeProps {
  isSquadSession?: boolean;
}

export default function SquadBadge({ isSquadSession }: SquadBadgeProps) {
  if (!isSquadSession) return null;

  return (
    <span className="squad-badge" title="This session uses Squad">
      <img src="/squad-logo.png" alt="Squad" className="squad-badge-logo" />
    </span>
  );
}
