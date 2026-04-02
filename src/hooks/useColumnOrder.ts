import { useCallback, useEffect, useState } from 'react'

const COLUMN_ORDER_KEY = 'rocinante-column-order'

function loadOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export interface UseColumnOrderResult {
  columnOrder: string[]
  reorderColumns: (activeId: string, overId: string) => void
  getOrderedNames: (names: string[]) => string[]
}

export function useColumnOrder(): UseColumnOrderResult {
  const [columnOrder, setColumnOrder] = useState<string[]>(loadOrder)

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder))
    } catch {
      // Ignore localStorage write errors
    }
  }, [columnOrder])

  const getOrderedNames = useCallback(
    (names: string[]): string[] => {
      const ordered: string[] = []
      const remaining = new Set(names)

      for (const name of columnOrder) {
        if (remaining.has(name)) {
          ordered.push(name)
          remaining.delete(name)
        }
      }

      // Append new workstreams not yet in saved order
      for (const name of names) {
        if (remaining.has(name)) {
          ordered.push(name)
        }
      }

      return ordered
    },
    [columnOrder],
  )

  const reorderColumns = useCallback(
    (activeId: string, overId: string) => {
      setColumnOrder(prev => {
        const working = [...prev]
        if (!working.includes(activeId)) working.push(activeId)
        if (!working.includes(overId)) working.push(overId)

        const fromIndex = working.indexOf(activeId)
        const toIndex = working.indexOf(overId)
        if (fromIndex === toIndex) return prev

        const next = [...working]
        const [removed] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, removed)
        return next
      })
    },
    [],
  )

  return { columnOrder, reorderColumns, getOrderedNames }
}
