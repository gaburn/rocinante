import { useSessionContext } from '../../context/SessionContext'
import type { SessionStatus } from '../../types'
import {
  getStatusTextClass,
  getStatusBgClass,
} from '../../utils/statusColors'

/* ────────────────────────────────────────────────────────
 * StatusFilter
 * ────────────────────────────────────────────────────────
 * A compact horizontal pill-bar that lets users filter
 * the session list by status.  Lives at the top of the
 * sidebar panel.
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  All(12)  Active(5)  Blocked(2)  Waiting(1)  Done(4)│
 * │           ═════════                                  │
 * └──────────────────────────────────────────────────────┘
 *
 * Design notes
 *  · Active pill gets a 2 px bottom-border accent in the
 *    status colour + a subtle background tint — two
 *    redundant visual channels for accessibility.
 *  · Inactive pills are muted gray; hover lifts them
 *    onto the surface-hover layer.
 *  · Zero-count status pills are further dimmed so the
 *    user's eye is drawn to what matters right now.
 *  · "All" uses the indigo `border-active` accent and
 *    a neutral surface-tertiary background when selected.
 *  · Tabular-nums on every count keep the bar rock-
 *    steady even as numbers change in real time.
 * ──────────────────────────────────────────────────────── */

type FilterValue = SessionStatus | 'all'

interface FilterItem {
  value: FilterValue
  label: string
}

const FILTERS: FilterItem[] = [
  { value: 'all',       label: 'All'       },
  { value: 'active',    label: 'Active'    },
  { value: 'blocked',   label: 'Blocked'   },
  { value: 'waiting',   label: 'Waiting'   },
  { value: 'completed', label: 'Completed' },
]

/*
 * Bottom-border colours for the selected pill.
 * Intentionally a notch brighter than getStatusBorderClass
 * so the 2 px underline reads clearly on the dark surface.
 */
const ACTIVE_UNDERLINE: Record<FilterValue, string> = {
  all:       'border-b-border-active',   /* indigo accent  */
  active:    'border-b-emerald-400',
  blocked:   'border-b-red-400',
  waiting:   'border-b-amber-400',
  completed: 'border-b-gray-500',
}

export default function StatusFilter() {
  const { statusFilter, setStatusFilter, statusCounts } = useSessionContext()

  function countFor(value: FilterValue): number {
    return value === 'all' ? statusCounts.total : statusCounts[value]
  }

  return (
    <div
      role="tablist"
      aria-label="Filter sessions by status"
      className="flex flex-wrap items-center gap-1.5 px-3 py-2"
    >
      {FILTERS.map(({ value, label }) => {
        const isActive  = statusFilter === value
        const count     = countFor(value)
        const isStatus  = value !== 'all'
        const isEmpty   = count === 0 && isStatus

        /* ── active-state classes ──────────────────── */
        let stateClasses: string

        if (isActive && isStatus) {
          // Status-specific pill: tinted bg + coloured text + underline
          stateClasses = `
            ${getStatusBgClass(value as SessionStatus)}
            ${getStatusTextClass(value as SessionStatus)}
            font-semibold
            ${ACTIVE_UNDERLINE[value]}
          `
        } else if (isActive) {
          // "All" pill: neutral raise + white text + indigo underline
          stateClasses = `
            bg-surface-tertiary text-fg/90 font-semibold
            ${ACTIVE_UNDERLINE[value]}
          `
        } else {
          // Inactive pill: muted, lifts on hover
          stateClasses = `
            border-b-transparent
            text-fg-secondary
            hover:bg-surface-hover hover:text-fg-heading
            ${isEmpty ? 'opacity-40' : ''}
          `
        }

        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${label}: ${count} session${count !== 1 ? 's' : ''}`}
            onClick={() => setStatusFilter(value)}
            className={`
              inline-flex items-center gap-1
              rounded-md border-b-2
              px-2.5 py-1
              text-xs font-mono leading-none
              transition-colors duration-150
              cursor-pointer select-none
              focus-visible:outline-2 focus-visible:outline-offset-1
              focus-visible:outline-border-active
              ${stateClasses}
            `}
          >
            {label}
            <span
              className={`tabular-nums ${isActive ? 'opacity-75' : 'opacity-50'}`}
            >
              ({count})
            </span>
          </button>
        )
      })}
    </div>
  )
}
