import { useCallback, useEffect, useState } from 'react'
import type { TelemetryData } from '../types/index'

const POLL_INTERVAL = 30_000

export interface UseTelemetryResult {
  data: TelemetryData | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useTelemetry(): UseTelemetryResult {
  const [data, setData] = useState<TelemetryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTelemetry = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/telemetry')
      if (!res.ok) throw new Error(`Telemetry fetch failed: ${res.status}`)
      const json = (await res.json()) as TelemetryData
      setData(json)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load telemetry.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTelemetry()
  }, [fetchTelemetry])

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchTelemetry()
    }, POLL_INTERVAL)
    return () => window.clearInterval(id)
  }, [fetchTelemetry])

  const refresh = useCallback(() => {
    void fetchTelemetry()
  }, [fetchTelemetry])

  return { data, isLoading, error, refresh }
}
