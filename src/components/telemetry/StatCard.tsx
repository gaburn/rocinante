import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  accent?: string // tailwind text color class
  indicator?: 'green' | null
}

export default function StatCard({
  label,
  value,
  icon,
  accent = 'text-gray-100',
  indicator,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-fg-secondary">
          {label}
        </span>
        <span className="text-fg-secondary">{icon}</span>
      </div>
      <div className="flex items-center gap-2">
        {indicator === 'green' && (
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
        )}
        <span className={`text-3xl font-bold tracking-tight ${accent}`}>
          {value}
        </span>
      </div>
    </div>
  )
}
