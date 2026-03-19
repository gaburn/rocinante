interface SparklineProps {
  buckets: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  buckets,
  width = 64,
  height = 16,
  className,
}: SparklineProps) {
  const maxCount = Math.max(...buckets);

  if (buckets.length === 0 || maxCount === 0) return null;

  const barWidth = width / buckets.length - 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className={className}
    >
      {buckets.map((count, i) => {
        const normalized = count / maxCount;
        const barHeight = count > 0 ? Math.max(1, normalized * height) : normalized * height;

        return (
          <rect
            key={i}
            x={i * (width / buckets.length)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            fill="currentColor"
            opacity={Math.max(0.15, normalized)}
          />
        );
      })}
    </svg>
  );
}
