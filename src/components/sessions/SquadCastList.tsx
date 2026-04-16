import type { SquadCastMember } from '../../types';

interface SquadCastListProps {
  cast: SquadCastMember[];
}

export default function SquadCastList({ cast }: SquadCastListProps) {
  if (cast.length === 0) return null;

  return (
    <div className="squad-cast-list">
      <div className="flex items-center gap-1.5 mb-1.5">
        <img src="/squad-logo.png" alt="" className="h-3.5 w-auto opacity-60" aria-hidden="true" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-fg/60">
          Cast
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cast.map((member) => (
          <span key={member.name} className="squad-cast-member">
            <span className="squad-cast-emoji" aria-hidden="true">{member.emoji}</span>
            <span className="squad-cast-name">{member.name}</span>
            <span className="squad-cast-role">{member.role}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
