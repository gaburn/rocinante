/* ── WaterfallTimeAxis ─────────────────────────────────────
   Horizontal time ruler with smart tick intervals and
   subtle dashed guide lines that drop into the row area.
   ──────────────────────────────────────────────────────── */

interface WaterfallTimeAxisProps {
  totalDurationMs: number;
}

/* ── tick formatting ───────────────────────────────────── */

function formatTick(ms: number): string {
  if (ms === 0) return '0s';

  const totalSeconds = Math.round(ms / 1000);

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
}

/* ── smart intervals ───────────────────────────────────── */

function computeTicks(totalMs: number): number[] {
  const totalSec = totalMs / 1000;

  let intervalSec: number;

  if (totalSec < 60) {
    intervalSec = 10;                       // < 1 min  → 10 s
  } else if (totalSec < 300) {
    intervalSec = 30;                       // < 5 min  → 30 s
  } else if (totalSec < 1800) {
    intervalSec = 300;                      // < 30 min → 5 min
  } else {
    intervalSec = 600;                      // else     → 10 min
  }

  const intervalMs = intervalSec * 1000;
  const ticks: number[] = [0];

  let t = intervalMs;
  while (t <= totalMs) {
    ticks.push(t);
    t += intervalMs;
  }

  return ticks;
}

/* ── component ─────────────────────────────────────────── */

export default function WaterfallTimeAxis({
  totalDurationMs,
}: WaterfallTimeAxisProps) {
  const ticks = computeTicks(totalDurationMs);

  return (
    <div className="relative flex" style={{ height: 22 }}>
      {/* left gutter — same width as the label column */}
      <div className="w-[140px] shrink-0" />

      {/* tick area */}
      <div className="relative flex-1">
        {ticks.map((ms) => {
          const pct = (ms / totalDurationMs) * 100;

          return (
            <div
              key={ms}
              className="absolute top-0 flex flex-col items-start"
              style={{ left: `${pct}%` }}
            >
              {/* label */}
              <span className="font-mono text-[10px] leading-none text-fg/20 -translate-x-1/2 select-none">
                {formatTick(ms)}
              </span>

              {/* dashed guide line — extends below into the row area */}
              <div
                className="absolute top-[14px] w-px border-l border-dashed border-fg/5"
                style={{ height: 'calc(100vh)' }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
