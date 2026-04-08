interface TokenModelEntry {
  model: string
  totalTokens: number
  percentage: number
}

interface TokenUtilizationProps {
  data?: {
    totalOutputTokens: number
    byModel: TokenModelEntry[]
  }
}

function getModelTier(model: string): { color: string; barColor: string } {
  const lower = model.toLowerCase()
  if (lower.includes('opus'))
    return { color: 'text-purple-400', barColor: 'bg-purple-400' }
  if (lower.includes('sonnet'))
    return { color: 'text-blue-400', barColor: 'bg-blue-400' }
  if (lower.includes('haiku'))
    return { color: 'text-teal-400', barColor: 'bg-teal-400' }
  if (lower.includes('gpt'))
    return { color: 'text-rose-400', barColor: 'bg-rose-400' }
  return { color: 'text-zinc-400', barColor: 'bg-zinc-400' }
}

export default function TokenUtilization({ data }: TokenUtilizationProps) {
  if (!data || data.byModel.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
        <h3 className="mb-4 text-sm font-semibold text-fg-heading">
          Token Usage
        </h3>
        <div className="flex h-20 items-center justify-center text-fg-secondary text-sm">
          No token data
        </div>
      </div>
    )
  }

  const { totalOutputTokens, byModel } = data

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
      <h3 className="mb-1 text-sm font-semibold text-fg-heading">
        Token Usage
      </h3>
      <p className="mb-4 text-xs text-fg-secondary">
        {totalOutputTokens.toLocaleString()} total output tokens
      </p>

      {/* Stacked horizontal bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-tertiary">
        {byModel
          .filter((entry) => entry.totalTokens > 0)
          .map((entry) => {
            const tier = getModelTier(entry.model)
            return (
              <div
                key={entry.model}
                className={`${tier.barColor} transition-all duration-300`}
                style={{ width: `${entry.percentage}%` }}
                title={`${entry.model}: ${entry.totalTokens.toLocaleString()} (${entry.percentage.toFixed(1)}%)`}
              />
            )
          })}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {byModel.map((entry) => {
          const tier = getModelTier(entry.model)
          return (
            <div key={entry.model} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${tier.barColor}`}
              />
              <span className={`text-xs truncate ${tier.color}`}>
                {entry.model}
              </span>
              <span className="ml-auto text-xs font-mono text-fg-secondary shrink-0">
                {entry.totalTokens.toLocaleString()}{' '}
                <span className="text-fg-secondary/60">
                  ({entry.percentage.toFixed(1)}%)
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
